from .base import *


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

LOGGING["root"]["level"] = "DEBUG"
LOGGING["loggers"]["accounts"]["level"] = "DEBUG"
LOGGING["loggers"]["storageapp"]["level"] = "DEBUG"
