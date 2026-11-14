import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, session } from './api';
import { Auth } from './components/Auth';
import { Board } from './components/Board';
import { errorText, Logo, useToast } from './components/bits';
import { Meetings } from './components/Meetings';
import { MyTasks } from './components/MyTasks';
import { QuickAdd } from './components/QuickAdd';
import { TaskDrawer } from './components/TaskDrawer';
import { TaskTable } from './components/TaskTable';
import { TeamGate } from './components/TeamGate';
import { TeamPage } from './components/TeamPage';
import { Today } from './components/Today';
import { filterTasks, groupMine, isoDate, jobRoles, memberNames, NO_FILTERS, PRIORITIES, type Filters } from './lib/tasks';
import type { Member, Status, Task, Team, User } from './types';

type View = 'board' | 'list' | 'mine' | 'today' | 'notes' | 'team';
const VIEWS: { id: View; label: string; title: string; icon: string }[] = [
  { id: 'mine', label: 'My tasks', title: 'My tasks', icon: '◉' },
  { id: 'today', label: 'Today', title: "Today's work", icon: '☀' },
  { id: 'board', label: 'Board', title: 'Board', icon: '▦' },
  { id: 'list', label: 'List', title: 'All tasks', icon: '☰' },
  { id: 'notes', label: 'Meetings', title: 'Meeting notes', icon: '✎' },
  { id: 'team', label: 'Team', title: 'Team', icon: '☺' },
];
const TEAM_KEY = 'tasking.team';
const POLL_MS = 20_000;

function readView(): View {
  const v = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.some((x) => x.id === v) ? v : 'mine';
}

function remembered(): number | null {
  try { return Number(localStorage.getItem(TEAM_KEY)) || null; } catch { return null; }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(Boolean(session.token));

  useEffect(() => {
    if (session.token) api.me().then(setUser).catch(() => session.clear()).finally(() => setBooting(false));
    const out = () => setUser(null);
    window.addEventListener('tasking:signed-out', out);
    return () => window.removeEventListener('tasking:signed-out', out);
  }, []);

  const signOut = () => { session.clear(); setUser(null); };
  if (booting) return <div className="center muted">Opening Tasking…</div>;
  if (!user) return <Auth onSignedIn={setUser} />;
  return <Workspace user={user} onSignOut={signOut} />;
}

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(remembered);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [view, setView] = useState<View>(readView);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const [focusNote, setFocusNote] = useState<number | null>(null);
  const { show: toast, node: toastNode } = useToast();
  const [joinCode] = useState(() => new URLSearchParams(window.location.search).get('join') ?? '');

  const team = teams?.find((t) => t.id === teamId) ?? teams?.[0] ?? null;
  const today = isoDate();
  const names = useMemo(() => memberNames(members), [members]);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // load teams; an invite link (?join=CODE) joins straight away
  useEffect(() => {
    (async () => {
      let joined: Team | null = null;
      if (joinCode) {
        try { joined = await api.joinTeam(joinCode); toast(`You joined ${joined.name}`); } catch (e) { toast(errorText(e), true); }
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      try {
        setTeams(await api.teams());
        if (joined) setTeamId(joined.id);
      } catch (e) { toast(errorText(e), true); setTeams([]); }
    })();
  }, [joinCode, toast]);

  useEffect(() => {
    if (team) try { localStorage.setItem(TEAM_KEY, String(team.id)); } catch { /* private mode */ }
  }, [team]);

  const reload = useCallback(async () => {
    if (!team) return;
    try {
      const [t, m] = await Promise.all([api.tasks(team.id), api.members(team.id)]);
      setTasks(t);
      setMembers(m);
    } catch (e) { toast(errorText(e), true); }
  }, [team, toast]);

  // Someone joined after our last member refresh (their id shows up on a task or in parsed notes):
  // fetch members once for that id, so names and the assignee picker are right straight away.
  const askedFor = useRef(new Set<number>());
  const seeMembers = useCallback((ids: (number | null)[]) => {
    const unknown = ids.filter((id): id is number => id !== null && !names.has(id) && !askedFor.current.has(id));
    if (!team || unknown.length === 0) return;
    unknown.forEach((id) => askedFor.current.add(id));
    api.members(team.id).then(setMembers).catch(() => undefined);
  }, [names, team]);
  useEffect(() => { if (members.length) seeMembers(tasks.flatMap((t) => [t.assignee_id, t.reporter_id])); }, [tasks, members, seeMembers]);

  // teammates' changes show up without a refresh: poll while the tab is visible
  useEffect(() => {
    setTasks([]);
    setMembers([]);
    void reload();
    const tick = () => document.visibilityState === 'visible' && void reload();
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [reload]);

  const upsert = (list: Task[]) => setTasks((prev) => {
    const byId = new Map(prev.map((t) => [t.id, t]));
    for (const t of list) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => b.number - a.number);
  });

  async function move(task: Task, status: Status) {
    upsert([{ ...task, status }]); // feels instant; corrected below if the server says no
    try { upsert([await api.updateTask(task.id, { status })]); } catch (e) { upsert([task]); toast(errorText(e), true); }
  }

  const go = (v: View) => { window.location.hash = `/${v}`; };
  const addTeam = (t: Team) => {
    setTeams((list) => [...(list ?? []).filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name)));
    setTeamId(t.id);
    go('mine');
  };

  if (teams === null) return <div className="center muted">Loading your teams…</div>;
  if (!team) return <TeamGate onReady={addTeam} initialCode={joinCode} onSignOut={onSignOut} />;

  const visible = filterTasks(tasks, filters, user.id, members);
  const roles = jobRoles(members);
  const mine = groupMine(tasks, user.id, today);
  const myOpen = mine.overdue.length + mine.today.length + mine.week.length + mine.later.length + mine.undated.length;
  const openTask = tasks.find((t) => t.id === openId) ?? null;
  const current = VIEWS.find((v) => v.id === view)!;
  const openT = (t: Task) => setOpenId(t.id);

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand"><Logo /> Tasking</div>
        <nav className="nav" aria-label="Views">
          {VIEWS.map((v) => (
            <a key={v.id} href={`#/${v.id}`} aria-current={v.id === view ? 'page' : undefined}>
              <span aria-hidden="true">{v.icon}</span>{v.label}
              {v.id === 'mine' && myOpen > 0 && <span className="count">{myOpen}</span>}
            </a>
          ))}
        </nav>
        <div className="rail-foot">
          <span><b>{user.name}</b><br /><span className="muted">{user.email}</span></span>
          <button className="btn small" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{current.title}</h1>
          {teams.length > 1 ? (
            <select className="select team-switch" aria-label="Team" value={team.id} onChange={(e) => setTeamId(Number(e.target.value))}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : <span className="muted">{team.name}</span>}
        </div>

        {(view === 'board' || view === 'list' || view === 'mine') && (
          <QuickAdd teamId={team.id} members={members} onSeeMembers={seeMembers} onCreated={(t) => { upsert([t]); toast(`Added ${t.key}`); }} onError={(m) => toast(m, true)} />
        )}

        {(view === 'board' || view === 'list') && (
          <div className="filters" role="search">
            <label className="sr-only" htmlFor="search">Search tasks</label>
            <input id="search" className="input" type="search" placeholder="Search tasks or people" value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
            <label className="sr-only" htmlFor="f-assignee">Assignee</label>
            <select id="f-assignee" className="select" value={String(filters.assignee)}
              onChange={(e) => { const v = e.target.value; setFilters({ ...filters, assignee: v === 'all' || v === 'me' || v === 'none' ? v : Number(v) }); }}>
              <option value="all">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
              {members.filter((m) => m.user_id !== user.id).map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}{m.job_title ? ` · ${m.job_title}` : ''}</option>
              ))}
            </select>
            {(roles.length > 0 || filters.role) && (
              <>
                <label className="sr-only" htmlFor="f-role">Role</label>
                <select id="f-role" className="select" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
                  <option value="">Every role</option>
                  {roles.map((r) => <option key={r} value={r}>{r} tasks</option>)}
                  {filters.role && !roles.includes(filters.role) && <option value={filters.role}>{filters.role} tasks</option>}
                </select>
              </>
            )}
            <label className="sr-only" htmlFor="f-priority">Priority</label>
            <select id="f-priority" className="select" value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value as Filters['priority'] })}>
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {(filters.query || filters.assignee !== 'all' || filters.priority !== 'all' || filters.role) && (
              <button className="btn ghost small" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
            )}
          </div>
        )}

        {view === 'today' && <Today teamId={team.id} me={user} members={members} tasks={tasks} onOpen={openT} toast={toast} />}
        {view === 'mine' && <MyTasks tasks={tasks} me={user.id} names={names} today={today} onOpen={openT} />}
        {view === 'board' && <Board tasks={visible} names={names} today={today} onOpen={openT} onMove={move} />}
        {view === 'list' && <TaskTable tasks={visible} names={names} today={today} teamId={team.id} onOpen={openT} onImported={reload} toast={toast} />}
        {view === 'notes' && <Meetings teamId={team.id} members={members} tasks={tasks} focusNoteId={focusNote} onSeeMembers={seeMembers}
          onTasksCreated={upsert} onOpenTask={openT} toast={toast} />}
        {view === 'team' && <TeamPage team={team} members={members} me={user} toast={toast} onTeamReady={addTeam}
          onTeamUpdated={(t) => setTeams((list) => list?.map((x) => (x.id === t.id ? t : x)) ?? null)}
          onMembersChanged={reload}
          onLeft={() => { setTeams((list) => list?.filter((x) => x.id !== team.id) ?? null); setTeamId(null); toast(`You left ${team.name}`); }} />}
      </main>

      {openTask && (
        <TaskDrawer key={openTask.id} task={openTask} team={team} me={user} members={members} names={names} today={today}
          onSaved={(t) => upsert([t])} onDeleted={(id) => { setTasks((l) => l.filter((t) => t.id !== id)); setOpenId(null); }}
          onClose={() => setOpenId(null)} toast={toast}
          onOpenNote={(id) => { setOpenId(null); setFocusNote(id); go('notes'); }} />
      )}
      {toastNode}
    </div>
  );
}
