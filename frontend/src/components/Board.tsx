import { useState } from 'react';
import { byUrgency, STATUSES } from '../lib/tasks';
import type { Status, Task } from '../types';
import { Avatar, Dot, Due, Prio } from './bits';

export function TaskCard({ task, names, today, onOpen, draggable }: {
  task: Task; names: Map<number, string>; today: string; onOpen: (t: Task) => void; draggable?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <button type="button" className={`card${dragging ? ' dragging' : ''}`} onClick={() => onOpen(task)} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(task.id)); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
      onDragEnd={() => setDragging(false)}>
      <span className="card-meta"><span className="key">{task.key}</span><Prio p={task.priority} /></span>
      <span className="card-title">{task.title}</span>
      <span className="card-meta">
        <Avatar name={task.assignee_id != null ? names.get(task.assignee_id) : null} />
        {task.comment_count > 0 && <span className="muted small" title={`${task.comment_count} comments`}>💬 {task.comment_count}</span>}
        <span className="spacer" /><Due task={task} today={today} />
      </span>
    </button>
  );
}

export function Board({ tasks, names, today, onOpen, onMove }: {
  tasks: Task[]; names: Map<number, string>; today: string; onOpen: (t: Task) => void; onMove: (t: Task, s: Status) => void;
}) {
  const [over, setOver] = useState<Status | null>(null);
  return (
    <div className="board">
      {STATUSES.map((col) => {
        const items = tasks.filter((t) => t.status === col.id).sort(byUrgency);
        return (
          <section key={col.id} className={`column${over === col.id ? ' drop' : ''}`} aria-label={col.label}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const task = tasks.find((t) => t.id === Number(e.dataTransfer.getData('text/plain')));
              if (task && task.status !== col.id) onMove(task, col.id);
            }}>
            <div className="column-head"><Dot s={col.id} /> {col.label}<span className="n">{items.length}</span></div>
            {items.map((t) => <TaskCard key={t.id} task={t} names={names} today={today} onOpen={onOpen} draggable />)}
            {items.length === 0 && <p className="empty-col">{col.id === 'todo' ? 'Nothing waiting. Add a task above.' : 'Drag a card here'}</p>}
          </section>
        );
      })}
    </div>
  );
}
