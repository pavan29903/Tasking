import { groupMine, statusLabel } from '../lib/tasks';
import type { Task } from '../types';
import { Avatar, Dot, Due, Prio } from './bits';

function Group({ title, tasks, names, today, onOpen, tone, showAssignee }: {
  title: string; tasks: Task[]; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
  tone?: string; showAssignee?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className={`group ${tone ?? ''}`}>
      <h2>{title} <span className="n">{tasks.length}</span></h2>
      <div className="sheet rows">
        {tasks.map((t) => (
          <button type="button" key={t.id} className="row" onClick={() => onOpen(t)}>
            <Dot s={t.status} />
            <span className="key hide-sm">{t.key}</span>
            <span className="t">{t.title} <Prio p={t.priority} /></span>
            <span className="small muted hide-sm">{showAssignee ? names.get(t.assignee_id ?? -1) : statusLabel(t.status)}</span>
            {showAssignee ? <Avatar name={names.get(t.assignee_id ?? -1)} /> : <Due task={t} today={today} />}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MyTasks({ tasks, me, names, today, onOpen }: {
  tasks: Task[]; me: number; names: Map<number, string>; today: string; onOpen: (t: Task) => void;
}) {
  const g = groupMine(tasks, me, today);
  const open = g.overdue.length + g.today.length + g.week.length + g.later.length + g.undated.length;
  const props = { names, today, onOpen };
  return (
    <div className="groups">
      {open === 0 && <p className="notice">Nothing assigned to you is open. Tasks someone gives you with <b>@yourname</b> will show up here.</p>}
      <Group title="Overdue" tone="overdue" tasks={g.overdue} {...props} />
      <Group title="Today" tasks={g.today} {...props} />
      <Group title="Next 7 days" tasks={g.week} {...props} />
      <Group title="Later" tasks={g.later} {...props} />
      <Group title="No due date" tasks={g.undated} {...props} />
      <Group title="Waiting on others (you asked)" tasks={g.waiting} showAssignee {...props} />
      <Group title="Done this week" tasks={g.doneRecently} {...props} />
    </div>
  );
}
