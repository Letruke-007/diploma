MyCloud

Небольшой файлообменник на Django + DRF (backend) и React + RTK Query (frontend), с отдачей статики через nginx.
Поддерживает публичные ссылки, массовое скачивание ZIP, админ-панель, CSRF-ретраи и лимит размера файла 2 ГБ.

Архитектура

backend — Django/DRF, PostgreSQL, хранит метаданные файлов и отдаёт контент

frontend — React (Vite), сборка попадает в nginx-образ

nginx — статика + прокси к backend

media — каталог для файлов пользователей (том на хосте)

Требования

Docker 24+ и Docker Compose v2+

Порт(ы), указанные в deploy/docker-compose.yml

Быстрый старт
# Клонировать и перейти в проект
git clone <repo> mycloud && cd mycloud

# (опционально) создать .env
cp deploy/.env.example deploy/.env

# Полная пересборка без кэша с pull'ом, миграциями и проверками
./deploy/rebuild.sh --no-cache --pull


После успешного запуска:

backend: http(s)://<domain>/api/…

health-check: http(s)://<domain>/health

админка Django: http(s)://<domain>/admin
(скрипт создаст суперпользователя автоматически при пустой БД и выведет пароль в консоль)

Окружение (.env)

Файл deploy/.env (пример):

# Django/Backend
SECRET_KEY=change-me
DJANGO_DEBUG=0
ALLOWED_HOSTS=example.com,localhost,127.0.0.1
TIME_ZONE=Europe/Istanbul

# DB
POSTGRES_DB=mycloud
POSTGRES_USER=mycloud
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Storage
MEDIA_ROOT=/var/lib/mycloud/media
# MAX_UPLOAD_MB по умолчанию = 2048 (2 ГБ), можно переопределить

# App
SUPERUSER_USERNAME=admin
SUPERUSER_EMAIL=admin@example.com
# SUPERUSER_PASSWORD=... (если не указать — сгенерируется)

# Deploy
DOMAIN=https://mycloud-diploma.duckdns.org


В коде также зашит «жёсткий» лимит 2 ГБ: попытка загрузить больше прерывается с ошибкой.

Сборка и деплой: rebuild.sh

Сценарий запуска/сборки лежит в deploy/rebuild.sh. Он:

выполняет docker compose down (опционально с удалением образов/волюмов);

собирает выбранные сервисы (backend, nginx/frontend, либо все);

поднимает контейнеры и ждёт готовности;

создаёт/применяет миграции, автосоздаёт суперпользователя;

проверяет nginx/ассеты и делает smoke-тест GET /health;

при необходимости чистит docker-ресурсы.

Частые сценарии
# Полная пересборка без кэша (по умолчанию всё)
./deploy/rebuild.sh --no-cache --pull

# Только backend (с кэшем)
./deploy/rebuild.sh --be

# Только nginx (включая сборку фронта)
./deploy/rebuild.sh --nginx --no-cache

# Полный цикл, но без остановки контейнеров и без prune
./deploy/rebuild.sh --no-down --skip-prune

# Агрессивный down: удалить контейнеры, volumes и все образы
./deploy/rebuild.sh -r all -v --orphans

Все опции

Цели: --all (по умолчанию), --be, --fe, --nginx

Кэш/пулы: --no-cache, --pull, --no-pull

Down: --no-down, --rmi=local|all, -v|--volumes, --orphans

Пропуски: --skip-migrations, --skip-prune, --skip-smoke

Прочее: --domain=https://…, -h|--help

Логи сохраняются в deploy/logs/<timestamp>/.

Разработка (локально)
# (вариант) поднять всё целиком
docker compose -f deploy/docker-compose.yml up -d

# Применить миграции вручную
docker compose -f deploy/docker-compose.yml exec backend python manage.py migrate --noinput

# Создать суперпользователя
docker compose -f deploy/docker-compose.yml exec backend python manage.py createsuperuser


Frontend обычно собирается внутри nginx-образа.
Если хочешь локальную разработку фронта вне контейнера — запускай pnpm dev/npm run dev и проксируй API на /api.

API (кратко)

GET/POST /api/files — список/загрузка
параметры: ?user=<id> (доступно админам)

PATCH /api/files/<id> — изменить имя/комментарий

DELETE /api/files/<id>/delete — удалить

GET /api/files/<id>/download — скачать (авторизованный)

POST /api/files/<id>/public-link — выдать публичную ссылку

POST /api/files/<id>/public-link/delete — отозвать

POST /api/files/archive — скачать архивом выбранные ID

GET /d/<token> — публичное скачивание по токену

Хранилище и лимиты

Файлы лежат в MEDIA_ROOT, подкаталоги: u/<first2>/<username>/<uuid[:2]>/<uuid>.

Лимит размера — 2 ГБ, контролируется при загрузке и в процессе записи (атомарная запись через os.replace).

Безопасность

CSRF-токен автоматически прогревается и ретраится в apiFetch и RTK Query baseQuery.

Доступ к чужим файлам только для админов (is_admin/is_superuser).

Публичные токены — URL-safe, отзыв по API.

Тест здоровья

GET /health должен возвращать 200/204. Скрипт деплоя использует его для smoke-проверки.

Лицензия

Проект распространяется по лицензии MIT. См. файл LICENSE
.