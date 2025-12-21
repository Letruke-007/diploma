from django.contrib import admin
from django.test import SimpleTestCase

from storageapp.models import StoredFile
from storageapp.admin import StoredFileAdmin


class StoredFileAdminRegistrationTests(SimpleTestCase):
    def test_stored_file_registered_in_admin(self):
        # регистрация происходит через @admin.register(StoredFile)
        self.assertIn(StoredFile, admin.site._registry)
        self.assertIsInstance(admin.site._registry[StoredFile], StoredFileAdmin)


class StoredFileAdminConfigurationTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.admin = StoredFileAdmin(StoredFile, admin.site)

    def test_list_display(self):
        self.assertEqual(
            self.admin.list_display,
            (
                "id",
                "owner",
                "original_name",
                "size",
                "uploaded_at",
                "last_downloaded_at",
                "public_token",
            ),
        )

    def test_list_filter(self):
        self.assertEqual(self.admin.list_filter, ("uploaded_at",))

    def test_search_fields(self):
        self.assertEqual(
            self.admin.search_fields,
            ("original_name", "owner__username", "public_token"),
        )

    def test_readonly_fields(self):
        self.assertEqual(
            self.admin.readonly_fields,
            (
                "disk_name",
                "rel_dir",
                "uploaded_at",
                "last_downloaded_at",
            ),
        )
