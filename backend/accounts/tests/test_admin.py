# backend/accounts/tests/test_admin.py
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from accounts.admin import UserAdmin

User = get_user_model()


class UserAdminRegistrationTests(SimpleTestCase):
    def test_user_model_registered_in_admin_site(self):
        # Регистрация выполняется декоратором @admin.register(User) при импорте accounts.admin
        self.assertIn(User, admin.site._registry)
        self.assertIsInstance(admin.site._registry[User], UserAdmin)


class UserAdminConfigurationTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_admin = UserAdmin(User, admin.site)

    def test_list_display(self):
        self.assertEqual(
            self.user_admin.list_display,
            (
                "id",
                "username",
                "email",
                "full_name",
                "is_admin",
                "is_staff",
                "is_active",
                "date_joined",
                "last_login",
            ),
        )

    def test_list_filter(self):
        self.assertEqual(
            self.user_admin.list_filter,
            ("is_admin", "is_staff", "is_active"),
        )

    def test_search_fields(self):
        self.assertEqual(
            self.user_admin.search_fields,
            ("username", "email", "full_name"),
        )

    def test_ordering(self):
        self.assertEqual(
            self.user_admin.ordering,
            ("-date_joined", "-id"),
        )

    def test_readonly_fields(self):
        self.assertEqual(
            self.user_admin.readonly_fields,
            ("date_joined", "last_login"),
        )
