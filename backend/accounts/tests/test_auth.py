from django.test import TestCase, Client

class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_register_me_logout_login_flow(self):
        r = self.client.post(
            "/api/auth/register",
            {
                "username": "alice",
                "full_name": "Alice A",
                "email": "alice@example.com",
                "password": "Pass12345!",
            }
        )
        assert r.status_code == 201, r.content

        r = self.client.get("/api/auth/me")
        assert r.status_code == 200, r.content

        r = self.client.post("/api/auth/logout")
        assert r.status_code == 204, r.content

        r = self.client.get("/api/auth/me")
        assert r.status_code in (401, 403), (r.status_code, r.content)

        r = self.client.post("/api/auth/login", {"username": "alice", "password": "Pass12345!"})
        assert r.status_code == 200, r.content

        r = self.client.get("/api/auth/me")
        assert r.status_code == 200, r.content
