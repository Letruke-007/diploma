from django.contrib.auth.base_user import BaseUserManager
from django.core.exceptions import ValidationError
import re

LOGIN_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]{3,19}$')

class UserManager(BaseUserManager):
    use_in_migrations = True

    def _validate(self, username, password):
        if not LOGIN_RE.match(username or ''):
            raise ValidationError('Invalid username format')
        # пароль ≥6, хотя бы 1 заглавная, 1 цифра, 1 спецсимвол
        if not password or len(password) < 6:
            raise ValidationError('Password too short')
        import re as _re
        if not _re.search(r'[A-Z]', password) or not _re.search(r'\d', password) or not _re.search(r'[^A-Za-z0-9]', password):
            raise ValidationError('Password must contain uppercase, digit and special char')

    def create_user(self, username, email, full_name, password=None, **extra):
        if not email:
            raise ValidationError('Email required')
        self._validate(username, password)
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, full_name=full_name, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, full_name='Admin', password=None, **extra):
        extra.setdefault('is_admin', True)
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(username, email, full_name, password, **extra)