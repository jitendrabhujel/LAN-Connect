from django.contrib import admin
from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Q
from .models import Thread, ChatMessage, Presence, CommunicationHistory

admin.site.register(ChatMessage)
admin.site.register(Presence)
admin.site.register(CommunicationHistory)

class ChatMessageInline(admin.TabularInline):
    model = ChatMessage

class ThreadForm(forms.ModelForm):
    def clean(self):
        super(ThreadForm, self).clean()
        first_person = self.cleaned_data.get('first_person')
        second_person = self.cleaned_data.get('second_person')
        lookup1 = Q(first_person=first_person) & Q(second_person=second_person)
        lookup2 = Q(first_person=second_person) & Q(second_person=first_person)
        lookup = Q(lookup1 | lookup2)
        qs = Thread.objects.filter(lookup)
        if qs.exists():
            raise ValidationError(f'Thread between {first_person} and {second_person} already exists.')

class ThreadAdmin(admin.ModelAdmin):
    inlines = [ChatMessageInline]
    form = ThreadForm
    class Meta:
        model = Thread
    fields = ['is_group', 'other_field']  # Ensure 'is_group' is in the form

admin.site.register(Thread, ThreadAdmin)
