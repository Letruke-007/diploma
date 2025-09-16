from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os

class Command(BaseCommand):
    help = 'Create initial admin with env ADMIN_USERNAME/EMAIL/PASSWORD'

    def handle(self, *args, **options):
        U = get_user_model()
        username = os.environ.get('ADMIN_USERNAME', 'admin')
        email = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
        password = os.environ.get('ADMIN_PASSWORD', 'Admin@123')
        if not U.objects.filter(username=username).exists():
            U.objects.create_superuser(username=username, email=email, full_name='Administrator', password=password)
            self.stdout.write(self.style.SUCCESS('Admin user created'))
        else:
            self.stdout.write('Admin already exists')