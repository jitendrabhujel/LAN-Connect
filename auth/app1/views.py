from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from .models import (
    Thread, Presence, CommunicationHistory, 
    ChatMessage, ChatAttachment, Group, GroupMember,
    GroupMessage
)

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from django.core.files.storage import default_storage
from django.utils import timezone
from django.db.models import Q
from django.db import transaction
import os
from django.conf import settings

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
        password = request.POST.get('password')
        user = authenticate(request, username=uname, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, "Log In To Your Account!")
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
    threads = Thread.objects.by_user(user=request.user).prefetch_related('chat_message_thread').order_by('timestamp')
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
    messages.success(request, "Logged out successfully!")
    return redirect('login')

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
    threads = Thread.objects.by_user(user=request.user).prefetch_related('chat_message_thread').order_by('timestamp')
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
        attachment_names = {}
        
        for file in files:
            # Generate a unique filename to prevent overwrites
            file_name = f"{file.name.split('.')[0]}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.{file.name.split('.')[-1]}"
            
            # Save file in the appropriate directory based on file type
            file_ext = file.name.split('.')[-1].lower()
            
            # Determine subdirectory based on file type
            if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']:
                sub_dir = 'images'
            elif file_ext in ['mp4', 'webm', 'ogg']:
                sub_dir = 'videos'
            else:
                sub_dir = 'documents'
            
            # Create subdirectory if it doesn't exist
            save_dir = f'chat_attachments/{sub_dir}'
            os.makedirs(os.path.join(settings.MEDIA_ROOT, save_dir), exist_ok=True)
            
            # Save the file
            file_path = os.path.join(save_dir, file_name)
            saved_path = default_storage.save(file_path, file)
            file_url = default_storage.url(saved_path)
            
            # Store the file URL and original name
            attachment_urls.append(file_url)
            attachment_names[file_url] = file.name
            
        return JsonResponse({
            'attachment_urls': attachment_urls,
            'attachment_names': attachment_names
        })
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

        # Find thread between users (in either direction)
        thread = Thread.objects.filter(
            (Q(first_person=current_user, second_person=other_user) |
            Q(first_person=other_user, second_person=current_user))
        ).first()

        # If no thread exists, create one with consistent ordering
        if not thread:
            thread = Thread.objects.create(
                first_person=min(current_user, other_user, key=lambda x: x.id),
                second_person=max(current_user, other_user, key=lambda x: x.id)
            )

        # Record communication history for both users
        CommunicationHistory.record_communication(current_user, other_user)
        CommunicationHistory.record_communication(other_user, current_user)

        # Get messages from the last 24 hours
        chat_messages = ChatMessage.get_messages_within_24h(thread)
        messages = []
        
        for msg in chat_messages:
            # Get all attachments for this message
            attachments = ChatAttachment.objects.filter(chat_message=msg)
            attachment_urls = [attachment.file.url for attachment in attachments]
            
            messages.append({
                'message': msg.message,
                'sent_by': str(msg.user.id),
                'send_to': str(other_user.id if msg.user.id == current_user.id else current_user.id),
                'attachment_urls': attachment_urls,
                'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                'thread_id': str(thread.id)
            })

        # Clean up old messages
        ChatMessage.cleanup_old_messages()

        # Update thread timestamp
        thread.updated = timezone.now()
        thread.save()

        return JsonResponse({
            'success': True,
            'thread_id': str(thread.id),
            'messages': messages,
            'other_user': {
                'id': other_user.id,
                'username': other_user.username,
                'is_online': Presence.is_user_active(other_user)
            }
        })
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@login_required
def fetch_unread_counts(request):
    current_user_id = request.GET.get('current_user_id')
    
    if not current_user_id:
        return JsonResponse({'error': 'Missing user ID'}, status=400)
        
    try:
        current_user = User.objects.get(id=current_user_id)
        
        # Get all threads involving the current user
        threads = Thread.objects.filter(
            Q(first_person=current_user) | Q(second_person=current_user)
        )
        
        unread_counts = {}
        twenty_four_hours_ago = timezone.now() - timezone.timedelta(hours=24)
        
        for thread in threads:
            # Determine the other user in the thread
            other_user = thread.second_person if thread.first_person == current_user else thread.first_person
            
            # Count unread messages from the other user in the last 24 hours
            unread_count = ChatMessage.objects.filter(
                thread=thread,
                user=other_user,
                timestamp__gte=twenty_four_hours_ago
            ).count()
            
            if unread_count > 0:
                unread_counts[str(other_user.id)] = unread_count
        
        return JsonResponse({
            'unread_counts': unread_counts,
            'success': True
        })
        
    except User.DoesNotExist:
        return JsonResponse({
            'error': 'User not found',
            'success': False
        }, status=404)
    except Exception as e:
        print(f"Error in fetch_unread_counts: {str(e)}")
        return JsonResponse({
            'error': str(e),
            'success': False
        }, status=500)

@login_required
@csrf_exempt
def create_group(request):
    if request.method == 'POST':
        try:
            with transaction.atomic():
                name = request.POST.get('name')
                description = request.POST.get('description', '')  # Get description from POST data
                members = json.loads(request.POST.get('members', '[]'))

                if not name:
                    return JsonResponse({'success': False, 'error': 'Group name is required'})

                if not members:
                    return JsonResponse({'success': False, 'error': 'At least one member is required'})

                # Check if a group with this name already exists
                if Group.objects.filter(name=name).exists():
                    return JsonResponse({
                        'success': False,
                        'error': 'A group with this name already exists'
                    })

                # Create the group with creator_id
                group = Group.objects.create(
                    name=name,
                    description=description,
                    creator_id=request.user.id  # Use creator_id instead of created_by
                )

                # Add members to the group
                for member_id in members:
                    try:
                        user = User.objects.get(id=member_id)
                        GroupMember.objects.create(
                            group=group,
                            user=user,
                            is_admin=user == request.user
                        )
                    except User.DoesNotExist:
                        continue

                return JsonResponse({
                    'success': True,
                    'group_id': group.id,
                    'message': 'Group created successfully'
                })

        except Exception as e:
            print(f"Error creating group: {str(e)}")  # Debugging line
            return JsonResponse({
                'success': False,
                'error': str(e)
            })

    return JsonResponse({'success': False, 'error': 'Invalid request method'})

@login_required
def fetch_group_chat_history(request):
    group_id = request.GET.get('group_id')
    
    try:
        group = Group.objects.get(id=group_id)
        if not group.members.filter(id=request.user.id).exists():
            return JsonResponse({'error': 'Not a member of this group'}, status=403)

        messages = GroupMessage.objects.filter(group=group).order_by('created_at')
        
        # Update last read timestamp
        member = GroupMember.objects.get(group=group, user=request.user)
        member.last_read = timezone.now()
        member.save()

        messages_data = []
        for msg in messages:
            messages_data.append({
                'message': msg.message,
                'sent_by': msg.sender.id,
                'sender_name': msg.sender.username,
                'attachment_urls': msg.attachment_urls,
                'attachment_names': msg.attachment_names,
                'created_at': msg.created_at.strftime('%Y-%m-%d %H:%M:%S')
            })

        return JsonResponse({
            'success': True,
            'group_id': group_id,
            'messages': messages_data
        })
    except Group.DoesNotExist:
        return JsonResponse({'error': 'Group not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
def get_group_info(request, group_id):
    try:
        group = Group.objects.get(id=group_id)
        if not group.members.filter(id=request.user.id).exists():
            return JsonResponse({'error': 'Not a member of this group'}, status=403)

        members_data = []
        for member in GroupMember.objects.filter(group=group):
            members_data.append({
                'id': member.user.id,
                'username': member.user.username,
                'is_admin': member.is_admin,
                'joined_at': member.joined_at.strftime('%Y-%m-%d %H:%M:%S')
            })

        return JsonResponse({
            'success': True,
            'group_id': group.id,
            'name': group.name,
            'description': group.description,
            'created_by': {
                'id': group.created_by.id,
                'username': group.created_by.username
            },
            'created_at': group.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'members': members_data
        })
    except Group.DoesNotExist:
        return JsonResponse({'error': 'Group not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@csrf_exempt
def manage_group_members(request, group_id):
    try:
        group = Group.objects.get(id=group_id)
        member = GroupMember.objects.get(group=group, user=request.user)
        
        if not member.is_admin:
            return JsonResponse({'error': 'Only admins can manage members'}, status=403)

        if request.method == 'POST':
            data = json.loads(request.body)
            action = data.get('action')
            user_id = data.get('user_id')
            
            try:
                target_user = User.objects.get(id=user_id)
                target_member = GroupMember.objects.get(group=group, user=target_user)

                if action == 'remove':
                    target_member.delete()
                    group.members.remove(target_user)
                    return JsonResponse({'success': True, 'message': 'Member removed'})
                elif action == 'make_admin':
                    target_member.is_admin = True
                    target_member.save()
                    return JsonResponse({'success': True, 'message': 'Member promoted to admin'})
                elif action == 'remove_admin':
                    if target_user == group.created_by:
                        return JsonResponse({'error': 'Cannot remove admin status from group creator'}, status=400)
                    target_member.is_admin = False
                    target_member.save()
                    return JsonResponse({'success': True, 'message': 'Admin status removed'})
            except User.DoesNotExist:
                return JsonResponse({'error': 'User not found'}, status=404)
            except GroupMember.DoesNotExist:
                return JsonResponse({'error': 'User is not a member of this group'}, status=404)

    except Group.DoesNotExist:
        return JsonResponse({'error': 'Group not found'}, status=404)
    except GroupMember.DoesNotExist:
        return JsonResponse({'error': 'You are not a member of this group'}, status=403)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@csrf_exempt
def add_group_members(request, group_id):
    if request.method == 'POST':
        try:
            group = Group.objects.get(id=group_id)
            member = GroupMember.objects.get(group=group, user=request.user)
            
            if not member.is_admin:
                return JsonResponse({'error': 'Only admins can add members'}, status=403)

            data = json.loads(request.body)
            new_member_ids = data.get('member_ids', [])
            
            added_members = []
            for user_id in new_member_ids:
                try:
                    user = User.objects.get(id=user_id)
                    if not group.members.filter(id=user.id).exists():
                        GroupMember.objects.create(group=group, user=user)
                        group.members.add(user)
                        added_members.append({
                            'id': user.id,
                            'username': user.username
                        })
                except User.DoesNotExist:
                    continue

            return JsonResponse({
                'success': True,
                'added_members': added_members
            })
        except Group.DoesNotExist:
            return JsonResponse({'error': 'Group not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

@login_required
def user_status(request):
    try:
        # Get all users except the current user
        users = User.objects.exclude(id=request.user.id)
        users_data = []
        
        for user in users:
            users_data.append({
                'id': user.id,
                'username': user.username,
                'is_online': Presence.is_user_active(user)
            })
        
        return JsonResponse({
            'success': True,
            'users': users_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
