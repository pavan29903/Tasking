import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { clock, dayLabel } from '../lib/meetings';
import { isoDate, jobRoles } from '../lib/tasks';
import { cardTasks, overlaps, parseAreas, peopleText, pickable, plannedTasks, shiftDay } from '../lib/today';
import type { DailyUpdate, Member, Status, Task, User } from '../types';
import { Avatar, Dot, errorText } from './bits';

const POLL_MS = 60_000;

function TaskLines({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  if (tasks.length === 0) return null;
  return (
    <ul className="work-tasks" aria-label="Their tasks">
      {tasks.map((t) => (
        <li key={t.id}>
          <button className="linkish" onClick={() => onOpen(t)}>
            <Dot s={t.status} /> <span className="key">{t.key}</span> <span className={t.status === 'done' ? 'struck' : undefined}>{t.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Your Today list: tick when done, send back to My tasks, or add more from My tasks. Earlier days are read-only. */
function MyList({ planned, options, day, canEdit, onOpen, onPlan, onMove }: {
  planned: Task[]; options: Task[]; day: string; canEdit: boolean; onOpen: (t: Task) => void;
  onPlan: (t: Task, day: string | null) => void; onMove: (t: Task, s: Status) => void;
}) {
  const done = planned.filter((t) => t.status === 'done').length;
  return (
    <div className="today-list">
      <div className="side-head">
        <h3>Today's tasks</h3>
        {planned.length > 0 && <span className="small muted">{done} of {planned.length} done</span>}
      </div>
      {planned.length === 0 && (
        <p className="small muted">
          {canEdit ? 'Nothing on your list yet. Add tasks from My tasks; anything not done today goes back there tomorrow.'
            : 'No tasks were on your list that day.'}
        </p>
      )}
      {planned.length > 0 && (
        <ul className="plan">
          {planned.map((t) => (
            <li key={t.id} className={t.status === 'done' ? 'done' : undefined}>
              <input type="checkbox" checked={t.status === 'done'} disabled={!canEdit}
                aria-label={`${t.key} done`} onChange={(e) => onMove(t, e.target.checked ? 'done' : 'in_progress')} />
              <button className="linkish" onClick={() => onOpen(t)}>
                <span className="key">{t.key}</span> <span className="t">{t.title}</span>
              </button>
              {(t.status === 'in_progress' || t.status === 'blocked') && (
                <span className="small muted">{t.status === 'blocked' ? 'Blocked' : 'In progress'}</span>
              )}
              {canEdit && t.status !== 'done' && (
                <button className="btn ghost small" aria-label={`Move ${t.key} back to My tasks`} title="Back to My tasks"
                  onClick={() => onPlan(t, null)}>↩ My tasks</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && options.length > 0 && (
        <>
          <label className="sr-only" htmlFor="plan-add">Add a task from My tasks</label>
          <select id="plan-add" className="select" value=""
            onChange={(e) => { const t = options.find((o) => o.id === Number(e.target.value)); if (t) onPlan(t, day); }}>
            <option value="">+ Add from My tasks…</option>
            {options.map((t) => <option key={t.id} value={t.id}>{t.key} {t.title}</option>)}
          </select>
        </>
      )}
    </div>
  );
}

function Areas({ areas, shared }: { areas: string[]; shared: Set<string> }) {
  if (areas.length === 0) return null;
  return (
    <span className="chips">
      {areas.map((a) => (
        <span key={a} className={`chip area${shared.has(a.toLowerCase()) ? ' warn' : ''}`}
          title={shared.has(a.toLowerCase()) ? 'Someone else is on this too' : undefined}>{a}</span>
      ))}
    </span>
  );
}

/** Your own update: what you're on and where, so nobody pushes over you. */
function Mine({ teamId, day, mine, onSaved, toast }: {
  teamId: number; day: string; mine: DailyUpdate | undefined; onSaved: (u: DailyUpdate | undefined) => void;
  toast: (msg: string, bad?: boolean) => void;
}) {
  const savedText = mine?.text ?? '';
  const savedAreas = (mine?.areas ?? []).join(', ');
  const [text, setText] = useState(savedText);
  const [areas, setAreas] = useState(savedAreas);
  const [busy, setBusy] = useState(false);
  // a teammate's refresh must not wipe what you're typing: only follow the server when you have no changes
  const [base, setBase] = useState({ text: savedText, areas: savedAreas });
  const dirty = text !== base.text || areas !== base.areas;
  useEffect(() => {
    if (!dirty) { setText(savedText); setAreas(savedAreas); setBase({ text: savedText, areas: savedAreas }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedText, savedAreas]);

  async function share() {
    setBusy(true);
    try {
      const saved = await api.saveUpdate(teamId, day, text, parseAreas(areas));
      onSaved(saved);
      setBase({ text: saved?.text ?? '', areas: (saved?.areas ?? []).join(', ') });
      setText(saved?.text ?? '');
      setAreas((saved?.areas ?? []).join(', '));
      toast(saved ? 'Update shared with your team' : 'Update removed');
    } catch (e) { toast(errorText(e), true); } finally { setBusy(false); }
  }

  return (
    <form className="work-mine" onSubmit={(e) => { e.preventDefault(); void share(); }}>
      <label className="sr-only" htmlFor="work-text">What you're working on</label>
      <textarea id="work-text" className="textarea" rows={3} maxLength={2000} value={text}
        placeholder="What are you working on? e.g. Fixing the login timeout in auth.py. Not touching the task API."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void share(); } }} />
      <label className="sr-only" htmlFor="work-areas">Repos or areas</label>
      <input id="work-areas" className="input" maxLength={400} value={areas} onChange={(e) => setAreas(e.target.value)}
        placeholder="Repo or area, comma separated: tasking-backend, auth" />
      <div className="toolbar">
        <span className="small muted">
          {mine ? `Shared at ${clock(mine.updated_at)}${dirty ? ' · not yet updated' : ''}` : 'Your team sees this once you share it.'}
        </span>
        <button className="btn small primary" disabled={busy || !dirty}>{mine ? 'Update' : 'Share update'}</button>
      </div>
    </form>
  );
}

export function Today({ teamId, me, members, tasks, onOpen, onPlan, onMove, toast }: {
  teamId: number; me: User; members: Member[]; tasks: Task[]; onOpen: (t: Task) => void;
  onPlan: (t: Task, day: string | null) => void; onMove: (t: Task, s: Status) => void;
  toast: (msg: string, bad?: boolean) => void;
}) {
  const today = isoDate();
  const [day, setDay] = useState(today);
  const [updates, setUpdates] = useState<DailyUpdate[] | null>(null);
  const [role, setRole] = useState('');

  const load = useCallback(() => {
    api.updates(teamId, day).then(setUpdates).catch((e) => toast(errorText(e), true));
  }, [teamId, day, toast]);
  useEffect(() => {
    setUpdates(null);
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const list = updates ?? [];
  const byUser = new Map(list.map((u) => [u.user_id, u]));
  const mine = byUser.get(me.id);
  const clashes = overlaps(list);
  const shared = new Set(clashes.map((c) => c.area.toLowerCase()));
  const nameOf = (id: number) => (id === me.id ? 'You' : members.find((m) => m.user_id === id)?.name ?? 'Someone');
  const roles = jobRoles(members);
  const others = members
    .filter((m) => m.user_id !== me.id)
    .filter((m) => !role || (m.job_title ?? '').trim().toLowerCase() === role.toLowerCase())
    .sort((a, b) => Number(byUser.has(b.user_id)) - Number(byUser.has(a.user_id)) || a.name.localeCompare(b.name));
  const sharedCount = others.filter((m) => byUser.has(m.user_id)).length;
  const isToday = day === today;

  const saved = (u: DailyUpdate | undefined) =>
    setUpdates((prev) => [...(prev ?? []).filter((x) => x.user_id !== me.id), ...(u ? [u] : [])]);

  return (
    <div className="today">
      <div className="filters">
        <span className="day-nav">
          <button className="btn small" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}>‹</button>
          <b>{dayLabel(day, today)}</b>
          <button className="btn small" aria-label="Next day" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}>›</button>
          {!isToday && <button className="btn ghost small" onClick={() => setDay(today)}>Back to today</button>}
        </span>
        {roles.length > 0 && (
          <>
            <label className="sr-only" htmlFor="today-role">Role</label>
            <select id="today-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Everyone</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </>
        )}
      </div>

      {clashes.length > 0 && (
        <div className="clash" role="status">
          {clashes.map((c) => (
            <p key={c.area}>
              <b>Heads up:</b> {peopleText([...c.userIds].sort((a, b) => Number(b === me.id) - Number(a === me.id)).map(nameOf))} {c.userIds.length === 2 ? 'are both' : 'are all'} on{' '}
              <span className="chip area warn">{c.area}</span>. Check with each other before pushing.
            </p>
          ))}
        </div>
      )}

      <section className="sheet work-card me">
        <div className="work-head">
          <Avatar name={me.name} />
          <b>{isToday ? 'Your work today' : `Your work: ${dayLabel(day, today)}`}</b>
        </div>
        {updates === null ? <p className="small muted">Loading…</p>
          : <Mine key={`${teamId}-${day}`} teamId={teamId} day={day} mine={mine} onSaved={saved} toast={toast} />}
        <MyList planned={plannedTasks(tasks, me.id, day)} options={isToday ? pickable(tasks, me.id, day) : []} day={day}
          canEdit={isToday} onOpen={onOpen} onPlan={onPlan} onMove={onMove} />
      </section>

      <div className="side-head">
        <h3>Team</h3>
        {updates !== null && <span className="small muted">{sharedCount} of {others.length} shared</span>}
      </div>
      {others.length === 0 && (
        <p className="muted small">{role ? `Nobody else is a ${role}.` : 'Invite teammates from the Team page to see their work here.'}</p>
      )}
      <div className="work-grid">
        {others.map((m) => {
          const u = byUser.get(m.user_id);
          const theirs = cardTasks(tasks, m.user_id, day, isToday);
          return (
            <article key={m.user_id} className={`sheet work-card${u || theirs.length ? '' : ' quiet'}`}>
              <div className="work-head">
                <Avatar name={m.name} />
                <span className="who"><b>{m.name}</b>{m.job_title && <span className="small muted">{m.job_title}</span>}</span>
                {u && <span className="small muted when">{clock(u.updated_at)}</span>}
              </div>
              {u?.text ? <p className="work-text">{u.text}</p> : !u && <p className="small muted">No update yet.</p>}
              {u && <Areas areas={u.areas} shared={shared} />}
              <TaskLines tasks={theirs} onOpen={onOpen} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
