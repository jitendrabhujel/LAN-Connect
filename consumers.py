import json
import asyncio
from channels.consumer import AsyncConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from .models import Thread, ChatMessage, Presence, ChatAttachment, CommunicationHistory

User = get_user_model()

class ChatConsumer(AsyncConsumer):
    async def websocket_connect(self, event):
        print('connected', event)
        user = self.scope['user']
        if not user.is_authenticated:
            await self.send({
                'type': 'websocket.close',
            })
            return
        chat_room = f'user_chatroom_{user.id}'
        self.chat_room = chat_room
        self.user = user
        await self.channel_layer.group_add(chat_room, self.channel_name)
        await self.update_presence()
        print(f"Updated presence for user: {user.username}, channel: {self.channel_name}")
        await self.send({
            'type': 'websocket.accept'
        })

    async def websocket_receive(self, event):
        print('receive', event)
        received_data = json.loads(event['text'])
        msg = received_data.get('message')
        sent_by_id = received_data.get('sent_by')
        send_to_id = received_data.get('send_to')
        attachment_urls = received_data.get('attachment_urls', [])

        if not sent_by_id or not send_to_id:
            print('Error: Invalid message data')
            await self.send({
                'type': 'websocket.send',
                'text': json.dumps({'error': 'Invalid message data'})
            })
            return

        sent_by_user = await self.get_user_object(sent_by_id)
        send_to_user = await self.get_user_object(send_to_id)
        if not sent_by_user or not send_to_user:
            print('Error: User not found')
            return

        thread = await self.get_or_create_thread(sent_by_user, send_to_user)
        if not thread:
            print('Error: Could not create thread')
            return

        chat_message = await self.save_message_with_attachment(thread, sent_by_user, msg, attachment_urls)

        await self.record_communication(sent_by_user, send_to_user)
        await self.record_communication(send_to_user, sent_by_user)

        other_user_chat_room = f'user_chatroom_{send_to_id}'
        response = {
            'message': msg,
            'sent_by': sent_by_id,
            'send_to': send_to_id,
            'thread_id': str(thread.id),  # Ensure thread_id is included
            'attachment_urls': attachment_urls
        }

        await self.channel_layer.group_send(
            other_user_chat_room,
            {
                'type': 'chat_message',
                'text': json.dumps(response)
            }
        )
        await self.channel_layer.group_send(
            self.chat_room,
            {
                'type': 'chat_message',
                'text': json.dumps(response)
            }
        )

    async def websocket_disconnect(self, event):
        print('disconnected', event)
        await self.remove_presence()
        print(f"Removed presence for channel: {self.channel_name}")
        try:
            await asyncio.wait_for(
                self.channel_layer.group_discard(self.chat_room, self.channel_name),
                timeout=2.0
            )
        except asyncio.TimeoutError:
            print(f"Timeout discarding {self.channel_name} from {self.chat_room}")

    async def chat_message(self, event):
        print('chat_message', event)
        await self.send({
            'type': 'websocket.send',
            'text': event['text']
        })

    @database_sync_to_async
    def get_user_object(self, user_id):
        qs = User.objects.filter(id=user_id)
        return qs.first() if qs.exists() else None

    @database_sync_to_async
    def get_or_create_thread(self, user1, user2):
        try:
            thread, created = Thread.objects.get_or_create(
                first_person=min(user1, user2, key=lambda x: x.id),
                second_person=max(user1, user2, key=lambda x: x.id)
            )
            return thread
        except Exception as e:
            print(f"Error creating thread: {e}")
            return None

    @database_sync_to_async
    def save_message_with_attachment(self, thread, user, message, attachment_urls):
        try:
            chat_message = ChatMessage.objects.create(
                thread=thread,
                user=user,
                message=message
            )
            for url in attachment_urls:
                ChatAttachment.objects.create(chat_message=chat_message, file=url)
            return chat_message
        except Exception as e:
            print(f"Error saving message with attachment: {e}")
            return None

    @database_sync_to_async
    def record_communication(self, user, communicated_with):
        CommunicationHistory.record_communication(user, communicated_with)

    @database_sync_to_async
    def update_presence(self):
        Presence.update_presence(self.user, self.channel_name)

    @database_sync_to_async
    def remove_presence(self):
        Presence.remove_presence(self.channel_name)
