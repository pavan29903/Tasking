import type { ReactNode } from 'react';
import { dayLabel } from '../lib/meetings';
import { groupMine, statusLabel } from '../lib/tasks';
import type { Task } from '../types';
import { Avatar, Dot, Due, Prio } from './bits';

type Plan = (t: Task, day: string | null) => void;

/** "From yesterday", "From Wed, 11 Nov": which day's Today list an unfinished task came back from. */
function fromDay(day: string, today: string): string {
  const label = dayLabel(day, today);
  return `From ${label === 'Yesterday' ? 'yesterday' : label}`;
}

function Group({ title, tasks, names, today, onOpen, onPlan, tone, showAssignee, action }: {
  title: string; tasks: Task[]; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
  onPlan?: Plan; tone?: string; showAssignee?: boolean; action?: ReactNode;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className={`group ${tone ?? ''}`}>
      <h2>{title} <span className="n">{tasks.length}</span>{action}</h2>
      <div className="sheet rows">
        {tasks.map((t) => (
          <div key={t.id} className={`row-line${onPlan ? ' plannable' : ''}`}>
            <button type="button" className="row" onClick={() => onOpen(t)}>
              <Dot s={t.status} />
              <span className="key hide-sm">{t.key}</span>
              <span className="t">{t.title} <Prio p={t.priority} /></span>
              <span className="small muted hide-sm">
                {showAssignee ? names.get(t.assignee_id ?? -1)
                  : t.planned_on && t.status !== 'done' ? fromDay(t.planned_on, today) : statusLabel(t.status)}
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

export function MyTasks({ tasks, me, names, today, onOpen, onPlan, onGoToday }: {
  tasks: Task[]; me: number; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
  onPlan: Plan; onGoToday: () => void;
}) {
  const g = groupMine(tasks, me, today);
  const open = g.leftover.length + g.overdue.length + g.today.length + g.week.length + g.later.length + g.undated.length;
  const props = { names, today, onOpen };
  const mine = { ...props, onPlan };
  const onToday = g.onToday.length;
  return (
    <div className="groups">
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
      <Group title="Done this week" tasks={g.doneRecently} {...props} />
    </div>
  );
}
