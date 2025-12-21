#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# Full-stack deploy (LOCAL -> SERVER) for low-resource VPS
#
# Goals:
# - Guarantee backend sources on server are updated BEFORE docker build
# - Keep server CPU/RAM usage minimal
# - Frontend build happens locally (via deploy_frontend.sh)
# - Backend update happens via tar+scp (fast on server)
# - Add hard verification: sha256 in container must match local
#
# Usage:
#   ./deploy_full_stack.sh
#
# Optional env overrides:
#   SERVER="root@91.229.11.192"
#   DOMAIN="my-cloud-diploma.ru"
#   REMOTE_ROOT="/opt/my-cloud"
#   COMPOSE_DIR="/opt/my-cloud/deploy"
#   BACKEND_SERVICE="backend"
#   NGINX_SERVICE="nginx"
#   RUN_MIGRATIONS="1"
#   FORCE_NO_CACHE="0"   # set to 1 if you want full rebuild on server
#   SKIP_FRONTEND="0"
#   SKIP_BACKEND_SYNC="0"
#   SYNC_DEPLOY_DIR="0"  # set to 1 if you want to sync deploy/ too
# ============================================================

# -----------------------------
# Config
# -----------------------------
SERVER="${SERVER:-root@91.229.11.192}"
DOMAIN="${DOMAIN:-my-cloud-diploma.ru}"

REMOTE_ROOT="${REMOTE_ROOT:-/opt/my-cloud}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/my-cloud/deploy}"

BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"

RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
FORCE_NO_CACHE="${FORCE_NO_CACHE:-0}"

SKIP_FRONTEND="${SKIP_FRONTEND:-0}"
SKIP_BACKEND_SYNC="${SKIP_BACKEND_SYNC:-0}"
SYNC_DEPLOY_DIR="${SYNC_DEPLOY_DIR:-0}"

SSH_OPTS="${SSH_OPTS:--o ConnectTimeout=10 -o ServerAliveInterval=2 -o ServerAliveCountMax=2}"
SCP_OPTS="${SCP_OPTS:-}"

# Local project paths (script assumed to be run from repo root)
LOCAL_BACKEND_DIR="${LOCAL_BACKEND_DIR:-./backend}"
LOCAL_DEPLOY_DIR="${LOCAL_DEPLOY_DIR:-./deploy}"

# File to verify (must exist locally and in container)
VERIFY_LOCAL_FILE="${VERIFY_LOCAL_FILE:-backend/storageapp/serializers.py}"
VERIFY_CONTAINER_FILE="${VERIFY_CONTAINER_FILE:-storageapp/serializers.py}"

# -----------------------------
# Helpers
# -----------------------------
log() { printf '[%s] %s\n' "$(date -u +'%Y-%m-%d %H:%M:%S UTC')" "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing command: $1" >&2; exit 1; }
}

ssh_run() {
  # shellcheck disable=SC2029
  ssh ${SSH_OPTS} "$SERVER" "$@"
}

sha256_local() {
  # Prefer python (works on Windows Git Bash too)
  python - <<'PY'
import hashlib, pathlib, sys
p = pathlib.Path(sys.argv[1])
h = hashlib.sha256(p.read_bytes()).hexdigest()
print(h)
PY
}

assets_marker() {
  curl -ksS "https://${DOMAIN}/" \
    | grep -oE 'assets/index-[^"]+\.js' \
    | head -n 1 \
    || true
}

# -----------------------------
# Preflight
# -----------------------------
need_cmd ssh
need_cmd scp
need_cmd tar
need_cmd python
need_cmd curl

if [[ ! -d "$LOCAL_BACKEND_DIR" ]]; then
  echo "ERROR: backend dir not found: $LOCAL_BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -f "$VERIFY_LOCAL_FILE" ]]; then
  echo "ERROR: verify file not found locally: $VERIFY_LOCAL_FILE" >&2
  exit 1
fi

log "Server: $SERVER"
log "Domain: $DOMAIN"
log "Remote root: $REMOTE_ROOT"
log "Compose dir: $COMPOSE_DIR"
log "Services: backend=$BACKEND_SERVICE nginx=$NGINX_SERVICE"

ASSET_BEFORE="$(assets_marker)"
log "BEFORE (https): asset=${ASSET_BEFORE:-<none>}"

# -----------------------------
# 1) Frontend deploy (local build) - keep heavy CPU off server
# -----------------------------
if [[ "$SKIP_FRONTEND" == "1" ]]; then
  log "Frontend deploy: SKIPPED"
else
  if [[ -x "./deploy_frontend.sh" ]]; then
    log "Frontend deploy: running ./deploy_frontend.sh"
    ./deploy_frontend.sh
  else
    log "Frontend deploy: ./deploy_frontend.sh not found or not executable (SKIPPED)"
  fi
fi

# -----------------------------
# 2) Sync backend sources to server via tar+scp (NO rsync)
# -----------------------------
LOCAL_VERIFY_SHA="$(python - <<PY
import hashlib, pathlib
p = pathlib.Path(r"$VERIFY_LOCAL_FILE")
print(hashlib.sha256(p.read_bytes()).hexdigest())
PY
)"
log "Local verify sha256 ($VERIFY_LOCAL_FILE): $LOCAL_VERIFY_SHA"

if [[ "$SKIP_BACKEND_SYNC" == "1" ]]; then
  log "Backend source sync: SKIPPED"
else
  TMP_BACKEND_TGZ="/tmp/mycloud_backend_$$.tgz"
  log "Packing backend -> $TMP_BACKEND_TGZ"

  # Pack backend/ excluding runtime/generated data
  tar -czf "$TMP_BACKEND_TGZ" \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.pyo' \
    --exclude='*.log' \
    --exclude='.env' \
    --exclude='media' \
    --exclude='staticfiles' \
    --exclude='.pytest_cache' \
    --exclude='.mypy_cache' \
    --exclude='.ruff_cache' \
    -C . backend

  log "Uploading backend archive to server..."
  scp ${SCP_OPTS} "$TMP_BACKEND_TGZ" "$SERVER:/tmp/backend.tgz"

  if [[ "$SYNC_DEPLOY_DIR" == "1" ]]; then
    if [[ -d "$LOCAL_DEPLOY_DIR" ]]; then
      TMP_DEPLOY_TGZ="/tmp/mycloud_deploy_$$.tgz"
      log "Packing deploy -> $TMP_DEPLOY_TGZ (excluding secrets/certs)"

      # IMPORTANT: exclude common cert dirs + .env so we don't destroy prod secrets
      tar -czf "$TMP_DEPLOY_TGZ" \
        --exclude='.env' \
        --exclude='letsencrypt' \
        --exclude='certbot' \
        --exclude='certs' \
        --exclude='ssl' \
        --exclude='acme' \
        --exclude='secrets' \
        --exclude='data' \
        -C . deploy

      log "Uploading deploy archive to server..."
      scp ${SCP_OPTS} "$TMP_DEPLOY_TGZ" "$SERVER:/tmp/deploy.tgz"
    else
      log "SYNC_DEPLOY_DIR=1 but deploy dir not found locally: $LOCAL_DEPLOY_DIR (SKIPPED)"
    fi
  else
    log "Deploy dir sync: disabled (SYNC_DEPLOY_DIR=0)"
  fi

  log "Extracting on server (fast operation)..."
  ssh_run "set -e;
    mkdir -p '$REMOTE_ROOT';
    cd '$REMOTE_ROOT';
    tar -xzf /tmp/backend.tgz;
    rm -f /tmp/backend.tgz;
    if [ -f /tmp/deploy.tgz ]; then
      tar -xzf /tmp/deploy.tgz;
      rm -f /tmp/deploy.tgz;
    fi
  "

  rm -f "$TMP_BACKEND_TGZ" 2>/dev/null || true
  rm -f "${TMP_DEPLOY_TGZ:-}" 2>/dev/null || true
fi

# -----------------------------
# 3) Build/recreate containers on server (minimal)
# -----------------------------
log "Server: docker compose build/up (minimal operations)"

BUILD_ARGS=()
if [[ "$FORCE_NO_CACHE" == "1" ]]; then
  BUILD_ARGS+=(--no-cache)
fi

# We rebuild only backend + nginx, and recreate them without touching deps.
ssh_run "set -e;
  cd '$COMPOSE_DIR';

  compose() { docker compose \"\$@\"; }

  echo '[SERVER] docker compose build ${BUILD_ARGS[*]} $BACKEND_SERVICE $NGINX_SERVICE'
  compose build ${BUILD_ARGS[*]} '$BACKEND_SERVICE' '$NGINX_SERVICE'

  echo '[SERVER] recreate $BACKEND_SERVICE'
  compose up -d --no-deps --force-recreate '$BACKEND_SERVICE'

  if [[ '$RUN_MIGRATIONS' == '1' ]]; then
    echo '[SERVER] migrations'
    compose exec -T '$BACKEND_SERVICE' python manage.py migrate --noinput
  fi

  echo '[SERVER] recreate $NGINX_SERVICE'
  compose up -d --no-deps --force-recreate '$NGINX_SERVICE'
"

# -----------------------------
# 4) Hard verification: file sha256 inside container must match local
# -----------------------------
log "Verifying backend code inside container (sha256 must match)..."

REMOTE_SHA="$(ssh_run "set -e;
  cd '$COMPOSE_DIR';
  docker compose exec -T '$BACKEND_SERVICE' python - <<'PY'
import hashlib, pathlib
p = pathlib.Path('$VERIFY_CONTAINER_FILE')
print(hashlib.sha256(p.read_bytes()).hexdigest())
PY
")"

REMOTE_SHA="$(echo "$REMOTE_SHA" | tr -d '\r' | tail -n 1)"

log "Container verify sha256 ($VERIFY_CONTAINER_FILE): $REMOTE_SHA"

if [[ "$REMOTE_SHA" != "$LOCAL_VERIFY_SHA" ]]; then
  echo "ERROR: Backend verification failed. Container file hash does NOT match local." >&2
  echo "  local : $LOCAL_VERIFY_SHA" >&2
  echo "  remote: $REMOTE_SHA" >&2
  echo "This means server did not build from the updated sources or wrong compose/container is used." >&2
  exit 2
fi

# -----------------------------
# 5) Snapshot AFTER
# -----------------------------
ASSET_AFTER="$(assets_marker)"
log "AFTER (https): asset=${ASSET_AFTER:-<none>}"
log "Full-stack deploy finished successfully."
