import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { pickToken, setToken, type PickKind } from '../lib/tasks';
import type { Member, ParsedItem, Task } from '../types';
import { errorText, useDebounced } from './bits';
import { NOTHING_PICKED, Pickers, type Picked } from './Pickers';

const PREFIX = /^\s*(?:[-*]\s*)?(?:\[\s?\]|todo:|action:)/i;

export function QuickAdd({ teamId, members, onSeeMembers, onCreated, onError }: {
  teamId: number; members: Member[]; onSeeMembers: (ids: (number | null)[]) => void;
  onCreated: (t: Task) => void; onError: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ParsedItem | null>(null);
  const [picked, setPicked] = useState<Partial<Picked>>({}); // shown at once, until the server's preview catches up
  const debounced = useDebounced(text, 300);

  useEffect(() => {
    if (!/[@!]|due:/i.test(debounced)) { setPreview(null); setPicked({}); return; }
    let live = true;
    const line = PREFIX.test(debounced) ? debounced : `[ ] ${debounced}`;
    const done = (p: ParsedItem | null) => { if (live) { setPreview(p); setPicked({}); } };
    api.parse(teamId, line).then((items) => done(items[0] ?? null)).catch(() => done(null));
    return () => { live = false; };
  }, [debounced, teamId]);

  function pick(kind: PickKind, value: string | number | null) {
    setText((t) => setToken(t, kind, pickToken(kind, value, members)));
    const field = { who: 'assignee_id', priority: 'priority', due: 'due_date' }[kind];
    setPicked((p) => ({ ...p, [field]: value }));
  }
  useEffect(() => { if (preview) onSeeMembers([preview.assignee_id]); }, [preview, onSeeMembers]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      onCreated(await api.quickAdd(teamId, text));
      setText('');
      setPreview(null);
      setPicked({});
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const who = preview?.assignee_id != null ? members.find((m) => m.user_id === preview.assignee_id)?.name : null;
  const value: Picked = { ...NOTHING_PICKED, ...(preview && {
    assignee_id: preview.assignee_id, priority: preview.priority, due_date: preview.due_date }), ...picked };
  return (
    <form className="quick" onSubmit={submit}>
      <div className="quick-row">
        <label className="sr-only" htmlFor="quick">Add a task</label>
        <input id="quick" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder="Add a task… e.g. Send revised estimate" autoComplete="off" />
        <button className="btn primary" disabled={busy || !text.trim()}>Add</button>
      </div>
      <Pickers id="quick" members={members} value={value} onPick={pick} shortcuts />
      <div className="quick-hint" aria-live="polite">
        {preview ? (
          <>
            <span className="muted">Will create:</span> <b>{preview.title}</b>
            {preview.assignee_query && !who && <span className="chip warn">@{preview.assignee_query} is not in this team</span>}
            {preview.due_error && <span className="chip warn">{preview.due_error}</span>}
          </>
        ) : (
          <span className="muted">Faster typing, if you like: <code>@name</code> <code>!high</code> <code>due:fri</code></span>
        )}
      </div>
    </form>
  );
}
