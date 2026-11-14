import type { ReactNode } from 'react';
import { dayLabel } from '../lib/meetings';
import { groupMine, isoDate, statusLabel } from '../lib/tasks';
import type { Status, Task } from '../types';
import { Avatar, Dot, Due, Prio } from './bits';

type Plan = (t: Task, day: string | null) => void;
type Move = (t: Task, s: Status) => void;

/** "From yesterday", "From Wed, 11 Nov": which day's Today list an unfinished task came back from. */
function fromDay(day: string, today: string): string {
  const label = dayLabel(day, today);
  return `From ${label === 'Yesterday' ? 'yesterday' : label}`;
}

function Tick({ task, onMove }: { task: Task; onMove: Move }) {
  const done = task.status === 'done';
  return (
    <input type="checkbox" className="tick" checked={done} aria-label={`${task.key} done`}
      title={done ? 'Not done after all' : 'Mark done'} onChange={() => onMove(task, done ? 'todo' : 'done')} />
  );
}

function Group({ title, tasks, names, today, onOpen, onPlan, onMove, tone, showAssignee, action }: {
  title: string; tasks: Task[]; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
  onPlan?: Plan; onMove?: Move; tone?: string; showAssignee?: boolean; action?: ReactNode;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className={`group ${tone ?? ''}`}>
      <h2>{title} <span className="n">{tasks.length}</span>{action}</h2>
      <div className="sheet rows">
        {tasks.map((t) => (
          <div key={t.id} className="row-line">
            {onMove && <Tick task={t} onMove={onMove} />}
            <button type="button" className="row" onClick={() => onOpen(t)}>
              <Dot s={t.status} />
              <span className="key hide-sm">{t.key}</span>
              <span className="t">{t.title} <Prio p={t.priority} /></span>
              <span className="small muted hide-sm">
                {showAssignee ? names.get(t.assignee_id ?? -1) : t.planned_on ? fromDay(t.planned_on, today) : statusLabel(t.status)}
              </span>
              {showAssignee ? <Avatar name={names.get(t.assignee_id ?? -1)} /> : <Due task={t} today={today} />}
            </button>
            {onPlan && (
              <button type="button" className="btn small to-today" aria-label={`Move ${t.key} to Today`}
                title="Move to Today's tasks" onClick={() => onPlan(t, today)}>→ Today</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The right-hand column: what I finished in the last 7 days. Unticking sends a task back to To do. */
function Done({ tasks, today, onOpen, onMove }: { tasks: Task[]; today: string; onOpen: (t: Task) => void; onMove: Move }) {
  const latest = [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <section className="group done-col" aria-label="Done">
      <h2>Done <span className="n">{tasks.length}</span><span className="small muted group-action">last 7 days</span></h2>
      {tasks.length === 0 ? <p className="small muted">Tick a task when it's finished and it moves here.</p> : (
        <div className="sheet rows">
          {latest.map((t) => (
            <div key={t.id} className="row-line">
              <Tick task={t} onMove={onMove} />
              <button type="button" className="row done-row" onClick={() => onOpen(t)}>
                <span className="t"><span className="key">{t.key}</span> {t.title}</span>
                <span className="small muted">{dayLabel(isoDate(new Date(t.updated_at)), today)}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MyTasks({ tasks, me, names, today, onOpen, onPlan, onMove, onGoToday }: {
  tasks: Task[]; me: number; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
  onPlan: Plan; onMove: Move; onGoToday: () => void;
}) {
  const g = groupMine(tasks, me, today);
  const open = g.leftover.length + g.overdue.length + g.today.length + g.week.length + g.later.length + g.undated.length;
  const props = { names, today, onOpen };
  const mine = { ...props, onPlan, onMove };
  const onToday = g.onToday.length;
  return (
    <div className="mine-cols">
      <div className="groups" aria-label="To do">
        <h2 className="col-title">To do <span className="n">{open}</span></h2>
        {onToday > 0 && (
          <p className="notice on-today">
            <span>{onToday === 1 ? '1 task is' : `${onToday} tasks are`} on your Today list.</span>
            <button className="btn small" onClick={onGoToday}>Open Today</button>
          </p>
        )}
        {open === 0 && onToday === 0 && (
          <p className="notice">Nothing assigned to you is open. Tasks someone gives you with <b>@yourname</b> will show up here.</p>
        )}
        <Group title="Not finished on Today" tone="overdue" tasks={g.leftover} {...mine}
          action={g.leftover.length > 1 && (
            <button className="btn ghost small group-action" onClick={() => g.leftover.forEach((t) => onPlan(t, today))}>
              Move all to Today
            </button>
          )} />
        <Group title="Overdue" tone="overdue" tasks={g.overdue} {...mine} />
        <Group title="Due today" tasks={g.today} {...mine} />
        <Group title="Next 7 days" tasks={g.week} {...mine} />
        <Group title="Later" tasks={g.later} {...mine} />
        <Group title="No due date" tasks={g.undated} {...mine} />
        <Group title="Waiting on others (you asked)" tasks={g.waiting} showAssignee {...props} />
      </div>
      <Done tasks={g.doneRecently} today={today} onOpen={onOpen} onMove={onMove} />
    </div>
  );
}
