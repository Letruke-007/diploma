from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase


class CreateInitialAdminCommandTests(TestCase):
    def setUp(self):
        self.User = get_user_model()

    def _run(self) -> str:
        from mycloud.management.commands.create_initial_admin import Command

        out = StringIO()
        cmd = Command()
        cmd.stdout = out
        cmd.handle()
        return out.getvalue()

    @patch.dict(
        "os.environ",
        {
            "ADMIN_USERNAME": "rootadmin",
            "ADMIN_EMAIL": "root@example.com",
            "ADMIN_PASSWORD": "TestPass123!",
        },
        clear=True,
    )
    def test_creates_admin_when_not_exists(self):
        output = self._run()

        self.assertTrue(self.User.objects.filter(username="rootadmin").exists())
        user = self.User.objects.get(username="rootadmin")

        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_admin)
        self.assertEqual(user.email, "root@example.com")
        self.assertIn("Admin user created", output)

    @patch.dict(
        "os.environ",
        {
            "ADMIN_USERNAME": "existingadmin",
            "ADMIN_EMAIL": "ex@example.com",
            "ADMIN_PASSWORD": "TestPass456!",
        },
        clear=True,
    )
    def test_does_not_duplicate_if_user_exists(self):
        self.User.objects.create_superuser(
            username="existingadmin",
            email="ex@example.com",
            full_name="Administrator",
            password="Abcdef1!",
        )

        output = self._run()

        self.assertEqual(self.User.objects.filter(username="existingadmin").count(), 1)
        self.assertIn("Admin already exists", output)

    @patch.dict("os.environ", {}, clear=True)
    def test_uses_default_env_values(self):
        output = self._run()

        self.assertTrue(self.User.objects.filter(username="admin").exists())
        user = self.User.objects.get(username="admin")

        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_admin)
        self.assertIn("Admin user created", output)
