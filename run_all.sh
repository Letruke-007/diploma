#!/usr/bin/env bash
set -e

# Ensure MSYS tools are always reachable (uname/sed/cygpath/etc.)
export PATH="/usr/bin:/bin:/mingw64/bin:$PATH"
hash -r

echo "=== Запускаем backend (settings: mycloud.settings.test) ==="

cd backend

# Save PATH before venv activation (we’ll need it for npm later)
ORIG_PATH="$PATH"

# Make core MSYS utilities available even if activate script pollutes PATH
uname()   { /usr/bin/uname "$@"; }
cygpath() { /usr/bin/cygpath "$@"; }

# Активируем venv (Windows or Unix layout)
if [ -f "venv/bin/activate" ]; then
  # Linux/Unix venv
  # shellcheck disable=SC1091
  source "venv/bin/activate"
elif [ -f "venv/Scripts/activate" ]; then
  # Windows venv (Git Bash)
  # shellcheck disable=SC1091
  source "venv/Scripts/activate"
else
  echo "ERROR: venv activate script not found in backend/venv (expected venv/bin/activate or venv/Scripts/activate)"
  exit 1
fi

# Применяем миграции под тестовыми (локальными) настройками
python manage.py migrate --noinput --settings=mycloud.settings.test

# Запускаем сервер Django с теми же настройками
python manage.py runserver 0.0.0.0:8000 --settings=mycloud.settings.test &
BACKEND_PID=$!

echo "Backend запущен (PID = $BACKEND_PID) на http://localhost:8000"
echo "=== Запускаем frontend ==="

cd ../frontend

# Drop venv so PATH returns and npm/node are available
deactivate 2>/dev/null || true
PATH="$ORIG_PATH"
export PATH
hash -r

# Optional: quick guard
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm not found in PATH"; exit 1; }

npm run dev &
FRONTEND_PID=$!

echo "Frontend запущен (PID = $FRONTEND_PID) на http://localhost:5173"

echo
echo "===================================================="
echo " Backend:  http://localhost:8000"
echo " Frontend: http://localhost:5173"
echo "===================================================="
echo

trap "echo 'Останавливаем оба процесса...'; kill $BACKEND_PID $FRONTEND_PID; exit 0" SIGINT

wait
