from django.urls import path
from . import consumers 

websocket_urlpatterns = [
    path('home/', consumers.ChatConsumer.as_asgi()),

]
