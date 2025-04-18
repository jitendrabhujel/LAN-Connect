from django.urls import path
from . import views

urlpatterns = [
    path('', views.HomePage, name='home'),
    path('signup/', views.SignupPage, name='signup'),
    path('login/', views.LoginPage, name='login'),
    path('logout/', views.logoutUser, name='logout'),
    path('messages/', views.messages_page, name='messages'),
    path('video_call/', views.video_call, name='video_call'),
    path('upload/', views.upload_file, name='upload_file'),
    path('fetch_chat_history/', views.fetch_chat_history, name='fetch_chat_history'),
    path('fetch_unread_counts/', views.fetch_unread_counts, name='fetch_unread_counts'),
    path('create_group/', views.create_group, name='create_group'),
    path('fetch_group_chat_history/', views.fetch_group_chat_history, name='fetch_group_chat_history'),
    path('get_group_chat/<int:group_id>/', views.get_group_chat, name='get_group_chat'),
    path('get_group_info/<int:group_id>/', views.get_group_info, name='get_group_info'),
    path('manage_group_members/<int:group_id>/', views.manage_group_members, name='manage_group_members'),
    path('add_group_members/<int:group_id>/', views.add_group_members, name='add_group_members'),
    path('user_status/', views.user_status, name='user_status'),
]