from .base import *  # noqa

from pathlib import Path
import tempfile


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "test_db.sqlite3",
    }
}

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

DEBUG = True

# В тестах (и особенно в CI) гарантируем writable MEDIA_ROOT
# GitHub Actions runner не даст писать в "/" (как раз то, что ломало тесты).
MEDIA_ROOT = Path(tempfile.gettempdir()) / "mycloud_test_media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

LOGGING["root"]["level"] = "DEBUG"
LOGGING["loggers"]["accounts"]["level"] = "DEBUG"
LOGGING["loggers"]["storageapp"]["level"] = "DEBUG"
