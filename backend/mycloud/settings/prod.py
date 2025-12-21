from .base import *


DEBUG = False

ALLOWED_HOSTS = [
    "mycloud-diploma.ru",
    "my-cloud-diploma.ru",
    "localhost",
    "127.0.0.1",
]

USE_X_FORWARDED_HOST = True

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

CSRF_TRUSTED_ORIGINS = [
    "https://mycloud-diploma.ru",
    "https://my-cloud-diploma.ru",
]

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "https://mycloud-diploma.ru",
    "https://my-cloud-diploma.ru",
]
