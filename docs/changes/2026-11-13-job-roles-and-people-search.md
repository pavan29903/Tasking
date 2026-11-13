# Job roles in a team, filter by role, and search by person

Date: 2026-11-13 · Repo: pavan29903/Tasking · Status: done; browser check not run (low memory on the dev PC)

## Summary
A team can mix developers, sales (BDA) and managers. Each member now has a **job role** shown on the Team page,
the Board and List get a **Role** filter ("Developer tasks", "BDA tasks"), and the search box also finds tasks
by the **name** of the person they are assigned to or who created them. Being in several teams already worked
(Team → join or create another team, then switch at the top).

## What changed
| File | Change |
| --- | --- |
| `backend/app/models.py` | `memberships.job_title` (optional, 40 chars). Separate from `role` (owner/member), which still decides permissions |
| `backend/app/db.py`, `main.py` | `add_missing_columns`: on start-up, adds new optional columns to tables that already exist, so the live Neon database gets `job_title` without a migration tool |
| `backend/app/routes/teams.py`, `schemas.py` | `PATCH /api/teams/{id}/members/{user}` sets `job_title`; the members list returns it |
| `backend/tests/test_api.py` | Job-role permissions and validation; upgrade of an old database file |
| `frontend/src/lib/tasks.ts` (+ test) | `filterTasks` searches people's names and filters by role; `jobRoles`; suggested roles |
| `frontend/src/App.tsx` | "Search tasks or people"; Role filter (shown once anyone has a role); roles next to names in the person filter |
| `frontend/src/components/TeamPage.tsx`, `styles.css` | Role box per member with suggestions; saves on Enter or when you leave the box |
| `frontend/src/api.ts`, `types.ts` | `setJobTitle`, `Member.job_title` |

## How it works
- Anyone can set their own role; the owner can set anyone's. Blank clears it. Extra spaces are tidied.
- A task's role is its **assignee's** role. Unassigned tasks, and tasks of people without a role, don't match a role filter.
- Role matching ignores case and spaces, so "developer" and "Developer" are one role. The first spelling is shown.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Member sets own role with extra spaces | saved tidied | pass |
| Member sets someone else's role / owner sets anyone's | 403 / 200 | pass |
| Owner sets their own role to "Manager" | permission role stays "owner" | pass |
| Blank or null role, 41 characters | cleared / 422 | pass |
| Outsider, or target not in the team | 404 | pass |
| Database created before job roles; app started twice | column added once, existing rows kept | pass |
| Search by assignee name, reporter name, full name | matching tasks | pass |
| Role filter: case/space differences, reporter's role, empty filter | matches assignee only / everything | pass |
| Role combined with search or person filter | both apply | pass |
| Role list: duplicates in different case, people without a role | listed once, sorted / skipped | pass |

`uv run python -m pytest -q` → 114 passed · `npm test` → 41 passed · `npm run typecheck` → clean · `npm run build` → OK.

## Verification
Not run in a browser: the PC had 0.6 GB of memory free. After deploying: Team page → type a role for yourself →
Board → the Role filter appears → pick it.

## Limitations
- Roles are labels for sorting work; they don't change what someone may do. Only the team creator is an owner;
  making someone else an owner is a separate feature.
- My tasks is still per team.
