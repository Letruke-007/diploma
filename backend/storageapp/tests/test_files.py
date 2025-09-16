import shutil
import tempfile
from typing import List, Tuple
from django.test import TestCase, Client, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from accounts.models import User


TMP_MEDIA = tempfile.mkdtemp(prefix="test_media_")


def _try_variants(client: Client, bases: List[str]) -> Tuple[str, bool]:
    """
    Перебираем кандидатов /files, /api/files, /api/v1/files, со слэшем и без.
    Возвращаем (base, has_trailing_slash).
    """
    for base in bases:
        for with_slash in (False, True):
            path = base if not with_slash else (base.rstrip("/") + "/")
            r = client.get(path)
            if r.status_code == 200 and isinstance(r.json(), dict) and "results" in r.json():
                return path.rstrip("/"), with_slash
    raise AssertionError(
        "Не найден рабочий эндпоинт списка файлов. "
        "Пробовал: " + ", ".join(bases + [b + "/" for b in bases])
    )


def _get_download_url(token: str, client: Client) -> str:
    """
    Для публичной ссылки пробуем /d/<token> и /d/<token>/.
    Возвращаем тот, что отдаёт 200.
    """
    for suffix in (f"/d/{token}", f"/d/{token}/"):
        r = client.get(suffix)
        if r.status_code == 200:
            return suffix
    # если сразу 404, вернём базовый без слэша (дальше тесты проверят 404 после revoke)
    return f"/d/{token}"


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

        # Авто-детект базового пути для файлового API
        self.files_base, self.files_trailing = _try_variants(
            self.c,
            bases=[
                "/files",
                "/api/files",
                "/api/v1/files",
                "/storage/files",
                "/api/storage/files",
            ],
        )

    def _list(self):
        path = self.files_base + ("/" if self.files_trailing else "")
        return self.c.get(path)

    def _post(self, data):
        path = self.files_base + ("/" if self.files_trailing else "")
        return self.c.post(path, data)

    def _patch(self, file_id: int, data: dict):
        path = f"{self.files_base}/{file_id}"
        return self.c.patch(path, data=data, content_type="application/json")

    def _public_link(self, file_id: int, action: str = "create"):
        if action == "create":
            return self.c.post(f"{self.files_base}/{file_id}/public-link")
        if action == "delete":
            return self.c.post(f"{self.files_base}/{file_id}/public-link/delete")
        raise ValueError("action must be 'create' or 'delete'")

    def _delete(self, file_id: int):
        return self.c.delete(f"{self.files_base}/{file_id}/delete")

    def test_upload_patch_public_download_revoke_delete(self):
        # список должен быть пуст
        r = self._list()
        assert r.status_code == 200, r.content
        assert len(r.json().get("results", [])) == 0

        # загрузка файла
        f = SimpleUploadedFile("hello.txt", b"hello world", content_type="text/plain")
        r = self._post({"file": f, "comment": "greeting"})
        assert r.status_code == 201, r.content
        file_id = r.json()["id"]

        # проверим, что 1 файл появился
        r = self._list()
        assert r.status_code == 200, r.content
        assert len(r.json()["results"]) == 1

        # патчим метаданные
        r = self._patch(file_id, {"original_name": "hello_renamed.txt", "comment": "updated"})
        assert r.status_code == 200, r.content

        # создаём публичную ссылку
        r = self._public_link(file_id, "create")
        assert r.status_code == 200, r.content
        token = r.json().get("token")
        assert isinstance(token, str) and token

        # скачивание анонимом: подберём корректный URL (/d/<token> или /d/<token>/)
        anon = Client()
        download_url = _get_download_url(token, anon)
        r = anon.get(download_url)
        assert r.status_code == 200, r.status_code
        assert "attachment;" in (r.headers.get("Content-Disposition", ""))

        # отзываем и проверяем, что 404
        r = self._public_link(file_id, "delete")
        assert r.status_code == 200, r.content
        assert r.json().get("status") == "revoked"

        r = anon.get(download_url)
        assert r.status_code == 404

        # удаление
        r = self._delete(file_id)
        assert r.status_code == 200, r.content
        assert r.json().get("status") == "deleted"

    def test_permissions_and_admin_filter(self):
        # загрузка от alice
        f = SimpleUploadedFile("x.txt", b"x", content_type="text/plain")
        r = self._post({"file": f})
        assert r.status_code == 201, r.content
        fid = r.json()["id"]

        # регистрация bob (гость без прав)
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

        # без логина — 401/403
        r = c2.get(f"{self.files_base}?user={self.alice_id}")
        assert r.status_code in (401, 403)

        # логин bob и попытка читать чужие файлы — 403
        r = c2.post("/api/auth/login", {"username": "bobby", "password": "Pass12345!"})
        assert r.status_code == 200, r.content

        r = c2.get(f"{self.files_base}?user={self.alice_id}")
        assert r.status_code == 403, r.content

        # создаём админа и читаем как админ — 200 и видим файл alice
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

        r = c3.get(f"{self.files_base}?user={self.alice_id}")
        assert r.status_code == 200, r.content
        assert any(x.get("id") == fid for x in (r.json().get("results") or []))

        # удаление чужого файла — 403
        r = c2.delete(f"{self.files_base}/{fid}/delete")
        assert r.status_code == 403, r.content
