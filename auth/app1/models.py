from django.db import models
from django.contrib.auth import get_user_model
from django.db.models import Q
import time
from django.utils import timezone
from datetime import timedelta
User = get_user_model()

class Presence(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    channel_name = models.CharField(max_length=255)
    last_seen = models.DateTimeField(auto_now=True)

    @classmethod
    def update_presence(cls, user, channel_name):
        presence, created = cls.objects.get_or_create(
            user=user,
            channel_name=channel_name,
            defaults={'last_seen': timezone.now()}
        )
        if not created:
            presence.last_seen = timezone.now()
            presence.save()

    @classmethod
    def remove_presence(cls, channel_name):
        cls.objects.filter(channel_name=channel_name).delete()

    @classmethod
    def get_active_users(cls):
        from django.utils import timezone
        from datetime import timedelta
        threshold = timezone.now() - timedelta(minutes=5)
        return User.objects.filter(presence__last_seen__gte=threshold).distinct()

    @classmethod
    def is_user_active(cls, user):
        cutoff = timezone.now() - timedelta(minutes=1)
        return cls.objects.filter(
            user=user,
            last_seen__gte=cutoff
        ).exists()

class CommunicationHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='communication_history')
    communicated_with = models.ForeignKey(User, on_delete=models.CASCADE, related_name='communicated_by')
    last_communicated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'communicated_with']

    @classmethod
    def record_communication(cls, user, communicated_with):
        if user != communicated_with:  # Don't record communication with self
            cls.objects.update_or_create(
                user=user,
                communicated_with=communicated_with,
                defaults={'last_communicated': timezone.now()}
            )

class ThreadManager(models.Manager):
    def by_user(self, **kwargs):
        user = kwargs.get('user')
        lookup = Q(first_person=user) | Q(second_person=user)
        qs = self.get_queryset().filter(lookup).distinct()
        return qs

class Thread(models.Model):
    first_person = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='thread_first_person')
    second_person = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='thread_second_person')
    updated = models.DateTimeField(auto_now=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_group = models.BooleanField(default=False)  # Ensure a default value

    objects = ThreadManager()

    class Meta:
        unique_together = ['first_person', 'second_person']

class ChatMessage(models.Model):
    thread = models.ForeignKey(Thread, null=True, blank=True, on_delete=models.CASCADE, related_name='chat_message_thread')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    message = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    @classmethod
    def get_messages_within_24h(cls, thread):
        twenty_four_hours_ago = timezone.now() - timezone.timedelta(hours=24)
        return cls.objects.filter(
            thread=thread,
            timestamp__gte=twenty_four_hours_ago
        ).order_by('timestamp')

    @classmethod
    def cleanup_old_messages(cls):
        twenty_four_hours_ago = timezone.now() - timezone.timedelta(hours=24)
        # First delete attachments of old messages
        old_messages = cls.objects.filter(timestamp__lt=twenty_four_hours_ago)
        ChatAttachment.objects.filter(chat_message__in=old_messages).delete()
        # Then delete the messages themselves
        old_messages.delete()

class ChatAttachment(models.Model):
    chat_message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='chat_attachments/')

class ChatRoom(models.Model):
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_rooms')
    members = models.ManyToManyField(User, related_name='chat_rooms')
    created_at = models.DateTimeField(auto_now_add=True)
    is_group = models.BooleanField(default=False)

    def __str__(self):
        return self.name

class Message(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f'{self.sender.username}: {self.content[:50]}'

class FileAttachment(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='chat_attachments/')
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=100)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.file_name} ({self.message.sender.username})'

class UserStatus(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='status')
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    channel_name = models.CharField(max_length=255, null=True, blank=True)

    @classmethod
    def update_status(cls, user, is_online, channel_name=None):
        status, created = cls.objects.get_or_create(user=user)
        status.is_online = is_online
        if is_online:
            status.last_seen = timezone.now()
        if channel_name:
            status.channel_name = channel_name
        status.save()

    def __str__(self):
        return f'{self.user.username} - {"Online" if self.is_online else "Offline"}'

class Group(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_groups')
    members = models.ManyToManyField(User, through='GroupMember')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class GroupMember(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('group', 'user')

    def __str__(self):
        return f"{self.user.username} in {self.group.name}"

class GroupMessage(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    attachment_urls = models.JSONField(default=list, blank=True)
    attachment_names = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.sender.username} in {self.group.name}: {self.message[:50]}"
