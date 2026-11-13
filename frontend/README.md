# Tasking frontend (React + Vite)

The web app for Tasking, also packaged as an Android shell with Capacitor. For the whole project, see
[../README.md](../README.md). What was built and how it was verified:
[../docs/changes/2026-11-10-tasking-app.md](../docs/changes/2026-11-10-tasking-app.md); later changes are in the same folder (latest: job roles and people search, 2026-11-13).

## Commands

```powershell
npm install
npm run dev          # http://localhost:5173, proxies /api to the backend on :8000
npm test             # 41 tests: dates, filters (people, roles), sorting, grouping, pickers
npm run typecheck
npm run build        # dist/, which the backend serves
npm run android:sync # build, then copy into the Android project (set TASKING_APP_URL first; see .env.example)
npm run android:open # open in Android Studio to build the APK
```

Vite is pinned to 6 on purpose: Vite 8's native bundler is blocked by Smart App Control on this PC.

## Where things are

| File | What it does |
| --- | --- |
| `src/App.tsx` | Sign-in gate, team loading (including `?join=CODE` links), navigation, 20 s polling |
| `src/api.ts` | Every API call; base URL from `VITE_API_URL`; signs out on 401 |
| `src/lib/tasks.ts` | Pure helpers: due labels, filters (search covers people's names; role filter uses the assignee's job role), sorting, My-tasks groups, history sentences |
| `src/components/Board.tsx` | Four status columns with drag-and-drop |
| `src/components/TaskTable.tsx` | Sortable list, Excel import and download |
| `src/components/MyTasks.tsx` | My work by due date, plus what I'm waiting on |
| `src/components/Meetings.tsx` | Ruled notes pad with autosave and an action-item margin |
| `src/components/Pickers.tsx` | Who / Priority / Due controls; they write `@name`, `!high`, `due:` into the line (`setToken` in `lib/tasks.ts`) |
| `src/components/TaskDrawer.tsx` | Task detail: fields, comments, history, delete |
| `src/components/TeamPage.tsx`, `TeamGate.tsx` | Invite code and link, members and their job roles, create or join a team |
| `src/styles.css` | Design tokens (light and dark), layout, phone layout under 760 px |
| `public/` | PWA manifest, service worker (never caches `/api`), icons |
| `capacitor.config.ts`, `android/` | Android shell; loads `TASKING_APP_URL` when set |
