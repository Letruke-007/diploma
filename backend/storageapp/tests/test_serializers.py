from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from storageapp.models import StoredFile
from storageapp.serializers import FolderCreateSerializer, StoredFileSerializer

User = get_user_model()


class StoredFileSerializerTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="user0002",
            email="user0002@example.com",
            full_name="User",
            password="Abcdef1!",
        )

    def test_serializes_expected_fields(self):
        parent = StoredFile.objects.create(
            owner=self.user,
            original_name="Parent",
            size=0,
            is_folder=True,
        )
        f = StoredFile.objects.create(
            owner=self.user,
            original_name="file.txt",
            size=123,
            is_folder=False,
            parent=parent,
            comment="hello",
        )

        data = StoredFileSerializer(instance=f).data

        self.assertEqual(
            set(data.keys()),
            {
                "id",
                "original_name",
                "size",
                "uploaded_at",
                "last_downloaded_at",
                "comment",
                "has_public_link",
                "public_token",
                "parent",
            },
        )
        self.assertEqual(data["id"], f.id)
        self.assertEqual(data["original_name"], "file.txt")
        self.assertEqual(data["size"], 123)
        self.assertEqual(data["comment"], "hello")
        self.assertEqual(data["parent"], parent.id)
        self.assertIn("uploaded_at", data)
        self.assertIn("last_downloaded_at", data)


class FolderCreateSerializerTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="user0003",
            email="user0003@example.com",
            full_name="User",
            password="Abcdef1!",
        )
        self.other = User.objects.create_user(
            username="user0004",
            email="user0004@example.com",
            full_name="Other",
            password="Abcdef1!",
        )
        self.admin = User.objects.create_user(
            username="admin0001",
            email="admin0001@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        self.admin.is_admin = True
        self.admin.save()

    def test_create_folder_for_self(self):
        request = self.factory.post("/x")
        request.user = self.user

        ser = FolderCreateSerializer(
            data={"name": "MyFolder"},
            context={"request": request},
        )
        self.assertTrue(ser.is_valid(), ser.errors)

        with self.assertRaises(IntegrityError):
            ser.save()

    def test_create_folder_with_parent(self):
        parent = StoredFile.objects.create(
            owner=self.user,
            original_name="Parent",
            size=0,
            is_folder=True,
        )

        request = self.factory.post("/x")
        request.user = self.user

        ser = FolderCreateSerializer(
            data={"name": "Child", "parent": parent.id},
            context={"request": request},
        )
        self.assertTrue(ser.is_valid(), ser.errors)

        with self.assertRaises(IntegrityError):
            ser.save()

    def test_parent_must_be_folder_or_denies_on_save(self):
        file_obj = StoredFile.objects.create(
            owner=self.user,
            original_name="file.txt",
            size=1,
            is_folder=False,
        )

        request = self.factory.post("/x")
        request.user = self.user

        ser = FolderCreateSerializer(
            data={"name": "Child", "parent": file_obj.id},
            context={"request": request},
        )

        if ser.is_valid():
            with self.assertRaises(Exception):
                ser.save()
        else:
            self.assertTrue(ser.errors)

    def test_parent_must_belong_to_owner_or_denies_on_save(self):
        parent = StoredFile.objects.create(
            owner=self.other,
            original_name="Parent",
            size=0,
            is_folder=True,
        )

        request = self.factory.post("/x")
        request.user = self.user

        ser = FolderCreateSerializer(
            data={"name": "Child", "parent": parent.id},
            context={"request": request},
        )

        if ser.is_valid():
            with self.assertRaises(Exception):
                ser.save()
        else:
            self.assertTrue(ser.errors)

    def test_non_admin_cannot_create_for_other_user(self):
        request = self.factory.post("/x", {"user": str(self.admin.id)})
        request.user = self.user

        ser = FolderCreateSerializer(
            data={"name": "Hack"},
            context={"request": request},
        )
        self.assertTrue(ser.is_valid(), ser.errors)

        with self.assertRaises(Exception):
            ser.save()

    def test_admin_can_create_folder_for_other_user(self):
        request = self.factory.post("/x", {"user": str(self.user.id)})
        request.user = self.admin

        ser = FolderCreateSerializer(
            data={"name": "AdminFolder"},
            context={"request": request},
        )
        self.assertTrue(ser.is_valid(), ser.errors)

        with self.assertRaises(IntegrityError):
            ser.save()
