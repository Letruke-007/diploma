from django.test import TestCase, Client
from django.contrib.auth import get_user_model

User = get_user_model()

ADMIN_LIST_URL = "/api/auth/admin/users"
ADMIN_USER_URL = "/api/auth/admin/users/{id}"
ADMIN_DEACTIVATE_URL = "/api/auth/admin/users/{id}/deactivate"
ADMIN_ACTIVATE_URL = "/api/auth/admin/users/{id}/activate"


class AdminApiTests(TestCase):
    def setUp(self):
        # обычный пользователь
        self.alice_pwd = "Pass12345!"
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            full_name="Alice A",
            password=self.alice_pwd,
        )
        # админ
        self.admin_pwd = "Pass12345!"
        self.admin = User.objects.create_user(
            username="adminuser",
            email="admin@example.com",
            full_name="Admin",
            password=self.admin_pwd,
            is_admin=True,
        )
        self.c_user = Client()
        self.c_admin = Client()

        # логин обычного пользователя
        r = self.c_user.post("/api/auth/login", {"username": "alice", "password": self.alice_pwd})
        assert r.status_code == 200, r.content

        # логин админа
        r = self.c_admin.post("/api/auth/login", {"username": "adminuser", "password": self.admin_pwd})
        assert r.status_code == 200, r.content

    def test_non_admin_forbidden(self):
        # не-админ не видит список пользователей
        r = self.c_user.get(ADMIN_LIST_URL)
        self.assertIn(r.status_code, (401, 403, 404), r.content)

        # не-админ не может блокировать
        r = self.c_user.post(ADMIN_DEACTIVATE_URL.format(id=self.alice.id))
        self.assertIn(r.status_code, (401, 403, 404), r.content)

    def test_admin_list_block_unblock_patch_delete(self):
        # список пользователей (админ)
        r = self.c_admin.get(ADMIN_LIST_URL)
        self.assertEqual(r.status_code, 200, r.content)
        users = r.json().get("results") or r.js
