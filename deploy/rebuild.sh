#!/usr/bin/env bash
set -Eeuo pipefail

# ================== Настройки по умолчанию ==================
DOMAIN="${DOMAIN:-https://mycloud-diploma.duckdns.org}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DEPLOY_DIR="${PROJECT_DIR}/deploy"
COMPOSE="docker compose -f ${DEPLOY_DIR}/docker-compose.yml"

MEDIA_HOST_DIR="${DEPLOY_DIR}/media"
APPS=(accounts storageapp)

# Targets (по умолчанию все)
BUILD_FE=false
BUILD_BE=false
BUILD_NGINX=false
BUILD_ALL=true

# Build flags
USE_CACHE=true
DO_PULL=true

# Down flags (r/i/v?)
DOWN_DO=true
DOWN_RMI=""           # "", "local", "all"
DOWN_VOLUMES=false    # -v
DOWN_ORPHANS=false    # --remove-orphans

# Skips
SKIP_MIGRATIONS=false
SKIP_PRUNE=false
SKIP_SMOKE=false

# ================== Тесты ==================
TESTS="${TESTS:-1}"                      # 1 — запускать тесты; 0 — пропустить
FE_DIR="${FE_DIR:-frontend}"             # каталог фронта (от корня проекта)
DJANGO_TEST_CMD="${DJANGO_TEST_CMD:-pytest -q}"  # основная команда тестов BE (fallback на manage.py test)

# ================== Логи/UI ==================
LOG_ROOT="${DEPLOY_DIR}/logs"
LOG_TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${LOG_ROOT}/${LOG_TS}"
mkdir -p "$LOG_DIR"

STAGE="init"
step() { echo -e "\n\033[1;34m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m✓ $*\033[0m"; }
warn() { echo -e "\033[1;33m! $*\033[0m"; }
die()  { echo -e "\033[1;31m✖ $*\033[0m"; exit 1; }

on_error() {
  local ec=$?
  echo
  echo -e "\033[1;31m✖ Ошибка на этапе: ${STAGE} (exit ${ec})\033[0m"
  local lf="${LOG_DIR}/${STAGE}.log"
  if [[ -f "$lf" ]]; then
    echo "---- tail ${lf} ----"
    tail -n 200 "$lf" | sed 's/^/│ /'
  fi
  echo "Полные логи: ${LOG_DIR}"
  exit "$ec"
}
trap on_error ERR

run() {
  local stage="$1"; shift
  local cmd="$*"
  STAGE="$stage"
  local lf="${LOG_DIR}/${stage}.log"
  echo "[$(date -Is)] $cmd" >> "$lf"
  if ! bash -lc "$cmd" >> "$lf" 2>&1; then
    echo "RC=$? FAIL" >> "$lf"
    tail -n 200 "$lf" | sed 's/^/│ /'
    die "Этап ${stage} завершился с ошибкой. См. $lf"
  fi
  ok "${stage}"
}

run_capture() {
  local stage="$1"; shift
  local cmd="$*"
  STAGE="$stage"
  local lf="${LOG_DIR}/${stage}.log"
  echo "[$(date -Is)] $cmd" >> "$lf"
  local out
  if ! out="$(bash -lc "$cmd" 2>>"$lf")"; then
    echo "RC=$? FAIL" >> "$lf"
    tail -n 200 "$lf" | sed 's/^/│ /'
    die "Этап ${stage} завершился с ошибкой. См. $lf"
  fi
  echo "$out" >> "$lf"
  printf "%s" "$out"
}

# ================== CLI ==================
usage() {
  cat <<'EOF'
rebuild.sh — сборка/перезапуск mycloud

ИСПОЛЬЗОВАНИЕ:
  ./deploy/rebuild.sh [опции]

ОСНОВНЫЕ ОПЦИИ:
  --fe                 Собирать только frontend (в nginx-образ)
  --be                 Собирать только backend
  --nginx              Собирать только nginx
  --all                Собирать все сервисы (по умолчанию)

  --no-cache           Билд без кэша (по умолчанию: с кэшем)
  --pull               Перед билдом тянуть базовые образы (по умолчанию: да)
  --no-pull            Не тянуть базовые образы

  --no-down            Не выполнять docker compose down
  -r, --rmi {local|all}
                       При down удалять образы (docker compose down --rmi ...)
  -v, --volumes        При down удалять volumes
  --orphans            При down удалять "осиротевшие" контейнеры

  --skip-migrations    Пропустить миграции
  --skip-prune         Пропустить docker system/builder prune
  --skip-smoke         Пропустить smoke-проверку nginx
  --domain=URL         Домен для smoke-тестов (по умолчанию из переменной DOMAIN)

  -h, --help           Показать справку

ПРИМЕРЫ:
  # Полная пересборка без кэша, с pull, с очисткой (по умолчанию)
  ./deploy/rebuild.sh --no-cache

  # Только backend, с кэшем
  ./deploy/rebuild.sh --be

  # Только nginx (фронт в его образе), без кэша и с pull
  ./deploy/rebuild.sh --nginx --no-cache --pull

  # Полный цикл, но без down и без prune
  ./deploy/rebuild.sh --no-down --skip-prune

  # Полный цикл с агрессивным down: удалить контейнеры, volumes и ВСЕ образы
  ./deploy/rebuild.sh -r all -v --orphans
EOF
}

# Парсинг
for arg in "$@"; do
  case "$arg" in
    --fe)      BUILD_FE=true; BUILD_ALL=false ;;
    --be)      BUILD_BE=true; BUILD_ALL=false ;;
    --nginx)   BUILD_NGINX=true; BUILD_ALL=false ;;
    --all)     BUILD_ALL=true ;;

    --no-cache) USE_CACHE=false ;;
    --pull)     DO_PULL=true ;;
    --no-pull)  DO_PULL=false ;;

    --no-down)  DOWN_DO=false ;;
    -r|--rmi)
      die "Опция --rmi требует значение: local|all. Используй: --rmi=local или --rmi=all"
      ;;
    --rmi=local) DOWN_RMI="local" ;;
    --rmi=all)   DOWN_RMI="all" ;;
    -v|--volumes) DOWN_VOLUMES=true ;;
    --orphans)    DOWN_ORPHANS=true ;;

    --skip-migrations) SKIP_MIGRATIONS=true ;;
    --skip-prune)      SKIP_PRUNE=true ;;
    --skip-smoke)      SKIP_SMOKE=true ;;
    --domain=*)        DOMAIN="${arg#*=}" ;|

    -h|--help) usage; exit 0 ;;
    *) die "Неизвестная опция: $arg (см. --help)" ;;
  esac
done

# Валидация взаимоисключающих целей
count_targets=$(( BUILD_FE + BUILD_BE + BUILD_NGINX ))
if [[ "$count_targets" -gt 1 ]]; then
  die "Опции --fe/--be/--nginx взаимоисключающие. Оставь только одну (или ни одной для сборки всех)."
fi

# ================== Хелперы ==================
ensure_media_dir() {
  step "Проверка каталога медиа"
  run "PREP_MEDIA" "mkdir -p '$MEDIA_HOST_DIR'"
  bash -lc "chown -R \"\$(id -u):\$(id -g)\" '$MEDIA_HOST_DIR' 2>/dev/null" || true
}

has_migrations_dir() {
  local app="$1"
  local dir="${PROJECT_DIR}/backend/${app}/migrations"
  [[ -d "$dir" ]] || return 1
  local n
  n="$(find "$dir" -maxdepth 1 -type f -name '*.py' ! -name '__init__.py' | wc -l | tr -d ' ')"
  [[ "${n:-0}" -ge 1 ]]
}

ensure_app_migrations() {
  local app="$1"
  if has_migrations_dir "$app"; then
    ok "Миграции ${app}: есть"
  else
    step "Создание миграций для ${app}"
    run "MIG_MAKEMIGR_${app}" "$COMPOSE exec -T backend python manage.py makemigrations '$app'"
  fi
}

backend_wait_ready() {
  step "Ожидание готовности backend (showmigrations)"
  for _ in {1..30}; do
    if bash -lc "$COMPOSE exec -T backend python manage.py showmigrations >/dev/null 2>&1"; then
      ok "Backend готов"
      return 0
    fi
    sleep 1
  done
  STAGE="BACKEND_WAIT"
  die "Backend не дождался готовности"
}

nginx_wait_ready() {
  step "Ожидание готовности nginx"
  for _ in {1..30}; do
    if bash -lc "$COMPOSE exec -T nginx wget -qO- http://127.0.0.1/health >/dev/null 2>&1"; then
      ok "nginx отвечает (health)"; return 0; fi
    if bash -lc "$COMPOSE exec -T nginx wget --max-redirect=0 -qO- http://127.0.0.1/ >/dev/null 2>&1"; then
      ok "nginx отвечает (http /)"; return 0; fi
    if bash -lc "$COMPOSE exec -T nginx wget --no-check-certificate -qO- https://127.0.0.1/ >/dev/null 2>&1"; then
      ok "nginx отвечает (https)"; return 0; fi
    sleep 1
  done
  STAGE="NGINX_WAIT"
  die "nginx не отвечает"
}

nginx_assets_check() {
  step "Проверка ассетов в nginx"
  run "NGINX_ASSETS_CSS" "$COMPOSE exec -T nginx sh -lc 'grep -a -- \"--brand\" /usr/share/nginx/html/assets/*.css | head -n 3 || true'"
  run "NGINX_ASSETS_JS"  "$COMPOSE exec -T nginx sh -lc 'grep -a \"col-icon\\|icon-button\\|dropzone\" /usr/share/nginx/html/assets/index-*.js | head -n 5 || true'"
}

auto_create_superuser() {
  step "Проверка/создание суперпользователя"
  local count_cmd="$COMPOSE exec -T backend python manage.py shell -c 'from django.contrib.auth import get_user_model as G; U=G(); print(U.objects.count())' 2>/dev/null | tr -d '\r' | tail -n1 | grep -Eo '^[0-9]+' || echo 0"
  local count
  count="$(run_capture "USR_COUNT" "$count_cmd")"
  if [[ "${count:-0}" -gt 0 ]]; then ok "Пользователи уже есть ($count)"; return 0; fi

  local su_user="${SUPERUSER_USERNAME:-admin}"
  local su_email="${SUPERUSER_EMAIL:-admin@example.com}"
  local su_pass generated=0
  if [[ -n "${SUPERUSER_PASSWORD:-}" ]]; then
    su_pass="${SUPERUSER_PASSWORD}"
  else
    su_pass="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"; generated=1
  fi

  local create_cmd="$COMPOSE exec -T backend python manage.py shell -c '
from django.contrib.auth import get_user_model
U=get_user_model()
if not U.objects.filter(username=${su_user@Q}).exists():
    U.objects.create_superuser(username=${su_user@Q},email=${su_email@Q},password=${su_pass@Q})
print(\"ok\")
'"
  run "USR_CREATE" "$create_cmd"

  if [[ "$generated" -eq 1 ]]; then
    echo "----------------------------------------------"
    echo "  СУПЕРПОЛЬЗОВАТЕЛЬ СОЗДАН:"
    echo "    username: ${su_user}"
    echo "    email:    ${su_email}"
    echo "    password: ${su_pass}"
    echo "  (СОХРАНИ ЭТОТ ПАРОЛЬ — он показан один раз)"
    echo "----------------------------------------------"
  else
    ok "Суперпользователь создан/проверен"
  fi
}

smoke_check() {
  $SKIP_SMOKE && { warn "Smoke-тест пропущен (--skip-smoke)"; return 0; }
  step "Smoke-тест домена: ${DOMAIN}"
  run "SMOKE_HTTP_200" "curl -fsSL -o /dev/null -w '%{http_code}\n' '${DOMAIN}/health' | grep -Eq '^(200|204)$'"
}

# ================== Тестовые хелперы ==================
run_backend_tests() {
  step "Запуск backend-тестов"
  run "TEST_BE" "$COMPOSE run --rm backend bash -lc '$DJANGO_TEST_CMD || python manage.py test --noinput'"
}

run_frontend_tests() {
  step "Запуск frontend-тестов"
  if [[ ! -d \"${PROJECT_DIR}/${FE_DIR}\" || ! -f \"${PROJECT_DIR}/${FE_DIR}/package.json\" ]]; then
    warn \"Каталог ${FE_DIR} или package.json не найдены — пропуск фронтовых тестов\"
    return 0
  fi
  run "TEST_FE" "docker run --rm -t -v '${PROJECT_DIR}/${FE_DIR}':/app -w /app node:20-alpine sh -lc '
    set -e
    if [ -f pnpm-lock.yaml ]; then
      corepack enable >/dev/null 2>&1 || true
      pnpm install --frozen-lockfile
      pnpm test -- --ci --run
    elif [ -f yarn.lock ]; then
      corepack enable >/dev/null 2>&1 || true
      yarn install --frozen-lockfile
      yarn test --ci
    else
      npm ci
      npm test -- --ci --run
    fi
  '"
}

run_tests_stage() {
  [[ "$TESTS" = "1" ]] || { warn "Тесты отключены (TESTS=0) — пропуск"; return 0; }

  # Выбор набора тестов по цели сборки
  if $BUILD_BE; then
    run_backend_tests
    return 0
  fi
  if $BUILD_FE || $BUILD_NGINX; then
    run_frontend_tests
    return 0
  fi

  # Полный прогон
  set +e
  bash -lc true
  local be_ok=0 fe_ok=0
  if run_backend_tests; then be_ok=1; fi
  if run_frontend_tests; then fe_ok=1; fi
  set -e

  if [[ $be_ok -ne 1 || $fe_ok -ne 1 ]]; then
    STAGE="TESTS"
    die "Не все тесты прошли (backend ok=$be_ok, frontend ok=$fe_ok)"
  fi
  ok "Все тесты пройдены"
}

# ================== Основной сценарий ==================
step "Логи: $LOG_DIR"
ensure_media_dir

# 1) Down
if $DOWN_DO; then
  step "Остановка контейнеров (down)"
  down_args=()
  [[ -n "$DOWN_RMI"    ]] && down_args+=(--rmi "$DOWN_RMI")
  $DOWN_VOLUMES       && down_args+=(--volumes)
  $DOWN_ORPHANS       && down_args+=(--remove-orphans)
  run "DOWN" "$COMPOSE down ${down_args[*]:-}"
else
  warn "Шаг down пропущен (--no-down)"
fi

# 2) Build
step "Сборка образов"
build_args=()
$DO_PULL   && build_args+=(--pull)
$USE_CACHE || build_args+=(--no-cache)

if   $BUILD_FE; then
  run "BUILD_FE"     "$COMPOSE build ${build_args[*]:-} nginx"
elif $BUILD_BE; then
  run "BUILD_BE"     "$COMPOSE build ${build_args[*]:-} backend"
elif $BUILD_NGINX; then
  run "BUILD_NGINX"  "$COMPOSE build ${build_args[*]:-} nginx"
else
  run "BUILD_ALL"    "$COMPOSE build ${build_args[*]:-}"
fi

# 3) Up
step "Поднимаю контейнеры"
run "UP" "$COMPOSE up -d --force-recreate"
run "PS" "$COMPOSE ps"

# 4) Backend ready
backend_wait_ready

# 5) Тесты (после сборки и старта сервисов)
step "Этап тестов (после сборки)…"
run_tests_stage

# 6) Миграции
if $SKIP_MIGRATIONS; then
  warn "Миграции пропущены (--skip-migrations)"
else
  step "Проверка/создание миграций"
  for app in "${APPS[@]}"; do ensure_app_migrations "$app"; done

  step "Применение миграций"
  run "MIGRATE" "$COMPOSE exec -T backend python manage.py migrate --noinput"

  step "Короткий отчёт по миграциям"
  run "SHOWMIGR" "$COMPOSE exec -T backend python manage.py showmigrations | sed -n '1,200p'"
fi

# 7) Суперпользователь
auto_create_superuser

# 8) Nginx + ассеты + smoke
nginx_wait_ready
nginx_assets_check
smoke_check

# 9) Prune
if $SKIP_PRUNE; then
  warn "Очистка docker-ресурсов пропущена (--skip-prune)"
else
  step "Очистка неиспользуемых docker-ресурсов"
  run "PRUNE_SYSTEM"  "docker system prune -af"
  run "PRUNE_BUILDER" "docker builder prune -af"
fi

ok "Готово. Полные логи: $LOG_DIR"
