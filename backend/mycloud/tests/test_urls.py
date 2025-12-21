from django.test import SimpleTestCase
from django.urls import resolve


class MycloudURLConfTests(SimpleTestCase):
    def test_admin_url_resolves(self):
        match = resolve("/dj_admin/")
        self.assertIn("admin", match.app_name)

    def test_api_auth_include_resolves(self):
        match = resolve("/api/auth/login/")
        self.assertEqual(match.route, "api/auth/login/")

    def test_api_storage_include_resolves(self):
        match = resolve("/api/files/")
        self.assertEqual(match.route, "api/files/")

    def test_public_download_resolves(self):
        match = resolve("/d/abc123")
        self.assertEqual(match.kwargs["token"], "abc123")

    def test_spa_fallback_resolves_for_non_api_paths(self):
        match = resolve("/some/spa/route/")
        self.assertEqual(match.url_name, "spa-fallback")

    def test_spa_fallback_does_not_catch_api_prefix(self):
        match = resolve("/api/files/")
        self.assertNotEqual(match.url_name, "spa-fallback")

    def test_spa_fallback_does_not_catch_public_prefix(self):
        match = resolve("/d/abc123")
        self.assertNotEqual(match.url_name, "spa-fallback")

    def test_spa_fallback_does_not_catch_admin_prefix(self):
        match = resolve("/dj_admin/")
        self.assertNotEqual(match.url_name, "spa-fallback")
