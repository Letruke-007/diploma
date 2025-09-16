# MyCloud — дипломный проект

Веб-приложение для обмена файлами и управления доступом.  
Проект состоит из **Django backend** и **React frontend**, работает в Docker-контейнерах.

## 🚀 Возможности
- Загрузка и хранение файлов
- Переименование и добавление комментариев
- Создание публичных ссылок для скачивания
- Авторизация и администрирование через Django
- REST API для работы с файлами
- Поддержка Docker-сборки и деплоя на сервер

## 🛠 Технологии
- **Backend:** Python 3.12, Django, Django REST Framework
- **Frontend:** React, Vite, jszip
- **База данных:** PostgreSQL
- **Инфраструктура:** Docker Compose
- **CI/CD:** GitHub Actions

## ⚙️ Локальный запуск

1. Клонировать репозиторий:
   ```bash
   git clone git@github.com:Letruke-007/diplom.git
   cd diploma
   ```

2. Создать файл окружения `.env`:
   ```env
   POSTGRES_DB=mycloud
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_HOST=db
   POSTGRES_PORT=5432
   DJANGO_SECRET_KEY=super-secret-key
   ```

3. Собрать и запустить:
   ```bash
   docker compose up --build
   ```

4. Применить миграции:
   ```bash
   docker compose exec backend python manage.py migrate
   ```

5. Создать суперпользователя:
   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

6. Открыть приложение:
   ```
   http://localhost:8000
   ```

## 🧪 Запуск тестов

В Docker-контейнере:
```bash
docker compose run --rm backend python manage.py test -v 2
```

На GitHub Actions тесты запускаются автоматически при каждом пуше в ветку `main`.

## 📦 CI/CD

В проекте настроен один workflow:

- **CI (unit tests)** — проверка миграций и юнит-тестов на GitHub Actions.

## ✅ Статус сборок

[![CI (unit tests)](https://github.com/Letruke-007/diploma/actions/workflows/ci.yml/badge.svg)](https://github.com/Letruke-007/diploma/actions/workflows/ci.yml)

## 🌐 Демонстрация

Проект развернут на сервере и доступен по адресу:  
👉 [https://mycloud-diploma.duckdns.org](https://mycloud-diploma.duckdns.org)

- Админка Django: `https://mycloud-diploma.duckdns.org/admin/`
- Клиентский интерфейс: `https://mycloud-diploma.duckdns.org/`

Для проверки можно:
1. Зарегистрировать нового пользователя.
2. Загрузить файл.
3. Сгенерировать публичную ссылку.
4. Скачать файл по адресу вида `https://mycloud-diploma.duckdns.org/d/<token>`.

## 🚀 Deployment

Для развёртывания на сервере:

1. Подключиться к серверу и обновить код:
   ```bash
   ssh user@server
   cd ~/mycloud
   git pull origin main
   ```

2. Собрать и запустить контейнеры:
   ```bash
   docker compose up -d --build
   ```

3. Применить миграции и собрать статику:
   ```bash
   docker compose exec backend python manage.py migrate --noinput
   docker compose exec backend python manage.py collectstatic --noinput
   ```

4. Перезапустить контейнеры:
   ```bash
   docker compose restart
   ```

После этого приложение доступно по адресу сервера (например, `https://mycloud.example.com`).
