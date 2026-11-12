# Pick who, priority and due date instead of typing `@`, `!` and `due:`

Date: 2026-11-11 · Repo: D:\tasking (not committed yet) · Status: done; in-browser check still to run

## Summary
Trying the app, it felt hard to remember `!high` and `due:fri`. Now the quick-add bar and every action item in
the meeting margin have **Who**, **Priority** and **Due** pickers. The meeting pad has a **+ Action item** button,
so you don't need to type `[ ]` either. The typed shortcuts still work.

## What changed
| File | Change |
| --- | --- |
| `frontend/src/components/Pickers.tsx` (new) | Who (team members), Priority, Due (date picker), optional Today/Tomorrow buttons |
| `frontend/src/components/QuickAdd.tsx` | Pickers under the input; shorter placeholder and hint; the preview keeps only warnings and the title |
| `frontend/src/components/Meetings.tsx` | Pickers on each pending action item; **+ Action item** button; plain-language help |
| `frontend/src/lib/tasks.ts` (+ test) | `setToken`, `mentionFor` and `pickToken`, 10 new tests (37 in total) |
| `frontend/src/styles.css` | Compact picker layout that wraps on phones |
| `backend/tests/test_notes.py` | Checks that the parser reads exactly what the pickers write (108 tests in total) |
| `README.md`, `frontend/README.md` | Usage notes |

## How it works
A picker doesn't keep a separate value. It rewrites the line:
- Choosing "High" replaces any `!low/!high/...` with `!high`. Medium removes it.
- Choosing a person replaces any `@mention` with the shortest name the server resolves to only that person:
  their first name, else the full name without spaces, else the email name. Two Ravis get `@ravikumar` and `@ravishah`.
- Choosing a date writes `due:2026-11-20` (ISO, so it means the same day whenever the note is converted).
  Clearing the date removes it.

So the server's parser is still the only thing that reads tasks out of text. **Create all** also picks up the
choices, and the meeting note keeps a readable record of what was agreed. The margin updates at once. If the note
changed under the margin since the last preview, a pick is ignored, and the margin refreshes about 300 ms later.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Add / replace / remove priority, including two `!` tokens | one token or none | pass |
| `!high` stuck to a word (`room!high`) | left alone, same as the parser | pass |
| Replace a mention in the middle of a line | old one removed, new one appended, single spaces | pass |
| An email address in the line (`ravi@x.in`) | not treated as a mention | pass |
| Leading indent and `- [ ]` prefix | kept | pass |
| Two members with the same first name | full-name mention for each | pass |
| Medium, nobody, empty date, unknown member | no token | pass |
| Server parses `@ravikumar`, `!urgent`, `due:2026-11-20`, `!low` | right person, priority and date | pass |

`npm test` → 37 passed · `npm run typecheck` → clean · `npm run build` → OK · `uv run python -m pytest -q` → 108 passed.

## Verification
Not run in a browser yet. The PC had 0.8 GB of memory free and Claude Code had just stopped the server for low
memory, so I didn't start the server and a test browser. To check by hand: `run.ps1`, then type a task, pick
someone, a priority and Tomorrow, and press Add. In Meetings, press **+ Action item**, write a line, and choose
values in the margin. The line in the note should gain the matching `@name !high due:…`.

## Limitations
- The meeting margin pickers don't have Today/Tomorrow buttons, to keep the cards narrow. The date picker has its own "Today".
- The scratchpad browser test (`e2e/flow.mjs`) still checks the old "→ name" margin chips and needs a small update
  before it is run again.

---

# Addendum 2026-11-12: ready for Render

| File | Change |
| --- | --- |
| `render.yaml` (new) | Render Blueprint: Docker web service + Postgres, generated `SECRET_KEY`, health check `/api/health` |
| `.dockerignore` (new) | Keeps `node_modules`, `.venv`, local DB and `.env` out of the image |
| `Dockerfile` | uv image pinned to 0.13.6 instead of `latest` |
| `backend/app/config.py` | `postgres://` and `postgresql://` addresses get the psycopg driver name SQLAlchemy needs |
| `backend/pyproject.toml` | `psycopg[binary]` added; `pydantic` pinned to 2.13 (Smart App Control blocks pydantic-core 2.50 here) |
| `backend/tests/test_api.py` | 4 cases for the database address (112 tests in total) |

Verified: `uv run python -m pytest -q` → 112 passed. A Postgres engine builds with the psycopg driver.
Not verified: the Docker build and a real Postgres run (no Docker or Postgres on this PC). The first Render deploy is
the first real test of both.
