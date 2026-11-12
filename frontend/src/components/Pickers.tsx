import { isoDate, PRIORITIES, type PickKind } from '../lib/tasks';
import type { Member, Priority } from '../types';

export interface Picked { assignee_id: number | null; priority: Priority; due_date: string | null }
export const NOTHING_PICKED: Picked = { assignee_id: null, priority: 'medium', due_date: null };

/** Who / priority / due controls, so nobody has to remember @name, !high or due:fri. */
export function Pickers({ id, members, value, onPick, shortcuts = false }: {
  id: string; members: Member[]; value: Picked; onPick: (kind: PickKind, value: string | number | null) => void;
  shortcuts?: boolean;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    <div className="pickers">
      <label className="pick" htmlFor={`${id}-who`}>
        <span>Who</span>
        <select id={`${id}-who`} className="select" value={value.assignee_id ?? ''}
          onChange={(e) => onPick('who', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Nobody yet</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
        </select>
      </label>
      <label className="pick" htmlFor={`${id}-prio`}>
        <span>Priority</span>
        <select id={`${id}-prio`} className="select" value={value.priority} onChange={(e) => onPick('priority', e.target.value)}>
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="pick" htmlFor={`${id}-due`}>
        <span>Due</span>
        <input id={`${id}-due`} type="date" className="input" value={value.due_date ?? ''}
          onChange={(e) => onPick('due', e.target.value || null)} />
      </label>
      {shortcuts && (
        <span className="pick-days">
          <button type="button" className="btn small ghost" onClick={() => onPick('due', isoDate())}>Today</button>
          <button type="button" className="btn small ghost" onClick={() => onPick('due', isoDate(tomorrow))}>Tomorrow</button>
        </span>
      )}
    </div>
  );
}
