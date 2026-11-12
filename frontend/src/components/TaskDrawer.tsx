import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { activityText, PRIORITIES, relativeTime, STATUSES } from '../lib/tasks';
import type { Activity, Comment, Member, Task, TaskPatch, Team, User } from '../types';
import { Avatar, Due, errorText } from './bits';

export function TaskDrawer({ task, team, me, members, names, today, onSaved, onDeleted, onClose, onOpenNote, toast }: {
  task: Task; team: Team; me: User; members: Member[]; names: Map<number, string>; today: string;
  onSaved: (t: Task) => void; onDeleted: (id: number) => void; onClose: () => void; onOpenNote: (id: number) => void;
  toast: (msg: string, bad?: boolean) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [reply, setReply] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitle(task.title); setDescription(task.description); }, [task.id, task.title, task.description]);

  const loadThread = () => {
    api.comments(task.id).then(setComments).catch(() => undefined);
    api.activity(task.id).then(setHistory).catch(() => undefined);
  };
  useEffect(loadThread, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(patch: TaskPatch) {
    try {
      onSaved(await api.updateTask(task.id, patch));
      api.activity(task.id).then(setHistory).catch(() => undefined);
    } catch (e) {
      toast(errorText(e), true);
      setTitle(task.title);
      setDescription(task.description);
    }
  }

  async function comment(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      const c = await api.addComment(task.id, reply);
      setComments((list) => [...list, c]);
      setReply('');
      onSaved({ ...task, comment_count: task.comment_count + 1 });
    } catch (err) { toast(errorText(err), true); }
  }

  async function remove() {
    if (!window.confirm(`Delete ${task.key} “${task.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteTask(task.id);
      onDeleted(task.id);
      toast(`Deleted ${task.key}`);
    } catch (e) { toast(errorText(e), true); }
  }

  const canDelete = task.reporter_id === me.id || team.role === 'owner';
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${task.key} ${task.title}`}>
        <div className="drawer-head">
          <span className="key">{task.key}</span>
          <Due task={task} today={today} />
          <button className="btn ghost small" onClick={onClose} aria-label="Close">Close</button>
        </div>

        <label className="sr-only" htmlFor="task-title">Title</label>
        <input id="task-title" ref={titleRef} className="drawer-title" value={title} maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title.trim() !== task.title ? save({ title: title.trim() }) : setTitle(task.title)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />

        <div className="props">
          <label className="field"><span>Status</span>
            <select className="select" value={task.status} onChange={(e) => save({ status: e.target.value as Task['status'] })}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Priority</span>
            <select className="select" value={task.priority} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Assignee</span>
            <select className="select" value={task.assignee_id ?? ''} onChange={(e) => save({ assignee_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Unassigned</option>
              {task.assignee_id !== null && !names.has(task.assignee_id) && <option value={task.assignee_id}>Former member</option>}
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}{m.user_id === me.id ? ' (you)' : ''}</option>)}
            </select>
          </label>
          <label className="field"><span>Due date</span>
            <input type="date" className="input" value={task.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />
          </label>
        </div>

        <label className="field"><span>Details</span>
          <textarea className="textarea" value={description} maxLength={10000} placeholder="Context, links, what done looks like…"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ description })} />
        </label>

        <p className="muted small">
          Asked by {names.get(task.reporter_id) ?? 'a former member'} · {relativeTime(task.created_at)}
          {task.note_id && <> · <button className="btn ghost small" onClick={() => onOpenNote(task.note_id!)}>From meeting notes</button></>}
        </p>

        <section className="thread" aria-label="Comments">
          <h3>Comments</h3>
          {comments.length === 0 && <p className="muted small">No comments yet. Ask a question or post an update.</p>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <Avatar name={c.author_name} />
              <div><span className="who">{c.author_name}</span> <span className="muted small">{relativeTime(c.created_at)}</span>
                <p className="body">{c.body}</p></div>
            </div>
          ))}
          <form className="split" onSubmit={comment}>
            <label className="sr-only" htmlFor="reply">Add a comment</label>
            <textarea id="reply" className="textarea" style={{ minHeight: 64 }} value={reply} maxLength={5000}
              onChange={(e) => setReply(e.target.value)} placeholder="Write a comment…"
              onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && comment(e)} />
            <button className="btn small primary" disabled={!reply.trim()} style={{ justifySelf: 'start' }}>Post comment</button>
          </form>
        </section>

        <section aria-label="History">
          <h3>History</h3>
          <ul className="history">
            {history.slice().reverse().map((a) => (
              <li key={a.id}><b>{a.actor_name}</b> {activityText(a, names)} · {relativeTime(a.created_at)}</li>
            ))}
          </ul>
        </section>

        {canDelete && <button className="btn danger small" style={{ justifySelf: 'start' }} onClick={remove}>Delete task</button>}
      </aside>
    </>
  );
}
