import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { clock, dayLabel, noteGroups, safeLink } from '../lib/meetings';
import { isoDate, pickToken, setToken, type PickKind } from '../lib/tasks';
import type { Meeting, Member, MyMeetings, Note, ParsedItem, Task } from '../types';
import { Agenda } from './Agenda';
import { errorText, useDebounced } from './bits';
import { Pickers } from './Pickers';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';
const template = (attendees = '') => `Attendees: ${attendees}\n\nDiscussed\n- \n\nAction items\n[ ] `;
const CALENDAR_MS = 5 * 60_000;

export function Meetings({ teamId, members, tasks, focusNoteId, onSeeMembers, onTasksCreated, onOpenTask, toast }: {
  teamId: number; members: Member[]; tasks: Task[]; focusNoteId: number | null; onSeeMembers: (ids: (number | null)[]) => void;
  onTasksCreated: (t: Task[]) => void; onOpenTask: (t: Task) => void; toast: (msg: string, bad?: boolean) => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [current, setCurrent] = useState<Note | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [busy, setBusy] = useState(false);
  const latest = useRef<Note | null>(null);
  const pad = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(false);
  const padTop = useRef<HTMLDivElement>(null);
  const [calendar, setCalendar] = useState<MyMeetings | null>(null);
  const [now, setNow] = useState(() => new Date());

  // your calendar: on open, every few minutes, and the clock ticks each minute for "Now" / "In 5 min"
  const loadCalendar = useCallback(() => {
    api.myMeetings().then(setCalendar).catch(() => setCalendar((c) => c ?? { connected: false, error: null, meetings: [] }));
  }, []);
  useEffect(() => {
    loadCalendar();
    const cal = setInterval(loadCalendar, CALENDAR_MS);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => { clearInterval(cal); clearInterval(tick); };
  }, [loadCalendar]);

  useEffect(() => {
    let live = true;
    api.notes(teamId).then((list) => {
      if (!live) return;
      setNotes(list);
      const pick = list.find((n) => n.id === focusNoteId) ?? list[0] ?? null;
      setCurrent(pick);
      latest.current = pick;
    }).catch((e) => toast(errorText(e), true));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, focusNoteId]);

  const save = useCallback(async () => {
    const note = latest.current;
    if (!note || !dirty.current) return note;
    dirty.current = false;
    setSaveState('saving');
    try {
      const saved = await api.saveNote(note);
      setNotes((list) => list?.map((n) => (n.id === saved.id ? saved : n)) ?? null);
      if (!dirty.current) setSaveState('saved');
      return saved;
    } catch (e) {
      dirty.current = true;
      setSaveState('error');
      toast(`Notes not saved: ${errorText(e)}`, true);
      return null;
    }
  }, [toast]);

  const edit = (patch: Partial<Note>) => {
    if (!current) return;
    const next = { ...current, ...patch };
    setCurrent(next);
    latest.current = next;
    dirty.current = true;
    setSaveState('unsaved');
  };

  // autosave shortly after typing stops
  const settled = useDebounced(current, 800);
  useEffect(() => { if (settled && dirty.current) void save(); }, [settled, save]);

  // live preview of action items in the margin
  const body = useDebounced(current?.body ?? '', 300);
  useEffect(() => {
    let live = true;
    if (!body.trim()) { setItems([]); return; }
    api.parse(teamId, body).then((x) => live && setItems(x)).catch(() => undefined);
    return () => { live = false; };
  }, [body, teamId]);
  useEffect(() => onSeeMembers(items.map((i) => i.assignee_id)), [items, onSeeMembers]);

  // save before leaving the page or switching notes
  useEffect(() => () => { void save(); }, [save]);

  // a picker rewrites that line's shortcut, so the note stays the record of what was agreed
  function pick(item: ParsedItem, kind: PickKind, value: string | number | null) {
    if (!current) return;
    const lines = current.body.split('\n');
    if (lines[item.line] !== item.text) return; // the note changed since the margin was drawn; it refreshes in a moment
    const text = setToken(item.text, kind, pickToken(kind, value, members));
    lines[item.line] = text;
    edit({ body: lines.join('\n') });
    const field = { who: 'assignee_id', priority: 'priority', due: 'due_date' }[kind];
    const cleared = kind === 'who' ? { assignee_query: null } : kind === 'due' ? { due_error: null } : {};
    setItems((list) => list.map((x) => (x === item ? { ...x, ...cleared, text, [field]: value } : x)));
  }

  function addActionLine() {
    if (!current) return;
    const body = current.body;
    const emptyLast = /(^|\n)\s*(?:[-*]\s*)?\[\s?\]\s*$/.test(body); // an empty "[ ]" is waiting: reuse it
    const next = emptyLast ? body : `${body.replace(/[ \t]+$/, '')}${body.trim() && !body.endsWith('\n') ? '\n' : ''}[ ] `;
    if (next !== body) edit({ body: next });
    requestAnimationFrame(() => {
      pad.current?.focus();
      pad.current?.setSelectionRange(next.length, next.length);
    });
  }

  function show(note: Note) {
    setCurrent(note);
    latest.current = note;
    if (window.matchMedia('(max-width: 860px)').matches) requestAnimationFrame(() => padTop.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  async function open(note: Note) {
    await save();
    show(note);
  }

  async function create(from?: Meeting) {
    await save();
    try {
      const label = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const note = await api.createNote(teamId, from ? {
        title: from.title, meeting_date: isoDate(new Date(from.starts_at)), body: template(from.attendees.join(', ')),
        starts_at: from.starts_at, meeting_link: safeLink(from.link), event_id: from.id,
      } : { title: `Meeting notes, ${label}`, meeting_date: isoDate(), body: template() });
      setNotes((list) => [note, ...(list ?? [])]);
      show(note);
    } catch (e) { toast(errorText(e), true); }
  }

  // a meeting opens its notes in this team, or starts them
  async function takeNotes(m: Meeting) {
    const existing = notes?.find((n) => n.event_id === m.id);
    if (existing) await open(existing); else await create(m);
  }

  async function convert(item: ParsedItem | 'all') {
    if (!current) return;
    setBusy(true);
    try {
      if ((await save()) === null && dirty.current) return;
      const res = item === 'all' ? await api.convertAll(current.id) : await api.convertLine(current.id, item.line, item.text);
      setCurrent(res.note);
      latest.current = res.note;
      setNotes((list) => list?.map((n) => (n.id === res.note.id ? res.note : n)) ?? null);
      onTasksCreated(res.tasks);
      toast(res.tasks.length === 1 ? `Created ${res.tasks[0].key}` : `Created ${res.tasks.length} tasks`);
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || !window.confirm(`Delete “${current.title}”? Tasks made from these notes are kept.`)) return;
    try {
      await api.deleteNote(current.id);
      dirty.current = false;
      const rest = (notes ?? []).filter((n) => n.id !== current.id);
      setNotes(rest);
      setCurrent(rest[0] ?? null);
      latest.current = rest[0] ?? null;
    } catch (e) { toast(errorText(e), true); }
  }

  const pending = items.filter((i) => !i.task_key);
  const name = (id: number | null) => members.find((m) => m.user_id === id)?.name;
  const today = isoDate(now);
  const join = safeLink(current?.meeting_link);

  return (
    <div className="meetings">
      <div className="side">
        <Agenda data={calendar} now={now} notes={notes ?? []} onTakeNotes={takeNotes} onChange={setCalendar}
          onRefresh={loadCalendar} toast={toast} />

        <nav className="note-list" aria-label="Meeting notes">
          <div className="side-head">
            <h3>Notes</h3>
            <button className="btn small" onClick={() => create()}>+ New notes</button>
          </div>
          {notes === null && <p className="muted small">Loading…</p>}
          {notes?.length === 0 && <p className="muted small">No notes yet. Pick a meeting above, or start blank notes.</p>}
          {noteGroups(notes ?? [], today).map((g) => (
            <div key={g.label} className="note-group">
              <h4>{g.label}</h4>
              {g.items.map((n) => (
                <button key={n.id} className="note-link" aria-current={n.id === current?.id} onClick={() => open(n)}>
                  <b>{n.id === current?.id ? current.title : n.title}</b>
                  <span className="muted small">
                    {n.meeting_date ? dayLabel(n.meeting_date, today) : 'No date'}{n.starts_at ? ` · ${clock(n.starts_at)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {current ? (
        <div className="pad-wrap" ref={padTop}>
          <section className="sheet pad">
            <div className="pad-head">
              <label className="sr-only" htmlFor="note-title">Title</label>
              <input id="note-title" className="pad-title" value={current.title} maxLength={200}
                onChange={(e) => edit({ title: e.target.value })} />
              <label className="sr-only" htmlFor="note-date">Meeting date</label>
              <input id="note-date" type="date" className="input pad-date" value={current.meeting_date ?? ''}
                onChange={(e) => edit({ meeting_date: e.target.value || null })} />
            </div>
            <div className="pad-meta">
              {current.starts_at && <span className="when">{clock(current.starts_at)}</span>}
              <label className="sr-only" htmlFor="note-link">Meeting link</label>
              <input id="note-link" className="input" type="url" maxLength={500} value={current.meeting_link ?? ''}
                placeholder="Meeting link (Meet, Zoom, Teams)" onChange={(e) => edit({ meeting_link: e.target.value })} />
              {join && <a className="btn small primary" href={join} target="_blank" rel="noopener noreferrer">Join meeting</a>}
            </div>
            <label className="sr-only" htmlFor="note-body">Notes</label>
            <textarea id="note-body" ref={pad} className="ruled" value={current.body} readOnly={busy} spellCheck
              onChange={(e) => edit({ body: e.target.value })}
              placeholder={'Write as you talk.\n[ ] Lines that start like this become tasks'} />
            <div className="toolbar">
              <button className="btn small" disabled={busy} onClick={addActionLine}>+ Action item</button>
              <span className="save-state" aria-live="polite">
                {{ saved: 'Saved', saving: 'Saving…', unsaved: 'Editing…', error: 'Not saved, retrying when you type' }[saveState]}
              </span>
              <button className="btn ghost small danger" onClick={remove}>Delete notes</button>
            </div>
          </section>

          <aside className="margin" aria-label="Action items">
            <div className="margin-head">
              <h3>Action items</h3>
              {pending.length > 1 && <button className="btn small primary" disabled={busy} onClick={() => convert('all')}>Create all {pending.length}</button>}
            </div>
            {items.length === 0 && (
              <div className="syntax sheet" style={{ padding: 12 }}>
                <p>Press <b>+ Action item</b> (or start a line with <code>[ ]</code>) and write what needs doing.</p>
                <p>It shows up here, where you choose who does it, the priority and the due date.</p>
                <p>Shortcuts if you prefer typing: <code>@meera</code> <code>!high</code> <code>due:fri</code></p>
              </div>
            )}
            {items.map((i) => {
              const made = i.task_key ? tasks.find((t) => t.key === i.task_key) : undefined;
              const who = name(i.assignee_id);
              return (
                <div key={i.line} className={`action${i.task_key ? ' made' : ''}`}>
                  <span className="ln">Line {i.line + 1}</span>
                  <b>{i.title}</b>
                  <span className="chips">
                    {i.task_key && who && <span className="chip">→ {who}</span>}
                    {i.assignee_query && !who && <span className="chip warn">@{i.assignee_query} not in team</span>}
                    {i.due_error && <span className="chip warn">{i.due_error}</span>}
                  </span>
                  {!i.task_key && <Pickers id={`line-${i.line}`} members={members} value={i} onPick={(kind, v) => pick(i, kind, v)} />}
                  {i.task_key ? (
                    made ? <button className="btn small" onClick={() => onOpenTask(made)}>Open {i.task_key}</button>
                      : <span className="key">{i.task_key}</span>
                  ) : (
                    <button className="btn small primary" disabled={busy} onClick={() => convert(i)}>Create task</button>
                  )}
                </div>
              );
            })}
          </aside>
        </div>
      ) : notes?.length === 0 ? null : <p className="muted">Pick a meeting or notes on the left.</p>}
    </div>
  );
}
