from django.utils import timezone
from django.contrib.auth import get_user_model

from rest_framework.test import APITestCase

User = get_user_model()


class UserModelTests(APITestCase):
    def test_create_user_minimal(self):
        user = User.objects.create_user(
            username="UserA",
            email="USERA@Example.COM",
            full_name="User A",
            password="Abcdef1!",
        )

        self.assertEqual(user.username, "UserA")
        # normalize_email приводит домен к нижнему регистру
        self.assertEqual(user.email, "USERA@example.com")
        self.assertEqual(user.full_name, "User A")
        self.assertTrue(user.check_password("Abcdef1!"))

    def test_default_fields(self):
        user = User.objects.create_user(
            username="UserB",
            email="userb@example.com",
            full_name="User B",
            password="Abcdef1!",
        )

        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_admin)
        self.assertEqual(user.storage_rel_path, "")
        self.assertIsNotNone(user.date_joined)
        self.assertIsNone(user.date_deleted)

    def test_str_returns_username(self):
        user = User.objects.create_user(
            username="PrettyName",
            email="pretty@example.com",
            full_name="Pretty User",
            password="Abcdef1!",
        )

        self.assertEqual(str(user), "PrettyName")

    def test_required_fields_defined(self):
        self.assertEqual(User.USERNAME_FIELD, "username")
        self.assertEqual(User.REQUIRED_FIELDS, ["email", "full_name"])

    def test_create_superuser_sets_super_flags(self):
        su = User.objects.create_superuser(
            username="AdminUser",
            email="ADMIN@Example.COM",
            full_name="Admin",
            password="Abcdef1!",
        )

        self.assertTrue(su.is_superuser)
        self.assertTrue(su.is_staff)
        self.assertTrue(su.is_admin)
        self.assertEqual(su.email, "ADMIN@example.com")

    def test_date_joined_auto_set(self):
        before = timezone.now()

        user = User.objects.create_user(
            username="UserC",
            email="userc@example.com",
            full_name="User C",
            password="Abcdef1!",
        )

        self.assertGreaterEqual(user.date_joined, before)
