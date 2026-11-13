# Tasking backend (FastAPI)

The API for Tasking. It also serves the built web app from `../frontend/dist` when that folder exists.
For the whole project, see [../README.md](../README.md). What was built and how it was verified:
[../docs/changes/2026-11-10-tasking-app.md](../docs/changes/2026-11-10-tasking-app.md).

## Commands

```powershell
py -3 -m venv .venv          # first time only (Smart App Control blocks the venv launcher uv makes)
uv sync
uv run python -m uvicorn app.main:create_app --factory --reload   # http://127.0.0.1:8000, docs at /docs
uv run python -m pytest -q                                        # 114 tests
```

Settings come from environment variables or `backend/.env`. See `.env.example` (`DATABASE_URL`, `SECRET_KEY`,
`APP_ENV`, `APP_URL`, `CORS_ORIGINS`, `TOKEN_HOURS`). Blank values fall back to the defaults.

## Where things are

| File | What it does |
| --- | --- |
| `app/main.py` | `create_app()`: database, CORS, routers, static web app |
| `app/models.py` | Tables: users, teams, memberships, tasks, comments, activity, notes |
| `app/access.py` | Membership checks (outsiders get 404), task numbering under a row lock, change history |
| `app/security.py` | scrypt password hashes, JWT tokens, `current_user` dependency |
| `app/notes.py` | Action-item parser: `[ ]`/`todo:` lines, `@name`, `!priority`, `due:` |
| `app/excel.py` | `.xlsx`/`.csv` import with column aliases and per-row issues; `.xlsx` export |
| `app/routes/` | `auth`, `teams`, `tasks` (comments, history, Excel), `meetings` (notes → tasks) |

## API at a glance

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me` | Accounts; returns `{token, user}` |
| `GET/POST /api/teams`, `POST /api/teams/join` | My teams, create, join by invite code |
| `GET /api/teams/{id}/members`, `POST .../invite-code`, `DELETE .../members/{user}` | Members, new code, leave/remove |
| `PATCH /api/teams/{id}/members/{user}` `{"job_title": "Developer"}` | Job role: your own, or anyone's if you are the owner; blank clears |
| `GET/POST /api/teams/{id}/tasks`, `POST .../tasks/quick` | List, create, one-line quick add |
| `PATCH/DELETE /api/tasks/{id}`, `GET/POST .../comments`, `GET .../activity` | Edit, delete, comments, history |
| `GET /api/teams/{id}/export`, `POST .../import` | Excel download and upload |
| `GET/POST /api/teams/{id}/notes`, `PUT/DELETE /api/notes/{id}` | Meeting notes |
| `POST /api/teams/{id}/parse`, `POST /api/notes/{id}/convert`, `.../convert-all` | Preview and convert action items |

All routes except register/login/health need `Authorization: Bearer <token>`. The interactive docs are at `/docs`.

## Database changes

There is no migration tool yet. On start-up, `create_all` makes missing tables, and `add_missing_columns`
(`app/db.py`) adds new **optional** columns to tables that already exist. That is how the live database got
`memberships.job_title` (see [../docs/changes/2026-11-13-job-roles-and-people-search.md](../docs/changes/2026-11-13-job-roles-and-people-search.md)).
Anything else (a required column, a rename, a type change) needs a real migration, e.g. Alembic.
