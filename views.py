from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from .models import Thread, Presence, CommunicationHistory, ChatMessage, ChatAttachment
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from django.core.files.storage import default_storage
from django.utils import timezone

def SignupPage(request):
    if request.method == 'POST':
        uname = request.POST.get('username')
        email = request.POST.get('email')
        pass1 = request.POST.get('password1')
        pass2 = request.POST.get('password2')

        if not uname or not email or not pass1 or not pass2:
            messages.error(request, "All fields are required!")
            return redirect('signup')
        if pass1 != pass2:
            messages.error(request, "Passwords do not match!")
            return redirect('signup')
        if User.objects.filter(username=uname).exists():
            messages.error(request, "Username already exists!")
            return redirect('signup')
        if User.objects.filter(email=email).exists():
            messages.error(request, "Email already registered!")
            return redirect('signup')

        user = User.objects.create_user(username=uname, email=email, password=pass1)
        messages.success(request, "User registered successfully!")
        return redirect('login')
    return render(request, 'signup.html')

def LoginPage(request):
    if request.method == 'POST':
        uname = request.POST.get('username')
        passw = request.POST.get('password')
        user = authenticate(request, username=uname, password=passw)
        if user is not None:
            login(request, user)
            messages.success(request, "Logged in successfully!")
            return redirect('home')
        else:
            messages.error(request, "Invalid username or password!")
            return redirect('login')
    return render(request, 'login.html')

@login_required
def HomePage(request):
    all_users = User.objects.exclude(id=request.user.id)
    active_users = Presence.get_active_users().exclude(id=request.user.id)
    users_with_status = []
    for user in all_users:
        users_with_status.append({
            'user': user,
            'is_active': Presence.is_user_active(user)
        })
    threads = Thread.objects.by_user(user=request.user).prefetch_related('chatmessage_thread').order_by('timestamp')
    communicated_users = CommunicationHistory.objects.filter(user=request.user).order_by('-last_communicated')
    context = {
        'users_with_status': users_with_status,
        'Threads': threads,
        'user': request.user,
        'communicated_users': communicated_users,
        'current_time': timezone.now(),
    }
    return render(request, 'home.html', context)

def logoutUser(request):
    logout(request)
    return render(request, 'signup.html')


@login_required
def messages_page(request):
    all_users = User.objects.exclude(id=request.user.id)
    active_users = Presence.get_active_users().exclude(id=request.user.id)
    users_with_status = []
    for user in all_users:
        users_with_status.append({
            'user': user,
            'is_active': Presence.is_user_active(user)
        })
    threads = Thread.objects.by_user(user=request.user).prefetch_related('chatmessage_thread').order_by('timestamp')
    communicated_users = CommunicationHistory.objects.filter(user=request.user).order_by('-last_communicated')
    context = {
        'users_with_status': users_with_status,
        'Threads': threads,
        'user': request.user,
        'communicated_users': communicated_users,
        'current_time': timezone.now(),
    }
    return render(request, 'home.html', context)

@login_required
def video_call(request):
    return render(request, 'video_call.html')

@csrf_exempt
def upload_file(request):
    if request.method == 'POST' and request.FILES:
        files = request.FILES.getlist('files')
        attachment_urls = []
        for file in files:
            file_path = default_storage.save(file.name, file)
            attachment_urls.append(default_storage.url(file_path))
        return JsonResponse({'attachment_urls': attachment_urls})
    return JsonResponse({'error': 'Invalid request'}, status=400)

@login_required
def fetch_chat_history(request):
    other_user_id = request.GET.get('other_user_id')
    current_user_id = request.GET.get('current_user_id')

    if not other_user_id or not current_user_id:
        return JsonResponse({'error': 'Missing user IDs'}, status=400)

    try:
        current_user = User.objects.get(id=current_user_id)
        other_user = User.objects.get(id=other_user_id)

        # Find or create the thread between the two users
        thread = Thread.objects.filter(
            first_person__in=[current_user, other_user],
            second_person__in=[current_user, other_user]
        ).first()

        messages = []
        thread_id = None
        if thread:
            thread_id = thread.id
            chat_messages = ChatMessage.objects.filter(thread=thread).order_by('timestamp')
            for msg in chat_messages:
                attachments = ChatAttachment.objects.filter(chat_message=msg)
                attachment_urls = [attachment.file.url for attachment in attachments]
                messages.append({
                    'message': msg.message,
                    'sent_by': str(msg.user.id),
                    'attachment_urls': attachment_urls,
                })

        return JsonResponse({
            'thread_id': thread_id,
            'messages': messages
        })
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)