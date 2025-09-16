from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.utils import timezone

from .models import StoredFile

# Жёсткий лимит размера файла: 2 ГБ
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB


def ensure_user_storage_dir(user) -> Path:
    """
    Гарантирует существование каталога пользователя под MEDIA_ROOT.
    Возвращает абсолютный путь на диске.
    """
    base = Path(settings.MEDIA_ROOT)
    if not getattr(user, "storage_rel_path", None):
        user.storage_rel_path = f"u/{user.username[:2].lower()}/{user.username}"
        user.save(update_fields=["storage_rel_path"])
    path = base / user.storage_rel_path
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_uploaded(django_file, user, comment: str = "") -> StoredFile:
    """
    Сохраняет загружаемый файл на диск и создаёт StoredFile.
    Пишет через временный файл с последующей атомарной заменой.
    Применяет лимит 2 ГБ: проверяет заранее (если известен size) и в процессе записи.
    """
    size: Optional[int] = getattr(django_file, "size", None)
    if size is not None and size > MAX_FILE_BYTES:
        raise ValueError("File too large (max 2GB)")

    user_dir = ensure_user_storage_dir(user)

    sf = StoredFile(
        owner=user,
        original_name=getattr(django_file, "name", "") or "file",
        rel_dir=user.storage_rel_path,
        size=size or 0,
        comment=comment,
        uploaded_at=timezone.now(),
    )
    sf.save()

    # Подкаталог по первым двум символам UUID
    subdir = user_dir / str(sf.disk_name)[:2]
    subdir.mkdir(parents=True, exist_ok=True)

    dst = subdir / str(sf.disk_name)
    tmp = dst.with_suffix(dst.suffix + ".tmp")

    bytes_written = 0
    try:
        chunks_iter = getattr(django_file, "chunks", None)
        if callable(chunks_iter):
            iterator = chunks_iter()
        else:
            data = getattr(django_file, "read", lambda: b"")()
            iterator = [data]

        with open(tmp, "wb") as out:
            for chunk in iterator:
                if not chunk:
                    continue
                bytes_written += len(chunk)
                if bytes_written > MAX_FILE_BYTES:
                    raise ValueError("File too large (max 2GB)")
                out.write(chunk)

        os.replace(tmp, dst)  # атомарная замена
    except Exception:
        # При любой ошибке — подчистим временный файл и БД-запись
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        try:
            sf.delete()
        except Exception:
            pass
        raise
    finally:
        # На случай редких гонок — дополнительная уборка tmp
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass

    # Финальный размер по факту записи
    try:
        sf.size = dst.stat().st_size
        sf.save(update_fields=["size"])
    except Exception:
        pass

    return sf


def delete_stored_file(sf: StoredFile) -> None:
    """
    Удаляет файл на диске (если есть) и запись из БД.
    Ошибки файловой системы не валят процесс.
    """
    try:
        path = Path(settings.MEDIA_ROOT) / sf.rel_path
        if path.is_file():
            path.unlink()
    except Exception:
        pass
    sf.delete()


def issue_public_link(sf: StoredFile) -> str:
    token = secrets.token_urlsafe(24)
    sf.public_token = token
    sf.save(update_fields=["public_token"])
    return token


def revoke_public_link(sf: StoredFile) -> StoredFile:
    sf.public_token = None
    sf.save(update_fields=["public_token"])
    return sf


def resolve_public_link(token: str) -> Optional[StoredFile]:
    try:
        return StoredFile.objects.get(public_token=token)
    except StoredFile.DoesNotExist:
        return None
