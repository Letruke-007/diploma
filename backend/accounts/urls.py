from django.urls import path
from . import views
from . import admin_views

urlpatterns = [
    # CSRF cookie
    path('csrf', views.csrf),                 # GET  /api/auth/csrf

    # Аутентификация / профиль
    path('register', views.register),         # POST /api/auth/register
    path('login', views.login_view),          # POST /api/auth/login
    path('logout', views.logout_view),        # POST /api/auth/logout
    path('me', views.me),                     # GET  /api/auth/me

    # Админ-раздел
    path('admin/users', admin_views.admin_users_list),                 # GET /api/auth/admin/users
    path('admin/users/<int:pk>', admin_views.admin_user_patch),        # PATCH /api/auth/admin/users/<id>
    path('admin/users/<int:pk>/delete', admin_views.admin_user_delete) # DELETE /api/auth/admin/users/<id>/delete
]
