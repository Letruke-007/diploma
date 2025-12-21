from django.test import override_settings
from django.urls import resolve
from rest_framework.test import APITestCase

from accounts import views, admin_views


@override_settings(ROOT_URLCONF="accounts.urls")
class AccountsUrlsResolveTests(APITestCase):
    # --------
    # public
    # --------

    def test_csrf_url_resolves(self):
        match = resolve("/csrf/")
        self.assertIs(match.func, views.csrf)

    def test_register_url_resolves(self):
        match = resolve("/register/")
        self.assertIs(match.func, views.register)

    def test_login_url_resolves(self):
        match = resolve("/login/")
        self.assertIs(match.func, views.login_view)

    def test_logout_url_resolves(self):
        match = resolve("/logout/")
        self.assertIs(match.func, views.logout_view)

    def test_me_url_resolves(self):
        match = resolve("/me/")
        self.assertIs(match.func, views.me)

    # --------
    # admin
    # --------

    def test_admin_users_list_url_resolves(self):
        match = resolve("/admin/users/")
        self.assertIs(match.func, admin_views.admin_users_list)

    def test_admin_user_patch_url_resolves(self):
        match = resolve("/admin/users/5/")
        self.assertIs(match.func, admin_views.admin_user_patch)
        self.assertEqual(match.kwargs["pk"], 5)

    def test_admin_user_delete_url_resolves(self):
        match = resolve("/admin/users/7/delete/")
        self.assertIs(match.func, admin_views.admin_user_delete)
        self.assertEqual(match.kwargs["pk"], 7)

    def test_admin_user_purge_url_resolves(self):
        match = resolve("/admin/users/9/purge/")
        self.assertIs(match.func, admin_views.admin_user_purge)
        self.assertEqual(match.kwargs["pk"], 9)
