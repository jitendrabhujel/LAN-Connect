from django.db import models
from django.contrib.auth import get_user_model
from django.db.models import Q
import time
from django.utils import timezone
User = get_user_model()

class Presence(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='presence')
    channel_name = models.CharField(max_length=255, unique=True)
    last_seen = models.DateTimeField(auto_now=True)

    @classmethod
    def update_presence(cls, user, channel_name):
        cls.objects.update_or_create(user=user, defaults={'channel_name': channel_name})

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
        from django.utils import timezone
        from datetime import timedelta
        threshold = timezone.now() - timedelta(minutes=5)
        return cls.objects.filter(user=user, last_seen__gte=threshold).exists()

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

    objects = ThreadManager()

    class Meta:
        unique_together = ['first_person', 'second_person']

class ChatMessage(models.Model):
    thread = models.ForeignKey(Thread, null=True, blank=True, on_delete=models.CASCADE, related_name='chatmessage_thread')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    message = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

class ChatAttachment(models.Model):
    chat_message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='chat_attachments/')