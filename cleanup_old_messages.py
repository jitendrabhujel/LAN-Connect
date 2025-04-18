from django.core.management.base import BaseCommand
from app1.models import ChatMessage
from django.utils import timezone

class Command(BaseCommand):
    help = 'Cleans up chat messages older than 24 hours'

    def handle(self, *args, **options):
        try:
            ChatMessage.cleanup_old_messages()
            self.stdout.write(self.style.SUCCESS('Successfully cleaned up old messages'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error cleaning up old messages: {str(e)}')) 