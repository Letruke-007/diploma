from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from rest_framework.test import APITestCase

User = get_user_model()


class UserManagerValidateTests(APITestCase):
    def setUp(self):
        self.manager = User.objects

    def test_validate_success(self):
        # Корректные username и пароль — ошибок нет
        self.manager._validate("TestUser1", "Abcdef1!")

    def test_validate_invalid_username(self):
        # Username не соответствует LOGIN_RE
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("1bad", "Abcdef1!")

        exc = ctx.exception
        self.assertIn("username", exc.message_dict)
        self.assertIn("Логин должен начинаться с буквы", exc.message_dict["username"][0])

    def test_validate_username_none(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate(None, "Abcdef1!")

        self.assertIn("username", ctx.exception.message_dict)

    def test_validate_password_too_short(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("GoodUser", "Ab1!")

        exc = ctx.exception
        self.assertIn("password", exc.message_dict)
        self.assertIn("Пароль должен быть не менее 6 символов", exc.message_dict["password"][0])

    def test_validate_password_none(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("GoodUser", None)

        self.assertIn("password", ctx.exception.message_dict)

    def test_validate_password_missing_uppercase(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("GoodUser", "abcdef1!")

        self.assertIn(
            "Пароль должен содержать минимум",
            ctx.exception.message_dict["password"][0],
        )

    def test_validate_password_missing_digit(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("GoodUser", "Abcdef!")

        self.assertIn(
            "Пароль должен содержать минимум",
            ctx.exception.message_dict["password"][0],
        )

    def test_validate_password_missing_special_char(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager._validate("GoodUser", "Abcdef1")

        self.assertIn(
            "Пароль должен содержать минимум",
            ctx.exception.message_dict["password"][0],
        )


class UserManagerCreateUserTests(APITestCase):
    def setUp(self):
        self.manager = User.objects

    def test_create_user_success(self):
        user = self.manager.create_user(
            username="GoodUser1",
            email="USER@Example.COM",
            full_name="Good User",
            password="Abcdef1!",
        )

        self.assertIsInstance(user, User)
        self.assertEqual(user.username, "GoodUser1")
        self.assertEqual(user.email, "USER@example.com")  # normalize_email
        self.assertEqual(user.full_name, "Good User")
        self.assertTrue(user.check_password("Abcdef1!"))

    def test_create_user_requires_email(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager.create_user(
                username="GoodUser1",
                email="",
                full_name="No Email",
                password="Abcdef1!",
            )

        exc = ctx.exception
        self.assertIn("email", exc.message_dict)
        self.assertEqual(exc.message_dict["email"], ["Email обязателен"])

    def test_create_user_invalid_username(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager.create_user(
                username="1bad",
                email="user@example.com",
                full_name="Bad User",
                password="Abcdef1!",
            )

        self.assertIn("username", ctx.exception.message_dict)

    def test_create_user_invalid_password(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager.create_user(
                username="GoodUser1",
                email="user@example.com",
                full_name="Bad Password",
                password="abc",
            )

        self.assertIn("password", ctx.exception.message_dict)

    def test_create_user_with_extra_fields(self):
        user = self.manager.create_user(
            username="ExtraUser1",
            email="extra@example.com",
            full_name="Extra User",
            password="Abcdef1!",
            is_active=False,
        )

        self.assertFalse(user.is_active)


class UserManagerCreateSuperuserTests(APITestCase):
    def setUp(self):
        self.manager = User.objects

    def test_create_superuser_sets_flags(self):
        user = self.manager.create_superuser(
            username="AdminUser1",
            email="ADMIN@Example.COM",
            full_name="Admin User",
            password="Abcdef1!",
        )

        self.assertTrue(user.is_admin)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("Abcdef1!"))
        self.assertEqual(user.email, "ADMIN@example.com")

    def test_create_superuser_respects_explicit_flags(self):
        user = self.manager.create_superuser(
            username="CustomAdmin1",
            email="custom@example.com",
            full_name="Custom Admin",
            password="Abcdef1!",
            is_admin=False,
            is_staff=False,
            is_superuser=False,
        )

        self.assertFalse(user.is_admin)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser_invalid_username(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager.create_superuser(
                username="1bad",
                email="admin@example.com",
                full_name="Bad Admin",
                password="Abcdef1!",
            )

        self.assertIn("username", ctx.exception.message_dict)

    def test_create_superuser_requires_email(self):
        with self.assertRaises(ValidationError) as ctx:
            self.manager.create_superuser(
                username="AdminUser2",
                email="",
                full_name="No Email",
                password="Abcdef1!",
            )

        self.assertIn("email", ctx.exception.message_dict)
