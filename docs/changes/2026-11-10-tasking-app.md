# Tasking: a shared team task app (first version)

Date: 2026-11-10 · Repo: D:\tasking (new, not committed yet) · Status: done with follow-ups

## Summary
Tasks agreed in meetings lived in each person's own Excel sheet and notes, so the lead, the manager and the team
kept separate copies. Tasking gives a team one shared list: tasks with an owner, priority, due date, comments and
history; a meeting-notes pad whose action lines become tasks; and Excel import/export so existing sheets move over.
Python (FastAPI) backend, React frontend, Capacitor shell for an Android APK.

## What changed
| File | Change |
| --- | --- |
| `backend/app/main.py`, `config.py`, `db.py` | App factory, settings from env/.env, SQLite or Postgres engine |
| `backend/app/models.py` | Users, teams, memberships, tasks (per-team numbers), comments, activity, notes |
| `backend/app/security.py` | scrypt password hashing (stdlib), JWT sign-in tokens |
| `backend/app/access.py` | Membership checks, task numbering with a row lock, change history |
| `backend/app/notes.py` | Action-item parser: `[ ]`/`todo:` lines, `@name`, `!priority`, `due:` |
| `backend/app/excel.py` | .xlsx/.csv import with column aliases and per-row issues; .xlsx export |
| `backend/app/routes/*.py` | REST API: auth, teams/invites, tasks/comments/history/Excel, notes/convert |
| `backend/tests/*` | 105 pytest tests |
| `frontend/src/**` | React app: My tasks, Board, List, Meetings, Team, task drawer, quick add |
| `frontend/src/lib/tasks.ts` (+ test) | Pure date/filter/sort/grouping helpers, 27 vitest tests |
| `frontend/public/*` | PWA manifest, service worker, icons |
| `frontend/capacitor.config.ts`, `frontend/android/` | Android shell project |
| `setup.ps1`, `run.ps1`, `Dockerfile`, `.env.example` x2, `README.md` | Setup, run, deploy, placeholders |

## How it works

```
 phone / browser ──► React app ──fetch /api/*──► FastAPI ──SQLAlchemy──► SQLite | Postgres
        ▲                (polls every 20 s                │
        │                 while visible)                  ├─ notes.py  (parse action lines)
 Android APK (Capacitor) opens the hosted URL             └─ excel.py  (openpyxl import/export)
```

- **Access:** every team-scoped call checks membership. Outsiders get 404, never 403, so team and task ids don't leak.
  Only the reporter or the team owner can delete a task. Only the author or the owner can delete notes.
- **Task keys:** each team has a prefix (`SRC`) and a counter. A task gets `SRC-n` under a row lock, and a
  unique (team, number) constraint backs that up.
- **History:** every tracked field change writes an activity row (who, old, new). Description edits are logged as
  "edited" without storing the text twice.
- **Meeting notes → tasks:** the server parses the note. Converting a line creates the task (linked to the note)
  and appends `(SRC-n)` to that line, so it can't be converted twice. The client sends the line text it saw, and a
  mismatch returns 409 instead of converting the wrong line.
- **Freshness:** the web app polls tasks and members every 20 s while visible and again on focus. If a task or a
  parsed note mentions a person the page hasn't loaded yet, it fetches members at once.
- **One server:** when `frontend/dist` exists, FastAPI serves it, so the app and API share one origin (no CORS
  needed). The APK opens that same URL.

## How to use it
See `README.md`: setup/run commands, the action-item syntax, the Excel columns, deploy steps and the APK build.
Settings (names only): `DATABASE_URL`, `SECRET_KEY`, `APP_ENV`, `APP_URL`, `CORS_ORIGINS`, `TOKEN_HOURS`,
`VITE_API_URL`, `VITE_APP_URL`, `TASKING_APP_URL`, `TASKING_APP_ID`.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Register, login, `/me`; email case/space normalised | works, lower-cased | pass |
| Duplicate email / wrong password / unknown email | 409 / 401 / 401 | pass |
| Short password, blank name, bad email | 422 | pass |
| Missing, garbage, or foreign-secret token | 401/403 | pass |
| Production with default, empty or short secret | refuses to start | pass |
| Blank values from a copied `.env.example` | fall back to defaults | pass |
| Invite code with spaces / lower case; joining twice | joins; idempotent | pass |
| Bad team key (`A`, `1AB`, too long, `A-B`) | 422 | pass |
| Outsider reads/writes any team, task, note, export | 404 everywhere | pass |
| Rotate invite code: member / owner; old code after rotate | 403 / new code; 404 | pass |
| Sole owner leaves; member removes owner; removed member's tasks | 400; 403; unassigned | pass |
| Task numbers per team, newest first | SRC-1..3, OTH-1 | pass |
| Blank/201-char title, bad status, assignee outside team | 422 / 422 / 400 | pass |
| Patch: no-op change, explicit null clears, null title | no history row; cleared; 422 | pass |
| Delete: non-reporter member / reporter / owner (with comments) | 403 / 204 / 204 cascade | pass |
| Quick add with tokens; only tokens; unreadable date | 201 parsed; 400; 400 with message | pass |
| Parser: 8 prefix forms, plain lines, `[x]` | recognised / ignored | pass |
| Mentions: exact, email name, unique prefix, ambiguous `ra`, unknown, email in text | resolved / none | pass |
| Dates: weekday on same weekday → next week, d/m/y, d/m, `20 Nov 2026`, `31/02` | correct / rejected | pass |
| Convert: non-action line, stale text, out-of-range, already converted, convert-all twice | 400 / 409 / 409 / 409 / empty | pass |
| Delete note | tasks kept, link cleared | pass |
| Excel: header below title row, blank rows, CSV with BOM, non-UTF-8 CSV, no title column | handled / clear error | pass |
| Excel values: serial dates, datetimes, TRUE/FALSE, negative numbers, unknown status/priority/owner | parsed or reported per row | pass |
| Export then import | same tasks back | pass |
| Upload empty, garbage, fake zip, no title column, over size limit | 400 / 400 / 400 / 400 / 413 | pass |
| Frontend: due labels (late, today, tomorrow, done never late), local-day dates, month/year ends | correct | pass |
| Frontend: search, assignee/priority filters, sort with unassigned last, My-tasks buckets, history sentences | correct | pass |

`uv run python -m pytest -q` → `105 passed`. `npm test` → `27 passed`. `npm run typecheck` → clean. `npm run build` → OK.

## Verification
Real Chrome (via `playwright-core`) against the built app served by FastAPI, with two users in separate profiles
(a manager at 1366 px, a member on a 390 px phone): sign-up, team creation, quick add with live preview, invite
link join, meeting notes with autosave, margin warnings for an unknown `@name` and an unreadable date, converting
one line and then all lines, drag-and-drop to In progress, comments and history, Excel download, CSV import with
reported issues, search, the member's My tasks on a phone, and dark mode. **28/28 steps passed.** No console errors,
no failed requests, and the server log shows 679 requests with only 200/201/304.

The browser run found and drove fixes for three bugs:
1. A member who joined after the manager loaded the page showed as "not in team" or "Unassigned", although the
   server had assigned the task correctly. The page now refreshes members when it sees an unknown person.
2. On phones the bottom navigation and board widened the page past the screen. The grid tracks now use `minmax(0, 1fr)`.
3. Screen-reader labels inside board cards escaped the board's scroll area and stretched the page sideways. The board
   and cards are now the positioning context.

Not run: the Android APK build (no Android Studio or JDK on this PC), the Dockerfile (no Docker here), and Postgres
(only SQLite was exercised).

## Limitations and follow-ups
- Sign-in is email + password only. Google/Microsoft single sign-on, password reset by email and login rate limiting
  are not built (they need an email service or OAuth app, which are placeholders for now).
- No email or push notifications yet. Teammates' changes appear within 20 s through polling, not instantly.
- Tables are created with `create_all`. Add Alembic before changing the schema of a live database.
- Excel download inside the APK may need a Capacitor file plugin. It works in browsers.
- Smart App Control on this PC needs the workarounds noted in the README (venv via `py`, `python -m pytest`, Vite 6).
