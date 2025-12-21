#!/usr/bin/env bash
set -euo pipefail

# -----------------------------
# Настройки (по вашим фактам)
# -----------------------------
SSH_USER="root"
SSH_HOST="91.229.11.192"
SSH_PORT="22"

DOMAIN="https://my-cloud-diploma.ru"

# локальный фронт
FRONTEND_DIR="/d/my-cloud/frontend"

# сервер
SERVER_DEPLOY_DIR="/opt/my-cloud/deploy"
REMOTE_DIST_DIR="${SERVER_DEPLOY_DIR}/frontend_dist"

# compose / сервисы
COMPOSE_FILE="${SERVER_DEPLOY_DIR}/docker-compose.yml"
NGINX_SERVICE="nginx"

# rsync предпочтительнее; если нет - будет fallback на scp+tar
PREFER_RSYNC="1"

# -----------------------------
# Хелперы
# -----------------------------
log() { printf "\n[%s] %s\n" "$(date +'%H:%M:%S')" "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: требуется команда: $1"; exit 1; }
}

ssh_run() {
  ssh -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "$@"
}

# -----------------------------
# Проверки окружения
# -----------------------------
need_cmd ssh
need_cmd npm
need_cmd curl
need_cmd grep
need_cmd sha256sum
need_cmd tar

if [[ "${PREFER_RSYNC}" == "1" ]]; then
  if ! command -v rsync >/dev/null 2>&1; then
    log "rsync не найден локально — переключаюсь на scp+tar"
    PREFER_RSYNC="0"
  else
    need_cmd rsync
  fi
else
  need_cmd scp
fi

# -----------------------------
# 1) Локальная сборка
# -----------------------------
log "Локальная сборка frontend: ${FRONTEND_DIR}"
cd "${FRONTEND_DIR}"

log "npm ci"
npm ci

log "npm run build"
npm run build

if [[ ! -d "dist" ]]; then
  echo "ERROR: dist/ не найден после build"
  exit 1
fi

BUILD_ID="$(date -u +%Y%m%dT%H%M%SZ)"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -n "${GIT_SHA}" ]]; then
    BUILD_ID="${BUILD_ID}-${GIT_SHA}"
  fi
fi

log "Пишу маркеры билда в dist/"
echo "${BUILD_ID}" > dist/build_id.txt
sha256sum dist/index.html > dist/index.html.sha256

# находим основной бандл (на случай нескольких — берём первый по имени)
MAIN_JS="$(ls -1 dist/assets/index-*.js 2>/dev/null | head -n 1 || true)"
if [[ -n "${MAIN_JS}" ]]; then
  sha256sum "${MAIN_JS}" > dist/main.js.sha256
fi

log "Локальные маркеры:"
echo "  build_id: ${BUILD_ID}"
echo "  index.html sha256: $(cut -d' ' -f1 dist/index.html.sha256)"

# -----------------------------
# 2) Доставка dist -> сервер (/opt/my-cloud/deploy/frontend_dist)
# -----------------------------
log "Готовлю директорию на сервере: ${REMOTE_DIST_DIR}"
ssh_run "mkdir -p '${REMOTE_DIST_DIR}'"

log "Заливаю dist/ на сервер"
if [[ "${PREFER_RSYNC}" == "1" ]]; then
  rsync -az --delete -e "ssh -p ${SSH_PORT}" ./dist/ "${SSH_USER}@${SSH_HOST}:${REMOTE_DIST_DIR}/"
else
  need_cmd scp
  tar -C dist -czf /tmp/dist.tgz .
  scp -P "${SSH_PORT}" /tmp/dist.tgz "${SSH_USER}@${SSH_HOST}:${SERVER_DEPLOY_DIR}/dist.tgz"
  rm -f /tmp/dist.tgz
  ssh_run "set -euo pipefail
    rm -rf '${REMOTE_DIST_DIR:?}'/*
    tar -C '${REMOTE_DIST_DIR}' -xzf '${SERVER_DEPLOY_DIR}/dist.tgz'
    rm -f '${SERVER_DEPLOY_DIR}/dist.tgz'
  "
fi

# -----------------------------
# 3) Обеспечить bind-mount frontend_dist -> /usr/share/nginx/html
#    (без docker build, без npm на сервере)
# -----------------------------
log "Проверяю docker-compose.yml на сервере и при необходимости добавляю volume frontend_dist -> /usr/share/nginx/html"

ssh_run "set -euo pipefail
cd '${SERVER_DEPLOY_DIR}'

python3 - <<'PY'
from pathlib import Path
import re, time, shutil, sys

compose_path = Path('${COMPOSE_FILE}')
text = compose_path.read_text(encoding='utf-8')

needle = r'      - ./frontend_dist:/usr/share/nginx/html:ro'
if re.search(r'^[ \t]*- \./frontend_dist:/usr/share/nginx/html:ro[ \t]*$', text, flags=re.M):
    print('[INFO] volume frontend_dist уже присутствует — ок')
    sys.exit(0)

backup = compose_path.with_name(compose_path.name + '.bak.' + time.strftime('%Y%m%dT%H%M%S'))
shutil.copy2(compose_path, backup)
print(f'[INFO] volume frontend_dist не найден — патчу compose (backup: {backup})')

lines = text.splitlines(True)

# Находим блок nginx: -> volumes:
i = 0
nginx_start = None
while i < len(lines):
    if lines[i].startswith('  nginx:'):
        nginx_start = i
        break
    i += 1

if nginx_start is None:
    raise SystemExit('ERROR: секция \"nginx:\" не найдена в compose')

# Граница секции nginx (следующий top-level сервис с отступом 2 пробела)
j = nginx_start + 1
nginx_end = len(lines)
while j < len(lines):
    if re.match(r'^  [A-Za-z0-9_-]+:\s*$', lines[j]) and not lines[j].startswith('  nginx:'):
        nginx_end = j
        break
    j += 1

# Находим '    volumes:' внутри nginx секции
vol_line = None
k = nginx_start
while k < nginx_end:
    if lines[k].startswith('    volumes:'):
        vol_line = k
        break
    k += 1

if vol_line is None:
    raise SystemExit('ERROR: внутри секции nginx не найден блок \"volumes:\"')

# Вставляем после строки nginx.conf (предпочтительно), иначе после последней строки в volumes
insert_at = None
k = vol_line + 1

# Идём по строкам volumes до выхода из блока (пока строки начинаются с 6 пробелов "      -")
last_vol = vol_line
while k < nginx_end and (lines[k].startswith('      -') or lines[k].strip() == ''):
    if lines[k].startswith('      -'):
        last_vol = k
        if './nginx/nginx.conf:/etc/nginx/nginx.conf:ro' in lines[k]:
            insert_at = k + 1
            break
    k += 1

if insert_at is None:
    insert_at = last_vol + 1

lines.insert(insert_at, needle + '\n')
compose_path.write_text(''.join(lines), encoding='utf-8')
print('[INFO] compose обновлён: добавлен volume frontend_dist -> /usr/share/nginx/html')
PY
"

# -----------------------------
# 4) Перезапуск nginx без build (без npm)
# -----------------------------
log "Перезапускаю nginx контейнер без сборки образа (docker compose up -d --force-recreate nginx)"
ssh_run "set -euo pipefail
cd '${SERVER_DEPLOY_DIR}'
docker compose up -d --no-deps --force-recreate '${NGINX_SERVICE}'
docker compose ps '${NGINX_SERVICE}'
"

# -----------------------------
# 5) Доказательства обновления (маркер + хэш бандла)
# -----------------------------
log "Проверка через HTTPS: build_id.txt"
REMOTE_BUILD_ID="$(curl -ksS "${DOMAIN}/build_id.txt" | tr -d '\r' || true)"
echo "  remote build_id: ${REMOTE_BUILD_ID}"

if [[ "${REMOTE_BUILD_ID}" != "${BUILD_ID}" ]]; then
  echo "ERROR: build_id на сервере не совпал. Ожидалось: ${BUILD_ID}"
  echo "Проверьте, что ${DOMAIN} действительно обслуживается этим nginx и что cache не мешает."
  exit 3
fi

log "Проверка: assets/index-*.js и sha256"
ASSET_PATH="$(curl -ksS "${DOMAIN}/" | grep -oE 'assets/index-[^\" ]+\.js' | head -n 1 || true)"
echo "  asset: ${ASSET_PATH}"

if [[ -z "${ASSET_PATH}" ]]; then
  echo "ERROR: не удалось найти assets/index-*.js на главной странице"
  exit 4
fi

REMOTE_JS_SHA="$(curl -ksS "${DOMAIN}/${ASSET_PATH}" | sha256sum | awk '{print $1}')"
echo "  remote js sha256: ${REMOTE_JS_SHA}"

if [[ -f "dist/main.js.sha256" ]]; then
  LOCAL_JS_SHA="$(cut -d' ' -f1 dist/main.js.sha256)"
  echo "  local  js sha256: ${LOCAL_JS_SHA}"
  if [[ "${REMOTE_JS_SHA}" != "${LOCAL_JS_SHA}" ]]; then
    echo "ERROR: sha256 бандла не совпал. Значит в прод не тот dist."
    exit 5
  fi
fi

log "OK: фронт обновлён, маркеры и sha256 совпали"
