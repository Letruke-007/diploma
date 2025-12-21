from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

from rest_framework.test import APITestCase, APIRequestFactory, force_authenticate
from rest_framework import status

from storageapp.models import StoredFile

from accounts.admin_views import (
    _is_admin,
    _user_public_dict,
    UserPagination,
    admin_users_list,
    admin_user_patch,
    admin_user_delete,
    admin_user_purge,
)

User = get_user_model()


def create_user_raw(**kwargs):
    defaults = {
        "username": "user@example.com",
        "email": "user@example.com",
        "full_name": "User",
        "is_active": True,
    }
    defaults.update(kwargs)
    return User.objects.create(**defaults)


def create_stored_file(owner, size=0, **extra):
    data = {}

    for field in StoredFile._meta.fields:
        if field.name == "id":
            continue
        if field.name in extra:
            continue

        if field.name == "owner":
            data["owner"] = owner
            continue

        if field.name == "size":
            data["size"] = size
            continue

        if field.null:
            continue
        if field.has_default() or field.default is not models.NOT_PROVIDED:
            continue
        if getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False):
            continue

        if isinstance(field, (models.CharField, models.TextField)):
            data[field.name] = "x"
        elif isinstance(field, models.BooleanField):
            data[field.name] = False
        elif isinstance(field, models.DateTimeField):
            data[field.name] = timezone.now()
        elif isinstance(field, models.DateField):
            data[field.name] = timezone.now().date()
        elif isinstance(field, (models.IntegerField, models.BigIntegerField)):
            data[field.name] = 1
        else:
            data[field.name] = "x"

    data.update(extra)
    return StoredFile.objects.create(**data)


class AdminHelpersTests(APITestCase):
    def test_is_admin_true_for_is_admin(self):
        u = User(username="a", email="a@a.com")
        u.is_admin = True
        self.assertTrue(_is_admin(u))

    def test_is_admin_true_for_is_superuser(self):
        u = User(username="b", email="b@b.com")
        u.is_superuser = True
        self.assertTrue(_is_admin(u))

    def test_is_admin_false(self):
        u = User(username="c", email="c@c.com")
        u.is_admin = False
        u.is_superuser = False
        self.assertFalse(_is_admin(u))

    def test_user_public_dict_full(self):
        u = create_user_raw(
            username="user1",
            email="u1@example.com",
            full_name="User One",
        )
        aggregates = {
            u.id: {
                "files_count": 3,
                "files_total_size": 150,
            }
        }

        data = _user_public_dict(u, aggregates)

        self.assertEqual(data["id"], u.id)
        self.assertEqual(data["username"], "user1")
        self.assertEqual(data["email"], "u1@example.com")
        self.assertEqual(data["full_name"], "User One")
        self.assertTrue(data["is_active"])
        self.assertEqual(data["files_count"], 3)
        self.assertEqual(data["files_total_size"], 150)

    def test_user_public_dict_defaults(self):
        u = User(username="x")
        data = _user_public_dict(u, None)

        self.assertEqual(data["files_count"], 0)
        self.assertEqual(data["files_total_size"], 0)
        self.assertEqual(data["email"], "")
        self.assertEqual(data["full_name"], "")
        self.assertFalse(data["is_admin"])


class PaginationTests(APITestCase):
    def test_defaults(self):
        p = UserPagination()
        self.assertEqual(p.page_size, 20)
        self.assertEqual(p.page_size_query_param, "page_size")
        self.assertEqual(p.max_page_size, 100)


class AdminUsersListTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = create_user_raw(
            username="admin",
            email="admin@example.com",
            is_admin=True,
        )

        self.u1 = create_user_raw(
            username="alpha",
            email="a@example.com",
            full_name="Alpha User",
        )
        self.u2 = create_user_raw(
            username="beta",
            email="b@example.com",
            full_name="Beta User",
        )

    def test_requires_auth(self):
        request = self.factory.get("/admin/users/")
        response = admin_users_list(request)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_forbidden_for_non_admin(self):
        request = self.factory.get("/admin/users/")
        force_authenticate(request, user=self.u1)
        response = admin_users_list(request)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_users_and_aggregates(self):
        create_stored_file(owner=self.u1, size=100)
        create_stored_file(owner=self.u1, size=200)

        request = self.factory.get("/admin/users/")
        force_authenticate(request, user=self.admin)
        response = admin_users_list(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("items", response.data)
        self.assertIn("data", response.data)

        alpha = [u for u in response.data["results"] if u["id"] == self.u1.id][0]
        self.assertEqual(alpha["files_count"], 2)
        self.assertEqual(alpha["files_total_size"], 300)

    def test_filter_by_query(self):
        request = self.factory.get("/admin/users/", {"q": "alp"})
        force_authenticate(request, user=self.admin)
        response = admin_users_list(request)

        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["username"], "alpha")

    def test_blank_query_is_ignored(self):
        request = self.factory.get("/admin/users/", {"q": "   "})
        force_authenticate(request, user=self.admin)
        response = admin_users_list(request)

        ids = {u["id"] for u in response.data["results"]}
        self.assertIn(self.u1.id, ids)
        self.assertIn(self.u2.id, ids)


class AdminUserPatchTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = create_user_raw(
            username="admin",
            email="admin@example.com",
            is_admin=True,
        )
        self.u = create_user_raw(
            username="user",
            email="user@example.com",
        )

    def test_requires_auth(self):
        request = self.factory.patch("/x/", {}, format="json")
        response = admin_user_patch(request, self.u.id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_404_if_not_found(self):
        request = self.factory.patch("/x/", {}, format="json")
        force_authenticate(request, user=self.admin)
        response = admin_user_patch(request, 9999)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_deactivate_self(self):
        request = self.factory.patch("/x/", {"is_active": False}, format="json")
        force_authenticate(request, user=self.admin)
        response = admin_user_patch(request, self.admin.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_fields(self):
        payload = {
            "email": " new@example.com ",
            "full_name": " New Name ",
            "is_admin": True,
            "is_active": False,
        }
        request = self.factory.patch("/x/", payload, format="json")
        force_authenticate(request, user=self.admin)
        response = admin_user_patch(request, self.u.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.u.refresh_from_db()
        self.assertEqual(self.u.email, "new@example.com")
        self.assertEqual(self.u.full_name, "New Name")
        self.assertFalse(self.u.is_active)


class AdminUserDeleteTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = create_user_raw(
            username="admin",
            email="admin@example.com",
            is_admin=True,
        )
        self.u = create_user_raw(username="user", email="u@example.com")

    def test_soft_delete(self):
        request = self.factory.delete("/x/")
        force_authenticate(request, user=self.admin)
        response = admin_user_delete(request, self.u.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "deactivated")

        self.u.refresh_from_db()
        self.assertFalse(self.u.is_active)


class AdminUserPurgeTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        self.admin = create_user_raw(
            username="admin",
            email="admin@example.com",
            is_admin=True,
        )
        self.u = create_user_raw(
            username="user",
            email="u@example.com",
            is_active=False,
        )

    def test_cannot_purge_active_user(self):
        active = create_user_raw(username="active", is_active=True)

        request = self.factory.delete("/x/")
        force_authenticate(request, user=self.admin)
        response = admin_user_purge(request, active.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purge_user_and_files(self):
        create_stored_file(owner=self.u, size=10)
        create_stored_file(owner=self.u, size=20)

        request = self.factory.delete("/x/")
        force_authenticate(request, user=self.admin)
        response = admin_user_purge(request, self.u.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "purged")
        self.assertFalse(User.objects.filter(id=self.u.id).exists())
