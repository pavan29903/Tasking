# Today's tasks: move tasks from My tasks to Today, and unfinished ones come back

Date: 2026-11-14 · Repo: pavan29903/Tasking · Status: done; checked in a browser

## Summary
Two lists now: **My tasks** (everything assigned to you) and **Today's tasks** (what you picked for today).
Each of your open tasks on My tasks has a **→ Today** button that moves it onto your Today list. On the Today page
you tick tasks off, send one back with **↩ My tasks**, or add more with **+ Add from My tasks**. Anything still not
done the next day comes back to My tasks on top, under **Not finished on Today** ("From yesterday"), with a
**Move all to Today** button. The team and the manager see each person's Today tasks on their card.

## What changed
| File | Change |
| --- | --- |
| `backend/app/models.py` | `tasks.planned_on` (date, optional): the day the task is on its assignee's Today list |
| `backend/app/schemas.py` | `TaskPatch.planned_on` (a date, or null to send it back); `TaskOut.planned_on` |
| `backend/app/access.py` | `planned_on` is in the task history; reassigning a task clears it; an unassigned task can't go on Today (422) |
| `backend/tests/test_today.py` | 8 new tests, below |
| `frontend/src/lib/tasks.ts` (+ test) | `groupMine`: tasks on today's list leave My tasks (`onToday`), unfinished ones from earlier days come back (`leftover`); history sentence. The "Today" group is now "Due today" so it isn't confused with the Today list |
| `frontend/src/lib/today.ts` (+ test) | `plannedTasks`, `cardTasks`, `pickable` |
| `frontend/src/components/MyTasks.tsx` | → Today buttons, "Not finished on Today" group, "N tasks are on your Today list" note |
| `frontend/src/components/Today.tsx` | Today's tasks checklist on your card; teammates' cards show their Today tasks |
| `frontend/src/App.tsx`, `types.ts`, `styles.css` | `plan()` (instant, rolled back if the server refuses); type; styles |

## How it works
- Moving to Today sets `planned_on` to your device's date. Nothing runs at midnight: the next day the date is simply
  in the past, so My tasks shows the task again if it isn't done. Done tasks stay done and stay on that day's list.
- Moving a task doesn't change its status. Ticking it marks it Done; unticking puts it back to In progress.
- Earlier days (‹ on the Today page) show what was on each person's list that day, read-only, with each task's
  current status. A task moved to Today again later shows on the newer day only.
- Teammates' cards: their Today tasks, plus (today only) anything else they have in progress or blocked.
- A Today list belongs to the assignee: reassigning the task takes it off. The database column is added on
  start-up by `add_missing_columns`, like earlier optional columns.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Move to Today, then back | `planned_on` set, then null; status unchanged; both in history | pass |
| Mark done after moving | keeps the day it was planned | pass |
| Reassign; reassign and plan together; unrelated change | cleared; kept; kept | pass |
| Unassigned task to Today; unassign a planned task | 422; cleared | pass |
| Bad dates (`today`, month 13, a number) | 422 | pass |
| Outsider plans a task | 404 | pass |
| My tasks: planned today (even if due today), done today, unfinished from Friday, done Friday, someone else's | hidden; done; leftover only (not again by due date); done; not mine | pass |
| Today list order | in progress, to do, blocked, done | pass |
| Teammate card today vs an earlier day | plan plus other in-progress, no repeats; plan only | pass |
| Picker | my open tasks not already on the list | pass |

## Verification
- `uv run python -m pytest -q`: 157 passed (8 new). `npm test`: 60 passed (6 new). Type-check and build clean.
- Browser (Chromium, local server on a database made before this change, so the column was added on start-up):
  My tasks showed "Fix Excel date parsing" under **Not finished on Today**, "From yesterday", and the done task as
  "Done". **→ Today** on "Write release notes" removed it from My tasks and showed "1 task is on your Today list".
  On Today, the picker offered the two other open tasks; adding one and ticking the other showed "1 of 2 done" with
  the ticked one struck through. Ravi's card showed his Today task. **↩ My tasks** sent a task back and it stayed
  back after a reload. The previous day showed yesterday's list with the checkbox disabled. History read "put it on
  Today's tasks for 2026-11-14". Phone width (390 px): no sideways scroll on either page. No console errors.

## Limits
- One Today date per task: if a task is on Monday's list, not finished, and moved to Tuesday, Monday's view no longer
  shows it.
- "Today" is the device's date, so people in different time zones roll over at their own midnight.
- No reminder to plan your day or to finish your list.
