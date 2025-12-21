from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from storageapp.views import public_download

urlpatterns = [
    # Django Admin для служебных задач
    path('dj_admin/', admin.site.urls),

    # API
    path('api/auth/', include('accounts.urls')),
    path('api/', include('storageapp.urls')),

    # Публичные ссылки типа /d/<token>
    path('d/<str:token>', public_download),

    # SPA fallback: все не-API маршруты отдаём на фронт (index.html)
    # Важно: исключаем api/, d/ и dj_admin/
    re_path(
        r"^(?!api/|d/|dj_admin/).*$",
        TemplateView.as_view(template_name="index.html"),
        name="spa-fallback",
    ),
]
