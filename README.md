# Tasking

A shared task list for you, your lead and your manager: a simpler Jira for what you agree in 1:1s and stand-ups.
Write meeting notes, mark lines as action items, and they become tasks with an owner and a due date that everyone
in the team sees.

- **Backend:** Python, FastAPI + SQLAlchemy (`backend/`). SQLite locally, Postgres in production.
- **Frontend:** React + Vite + TypeScript (`frontend/`), installable on phones as a web app.
- **Android:** Capacitor shell (`frontend/android/`) that opens your hosted site, like the Amazon app.

## Run it on this PC

```powershell
cd D:\tasking
powershell -ExecutionPolicy Bypass -File .\setup.ps1   # once
powershell -ExecutionPolicy Bypass -File .\run.ps1     # builds the web app, serves everything
```

Open http://127.0.0.1:8000, create an account, create a team, and share the invite code from the **Team** page.
To try it from your phone on the same Wi-Fi, use `.\run.ps1 -Lan` and open `http://<this PC's IP>:8000`.

### Development mode (live reload)

```powershell
# terminal 1: API on :8000
cd D:\tasking\backend; uv run python -m uvicorn app.main:create_app --factory --reload
# terminal 2: web app on :5173, proxies /api to :8000
cd D:\tasking\frontend; npm run dev
```

### Tests

```powershell
cd D:\tasking\backend;  uv run python -m pytest -q     # API, parser, Excel
cd D:\tasking\frontend; npm test                       # date/sort/grouping logic
cd D:\tasking\frontend; npm run typecheck
```

> **Windows Smart App Control is on for this PC.** It blocks some unsigned programs, so:
> run pytest as `python -m pytest` (not `pytest.exe`), create the backend venv with `py -3 -m venv .venv`
> (setup.ps1 does this), and the frontend uses Vite 6 because Vite 8's native bundler is blocked.
> Its verdicts can change over time: on 2026-11-12 it started blocking pydantic-core 2.50, so `pydantic` is pinned to 2.13.
> If the server stops with "An Application Control policy has blocked this file", try the previous version of the
> package that file belongs to. `setup.ps1` also removes SQLAlchemy's compiled `*_cy*.pyd` files, because the plain-Python
> copies SQLAlchemy ships next to them are never blocked.

## How to use it

| Where | What you do |
| --- | --- |
| **My tasks** | Your open work by due date (overdue, today, next 7 days…), plus "Waiting on others": tasks you asked someone else to do. |
| **Today** | Everyone's work for the day: write what you're on and which repo or area it touches. You see the whole team's updates and their in-progress tasks. If two people name the same repo, a Heads-up banner tells them to check with each other before pushing. Filter by role; look back at earlier days. |
| **Board** | To do / In progress / Blocked / Done. Drag cards between columns. Swipe sideways on a phone. |
| **List** | Sortable table, search, filters. **Import from Excel** and **Download Excel**. |
| **Meetings** | Your Google Calendar meetings with **Join** buttons (connect it once: Meetings → Connect Google Calendar), and notes on a ruled pad. Click a meeting to take notes for it. Action lines show up in the margin; one click turns them into tasks. |
| **Team** | Invite code and link, members and their roles (Developer, BDA, Sales…), leave or remove people, join or create another team. |
| **Search and filters** | On Board and List: search by task text or by the name of the person it's assigned to or was created by; filter by person, priority or role ("Developer tasks"). |

Click any task to open it: change status, owner, priority, due date, add details and comments, and see the history of
who changed what.

### Writing action items (meeting notes and the quick-add bar)

You don't have to type any symbols. Under the quick-add bar, and on every action item in the meeting margin, there
are **Who**, **Priority** and **Due** pickers (plus **Today** / **Tomorrow** buttons on the quick-add bar). On the
meeting pad, **+ Action item** starts a new action line for you. The pickers write the shortcuts below into the
line, so typing them yourself does the same thing:

```
[ ] Send revised deck to client @pavan !high due:fri
todo: Book the demo room due:20/11
- [ ] Check vendor invoice @meera !urgent due:tomorrow
```

- A line is an action item when it starts with `[ ]`, `[]`, `- [ ]`, `todo:` or `action:`. The quick-add bar treats any text as a task.
- `@name`: first name, full name without spaces, or the part of the email before `@`. If two people match, the task stays unassigned.
- `!low` `!medium` `!high` `!urgent` set the priority.
- `due:` takes `today`, `tomorrow`, a weekday (`fri` means the next Friday after today), `2026-11-20`, `20/11/2026` or `20/11` (day first).
- Converted lines get the task key appended, e.g. `(SRC-12)`, so they are never created twice.

### Importing your Excel sheet

The first sheet is read; the header row can be anywhere in the first 10 rows. Recognised columns (any case):
Title/Task/Summary, Description/Details/Notes, Status/State, Priority, Assignee/Owner/Assigned to, Due/Due date/Deadline.
Status words like *WIP, Open, Pending, Completed, On hold* and priorities like *P0–P3, Critical* are understood.
Rows that can't be read fully are still imported, with a list of what to check. `.csv` (UTF-8) works too.

## Put it online

### On Render (set up in `render.yaml`)

1. Create a Postgres database. Neon's free plan (https://neon.tech, about 0.5 GB, no expiry) is plenty.
   Copy its connection string (`postgresql://…?sslmode=require`).
2. Sign in at https://render.com with your GitHub account and allow it to see this repo.
3. **New → Blueprint**, pick this repo, then **Apply**. Render creates the `tasking` web service from the
   `Dockerfile` and generates `SECRET_KEY` itself.
4. In the service's **Environment** page, set `DATABASE_URL` to the connection string and save. Render redeploys.
5. Open the `https://tasking-….onrender.com` address it shows. Every push to `main` deploys again.

The web service uses Render's **free** plan: it sleeps after a while without visitors, so the next visit waits
about a minute. The data lives in the database, so sleeping loses nothing.

### Anywhere else

1. **Database:** a Postgres database. Set `DATABASE_URL` (`postgres://…`, `postgresql://…` or `postgresql+psycopg://…` all work).
2. **Secrets:** set `SECRET_KEY` (32+ random characters) and `APP_ENV=production`. The server refuses to start in production without a strong key.
3. **Host:** the `Dockerfile` builds one container serving the app and the API on `$PORT` (default 8000).

All settings are listed in `backend/.env.example` and `frontend/.env.example`.

## Android app (APK)

Needs Android Studio (not installed on this PC yet).

```powershell
cd D:\tasking\frontend
$env:TASKING_APP_URL = "https://YOUR-TASKING-DOMAIN.example"   # the APK opens your hosted site
$env:TASKING_APP_ID  = "com.yourcompany.tasking"               # unique id, needed for the Play Store
npm run android:sync
npm run android:open      # Android Studio: Build > Build APK(s), or Generate Signed Bundle for the Play Store
```

Because the APK only opens the site, every web deploy updates the app without shipping a new APK.
Phones can also install the site directly: open it in Chrome, then **Add to Home screen**.

## Project layout

```
backend/app/
  main.py        app factory, serves frontend/dist when built
  models.py      users, teams, memberships, tasks, comments, activity, notes
  routes/        auth, teams, tasks (+ Excel), meetings (notes -> tasks), calendar (your meetings)
  notes.py       action-item parser (@name, !priority, due:)
  excel.py       import/export
  access.py      membership checks, task numbering, history
backend/tests/   pytest
frontend/src/
  App.tsx        layout, navigation, data loading
  components/    Board, TaskTable, MyTasks, Meetings, Agenda, TaskDrawer, TeamPage, Auth
  lib/tasks.ts   pure helpers (dates, filters, grouping), tested in tasks.test.ts
frontend/android/  Capacitor Android project
docs/changes/    what was built and how it was verified
```
