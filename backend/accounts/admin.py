from django.contrib import admin
from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'username', 'email', 'full_name',
        'is_admin', 'is_staff', 'is_active',
        'date_joined', 'last_login',
    )
    list_filter = ('is_admin', 'is_staff', 'is_active')
    search_fields = ('username', 'email', 'full_name')
    ordering = ('-date_joined', '-id')
    readonly_fields = ('date_joined', 'last_login')
