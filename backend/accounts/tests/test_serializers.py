from django.contrib.auth import get_user_model

from rest_framework.test import APITestCase

from accounts.serializers import (
    UserPublicSerializer,
    RegisterSerializer,
    LoginSerializer,
    AdminUserSerializer,
)

User = get_user_model()


class UserPublicSerializerTests(APITestCase):
    def test_user_public_serializer_fields(self):
        user = User.objects.create_user(
            username="userpub1",
            email="PUB@Example.COM",
            full_name="Public User",
            password="Abcdef1!",
        )

        serializer = UserPublicSerializer(instance=user)
        data = serializer.data

        self.assertEqual(
            set(data.keys()),
            {
                "id",
                "username",
                "full_name",
                "email",
                "is_admin",
                "storage_rel_path",
                "date_joined",
            },
        )
        self.assertEqual(data["username"], "userpub1")
        self.assertEqual(data["email"], "PUB@example.com")
        self.assertIn("date_joined", data)


class RegisterSerializerTests(APITestCase):
    def test_register_serializer_valid(self):
        payload = {
            "username": "RegUser1",
            "full_name": "Register User",
            "email": "reg@example.com",
            "password": "Abcdef1!",
        }

        serializer = RegisterSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        self.assertEqual(serializer.validated_data["username"], "RegUser1")
        self.assertEqual(serializer.validated_data["full_name"], "Register User")
        self.assertEqual(serializer.validated_data["email"], "reg@example.com")
        self.assertEqual(serializer.validated_data["password"], "Abcdef1!")

    def test_register_serializer_missing_required_fields(self):
        serializer = RegisterSerializer(data={})
        self.assertFalse(serializer.is_valid())

        self.assertIn("username", serializer.errors)
        self.assertIn("full_name", serializer.errors)
        self.assertIn("email", serializer.errors)
        self.assertIn("password", serializer.errors)

    def test_register_serializer_invalid_username(self):
        serializer = RegisterSerializer(
            data={
                "username": "1bad",
                "full_name": "Bad User",
                "email": "bad@example.com",
                "password": "Abcdef1!",
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)
        self.assertIn(
            "Логин должен начинаться с буквы",
            serializer.errors["username"][0],
        )

    def test_register_serializer_password_write_only(self):
        payload = {
            "username": "RegUser2",
            "full_name": "Register User 2",
            "email": "reg2@example.com",
            "password": "Abcdef1!",
        }

        serializer = RegisterSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        data = serializer.data
        self.assertNotIn("password", data)
        self.assertTrue(serializer.fields["password"].write_only)


class LoginSerializerTests(APITestCase):
    def test_login_serializer_valid(self):
        payload = {
            "username": "loginuser",
            "password": "Abcdef1!",
        }

        serializer = LoginSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        self.assertEqual(serializer.validated_data["username"], "loginuser")
        self.assertEqual(serializer.validated_data["password"], "Abcdef1!")

    def test_login_serializer_required_fields(self):
        serializer = LoginSerializer(data={})
        self.assertFalse(serializer.is_valid())

        self.assertIn("username", serializer.errors)
        self.assertIn("password", serializer.errors)

    def test_login_serializer_password_write_only(self):
        serializer = LoginSerializer(
            data={"username": "loginuser2", "password": "Abcdef1!"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        self.assertNotIn("password", serializer.data)
        self.assertTrue(serializer.fields["password"].write_only)


class AdminUserSerializerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="adminser",
            email="adminser@example.com",
            full_name="Admin Serializer",
            password="Abcdef1!",
        )

    def test_admin_user_serializer_fields(self):
        self.user.files_count = 3
        self.user.files_total_size = 1024

        serializer = AdminUserSerializer(instance=self.user)
        data = serializer.data

        self.assertEqual(
            set(data.keys()),
            {
                "id",
                "username",
                "full_name",
                "email",
                "is_admin",
                "is_staff",
                "is_superuser",
                "is_active",
                "date_joined",
                "files_count",
                "files_total_size",
            },
        )

        self.assertEqual(data["username"], "adminser")
        self.assertEqual(data["files_count"], 3)
        self.assertEqual(data["files_total_size"], 1024)

    def test_admin_user_serializer_read_only_meta_fields(self):
        payload = {
            "username": "newname",
            "email": "new@example.com",
            "is_admin": True,
            "id": 999,
            "date_joined": "2000-01-01T00:00:00Z",
        }

        serializer = AdminUserSerializer(
            instance=self.user,
            data=payload,
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        validated = serializer.validated_data

        self.assertIn("username", validated)
        self.assertIn("email", validated)
        self.assertIn("is_admin", validated)
        self.assertNotIn("id", validated)
        self.assertNotIn("date_joined", validated)

    def test_admin_user_serializer_read_only_computed_fields(self):
        payload = {
            "files_count": 10,
            "files_total_size": 2048,
        }

        serializer = AdminUserSerializer(
            instance=self.user,
            data=payload,
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        validated = serializer.validated_data
        self.assertNotIn("files_count", validated)
        self.assertNotIn("files_total_size", validated)
