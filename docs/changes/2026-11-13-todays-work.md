# Today's work: everyone shares what they're on, and overlaps are flagged

Date: 2026-11-13 · Repo: pavan29903/Tasking · Status: done; checked in a browser with four people

## Summary
A new **Today** page (second in the menu). Each person writes what they're working on today and which **repo or area**
it touches (`tasking-backend, auth`). Everyone in the team sees everyone's update next to their in-progress and
blocked tasks, so a manager sees the whole team's day on one page and teammates see what others are doing.
When two people name the same repo or area on the same day, a **Heads up** banner says so ("You and Ravi are both
on tasking-backend. Check with each other before pushing."), and that area is highlighted on their cards.

## What changed
| File | Change |
| --- | --- |
| `backend/app/models.py` | New table `daily_updates`: team, person, day, text, areas; one row per person per day per team |
| `backend/app/schemas.py` | `UpdateIn` (text up to 2000; up to 8 areas of 40 chars, split on commas, tidied, case duplicates dropped), `UpdateOut` |
| `backend/app/routes/today.py` (new), `main.py` | `GET /api/teams/{id}/updates?day=`, `PUT /api/teams/{id}/updates/{day}` (your own; blank removes it) |
| `backend/tests/test_today.py` (new) | 10 tests, below |
| `frontend/src/components/Today.tsx` (new) | The page: day switcher, role filter, Heads-up banner, your update, team cards |
| `frontend/src/lib/today.ts` (+ test) | `parseAreas`, `overlaps`, `peopleText`, `shiftDay`, `activeTasks` |
| `frontend/src/App.tsx`, `api.ts`, `types.ts`, `styles.css` | Today in the menu; API calls; types; styles |

## How to use it
1. Open **Today**. Write what you're doing (and what you're *not* touching, if that helps others), add the repo or
   area, and click **Share update** (or Ctrl+Enter). Change it any time during the day with **Update**.
2. Below, see each teammate's update, their role, when they shared it, and their in-progress/blocked tasks
   (click one to open it). People who haven't shared yet show as dashed cards.
3. Managers: use the role filter (Developer, BDA…) to see one group, and **‹** to look at earlier days.

## How it works
- "Today" is your device's date, so a team in India gets an India day. You can write for earlier days (forgot
  yesterday?) and for tomorrow at most; further ahead is refused.
- Overlap is an exact match on a repo/area name, ignoring case and extra spaces. It doesn't read the text, so name
  areas consistently (the same repo name for everyone).
- The page refreshes every minute while open. A refresh never overwrites what you're typing.
- Updates belong to one team. Someone who leaves the team disappears from the page.
- Tasks shown are live (current status), so they appear only when viewing today.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Member shares; owner and other members list the day | everyone sees both updates | pass |
| Areas with extra spaces, blanks, same name in other case | tidied, one copy | pass |
| `"api, web,  mobile app "` in one item | three areas | pass |
| Area over 40 chars, more than 8 areas, text over 2000 | 422 | pass |
| Second share the same day; share for yesterday | today's replaced; yesterday kept separately | pass |
| Blank text and no areas (with or without an existing update) | 204, removed | pass |
| Areas but no text | kept | pass |
| Tomorrow / two days ahead (UTC) | allowed / 422 | pass |
| Bad dates (`yesterday`, month 13) | 422 | pass |
| Outsider reads or writes | 404 | pass |
| Member leaves the team | their update no longer listed | pass |
| Update in another team | not shown in this one | pass |
| Overlap: case-insensitive, 2+ people, one person repeating an area, nobody | flagged / not flagged | pass |
| Names in the banner | "You and Ravi", "A, B and C" | pass |
| In-progress then blocked tasks, newest first; todo/done and other people's left out | as described | pass |
| Day switch across month and year ends | correct dates | pass |

## Verification
- `uv run python -m pytest -q`: 149 passed (10 new). `npm test`: 54 passed (6 new). Type-check and build clean.
- Browser (Chromium, real app on a local server): four people (Manager, two Developers, BDA) with tasks. Shared an
  update on `tasking-backend, auth` while Ravi was on `tasking-backend`. The banner showed "You and Ravi Teja are
  both on tasking-backend", and the area was highlighted on Ravi's card. Role filter "BDA" showed only Sana. Previous
  day showed three "No update yet" cards; Back to today worked. Phone width (390 px): no sideways scroll, six menu
  items fit. No console errors.

## Limits
- No reminders yet: people have to remember to share (an email or push nudge would need an email service).
- Overlap only matches names. "backend" and "tasking-backend" are treated as different areas.
- No history view across days for one person (step back day by day instead).
