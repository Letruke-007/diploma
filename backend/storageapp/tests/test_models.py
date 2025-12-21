from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone


from storageapp.models import StoredFile

User = get_user_model()


class StoredFileModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="fileowner",
            email="fileowner@example.com",
            full_name="Owner",
            password="Abcdef1!",
        )

    def test_create_stored_file_basic_fields(self):
        f = StoredFile.objects.create(
            owner=self.owner,
            original_name="doc.pdf",
            size=123,
            rel_dir="u/1",
        )

        self.assertEqual(f.owner, self.owner)
        self.assertEqual(f.original_name, "doc.pdf")
        self.assertEqual(f.size, 123)
        self.assertEqual(f.rel_dir, "u/1")

        self.assertIsNotNone(f.disk_name)
        self.assertIsNotNone(f.uploaded_at)
        self.assertIsNone(f.last_downloaded_at)

        self.assertEqual(f.comment, "")
        self.assertIsNone(f.public_token)

        self.assertFalse(f.is_deleted)
        self.assertIsNone(f.deleted_at)
        self.assertIsNone(f.deleted_from)

    def test_str_representation_alive(self):
        f = StoredFile.objects.create(
            owner=self.owner,
            original_name="image.png",
            size=2048,
        )

        expected = f"{f.id} · image.png (2048 B, alive)"
        self.assertEqual(str(f), expected)

    def test_str_representation_deleted(self):
        f = StoredFile.objects.create(
            owner=self.owner,
            original_name="trash.txt",
            size=10,
        )

        f.soft_delete()

        expected = f"{f.id} · trash.txt (10 B, deleted)"
        self.assertEqual(str(f), expected)

    def test_rel_path_property(self):
        f = StoredFile.objects.create(
            owner=self.owner,
            original_name="x",
            size=1,
            rel_dir="abc/def",
        )

        prefix = str(f.disk_name)[:2]
        expected = f"abc/def/{prefix}/{f.disk_name}"
        self.assertEqual(f.rel_path, expected)

    def test_path_on_disk_property(self):
        from pathlib import Path
        from django.conf import settings
        from django.contrib.auth import get_user_model

        User = get_user_model()

        user = User.objects.create_user(
            username="user1000",
            email="user1000@example.com",
            full_name="User One",
            password="Abcdef1!",
        )

        # Важно: size должен быть задан, иначе в CI/PG может быть NOT NULL
        f = StoredFile.objects.create(
            owner=user,
            original_name="y",
            is_folder=False,
            rel_dir="qwerty/y",
            size=1,
        )

        actual = str(f.path_on_disk).replace("\\", "/")
        media_root = str(Path(settings.MEDIA_ROOT)).replace("\\", "/")

        self.assertTrue(
            actual.startswith(media_root),
            f"path_on_disk should be inside MEDIA_ROOT. MEDIA_ROOT={media_root}, actual={actual}",
        )
        self.assertIn("qwerty/y", actual)

class StoredFileTrashLogicTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="trashuser",
            email="trash@example.com",
            full_name="Trash User",
            password="Abcdef1!",
        )

    def test_soft_delete_sets_flags_and_parent(self):
        folder = StoredFile.objects.create(
            owner=self.owner,
            original_name="folder",
            size=0,
            is_folder=True,
        )
        file = StoredFile.objects.create(
            owner=self.owner,
            original_name="file.txt",
            size=10,
            parent=folder,
        )

        file.soft_delete()

        file.refresh_from_db()
        self.assertTrue(file.is_deleted)
        self.assertIsNotNone(file.deleted_at)
        self.assertIsNone(file.parent)
        self.assertEqual(file.deleted_from, folder)

    def test_soft_delete_idempotent(self):
        f = StoredFile.objects.create(
            owner=self.owner,
            original_name="file.txt",
            size=1,
        )

        f.soft_delete()
        deleted_at_first = f.deleted_at

        f.soft_delete()
        f.refresh_from_db()

        self.assertEqual(f.deleted_at, deleted_at_first)

    def test_restore_returns_to_parent_if_valid(self):
        folder = StoredFile.objects.create(
            owner=self.owner,
            original_name="folder",
            size=0,
            is_folder=True,
        )
        file = StoredFile.objects.create(
            owner=self.owner,
            original_name="file.txt",
            size=10,
            parent=folder,
        )

        file.soft_delete()
        file.restore()
        file.refresh_from_db()

        self.assertFalse(file.is_deleted)
        self.assertIsNone(file.deleted_at)
        self.assertIsNone(file.deleted_from)
        self.assertEqual(file.parent, folder)

    def test_restore_to_root_if_parent_missing(self):
        folder = StoredFile.objects.create(
            owner=self.owner,
            original_name="folder",
            size=0,
            is_folder=True,
        )
        file = StoredFile.objects.create(
            owner=self.owner,
            original_name="file.txt",
            size=10,
            parent=folder,
        )

        file.soft_delete()
        folder.delete()

        file.restore()
        file.refresh_from_db()

        self.assertFalse(file.is_deleted)
        self.assertIsNone(file.deleted_at)
        self.assertIsNone(file.deleted_from)
        self.assertIsNone(file.parent)


class StoredFileQuerySetTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="qsuser",
            email="qs@example.com",
            full_name="QS User",
            password="Abcdef1!",
        )

    def test_alive_queryset(self):
        alive = StoredFile.objects.create(
            owner=self.owner,
            original_name="alive.txt",
            size=1,
        )
        deleted = StoredFile.objects.create(
            owner=self.owner,
            original_name="deleted.txt",
            size=1,
            is_deleted=True,
            deleted_at=timezone.now(),
        )

        qs = StoredFile.objects.alive()

        self.assertIn(alive, qs)
        self.assertNotIn(deleted, qs)

    def test_trashed_queryset(self):
        recent = StoredFile.objects.create(
            owner=self.owner,
            original_name="recent.txt",
            size=1,
            is_deleted=True,
            deleted_at=timezone.now() - timedelta(days=5),
        )
        expired = StoredFile.objects.create(
            owner=self.owner,
            original_name="expired.txt",
            size=1,
            is_deleted=True,
            deleted_at=timezone.now() - timedelta(days=40),
        )

        qs = StoredFile.objects.trashed()

        self.assertIn(recent, qs)
        self.assertNotIn(expired, qs)

    def test_expired_queryset(self):
        recent = StoredFile.objects.create(
            owner=self.owner,
            original_name="recent.txt",
            size=1,
            is_deleted=True,
            deleted_at=timezone.now() - timedelta(days=5),
        )
        expired = StoredFile.objects.create(
            owner=self.owner,
            original_name="expired.txt",
            size=1,
            is_deleted=True,
            deleted_at=timezone.now() - timedelta(days=40),
        )

        qs = StoredFile.objects.expired()

        self.assertIn(expired, qs)
        self.assertNotIn(recent, qs)
