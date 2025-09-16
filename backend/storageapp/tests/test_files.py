import shutil
import tempfile
from django.test import TestCase, Client, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from accounts.models import User

TMP_MEDIA = tempfile.mkdtemp(prefix="test_media_")

@override_settings(MEDIA_ROOT=TMP_MEDIA)
class FileFlowTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        try:
            shutil.rmtree(TMP_MEDIA, ignore_errors=True)
        except Exception:
            pass

    def setUp(self):
        self.c = Client()
        r = self.c.post(
            "/api/auth/register",
            {
                "username": "alice",
                "full_name": "Alice A",
                "email": "alice@example.com",
                "password": "Pass12345!",
            },
        )
        assert r.status_code == 201, r.content
        self.alice_id = r.json()["id"]

    def test_upload_patch_public_download_revoke_delete(self):

        r = self.c.get("/files")
        assert r.status_code == 200, r.content
        assert len(r.json().get("results", [])) == 0

        f = SimpleUploadedFile("hello.txt", b"hello world", content_type="text/plain")
        r = self.c.post("/files", {"file": f, "comment": "greeting"})
        assert r.status_code == 201, r.content
        file_id = r.json()["id"]

        r = self.c.get("/files")
        assert r.status_code == 200, r.content
        assert len(r.json()["results"]) == 1

        r = self.c.patch(
            f"/files/{file_id}",
            data={"original_name": "hello_renamed.txt", "comment": "updated"},
            content_type="application/json",
        )
        assert r.status_code == 200, r.content

        r = self.c.post(f"/files/{file_id}/public-link")
        assert r.status_code == 200, r.content
        token = r.json().get("token")
        assert isinstance(token, str) and token

        anon = Client()
        r = anon.get(f"/d/{token}")
        assert r.status_code == 200, r.status_code
        assert "attachment;" in (r.headers.get("Content-Disposition",""))

        r = self.c.post(f"/files/{file_id}/public-link/delete")
        assert r.status_code == 200, r.content
        assert r.json().get("status") == "revoked"

        r = anon.get(f"/d/{token}")
        assert r.status_code == 404

        r = self.c.delete(f"/files/{file_id}/delete")
        assert r.status_code == 200, r.content
        assert r.json().get("status") == "deleted"

    def test_permissions_and_admin_filter(self):
        f = SimpleUploadedFile("x.txt", b"x", content_type="text/plain")
        r = self.c.post("/files", {"file": f})
        assert r.status_code == 201, r.content
        fid = r.json()["id"]

        c2 = Client()
        r = c2.post(
            "/api/auth/register",
            {
                "username": "bobby",
                "full_name": "Bob B",
                "email": "bob@example.com",
                "password": "Pass12345!",
            },
        )
        assert r.status_code == 201, r.content

        r = c2.get(f"/files?user={self.alice_id}")
        assert r.status_code in (401, 403)

        r = c2.post("/api/auth/login", {"username": "bobby", "password": "Pass12345!"})
        assert r.status_code == 200, r.content

        r = c2.get(f"/files?user={self.alice_id}")
        assert r.status_code == 403, r.content

        User.objects.create_user(
            username="adminuser",
            email="admin@example.com",
            full_name="Admin",
            password="Pass12345!",
            is_admin=True,
        )
        c3 = Client()
        r = c3.post("/api/auth/login", {"username": "adminuser", "password": "Pass12345!"})
        assert r.status_code == 200, r.content

        r = c3.get(f"/files?user={self.alice_id}")
        assert r.status_code == 200, r.content
        assert any(x.get("id") == fid for x in (r.json().get("results") or []))

        r = c2.delete(f"/files/{fid}/delete")
        assert r.status_code == 403, r.content
