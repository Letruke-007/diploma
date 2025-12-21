import io
import shutil
import tempfile
import zipfile
from pathlib import Path
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from django.urls import get_resolver

from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from storageapp.models import StoredFile
import storageapp.views as views

User = get_user_model()


def _iter_urlpatterns(patterns):
    """Рекурсивный обход urlpatterns, включая include()."""
    for p in patterns:
        if hasattr(p, "url_patterns"):
            yield from _iter_urlpatterns(p.url_patterns)
        else:
            yield p


def url_for_view(view_func, **kwargs) -> str:
    """
    Находит путь в ROOT_URLCONF, где callback == view_func, и подставляет kwargs.
    """
    resolver = get_resolver()
    for p in _iter_urlpatterns(resolver.url_patterns):
        try:
            cb = p.callback
        except Exception:
            continue

        if cb is view_func:
            route = getattr(p.pattern, "_route", None)
            if not route:
                raise AssertionError("Unsupported URLPattern type (no _route)")

            path = "/" + route  # route обычно без ведущего "/"
            for k, v in kwargs.items():
                for prefix in ("int", "str", "slug", "uuid", "path"):
                    path = path.replace(f"<{prefix}:{k}>", str(v))
            return path

    raise AssertionError(
        f"URL for view {getattr(view_func, '__name__', view_func)} not found in ROOT_URLCONF"
    )


# ======================================================
# helpers
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class HelpersTests(APITestCase):
    def test_is_admin(self):
        u = User(username="user01", email="u@x", full_name="U")
        self.assertFalse(getattr(u, "is_admin", False))
        self.assertFalse(u.is_superuser)

        from storageapp.views import _is_admin

        self.assertFalse(_is_admin(u))

        u.is_superuser = True
        self.assertTrue(_is_admin(u))

        u.is_superuser = False
        u.is_admin = True
        self.assertTrue(_is_admin(u))


# ======================================================
# list_files (GET)
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class ListFilesGetTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01",
            email="owner@example.com",
            full_name="Owner",
            password="Abcdef1!",
        )
        self.other = User.objects.create_user(
            username="other01",
            email="other@example.com",
            full_name="Other",
            password="Abcdef1!",
        )
        self.admin = User.objects.create_user(
            username="admin01",
            email="admin@example.com",
            full_name="Admin",
            password="Abcdef1!",
        )
        self.admin.is_admin = True
        self.admin.save()

    def test_requires_auth(self):
        res = self.client.get("/files/")
        self.assertEqual(res.status_code, 403)

    def test_invalid_parent_parameter_returns_400(self):
        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/", {"parent": "not-an-int"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "Invalid parent parameter")

    def test_invalid_user_parameter_returns_400(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/files/", {"user": "abc"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "Invalid user parameter")

    def test_my_view_only_owner_files(self):
        StoredFile.objects.create(owner=self.owner, original_name="a", size=1)
        StoredFile.objects.create(owner=self.other, original_name="b", size=2)

        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/")
        self.assertEqual(res.status_code, 200)

        ids = [x["id"] for x in res.data["results"]]
        self.assertEqual(len(ids), 1)

    def test_admin_can_view_other_user_storage(self):
        f = StoredFile.objects.create(owner=self.other, original_name="x", size=1)

        self.client.force_authenticate(self.admin)
        res = self.client.get("/files/", {"user": str(self.other.id)})
        self.assertEqual(res.status_code, 200)

        ids = [x["id"] for x in res.data["results"]]
        self.assertIn(f.id, ids)

    def test_view_recent_returns_only_not_deleted_ordered_by_uploaded_at(self):
        f1 = StoredFile.objects.create(
            owner=self.owner, original_name="a.txt", size=1, is_deleted=False
        )
        f2 = StoredFile.objects.create(
            owner=self.owner, original_name="b.txt", size=1, is_deleted=False
        )

        # сделаем f1 "новее"
        StoredFile.objects.filter(id=f1.id).update(
            uploaded_at=timezone.now() + timedelta(seconds=5)
        )

        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/", {"view": "recent"})
        self.assertEqual(res.status_code, 200)

        ids = [x["id"] for x in res.data["results"]]
        self.assertEqual(ids, [f1.id, f2.id])

    def test_view_trash_filters_last_30_days_and_orders_by_deleted_at(self):
        f_recent = StoredFile.objects.create(
            owner=self.owner, original_name="r.txt", size=1
        )
        f_old = StoredFile.objects.create(owner=self.owner, original_name="o.txt", size=1)

        f_recent.soft_delete()
        f_old.soft_delete()

        StoredFile.objects.filter(id=f_recent.id).update(
            deleted_at=timezone.now() - timedelta(days=1)
        )
        StoredFile.objects.filter(id=f_old.id).update(
            deleted_at=timezone.now() - timedelta(days=31)
        )

        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/", {"view": "trash"})
        self.assertEqual(res.status_code, 200)

        ids = [x["id"] for x in res.data["results"]]
        self.assertEqual(ids, [f_recent.id], res.data)

    def test_folder_size_is_computed_recursively_for_list_page(self):
        root = StoredFile.objects.create(
            owner=self.owner,
            original_name="Root",
            is_folder=True,
            is_deleted=False,
            size=0,
            rel_dir="",
        )
        child = StoredFile.objects.create(
            owner=self.owner,
            original_name="Child",
            is_folder=True,
            is_deleted=False,
            parent=root,
            size=0,
            rel_dir="",
        )
        StoredFile.objects.create(
            owner=self.owner,
            original_name="f1.bin",
            is_folder=False,
            is_deleted=False,
            parent=root,
            size=10,
        )
        StoredFile.objects.create(
            owner=self.owner,
            original_name="f2.bin",
            is_folder=False,
            is_deleted=False,
            parent=child,
            size=25,
        )

        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/")
        self.assertEqual(res.status_code, 200)

        found = {x["id"]: x for x in res.data["results"]}
        self.assertIn(root.id, found)
        self.assertTrue(found[root.id]["is_folder"])
        self.assertEqual(found[root.id]["size"], 35, found[root.id])


# ======================================================
# upload
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class UploadFileTests(APITestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.tmpdir)
        self.override.enable()

        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01",
            email="owner@example.com",
            full_name="Owner",
            password="Abcdef1!",
        )

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_requires_auth(self):
        res = self.client.post("/files/")
        self.assertEqual(res.status_code, 403)

    def test_file_required(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post("/files/", {})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "file is required")

    def test_upload_success(self):
        self.client.force_authenticate(self.owner)

        up = SimpleUploadedFile("x.txt", b"x", content_type="text/plain")
        res = self.client.post("/files/", {"file": up}, format="multipart")

        self.assertEqual(res.status_code, 201)

        self.assertTrue(("id" in res.data) or (res.data.get("detail") == "uploaded"), res.data)

        self.assertTrue(StoredFile.objects.filter(owner=self.owner, original_name="x.txt").exists())


# ======================================================
# patch_file
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class PatchFileTests(APITestCase):
    def setUp(self):
        self.client = APIClient()

        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

        self.sf = StoredFile.objects.create(
            owner=self.owner,
            original_name="old.txt",
            size=1,
            comment="old",
        )

    def test_requires_auth(self):
        res = self.client.patch(f"/files/{self.sf.id}/")
        self.assertEqual(res.status_code, 403)

    def test_forbidden(self):
        self.client.force_authenticate(self.other)
        res = self.client.patch(f"/files/{self.sf.id}/")
        self.assertEqual(res.status_code, 403)

    def test_patch_success(self):
        self.client.force_authenticate(self.owner)
        res = self.client.patch(
            f"/files/{self.sf.id}/",
            {"original_name": "new.txt", "comment": "c"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        self.sf.refresh_from_db()
        self.assertEqual(self.sf.original_name, "new.txt")
        self.assertEqual(self.sf.comment, "c")

    def test_admin_can_patch(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f"/files/{self.sf.id}/",
            {"comment": "admin"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)


# ======================================================
# delete / restore
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class DeleteRestoreTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

        self.sf = StoredFile.objects.create(
            owner=self.owner, original_name="f", size=1, is_deleted=False
        )

    def test_delete_requires_auth(self):
        url = url_for_view(views.delete_file, pk=self.sf.id)
        res = self.client.delete(url)
        self.assertEqual(res.status_code, 403)

    def test_delete_forbidden(self):
        self.client.force_authenticate(self.other)
        url = url_for_view(views.delete_file, pk=self.sf.id)
        res = self.client.delete(url)
        self.assertEqual(res.status_code, 403)

    def test_delete_success(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.delete_file, pk=self.sf.id)
        res = self.client.delete(url)
        self.assertEqual(res.status_code, 200)

        self.sf.refresh_from_db()
        self.assertTrue(self.sf.is_deleted)
        self.assertIsNotNone(self.sf.deleted_at)
        self.assertEqual(res.data.get("status"), "trashed")

    def test_restore_forbidden(self):
        self.sf.soft_delete()

        self.client.force_authenticate(self.other)
        res = self.client.post(f"/files/{self.sf.id}/restore/")
        self.assertEqual(res.status_code, 403)

    def test_restore_requires_in_trash(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post(f"/files/{self.sf.id}/restore/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "File is not in trash")

    def test_restore_success(self):
        self.sf.soft_delete()

        self.client.force_authenticate(self.owner)
        res = self.client.post(f"/files/{self.sf.id}/restore/")
        self.assertEqual(res.status_code, 200)

        self.sf.refresh_from_db()
        self.assertFalse(self.sf.is_deleted)


# ======================================================
# download/view + public links + create_folder + bulk_* + download_archive
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class DownloadAndViewTests(APITestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.tmpdir)
        self.override.enable()

        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _mk_file(self, owner, name="a.txt", content=b"hello"):
        sf = StoredFile.objects.create(
            owner=owner,
            original_name=name,
            size=len(content),
            is_folder=False,
            rel_dir="",
        )
        p = Path(sf.path_on_disk)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
        return sf

    def test_download_forbidden_for_non_owner_non_admin(self):
        sf = self._mk_file(self.owner)
        self.client.force_authenticate(self.other)
        url = url_for_view(views.download_file, pk=sf.id)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)

    def test_download_404_if_missing_on_disk(self):
        sf = StoredFile.objects.create(
            owner=self.owner, original_name="x.txt", size=1, is_folder=False, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_file, pk=sf.id)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data["detail"], "File not found on disk")

    def test_download_success_updates_last_downloaded_at(self):
        sf = self._mk_file(self.owner, name="x.txt", content=b"abc")
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_file, pk=sf.id)

        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertIn("Content-Disposition", res.headers)

        sf.refresh_from_db()
        self.assertIsNotNone(sf.last_downloaded_at)

    def test_view_success_inline_sets_content_type_when_known(self):
        sf = self._mk_file(self.owner, name="x.txt", content=b"abc")
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.view_file, pk=sf.id)

        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertIn("Content-Disposition", res.headers)
        self.assertIn("inline", res.headers["Content-Disposition"])

    def test_view_forbidden_for_non_owner_non_admin(self):
        sf = self._mk_file(self.owner, name="x.txt", content=b"abc")
        self.client.force_authenticate(self.other)
        url = url_for_view(views.view_file, pk=sf.id)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)


@override_settings(ROOT_URLCONF="storageapp.urls")
class PublicLinksTests(APITestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.tmpdir)
        self.override.enable()

        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _mk_file(self, owner, name="x.txt", content=b"abc"):
        sf = StoredFile.objects.create(
            owner=owner,
            original_name=name,
            size=len(content),
            is_folder=False,
            rel_dir="",
        )
        p = Path(sf.path_on_disk)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
        return sf

    def test_issue_public_rejects_folders_400(self):
        folder = StoredFile.objects.create(
            owner=self.owner, original_name="F", is_folder=True, size=0, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.issue_public, pk=folder.id)
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "Folders cannot be shared")

    def test_issue_public_forbidden_for_non_owner_non_admin(self):
        sf = self._mk_file(self.owner)
        self.client.force_authenticate(self.other)
        url = url_for_view(views.issue_public, pk=sf.id)
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_issue_and_public_download_success(self):
        sf = self._mk_file(self.owner, name="p.txt", content=b"public")

        self.client.force_authenticate(self.owner)
        issue_url = url_for_view(views.issue_public, pk=sf.id)
        res = self.client.post(issue_url, {}, format="json")
        self.assertEqual(res.status_code, 200)
        token = res.data["token"]
        self.assertTrue(token)

        public_url = url_for_view(views.public_download, token=token)
        anon = APIClient()
        res2 = anon.get(public_url)
        self.assertEqual(res2.status_code, 200)

        sf.refresh_from_db()
        self.assertIsNotNone(sf.last_downloaded_at)

    def test_public_download_404_for_unknown_token(self):
        public_url = url_for_view(views.public_download, token="does-not-exist")
        anon = APIClient()
        res = anon.get(public_url)
        self.assertEqual(res.status_code, 404)

    def test_revoke_public_forbidden_for_non_owner_non_admin(self):
        sf = self._mk_file(self.owner)
        self.client.force_authenticate(self.other)
        url = url_for_view(views.revoke_public, pk=sf.id)
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_revoke_public_success(self):
        sf = self._mk_file(self.owner)
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.revoke_public, pk=sf.id)
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "revoked")


@override_settings(ROOT_URLCONF="storageapp.urls")
class CreateFolderMoreBranchesTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )

    def test_empty_name_returns_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.create_folder)
        res = self.client.post(url, {"name": "   "}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.data)
        self.assertIsInstance(res.data["name"], list)
        self.assertTrue(res.data["name"])

    def test_invalid_parent_returns_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.create_folder)
        res = self.client.post(url, {"name": "A", "parent": "not-int"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("parent", res.data)

    def test_create_in_parent_success(self):
        parent = StoredFile.objects.create(
            owner=self.owner, original_name="P", is_folder=True, size=0, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.create_folder)
        res = self.client.post(
            url, {"name": "Child", "parent": parent.id}, format="json"
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["parent"], parent.id)
        self.assertTrue(res.data["is_folder"])


@override_settings(ROOT_URLCONF="storageapp.urls")
class BulkOperationsTests(APITestCase):
    def setUp(self):
        self.client = APIClient()

        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

    def test_bulk_trash_invalid_ids_returns_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_trash)
        res = self.client.post(url, {"ids": []}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "ids must be non-empty list")

    def test_bulk_trash_ids_must_be_integers_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_trash)
        res = self.client.post(url, {"ids": ["x"]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "ids must be integers")

    def test_bulk_trash_forbidden_when_contains_other_users_object(self):
        mine = StoredFile.objects.create(owner=self.owner, original_name="m", size=1)
        other_file = StoredFile.objects.create(owner=self.other, original_name="o", size=1)

        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_trash)
        res = self.client.post(url, {"ids": [mine.id, other_file.id]}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_bulk_trash_admin_rejects_cross_owner_in_one_request_400(self):
        a = StoredFile.objects.create(owner=self.owner, original_name="a", size=1)
        b = StoredFile.objects.create(owner=self.other, original_name="b", size=1)

        self.client.force_authenticate(self.admin)
        url = url_for_view(views.bulk_trash)
        res = self.client.post(url, {"ids": [a.id, b.id]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn(
            "Cannot move objects belonging to different owners", res.data["detail"]
        )

    def test_bulk_trash_success_counts_only_newly_trashed(self):
        a = StoredFile.objects.create(owner=self.owner, original_name="a", size=1)
        b = StoredFile.objects.create(owner=self.owner, original_name="b", size=1)
        b.soft_delete()

        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_trash)
        res = self.client.post(url, {"ids": [a.id, b.id]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["trashed"], 1)

    def test_bulk_move_invalid_ids_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_move)
        res = self.client.post(url, {"ids": []}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "ids must be a non-empty list")

    def test_bulk_move_parent_not_found_400(self):
        sf = StoredFile.objects.create(owner=self.owner, original_name="a", size=1)
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_move)
        res = self.client.post(url, {"ids": [sf.id], "parent": 999999}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("parent", res.data)

    def test_bulk_move_forbidden_parent_other_owner_403(self):
        sf = StoredFile.objects.create(owner=self.owner, original_name="a", size=1)
        other_folder = StoredFile.objects.create(
            owner=self.other, original_name="P", is_folder=True, size=0, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_move)
        res = self.client.post(
            url, {"ids": [sf.id], "parent": other_folder.id}, format="json"
        )
        self.assertEqual(res.status_code, 403)

    def test_bulk_move_cannot_move_folder_into_itself_400(self):
        folder = StoredFile.objects.create(
            owner=self.owner, original_name="F", is_folder=True, size=0, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_move)
        res = self.client.post(url, {"ids": [folder.id], "parent": folder.id}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Нельзя переместить папку", res.data["detail"])

    def test_bulk_move_success(self):
        folder = StoredFile.objects.create(
            owner=self.owner, original_name="F", is_folder=True, size=0, rel_dir=""
        )
        sf = StoredFile.objects.create(owner=self.owner, original_name="a", size=1)

        self.client.force_authenticate(self.owner)
        url = url_for_view(views.bulk_move)
        res = self.client.post(url, {"ids": [sf.id], "parent": folder.id}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["moved"], 1)

        sf.refresh_from_db()
        self.assertEqual(sf.parent_id, folder.id)


@override_settings(ROOT_URLCONF="storageapp.urls")
class DownloadArchiveTests(APITestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.tmpdir)
        self.override.enable()

        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )
        self.other = User.objects.create_user(
            username="other01", email="x@x", full_name="X", password="Abcdef1!"
        )
        self.admin = User.objects.create_user(
            username="admin01", email="a@x", full_name="A", password="Abcdef1!"
        )
        self.admin.is_admin = True
        self.admin.save()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _mk_file(self, owner, name, content=b"data"):
        sf = StoredFile.objects.create(
            owner=owner, original_name=name, size=len(content), is_folder=False, rel_dir=""
        )
        p = Path(sf.path_on_disk)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
        return sf

    def test_invalid_ids_returns_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_archive)
        res = self.client.post(url, {"ids": []}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "ids must be non-empty list")

    def test_ids_must_be_integers_400(self):
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_archive)
        res = self.client.post(url, {"ids": ["x"]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "ids must be integers")

    def test_forbidden_when_contains_other_users_file(self):
        a = self._mk_file(self.owner, "a.txt", b"a")
        b = self._mk_file(self.other, "b.txt", b"b")

        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_archive)
        res = self.client.post(url, {"ids": [a.id, b.id]}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_404_when_any_file_missing_on_disk(self):
        sf = StoredFile.objects.create(
            owner=self.owner, original_name="x.txt", size=1, is_folder=False, rel_dir=""
        )
        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_archive)
        res = self.client.post(url, {"ids": [sf.id]}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertIn("File not found on disk", res.data["detail"])

    def test_success_returns_zip_with_files(self):
        a = self._mk_file(self.owner, "a.txt", b"a")
        b = self._mk_file(self.owner, "a.txt", b"b")  # коллизия имени

        self.client.force_authenticate(self.owner)
        url = url_for_view(views.download_archive)
        res = self.client.post(url, {"ids": [a.id, b.id]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("Content-Type"), "application/zip")

        body = b"".join(res.streaming_content)
        z = zipfile.ZipFile(io.BytesIO(body), "r")
        names = sorted(z.namelist())

        self.assertEqual(len(names), 2)
        self.assertIn("a.txt", names)
        self.assertTrue(any(n.startswith("a.txt") and n != "a.txt" for n in names))


# ======================================================
# storage_usage
# ======================================================

@override_settings(ROOT_URLCONF="storageapp.urls")
class StorageUsageTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner01", email="o@x", full_name="O", password="Abcdef1!"
        )

    def test_requires_auth(self):
        res = self.client.get("/files/usage/")
        self.assertEqual(res.status_code, 403)

    def test_usage(self):
        StoredFile.objects.create(owner=self.owner, original_name="a", size=10)
        StoredFile.objects.create(owner=self.owner, original_name="b", size=5)

        self.client.force_authenticate(self.owner)
        res = self.client.get("/files/usage/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["used_bytes"], 15)
        self.assertIn("quota_bytes", res.data)
