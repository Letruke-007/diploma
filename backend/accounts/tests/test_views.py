from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from rest_framework import status
from rest_framework.test import APITestCase, APIRequestFactory, force_authenticate

from accounts.views import (
    AdminOnly,
    csrf,
    register,
    login_view,
    logout_view,
    me,
    admin_users,
    admin_patch_user,
    admin_delete_user,
)

User = get_user_model()


class AdminOnlyPermissionTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_denies_unauthenticated(self):
        request = self.factory.get("/x")
        request.user = None
        perm = AdminOnly()
        self.assertFalse(perm.has_permission(request, None))

    def test_denies_non_admin(self):
        user = User.objects.create_user(
            username="user",
            email="user@example.com",
            full_name="User",
            password="Abcdef1!",
        )
        request = self.factory.get("/x")
        request.user = user
        perm = AdminOnly()
        self.assertFalse(perm.has_permission(request, None))

    def test_allows_admin(self):
        admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        admin.is_admin = True
        admin.save()

        request = self.factory.get("/x")
        request.user = admin
        perm = AdminOnly()
        self.assertTrue(perm.has_permission(request, None))


class CsrfViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_csrf_ok(self):
        request = self.factory.get("/api/auth/csrf/")
        response = csrf(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"detail": "ok"})


class RegisterViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_register_success(self):
        payload = {
            "username": "NewUser1",
            "full_name": "New User",
            "email": "new@example.com",
            "password": "Abcdef1!",
        }

        with mock.patch("accounts.views.login") as m:
            request = self.factory.post("/api/auth/register/", payload, format="json")
            response = register(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "NewUser1")
        self.assertIn("id", response.data)
        m.assert_called_once()

    def test_register_invalid_serializer(self):
        request = self.factory.post("/api/auth/register/", {}, format="json")
        response = register(request)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", response.data)

    def test_register_validation_error_from_manager(self):
        payload = {
            "username": "BadUser",
            "full_name": "Bad User",
            "email": "bad@example.com",
            "password": "Abcdef1!",
        }

        def raise_validation(*args, **kwargs):
            raise ValidationError({"username": ["invalid"]})

        with mock.patch(
            "accounts.views.User.objects.create_user",
            side_effect=raise_validation,
        ), mock.patch("accounts.views.login"):
            request = self.factory.post("/api/auth/register/", payload, format="json")
            response = register(request)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["username"], ["invalid"])

    def test_register_integrity_error(self):
        payload = {
            "username": "dupe",
            "full_name": "Dup User",
            "email": "dup@example.com",
            "password": "Abcdef1!",
        }

        with mock.patch(
            "accounts.views.User.objects.create_user",
            side_effect=Exception("integrity"),
        ), mock.patch("accounts.views.login"):
            request = self.factory.post("/api/auth/register/", payload, format="json")
            response = register(request)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="user1",
            email="user1@example.com",
            full_name="User One",
            password="Abcdef1!",
        )

    def test_invalid_serializer(self):
        request = self.factory.post("/api/auth/login/", {}, format="json")
        response = login_view(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", response.data)

    def test_invalid_credentials(self):
        payload = {"username": "user1", "password": "wrong"}

        with mock.patch("accounts.views.authenticate", return_value=None):
            request = self.factory.post("/api/auth/login/", payload, format="json")
            response = login_view(request)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Пользователь с таким именем не существует",
        )

    def test_inactive_user(self):
        inactive = User.objects.create_user(
            username="inactive",
            email="inactive@example.com",
            full_name="Inactive",
            password="Abcdef1!",
        )
        inactive.is_active = False
        inactive.save()

        payload = {"username": "inactive", "password": "Abcdef1!"}

        with mock.patch("accounts.views.authenticate", return_value=inactive):
            request = self.factory.post("/api/auth/login/", payload, format="json")
            response = login_view(request)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Пользователь деактивирован, вход невозможен",
        )

    def test_login_success(self):
        payload = {"username": "user1", "password": "Abcdef1!"}

        with mock.patch(
            "accounts.views.authenticate", return_value=self.user
        ), mock.patch("accounts.views.login") as m:
            request = self.factory.post("/api/auth/login/", payload, format="json")
            response = login_view(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "user1")
        m.assert_called_once()


class LogoutAndMeViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            full_name="User Two",
            password="Abcdef1!",
        )

    def test_logout_requires_auth(self):
        request = self.factory.post("/api/auth/logout/")
        response = logout_view(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_success(self):
        request = self.factory.post("/api/auth/logout/")
        force_authenticate(request, user=self.user)

        with mock.patch("accounts.views.logout") as m:
            response = logout_view(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Logged out")
        m.assert_called_once()

    def test_me_requires_auth(self):
        request = self.factory.get("/api/auth/me/")
        response = me(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_user(self):
        request = self.factory.get("/api/auth/me/")
        force_authenticate(request, user=self.user)
        response = me(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "user2")
        self.assertEqual(response.data["email"], "user2@example.com")


class AdminUsersViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        self.admin.is_admin = True
        self.admin.save()

        self.u1 = User.objects.create_user(
            username="alpha",
            email="alpha@example.com",
            full_name="Alpha",
            password="Abcdef1!",
        )
        self.u2 = User.objects.create_user(
            username="beta",
            email="beta@example.com",
            full_name="Beta",
            password="Abcdef1!",
        )

    def test_requires_auth(self):
        request = self.factory.get("/x")
        response = admin_users(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_admin(self):
        request = self.factory.get("/x")
        force_authenticate(request, user=self.u1)
        response = admin_users(request)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_users(self):
        request = self.factory.get("/x")
        force_authenticate(request, user=self.admin)
        response = admin_users(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {r["id"] for r in response.data["results"]}
        self.assertIn(self.admin.id, ids)
        self.assertIn(self.u1.id, ids)
        self.assertIn(self.u2.id, ids)

    def test_filter_q(self):
        request = self.factory.get("/x?q=alp")
        force_authenticate(request, user=self.admin)
        response = admin_users(request)

        usernames = {r["username"] for r in response.data["results"]}
        self.assertIn("alpha", usernames)
        self.assertNotIn("beta", usernames)


class AdminPatchUserTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = User.objects.create_user(
            username="adminp",
            email="adminp@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        self.admin.is_admin = True
        self.admin.save()

        self.target = User.objects.create_user(
            username="target",
            email="target@example.com",
            full_name="Target",
            password="Abcdef1!",
        )

    def test_prevent_self_deactivate(self):
        request = self.factory.patch("/x", {"is_active": "false"}, format="json")
        force_authenticate(request, user=self.admin)
        response = admin_patch_user(request, self.admin.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "You cannot deactivate yourself",
        )

    def test_update_flags(self):
        payload = {
            "is_active": "false",
            "is_admin": "true",
            "is_staff": "true",
            "is_superuser": "false",
        }

        request = self.factory.patch("/x", payload, format="json")
        force_authenticate(request, user=self.admin)
        response = admin_patch_user(request, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()

        self.assertFalse(self.target.is_active)
        self.assertTrue(self.target.is_admin)
        self.assertTrue(self.target.is_staff)
        self.assertFalse(self.target.is_superuser)


class AdminDeleteUserTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = User.objects.create_user(
            username="admind",
            email="admind@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        self.admin.is_admin = True
        self.admin.save()

        self.target = User.objects.create_user(
            username="dele",
            email="del@example.com",
            full_name="Del",
            password="Abcdef1!",
        )

    def test_prevent_self_delete(self):
        request = self.factory.delete("/x")
        force_authenticate(request, user=self.admin)
        response = admin_delete_user(request, self.admin.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "You cannot deactivate yourself",
        )

    def test_soft_delete(self):
        request = self.factory.delete("/x")
        force_authenticate(request, user=self.admin)
        response = admin_delete_user(request, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()

        self.assertFalse(self.target.is_active)
        self.assertIsNotNone(self.target.date_deleted)
        self.assertLess(self.target.date_deleted, timezone.now())
