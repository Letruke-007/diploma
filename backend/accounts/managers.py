import re

from django.contrib.auth.base_user import BaseUserManager
from django.core.exceptions import ValidationError

LOGIN_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]{3,19}$")


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _validate(self, username, password):
        errors = {}

        if not LOGIN_RE.match(username or ""):
            errors["username"] = [
                "Логин должен начинаться с буквы и содержать только латинские буквы и цифры (4–20 символов)"
            ]

        if not password or len(password) < 6:
            errors["password"] = [
                "Пароль должен быть не менее 6 символов и содержать минимум: 1 заглавную букву, 1 цифру и 1 спецсимвол"
            ]
        else:
            if (
                not re.search(r"[A-Z]", password)
                or not re.search(r"\d", password)
                or not re.search(r"[^A-Za-z0-9]", password)
            ):
                errors["password"] = [
                    "Пароль должен содержать минимум: 1 заглавную букву, 1 цифру и 1 спецсимвол"
                ]

        if errors:
            raise ValidationError(errors)

    def create_user(self, username, email, full_name, password=None, **extra):
        if not email:
            raise ValidationError({"email": ["Email обязателен"]})

        self._validate(username, password)

        email = self.normalize_email(email)
        user = self.model(
            username=username,
            email=email,
            full_name=full_name,
            **extra,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        username,
        email,
        full_name="Admin",
        password=None,
        **extra,
    ):
        extra.setdefault("is_admin", True)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)

        return self.create_user(
            username,
            email,
            full_name,
            password,
            **extra,
        )
