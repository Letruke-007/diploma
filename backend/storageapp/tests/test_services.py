import os
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from storageapp.models import StoredFile
from storageapp import services as services_module

User = get_user_model()


class StorageServicesTests(TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.tmpdir)
        self.override.enable()

        self.user = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            full_name="Owner",
            password="Abcdef1!",
        )

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    # -------------------------
    # ensure_user_storage_dir
    # -------------------------

    def test_ensure_user_storage_dir_sets_rel_path_and_creates_dir(self):
        self.assertEqual(self.user.storage_rel_path, "")

        path = services_module.ensure_user_storage_dir(self.user)

        self.user.refresh_from_db()
        self.assertTrue(self.user.storage_rel_path.startswith("u/"))
        self.assertTrue(path.exists())
        self.assertTrue(path.is_dir())
        self.assertTrue(str(path).startswith(self.tmpdir))

    def test_ensure_user_storage_dir_uses_existing_rel_path(self):
        self.user.storage_rel_path = "u/custom/owner"
        self.user.save(update_fields=["storage_rel_path"])

        path = services_module.ensure_user_storage_dir(self.user)

        self.user.refresh_from_db()
        self.assertEqual(self.user.storage_rel_path, "u/custom/owner")
        self.assertTrue(path.exists())
        self.assertTrue(path.is_dir())

    # -------------------------
    # save_uploaded
    # -------------------------

    def test_save_uploaded_rejects_too_large_by_declared_size(self):
        class DummyFile:
            def __init__(self):
                self.name = "big.bin"
                self.size = services_module.MAX_FILE_BYTES + 1

        fobj = DummyFile()

        with self.assertRaisesMessage(ValueError, "File too large (max 2GB)"):
            services_module.save_uploaded(fobj, self.user)

        self.assertEqual(StoredFile.objects.count(), 0)

    def test_save_uploaded_with_chunks_success(self):
        content = b"hello world"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = len(data)

            def chunks(self):
                yield self._data

        fobj = DummyFile("doc.txt", content)
        sf = services_module.save_uploaded(fobj, self.user, comment="test-comment")

        self.assertIsInstance(sf, StoredFile)
        self.assertEqual(sf.owner, self.user)
        self.assertEqual(sf.original_name, "doc.txt")
        self.assertEqual(sf.comment, "test-comment")
        self.assertEqual(sf.rel_dir, self.user.storage_rel_path)

        disk_path = Path(settings.MEDIA_ROOT) / sf.rel_path
        self.assertTrue(disk_path.is_file())
        with open(disk_path, "rb") as fh:
            self.assertEqual(fh.read(), content)

    def test_save_uploaded_with_read_fallback(self):
        content = b"abc123"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = None

            def read(self):
                return self._data

        fobj = DummyFile("nochunks.bin", content)
        sf = services_module.save_uploaded(fobj, self.user)

        disk_path = Path(settings.MEDIA_ROOT) / sf.rel_path
        self.assertTrue(disk_path.is_file())
        with open(disk_path, "rb") as fh:
            self.assertEqual(fh.read(), content)

        sf.refresh_from_db()
        self.assertEqual(sf.size, len(content))

    def test_save_uploaded_streaming_oversize_cleans_up(self):
        old_max = services_module.MAX_FILE_BYTES
        services_module.MAX_FILE_BYTES = 10
        try:
            class DummyFile:
                def __init__(self):
                    self.name = "stream.bin"

                def chunks(self):
                    yield b"123456"
                    yield b"7890"
                    yield b"1"

            fobj = DummyFile()

            with self.assertRaisesMessage(ValueError, "File too large (max 2GB)"):
                services_module.save_uploaded(fobj, self.user)

            self.assertEqual(StoredFile.objects.count(), 0)

            # .tmp файлы должны быть удалены
            for root, _, files in os.walk(self.tmpdir):
                for name in files:
                    self.assertFalse(name.endswith(".tmp"))
        finally:
            services_module.MAX_FILE_BYTES = old_max

    # -------------------------
    # delete_stored_file
    # -------------------------

    def test_delete_stored_file_removes_file_and_record(self):
        content = b"data"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = len(data)

            def chunks(self):
                yield self._data

        fobj = DummyFile("deletable.txt", content)
        sf = services_module.save_uploaded(fobj, self.user)

        path = Path(settings.MEDIA_ROOT) / sf.rel_path
        self.assertTrue(path.is_file())

        services_module.delete_stored_file(sf)

        self.assertFalse(StoredFile.objects.filter(pk=sf.pk).exists())
        self.assertFalse(path.exists())

        # повторный вызов — no-op
        services_module.delete_stored_file(sf)

    # -------------------------
    # public links
    # -------------------------

    def test_issue_public_link_sets_token(self):
        content = b"x"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = len(data)

            def chunks(self):
                yield self._data

        fobj = DummyFile("pub.txt", content)
        sf = services_module.save_uploaded(fobj, self.user)

        self.assertIsNone(sf.public_token)

        token = services_module.issue_public_link(sf)

        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 0)

        sf.refresh_from_db()
        self.assertEqual(sf.public_token, token)

    def test_revoke_public_link_clears_token(self):
        content = b"x"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = len(data)

            def chunks(self):
                yield self._data

        fobj = DummyFile("pub2.txt", content)
        sf = services_module.save_uploaded(fobj, self.user)

        token = services_module.issue_public_link(sf)
        self.assertIsNotNone(token)

        obj = services_module.revoke_public_link(sf)

        self.assertIs(obj, sf)

        sf.refresh_from_db()
        self.assertIsNone(sf.public_token)

    def test_resolve_public_link_returns_object_or_none(self):
        content = b"x"

        class DummyFile:
            def __init__(self, name, data):
                self.name = name
                self._data = data
                self.size = len(data)

            def chunks(self):
                yield self._data

        fobj = DummyFile("pub3.txt", content)
        sf = services_module.save_uploaded(fobj, self.user)

        token = services_module.issue_public_link(sf)

        resolved = services_module.resolve_public_link(token)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.id, sf.id)

        self.assertIsNone(
            services_module.resolve_public_link("nonexistent-token")
        )
