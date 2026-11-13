import io
from datetime import date

import pytest
from openpyxl import Workbook, load_workbook

from app.config import DEV_SECRET, Settings
from app.main import create_app


# ------------------------------------------------------------------ auth
def test_register_login_me(client, signup):
    api = signup("Pavan", "Pavan@Example.com ")
    assert api.user["email"] == "pavan@example.com"
    assert api.get("/api/me").json()["name"] == "Pavan"
    r = client.post("/api/auth/login", json={"email": "PAVAN@example.com", "password": "password123"})
    assert r.status_code == 200 and r.json()["token"]


def test_duplicate_email_and_wrong_password(client, signup):
    signup("A", "a@example.com")
    assert client.post("/api/auth/register", json={"name": "B", "email": "a@example.com",
                                                   "password": "password123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope-nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x"}).status_code == 401


@pytest.mark.parametrize("body", [{"name": "A", "email": "a@example.com", "password": "short"},
                                  {"name": "", "email": "a@example.com", "password": "password123"},
                                  {"name": "A", "email": "not-an-email", "password": "password123"}])
def test_register_validation(client, body):
    assert client.post("/api/auth/register", json=body).status_code == 422


@pytest.mark.parametrize("header", [None, "Bearer garbage", "Bearer "])
def test_bad_tokens_rejected(client, header):
    headers = {"Authorization": header} if header else {}
    assert client.get("/api/me", headers=headers).status_code in (401, 403)


def test_token_from_another_secret_rejected(client):
    from app.security import create_token
    forged = create_token(1, "someone-elses-secret-of-32-chars-or-more", 1)
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_blank_env_values_fall_back_to_defaults(monkeypatch):
    # copying .env.example as-is leaves "DATABASE_URL=" and "SECRET_KEY=" blank
    monkeypatch.setattr("app.config.load_env_file", lambda path: None)
    for key in ("DATABASE_URL", "SECRET_KEY", "APP_ENV", "CORS_ORIGINS"):
        monkeypatch.setenv(key, "")
    monkeypatch.setenv("TOKEN_HOURS", "  ")
    s = Settings.from_env()
    defaults = Settings()
    assert (s.database_url, s.secret_key, s.app_env, s.token_hours, s.cors_origins) == (
        defaults.database_url, DEV_SECRET, "development", defaults.token_hours, defaults.cors_origins)
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example ,")
    s = Settings.from_env()
    assert s.database_url == "sqlite://" and s.cors_origins == ["https://a.example", "https://b.example"]


@pytest.mark.parametrize("given,expected", [
    ("postgres://u:p@db.host:5432/tasking", "postgresql+psycopg://u:p@db.host:5432/tasking"),  # Render's form
    ("postgresql://u:p@db.host/tasking", "postgresql+psycopg://u:p@db.host/tasking"),
    ("postgresql+psycopg://u:p@db.host/tasking", "postgresql+psycopg://u:p@db.host/tasking"),
    ("sqlite:///tasking.db", "sqlite:///tasking.db"),
])
def test_database_url_names_the_postgres_driver(monkeypatch, given, expected):
    monkeypatch.setattr("app.config.load_env_file", lambda path: None)
    monkeypatch.setenv("DATABASE_URL", given)
    assert Settings.from_env().database_url == expected


def test_production_refuses_default_secret():
    for weak in (DEV_SECRET, "", "short-secret"):
        with pytest.raises(RuntimeError):
            Settings(app_env="production", secret_key=weak).validate()
    Settings(app_env="production", secret_key="x" * 32).validate()
    Settings(app_env="development", secret_key="short").validate()  # local dev is not blocked


# ------------------------------------------------------------------ teams
def test_create_team_default_key_and_join_codes(signup):
    a, b = signup(), signup()
    t = a.post("/api/teams", json={"name": "q3 Search!"}).json()
    assert t["key"] == "QSE" and t["role"] == "owner" and len(t["invite_code"]) == 8
    spaced = " ".join(t["invite_code"][i:i + 4] for i in (0, 4)).lower()
    assert b.post("/api/teams/join", json={"code": spaced}).json()["role"] == "member"
    assert b.post("/api/teams/join", json={"code": t["invite_code"]}).status_code == 200  # joining twice is fine
    assert len(a.get(f"/api/teams/{t['id']}/members").json()) == 2
    assert b.post("/api/teams/join", json={"code": "ZZZZZZZZ"}).status_code == 404


@pytest.mark.parametrize("key", ["A", "1AB", "TOOLONGKEY", "A-B"])
def test_bad_team_key(signup, key):
    assert signup().post("/api/teams", json={"name": "x", "key": key}).status_code == 422


def test_rotate_invite_code(team):
    t = team["team"]
    assert team["member"].post(f"/api/teams/{t['id']}/invite-code").status_code == 403
    new = team["owner"].post(f"/api/teams/{t['id']}/invite-code").json()["invite_code"]
    assert new != t["invite_code"]
    assert team["outsider"].post("/api/teams/join", json={"code": t["invite_code"]}).status_code == 404


def test_outsider_sees_nothing(team):
    t, out = team["team"], team["outsider"]
    task = team["owner"].post(f"/api/teams/{t['id']}/tasks", json={"title": "Secret"}).json()
    assert out.get("/api/teams").json() == []
    for url in (f"/api/teams/{t['id']}/tasks", f"/api/teams/{t['id']}/members", f"/api/teams/{t['id']}/notes",
                f"/api/tasks/{task['id']}/comments", f"/api/tasks/{task['id']}/activity",
                f"/api/teams/{t['id']}/export"):
        assert out.get(url).status_code == 404, url
    assert out.patch(f"/api/tasks/{task['id']}", json={"title": "x"}).status_code == 404
    assert out.delete(f"/api/tasks/{task['id']}").status_code == 404
    assert out.post(f"/api/teams/{t['id']}/tasks", json={"title": "x"}).status_code == 404
    assert out.get("/api/teams/9999/tasks").status_code == 404  # same answer for a team that does not exist


def test_leaving_and_removing_members(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    task = owner.post(f"/api/teams/{t['id']}/tasks",
                      json={"title": "Theirs", "assignee_id": member.user["id"]}).json()
    assert member.delete(f"/api/teams/{t['id']}/members/{owner.user['id']}").status_code == 403
    assert owner.delete(f"/api/teams/{t['id']}/members/{owner.user['id']}").status_code == 400  # sole owner
    assert owner.delete(f"/api/teams/{t['id']}/members/{member.user['id']}").status_code == 204
    assert owner.get(f"/api/teams/{t['id']}/tasks").json()[0]["assignee_id"] is None
    assert member.get(f"/api/tasks/{task['id']}/comments").status_code == 404
    assert owner.delete(f"/api/teams/{t['id']}/members/{member.user['id']}").status_code == 404


def test_job_roles(team):
    t, owner, member, outsider = team["team"], team["owner"], team["member"], team["outsider"]
    url = f"/api/teams/{t['id']}/members"
    me, boss = f"{url}/{member.user['id']}", f"{url}/{owner.user['id']}"
    r = member.patch(me, json={"job_title": "  Senior   Developer "})
    assert r.status_code == 200 and r.json()["job_title"] == "Senior Developer"  # spaces tidied
    assert member.patch(boss, json={"job_title": "Intern"}).status_code == 403  # members set only their own
    assert owner.patch(me, json={"job_title": "BDA"}).json()["job_title"] == "BDA"  # owner sets anyone's
    assert owner.patch(boss, json={"job_title": "Manager"}).json()["role"] == "owner"  # job role != permissions
    roles = {m["name"]: m["job_title"] for m in member.get(url).json()}
    assert roles == {"Meera Lead": "Manager", "Pavan Kumar": "BDA"}
    assert member.patch(me, json={"job_title": "   "}).json()["job_title"] is None  # blank clears
    assert member.patch(me, json={"job_title": None}).json()["job_title"] is None
    assert member.patch(me, json={"job_title": "x" * 41}).status_code == 422
    assert outsider.patch(me, json={"job_title": "Spy"}).status_code == 404
    assert owner.patch(f"{url}/{outsider.user['id']}", json={"job_title": "Spy"}).status_code == 404


def test_new_optional_columns_are_added_to_an_existing_database(tmp_path):
    import sqlite3
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as old:  # a database made before job roles existed
        old.execute("CREATE TABLE memberships (team_id INTEGER NOT NULL, user_id INTEGER NOT NULL, "
                    "role VARCHAR(10) NOT NULL, joined_at DATETIME NOT NULL, PRIMARY KEY (team_id, user_id))")
        old.execute("INSERT INTO memberships VALUES (1, 1, 'owner', '2026-11-01 10:00:00')")
    settings = Settings(database_url=f"sqlite:///{path.as_posix()}", frontend_dist=tmp_path / "none",
                        secret_key="test-secret-" + "x" * 32)
    for _ in range(2):  # a second start must not try to add it again
        create_app(settings)
    with sqlite3.connect(path) as db:
        columns = [row[1] for row in db.execute("PRAGMA table_info(memberships)")]
        assert "job_title" in columns
        assert db.execute("SELECT role, job_title FROM memberships").fetchall() == [("owner", None)]


# ------------------------------------------------------------------ tasks
def test_task_numbers_are_per_team_and_keys_use_team_key(team, signup):
    t, owner = team["team"], team["owner"]
    keys = [owner.post(f"/api/teams/{t['id']}/tasks", json={"title": f"T{i}"}).json()["key"] for i in range(3)]
    other = owner.post("/api/teams", json={"name": "Other", "key": "OTH"}).json()
    assert keys == ["SRC-1", "SRC-2", "SRC-3"]
    assert owner.post(f"/api/teams/{other['id']}/tasks", json={"title": "x"}).json()["key"] == "OTH-1"
    listed = owner.get(f"/api/teams/{t['id']}/tasks").json()
    assert [x["key"] for x in listed] == ["SRC-3", "SRC-2", "SRC-1"]


def test_create_task_validation(team):
    t, owner = team["team"], team["owner"]
    url = f"/api/teams/{t['id']}/tasks"
    assert owner.post(url, json={"title": "   "}).status_code == 422
    assert owner.post(url, json={"title": "x", "status": "maybe"}).status_code == 422
    assert owner.post(url, json={"title": "x", "assignee_id": team["outsider"].user["id"]}).status_code == 400
    assert owner.post(url, json={"title": "x" * 201}).status_code == 422
    ok = owner.post(url, json={"title": "  Trim me  ", "due_date": "2026-11-20",
                               "assignee_id": team["member"].user["id"]}).json()
    assert ok["title"] == "Trim me" and ok["due_date"] == "2026-11-20"
    assert ok["reporter_id"] == owner.user["id"] and ok["created_at"].endswith("+00:00")


def test_update_records_history(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    task = owner.post(f"/api/teams/{t['id']}/tasks", json={"title": "Draft"}).json()
    url = f"/api/tasks/{task['id']}"
    r = member.patch(url, json={"status": "in_progress", "assignee_id": member.user["id"],
                                "due_date": "2026-12-01", "description": "long text", "title": "Draft"})
    assert r.status_code == 200 and r.json()["status"] == "in_progress"
    member.patch(url, json={"status": "in_progress"})  # no change, no history row
    member.patch(url, json={"assignee_id": None, "due_date": None})  # explicit null clears
    history = owner.get(f"{url}/activity").json()
    rows = [(h["field"], h["old"], h["new"], h["actor_name"]) for h in history]
    assert rows == [("created", None, "Draft", "Meera Lead"),  # unchanged title: no row
                    ("description", None, None, "Pavan Kumar"),  # long text: "changed", not the content
                    ("status", "todo", "in_progress", "Pavan Kumar"),
                    ("assignee_id", None, str(member.user["id"]), "Pavan Kumar"),
                    ("due_date", None, "2026-12-01", "Pavan Kumar"),
                    ("assignee_id", str(member.user["id"]), None, "Pavan Kumar"),
                    ("due_date", "2026-12-01", None, "Pavan Kumar")]
    assert member.patch(url, json={"title": None}).status_code == 422
    assert member.patch(url, json={"assignee_id": team["outsider"].user["id"]}).status_code == 400


def test_delete_permissions(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    by_owner = owner.post(f"/api/teams/{t['id']}/tasks", json={"title": "A"}).json()
    by_member = member.post(f"/api/teams/{t['id']}/tasks", json={"title": "B"}).json()
    assert member.delete(f"/api/tasks/{by_owner['id']}").status_code == 403
    assert member.delete(f"/api/tasks/{by_member['id']}").status_code == 204
    owner.post(f"/api/tasks/{by_owner['id']}/comments", json={"body": "bye"})
    assert owner.delete(f"/api/tasks/{by_owner['id']}").status_code == 204
    assert owner.get(f"/api/teams/{t['id']}/tasks").json() == []


def test_comments(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    task = owner.post(f"/api/teams/{t['id']}/tasks", json={"title": "A"}).json()
    assert member.post(f"/api/tasks/{task['id']}/comments", json={"body": "  "}).status_code == 422
    member.post(f"/api/tasks/{task['id']}/comments", json={"body": "On it"})
    owner.post(f"/api/tasks/{task['id']}/comments", json={"body": "Thanks"})
    comments = owner.get(f"/api/tasks/{task['id']}/comments").json()
    assert [(c["author_name"], c["body"]) for c in comments] == [("Pavan Kumar", "On it"), ("Meera Lead", "Thanks")]
    assert owner.get(f"/api/teams/{t['id']}/tasks").json()[0]["comment_count"] == 2


def test_quick_add(team):
    t, owner = team["team"], team["owner"]
    url = f"/api/teams/{t['id']}/tasks/quick"
    r = owner.post(url, json={"text": "Share the deck @pavan !urgent due:2026-11-20"})
    assert r.status_code == 201
    body = r.json()
    assert (body["title"], body["assignee_id"], body["priority"], body["due_date"]) == (
        "Share the deck", team["member"].user["id"], "urgent", "2026-11-20")
    assert owner.post(url, json={"text": "@pavan !high"}).status_code == 400
    assert "someday" in owner.post(url, json={"text": "Ship due:someday"}).json()["detail"]


# ------------------------------------------------------------------ meeting notes
def test_meeting_notes_to_tasks(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    body = "1:1 with Meera\nDiscussed Q4\n[ ] Send deck @pavan due:2026-11-20\ntodo: Book room !low\n"
    note = member.post(f"/api/teams/{t['id']}/notes",
                       json={"title": "1:1", "meeting_date": "2026-11-09", "body": body}).json()
    preview = member.post(f"/api/teams/{t['id']}/parse", json={"text": body}).json()
    assert [(p["line"], p["title"], p["assignee_id"]) for p in preview] == [
        (2, "Send deck", member.user["id"]), (3, "Book room", None)]

    url = f"/api/notes/{note['id']}"
    assert member.post(f"{url}/convert", json={"line": 1, "text": "Discussed Q4"}).status_code == 400
    assert member.post(f"{url}/convert", json={"line": 2, "text": "stale"}).status_code == 409
    assert member.post(f"{url}/convert", json={"line": 99, "text": "x"}).status_code == 409
    one = member.post(f"{url}/convert", json={"line": 2, "text": "[ ] Send deck @pavan due:2026-11-20"}).json()
    assert one["tasks"][0]["key"] == "SRC-1" and one["tasks"][0]["note_id"] == note["id"]
    assert one["note"]["body"].splitlines()[2].endswith("(SRC-1)")
    again = one["note"]["body"].splitlines()[2]
    assert member.post(f"{url}/convert", json={"line": 2, "text": again}).status_code == 409

    rest = member.post(f"{url}/convert-all").json()
    assert [x["key"] for x in rest["tasks"]] == ["SRC-2"]
    assert member.post(f"{url}/convert-all").json()["tasks"] == []  # nothing left

    assert owner.delete(url).status_code == 204  # owner may delete anyone's notes
    tasks = owner.get(f"/api/teams/{t['id']}/tasks").json()
    assert len(tasks) == 2 and all(x["note_id"] is None for x in tasks)


def test_note_edit_and_delete_permissions(team):
    t, owner, member = team["team"], team["owner"], team["member"]
    note = owner.post(f"/api/teams/{t['id']}/notes", json={"title": "Plan"}).json()
    r = member.put(f"/api/notes/{note['id']}", json={"title": "Plan v2", "body": "x", "meeting_date": None})
    assert r.status_code == 200 and r.json()["title"] == "Plan v2"
    assert member.delete(f"/api/notes/{note['id']}").status_code == 403
    assert team["outsider"].put(f"/api/notes/{note['id']}", json={"title": "x"}).status_code == 404


# ------------------------------------------------------------------ excel
def _xlsx(rows):
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def test_import_and_export(team):
    t, owner = team["team"], team["owner"]
    data = _xlsx([["Task", "Owner", "Status", "Due"], ["Send deck", "Pavan", "WIP", date(2026, 11, 20)],
                  ["Who knows", "Stranger", "done", None], ["", "Pavan", "", None]])
    r = owner.post(f"/api/teams/{t['id']}/import", files={"file": ("tasks.xlsx", data)})
    assert r.status_code == 200
    assert r.json()["created"] == 2
    assert {i["message"] for i in r.json()["issues"]} == {"'Stranger' is not in this team, left unassigned",
                                                          "Skipped: no title"}
    export = owner.get(f"/api/teams/{t['id']}/export")
    assert export.status_code == 200 and "SRC-tasks-" in export.headers["content-disposition"]
    sheet = load_workbook(io.BytesIO(export.content)).active
    assert [c.value for c in sheet[2]][:6] == ["SRC-1", "Send deck", None, "In progress", "Medium", "Pavan Kumar"]


@pytest.mark.parametrize("payload,status", [(b"", 400), (b"\x00\x01garbage", 400), (b"PKnot-a-zip", 400),
                                            (b"Owner\nRavi\n", 400)])
def test_import_rejects_bad_files(team, payload, status):
    r = team["owner"].post(f"/api/teams/{team['team']['id']}/import", files={"file": ("x.xlsx", payload)})
    assert r.status_code == status


def test_import_size_limit(client, team):
    client.app.state.settings.max_upload_bytes = 100
    r = team["owner"].post(f"/api/teams/{team['team']['id']}/import", files={"file": ("x.csv", b"Title\n" + b"a" * 200)})
    assert r.status_code == 413


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}
