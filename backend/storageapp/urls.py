from django.urls import path
from . import views

urlpatterns = [
    # список файлов и загрузка
    path("files", views.list_files),                 # GET, POST

    # обновление имени/комментария
    path("files/<int:pk>", views.patch_file),        # PATCH

    # удаление файла
    path("files/<int:pk>/delete", views.delete_file),  # DELETE, POST

    # скачивание файла (авторизованный пользователь)
    path("files/<int:pk>/download", views.download_file),  # GET

    # публичные ссылки
    path("files/<int:pk>/public-link", views.issue_public),         # POST
    path("files/<int:pk>/public-link/delete", views.revoke_public), # POST

    # публичная загрузка по токену (вне /api)
    path("d/<str:token>", views.public_download),  # GET

    # скачивание нескольких файлов архивом
    path("files/archive", views.download_archive),  # POST
]
