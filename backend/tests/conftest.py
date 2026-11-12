import itertools

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

_ids = itertools.count(1)


class Api:
    """A test client signed in as one person."""

    def __init__(self, client: TestClient, token: str, user: dict):
        self.client, self.token, self.user = client, token, user

    def _h(self):
        return {"Authorization": f"Bearer {self.token}"}

    def get(self, url, **kw):
        return self.client.get(url, headers=self._h(), **kw)

    def post(self, url, **kw):
        return self.client.post(url, headers=self._h(), **kw)

    def patch(self, url, **kw):
        return self.client.patch(url, headers=self._h(), **kw)

    def put(self, url, **kw):
        return self.client.put(url, headers=self._h(), **kw)

    def delete(self, url, **kw):
        return self.client.delete(url, headers=self._h(), **kw)


@pytest.fixture
def client(tmp_path):
    settings = Settings(database_url="sqlite://", frontend_dist=tmp_path / "no-dist", secret_key="test-secret-" + "x" * 32)
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def signup(client):
    def _signup(name="Pavan Kumar", email=None) -> Api:
        email = email or f"user{next(_ids)}@example.com"
        r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
        assert r.status_code == 201, r.text
        return Api(client, r.json()["token"], r.json()["user"])
    return _signup


@pytest.fixture
def team(signup):
    """Owner (manager), a member (Pavan) and an outsider, with one shared team."""
    owner = signup("Meera Lead")
    member = signup("Pavan Kumar")
    outsider = signup("Out Sider")
    t = owner.post("/api/teams", json={"name": "Search team", "key": "SRC"}).json()
    assert member.post("/api/teams/join", json={"code": t["invite_code"]}).status_code == 200
    return {"owner": owner, "member": member, "outsider": outsider, "team": t}
