import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from .models import ChatRoom, Message, FileAttachment, UserStatus, Presence, Thread, ChatMessage, ChatAttachment, CommunicationHistory
from django.core.files.storage import default_storage
from django.utils import timezone
import base64
from django.db.models import Q
import traceback

User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        self.user_id = str(self.user.id)
        self.room_group_name = f'user_{self.user_id}'

        # Join user's personal room
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        # Update user presence
        await self.update_user_presence()
        await self.accept()

    async def disconnect(self, close_code):
        # Remove user presence
        await self.remove_user_presence()
        
        # Leave room group
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            
            # Handle video call signaling
            if data.get('type') == 'video-call':
                await self.handle_video_call(data)
                return

            message = data.get('message', '')
            sent_by_id = str(data.get('sent_by'))
            send_to_id = str(data.get('send_to'))
            attachment_urls = data.get('attachment_urls', [])

            if not all([sent_by_id, send_to_id]):
                print("Missing user IDs in message data")
                return

            # Get or create thread
            thread = await self.get_or_create_thread(sent_by_id, send_to_id)
            if not thread:
                print(f"Failed to get/create thread for users {sent_by_id} and {send_to_id}")
                return

            # Save message
            chat_message = await self.save_message(thread, sent_by_id, message, attachment_urls)
            if not chat_message:
                print(f"Failed to save message for thread {thread.id}")
                return

            # Record communication history
            await self.record_communication(sent_by_id, send_to_id)

            # Prepare message data
            message_data = {
                'type': 'chat_message',
                'message': message,
                'sent_by': sent_by_id,
                'send_to': send_to_id,
                'thread_id': str(thread.id),
                'attachment_urls': attachment_urls,
                'timestamp': chat_message.timestamp.strftime('%Y-%m-%d %H:%M:%S')
            }

            # Send message to sender's room
            await self.channel_layer.group_send(
                f'user_{sent_by_id}',
                message_data
            )

            # Send message to recipient's room
            await self.channel_layer.group_send(
                f'user_{send_to_id}',
                message_data
            )

        except Exception as e:
            print(f"Error in receive: {str(e)}")
            print(traceback.format_exc())

    async def chat_message(self, event):
        # Send message to WebSocket
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def update_user_presence(self):
        Presence.update_presence(self.user, self.channel_name)

    @database_sync_to_async
    def remove_user_presence(self):
        Presence.remove_presence(self.channel_name)

    @database_sync_to_async
    def get_or_create_thread(self, user1_id, user2_id):
        try:
            user1 = User.objects.get(id=int(user1_id))
            user2 = User.objects.get(id=int(user2_id))
            
            # Try to find existing thread
            thread = Thread.objects.filter(
                Q(first_person=user1, second_person=user2) |
                Q(first_person=user2, second_person=user1)
            ).first()
            
            if not thread:
                # Create new thread with consistent ordering
                first_person = user1 if user1.id < user2.id else user2
                second_person = user2 if user1.id < user2.id else user1
                thread = Thread.objects.create(
                    first_person=first_person,
                    second_person=second_person
                )
                print(f"Created new thread {thread.id} between users {user1.id} and {user2.id}")
            
            return thread
        except Exception as e:
            print(f"Error in get_or_create_thread: {str(e)}")
            print(traceback.format_exc())
            return None

    @database_sync_to_async
    def save_message(self, thread, user_id, message, attachment_urls):
        try:
            user = User.objects.get(id=int(user_id))
            chat_message = ChatMessage.objects.create(
                thread=thread,
                user=user,
                message=message
            )
            
            for url in attachment_urls:
                ChatAttachment.objects.create(
                    chat_message=chat_message,
                    file=url
                )
            print(f"Saved message {chat_message.id} in thread {thread.id}")
            return chat_message
        except Exception as e:
            print(f"Error in save_message: {str(e)}")
            print(traceback.format_exc())
            return None

    @database_sync_to_async
    def record_communication(self, user1_id, user2_id):
        try:
            user1 = User.objects.get(id=int(user1_id))
            user2 = User.objects.get(id=int(user2_id))
            CommunicationHistory.record_communication(user1, user2)
            CommunicationHistory.record_communication(user2, user1)
            print(f"Recorded communication between users {user1.id} and {user2.id}")
        except Exception as e:
            print(f"Error in record_communication: {str(e)}")
            print(traceback.format_exc())

    async def handle_video_call(self, data):
        try:
            to_user_id = data.get('to')
            if not to_user_id:
                return

            # Add the sender's ID to the message
            data['from'] = self.user_id

            # Send to recipient's room
            await self.channel_layer.group_send(
                f'user_{to_user_id}',
                {
                    'type': 'video_call_message',
                    'message': data
                }
            )
        except Exception as e:
            print(f"Error in handle_video_call: {str(e)}")
            print(traceback.format_exc())

    async def video_call_message(self, event):
        # Send video call message to WebSocket
        await self.send(text_data=json.dumps(event['message']))
