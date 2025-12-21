from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parents[2]

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
DEBUG = False

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1",
    ).split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "accounts",
    "storageapp",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mycloud.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "backend" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mycloud.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "mycloud"),
        "USER": os.environ.get("POSTGRES_USER", "mycloud"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "mycloud"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": int(os.environ.get("POSTGRES_PORT", "5432")),
    }
}

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Istanbul"
USE_I18N = True
USE_TZ = True

# ---- Static files ----
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "backend" / "static"
STATICFILES_DIRS = [BASE_DIR / "static_front"]

# ---- Media files ----
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))
MEDIA_URL = "/media/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

# ---- Upload limits ----
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "2048"))  # 2 GB
FILE_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024    # 8 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024   # 10 MB

# ---- Storage quota per user ----
USER_QUOTA_GB = int(os.environ.get("USER_QUOTA_GB", "5"))
USER_QUOTA_BYTES = USER_QUOTA_GB * 1024 * 1024 * 1024

# ---- Logging ----
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {
            "format": "[{asctime}] {levelname:<8} {name}: {message}",
            "style": "{",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "accounts": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "storageapp": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
