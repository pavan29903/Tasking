# Google Calendar on the Meetings page: Join links, notes per meeting, cleaner list

Date: 2026-11-13 · Repo: pavan29903/Tasking · Status: done; checked in a browser with a sample calendar

## Summary
Each person can connect their own Google Calendar by pasting its private iCal link once. The Meetings page then
lists their meetings for the next 7 days, grouped by day, with a **Join** button (Google Meet, Zoom, Teams, Webex)
and one click to **take notes** for that meeting. Notes made this way remember the meeting's title, time, people and
link. The notes list is grouped by Upcoming / This week / Last week / month instead of one long list.

We chose the private link over a "Sign in with Google" button. The button would need a Google Cloud project,
Google's app review (weeks), a manual test-user list, and people reconnecting every 7 days until the review passes.
The link needs none of that. Its limit: some company Google accounts have the private link turned off by IT.

## What changed
| File | Change |
| --- | --- |
| `backend/app/calendar.py` (new) | Checks the link (https, Google/Outlook calendar hosts only, also after redirects), downloads it (15 s, 15 MB cap), expands repeating meetings, skips all-day and cancelled events, finds the join link, caches 3 minutes |
| `backend/app/routes/calendar.py` (new) | `GET /api/me/meetings`, `PUT /api/me/calendar` (checks the link works before saving), `DELETE /api/me/calendar` |
| `backend/app/models.py`, `schemas.py` | `users.calendar_url`; `notes.starts_at`, `meeting_link`, `event_id`. Note links must be `http(s)://` |
| `backend/app/routes/meetings.py` | Saving notes only changes the fields sent, so the meeting time and calendar id stay |
| `backend/pyproject.toml`, `uv.lock` | `recurring-ical-events` (brings `icalendar`); pure Python |
| `frontend/src/components/Agenda.tsx` (new) | "Your meetings" card: connect steps, meetings by day, Now / In 5 min, Join, Disconnect |
| `frontend/src/components/Meetings.tsx` | Agenda above the notes list; notes grouped by date; meeting link and Join on the notes; on a phone, opening notes scrolls to them |
| `frontend/src/lib/meetings.ts` (+ test) | Meeting state, day labels, grouping, safe links |
| `frontend/src/styles.css`, `api.ts`, `types.ts` | Styles for the agenda and notes; calendar API calls and types |

## How to use it
1. Open Google Calendar on a computer, go to **Settings**, then under **Settings for my calendars** click your calendar.
2. In **Integrate calendar**, copy **Secret address in iCal format**.
3. In Tasking, go to **Meetings**, click **Connect Google Calendar**, paste the link and click **Connect**.

Click a meeting to start notes for it (or open the notes you already took); **Join** opens the call. Meetings that
are on now or start within 15 minutes are highlighted, and their Join button is blue. Notes not made from a calendar
can still have a link: paste it into the **Meeting link** box under the title.

## How it works
- Each person's calendar is private to them: only they see their meetings. Notes taken from a meeting belong to the
  team, like any other notes. The same meeting opens the same notes in a team, not a copy.
- The server reads meetings from yesterday to 8 days ahead in UTC; the browser groups them by *your* local day and
  shows today plus the next 6 days. Meetings that ended today stay (dimmed) so you can write notes afterwards.
- The calendar is re-read every 5 minutes while the page is open (the server caches for 3), or on **Refresh**. A new
  meeting can take a few minutes to appear; Google's private link itself can lag behind the calendar.
- The link is a secret: it is stored on the user row, never returned by the API, never logged.
- If the calendar can't be read later (link reset, Google down), the page shows the reason and keeps working.

## Tests and edge cases
| Case | Expected | Result |
| --- | --- | --- |
| Daily repeating stand-up in IST, Zoom link in description, Meet link in Google's field | expanded per weekday in UTC, links found, trailing "." trimmed | pass |
| All-day holiday, cancelled meeting, meeting next year | left out | pass |
| Meeting without an end time | ends when it starts; page shows "Now" for a minute | pass |
| `webcal://` link, Outlook link | accepted as https | pass |
| http, other hosts, look-alike host, cloud metadata IP, `file://`, not a link | refused with steps to fix | pass |
| Redirect to another host or to http | refused | pass |
| Link that returns a web page, or Google refuses it | 400 with a clear message; the old link is kept | pass |
| Calendar unreachable after connecting | 200 with `error`, notes still shown | pass |
| Second read within 3 minutes | served from cache | pass |
| Secret link in any response | never | pass |
| Another person's meetings | not visible | pass |
| Notes with meeting time/link; save without them | kept; blank link clears | pass |
| `javascript:` or bare-domain meeting link | 422 | pass |
| Grouping: by local day, ended-today kept, yesterday and >7 days dropped; notes by week/month | as described | pass |

## Verification
- `uv run python -m pytest -q`: 139 passed (24 new). `npm test`: 48 passed (7 new). `npm run typecheck`, `npm run build`: clean.
- Browser (Chromium, real app on a local server, calendar download replaced by a sample around the current time):
  connected with a bad link (clear error), then a good one; six meetings over three days with Now / In 12 min;
  Join links to Meet, Zoom and Teams; clicking a meeting created notes with title, attendees and Zoom link, and
  clicking it again opened the same notes. Checked at 1400 px light and dark, and 390 px (no sideways scroll).

## Limits
- Only meetings on the calendar you link (not other calendars you subscribe to, unless you link those too).
- Declined meetings still show (the private link doesn't say which attendee you are).
- The link is stored as plain text in the database; anyone with database access could read that person's calendar.
  Disconnecting removes it; resetting the secret address in Google makes the old one useless.
