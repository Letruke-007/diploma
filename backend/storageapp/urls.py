from django.urls import path
from . import views

urlpatterns = [
    # список файлов и загрузка
    path("files/", views.list_files),  # GET, POST

    # обновление имени/комментария
    path("files/<int:pk>/", views.patch_file),  # PATCH

    # удаление файла
    path("files/<int:pk>/delete/", views.delete_file),  # DELETE, POST

    # скачивание файла (авторизованный пользователь)
    path("files/<int:pk>/download/", views.download_file),  # GET

    # просмотр файла в браузере
    path("files/<int:pk>/view/", views.view_file),  # GET (inline preview)

    # использование хранилища
    path("files/usage/", views.storage_usage),  # GET

    # публичные ссылки
    path("files/<int:pk>/public-link/", views.issue_public),          # POST
    path("files/<int:pk>/public-link/delete/", views.revoke_public),  # POST

    # публичная загрузка по токену (вне /api)
    path("d/<str:token>/", views.public_download),  # GET

    # создание папки
    path("folders/", views.create_folder),  # POST

    # массовые операции
    path("files/bulk-move/", views.bulk_move),      # POST
    path("files/bulk/trash/", views.bulk_trash),    # POST
    path("files/archive/", views.download_archive), # POST

    # восстановление из корзины
    path("files/<int:pk>/restore/", views.restore_file),  # POST
]
