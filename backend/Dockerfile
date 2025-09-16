# ---------- 1) Frontend build (Vite) ----------
FROM node:20-alpine AS fe
WORKDIR /app

# кешируем установку зависимостей
COPY frontend/package*.json ./
RUN npm install

# копируем исходники и билдим фронт
COPY frontend/ ./
RUN npm run build

# --- Валидация билда фронта ---
RUN set -eux; \
    test -f /app/dist/index.html; \
    ls -l /app/dist/; \
    css_count="$(find /app/dist -maxdepth 2 -type f -name '*.css' | wc -l)"; \
    if [ "${css_count}" -eq 0 ]; then \
      echo "ERROR: после vite build не найдено ни одного CSS в dist. \
Убедись, что styles.css импортируется в src/main.tsx или лежит в public/."; \
      exit 1; \
    fi; \
    echo "CSS files:"; \
    find /app/dist -maxdepth 2 -type f -name '*.css' -print


# ---------- 2) Backend build (Django) ----------
FROM python:3.12-slim-bookworm AS be
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/app

# --- Офлайн wheelhouse и requirements ---
COPY wheelhouse/ /wheels/
COPY backend/requirements/prod.txt /srv/app/requirements.txt

# --- Диагностическая офлайн-установка по одному пакету (POSIX sh) ---
ENV PIP_NO_INDEX=1 PIP_FIND_LINKS=/wheels
RUN set -eu; \
    awk 'NF && $1 !~ /^#/' /srv/app/requirements.txt > /tmp/req_no_comments.txt; \
    grep -vE '^[[:space:]]*-' /tmp/req_no_comments.txt > /tmp/req_clean.txt || true; \
    while read -r dep; do \
        echo "Installing: $dep"; \
        pip install "$dep" || { echo "FAILED: $dep"; exit 1; }; \
    done < /tmp/req_clean.txt

# --- Перенос backend-кода ---
COPY backend/ /srv/app/

# --- Сбор статики Django ---
ENV DJANGO_SETTINGS_MODULE=mycloud.settings.prod
RUN mkdir -p /tmp/static_build && \
    (python manage.py collectstatic --noinput || true) && \
    python - <<'PY' || true
import os, shutil
from django.conf import settings
src = settings.STATIC_ROOT
dst = "/tmp/static_build"
print("STATIC_ROOT:", src)
if src and os.path.isdir(src):
    for name in os.listdir(src):
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
PY

# ---------- 3) Финальный nginx-образ ----------
FROM nginx:1.27-alpine AS nginx

# фронтенд-ассеты
COPY --from=fe /app/dist /usr/share/nginx/html

# статика Django (если есть) — из гарантированного каталога
COPY --from=be /tmp/static_build /usr/share/nginx/html/static

# конфиг nginx
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
