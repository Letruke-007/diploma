from django.test import TestCase, override_settings
from django.urls import resolve

from storageapp import views


@override_settings(ROOT_URLCONF="storageapp.urls")
class StorageUrlsResolveTests(TestCase):
    # --------
    # files
    # --------

    def test_list_files_resolves(self):
        match = resolve("/files/")
        self.assertIs(match.func, views.list_files)

    def test_patch_file_resolves(self):
        match = resolve("/files/10/")
        self.assertIs(match.func, views.patch_file)
        self.assertEqual(match.kwargs["pk"], 10)

    def test_delete_file_resolves(self):
        match = resolve("/files/7/delete/")
        self.assertIs(match.func, views.delete_file)
        self.assertEqual(match.kwargs["pk"], 7)

    def test_download_file_resolves(self):
        match = resolve("/files/3/download/")
        self.assertIs(match.func, views.download_file)
        self.assertEqual(match.kwargs["pk"], 3)

    def test_view_file_resolves(self):
        match = resolve("/files/4/view/")
        self.assertIs(match.func, views.view_file)
        self.assertEqual(match.kwargs["pk"], 4)

    def test_storage_usage_resolves(self):
        match = resolve("/files/usage/")
        self.assertIs(match.func, views.storage_usage)

    # --------
    # public links
    # --------

    def test_issue_public_resolves(self):
        match = resolve("/files/5/public-link/")
        self.assertIs(match.func, views.issue_public)
        self.assertEqual(match.kwargs["pk"], 5)

    def test_revoke_public_resolves(self):
        match = resolve("/files/9/public-link/delete/")
        self.assertIs(match.func, views.revoke_public)
        self.assertEqual(match.kwargs["pk"], 9)

    def test_public_download_resolves(self):
        match = resolve("/d/abc123/")
        self.assertIs(match.func, views.public_download)
        self.assertEqual(match.kwargs["token"], "abc123")

    # --------
    # folders / bulk
    # --------

    def test_create_folder_resolves(self):
        match = resolve("/folders/")
        self.assertIs(match.func, views.create_folder)

    def test_bulk_move_resolves(self):
        match = resolve("/files/bulk-move/")
        self.assertIs(match.func, views.bulk_move)

    def test_bulk_trash_resolves(self):
        match = resolve("/files/bulk/trash/")
        self.assertIs(match.func, views.bulk_trash)

    def test_download_archive_resolves(self):
        match = resolve("/files/archive/")
        self.assertIs(match.func, views.download_archive)

    def test_restore_file_resolves(self):
        match = resolve("/files/8/restore/")
        self.assertIs(match.func, views.restore_file)
        self.assertEqual(match.kwargs["pk"], 8)
