import type { Activity, Member, Priority, Status, Task } from '../types';

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];
export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const statusLabel = (s: string) => STATUSES.find((x) => x.id === s)?.label ?? s;
export const priorityLabel = (p: string) => PRIORITIES.find((x) => x.id === p)?.label ?? p;

/** Local calendar date as YYYY-MM-DD (not UTC: 11pm in India is still today). */
export function isoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [a, b] = [fromIso, toIso].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

export type DueTone = 'overdue' | 'soon' | 'later' | 'done';

export function dueInfo(task: Pick<Task, 'due_date' | 'status'>, today: string): { label: string; tone: DueTone } | null {
  if (!task.due_date) return null;
  const days = daysBetween(today, task.due_date);
  const [y, m, d] = task.due_date.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (task.status === 'done') return { label: date, tone: 'done' };
  if (days < 0) return { label: days === -1 ? 'Yesterday' : `${-days} days late`, tone: 'overdue' };
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days < 7) return { label: new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short' }), tone: 'later' };
  return { label: date, tone: 'later' };
}

export interface Filters {
  query: string; assignee: 'all' | 'me' | 'none' | number; priority: 'all' | Priority;
  role: string; // '' for any, or a job role such as "Developer": tasks assigned to people with that role
}
export const NO_FILTERS: Filters = { query: '', assignee: 'all', priority: 'all', role: '' };

/** Search covers the key, title, details and the names of the assignee and the reporter. */
export function filterTasks(tasks: Task[], f: Filters, me: number, members: Member[] = []): Task[] {
  const q = f.query.trim().toLowerCase();
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const role = f.role.trim().toLowerCase();
  return tasks.filter((t) => {
    const assignee = t.assignee_id === null ? undefined : byId.get(t.assignee_id);
    const people = `${assignee?.name ?? ''} ${byId.get(t.reporter_id)?.name ?? ''}`;
    if (q && !`${t.key} ${t.title} ${t.description} ${people}`.toLowerCase().includes(q)) return false;
    if (f.assignee === 'me' && t.assignee_id !== me) return false;
    if (f.assignee === 'none' && t.assignee_id !== null) return false;
    if (typeof f.assignee === 'number' && t.assignee_id !== f.assignee) return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (role && assignee?.job_title?.trim().toLowerCase() !== role) return false;
    return true;
  });
}

export const JOB_SUGGESTIONS = ['Manager', 'Team lead', 'Developer', 'QA', 'Design', 'BDA', 'Sales', 'Marketing', 'Operations'];

/** The job roles people in this team actually have, for the Role filter (case-insensitive, first spelling wins). */
export function jobRoles(members: Member[]): string[] {
  const seen = new Map<string, string>();
  for (const m of members) {
    const title = m.job_title?.trim();
    if (title && !seen.has(title.toLowerCase())) seen.set(title.toLowerCase(), title);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Most urgent first, then soonest due (no due date last), then newest. */
export function byUrgency(a: Task, b: Task): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || b.number - a.number;
}

export type SortKey = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'due';

export function sortTasks(tasks: Task[], key: SortKey, dir: 1 | -1, names: Map<number, string>): Task[] {
  const order = STATUSES.map((s) => s.id);
  const value = (t: Task): string | number => {
    switch (key) {
      case 'key': return t.number;
      case 'title': return t.title.toLowerCase();
      case 'status': return order.indexOf(t.status);
      case 'priority': return PRIORITY_RANK[t.priority];
      case 'assignee': return t.assignee_id === null ? '￿' : (names.get(t.assignee_id) ?? '').toLowerCase();
      case 'due': return t.due_date ?? '9999-99-99';
    }
  };
  return [...tasks].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    return (x < y ? -1 : x > y ? 1 : 0) * dir || b.number - a.number;
  });
}

export interface MyGroups {
  overdue: Task[]; today: Task[]; week: Task[]; later: Task[]; undated: Task[];
  waiting: Task[]; doneRecently: Task[];
}

/** "My tasks": what is assigned to me by due date, plus what I asked others for. */
export function groupMine(tasks: Task[], me: number, today: string): MyGroups {
  const g: MyGroups = { overdue: [], today: [], week: [], later: [], undated: [], waiting: [], doneRecently: [] };
  for (const t of tasks) {
    if (t.status === 'done') {
      if (t.assignee_id === me && daysBetween(isoDate(new Date(t.updated_at)), today) <= 7) g.doneRecently.push(t);
      continue;
    }
    if (t.assignee_id !== me) {
      if (t.reporter_id === me && t.assignee_id !== null) g.waiting.push(t);
      continue;
    }
    if (!t.due_date) g.undated.push(t);
    else {
      const days = daysBetween(today, t.due_date);
      (days < 0 ? g.overdue : days === 0 ? g.today : days <= 7 ? g.week : g.later).push(t);
    }
  }
  for (const list of Object.values(g)) list.sort(byUrgency);
  return g;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function memberNames(members: Member[]): Map<number, string> {
  return new Map(members.map((m) => [m.user_id, m.name]));
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One history row as a sentence, e.g. "moved it from To do to Done". */
export function activityText(a: Activity, names: Map<number, string>): string {
  const person = (id: string | null) => (id === null ? 'nobody' : names.get(Number(id)) ?? 'a former member');
  switch (a.field) {
    case 'created': return 'created the task';
    case 'status': return `moved it from ${statusLabel(a.old ?? '')} to ${statusLabel(a.new ?? '')}`;
    case 'priority': return `changed priority from ${priorityLabel(a.old ?? '')} to ${priorityLabel(a.new ?? '')}`;
    case 'assignee_id':
      return a.new === null ? `unassigned ${person(a.old)}` : `assigned it to ${person(a.new)}`;
    case 'due_date': return a.new === null ? 'removed the due date' : `set the due date to ${a.new}`;
    case 'title': return `renamed it to “${a.new}”`;
    case 'description': return 'edited the description';
    default: return `changed ${a.field}`;
  }
}

/* Pickers write the same shortcuts people can type (@name, !high, due:2026-11-20) into the task line,
   so the server's parser stays the one place that reads them. Patterns mirror backend/app/notes.py. */
export type PickKind = 'who' | 'priority' | 'due';
const TOKENS: Record<PickKind, RegExp> = {
  who: /(?<!\S)@[\w.-]+/g,
  priority: /(?<!\S)!(?:low|medium|med|high|urgent)\b/gi,
  due: /(?<!\S)due:\S+/gi,
};

/** Replace every token of one kind in a line with `token`, or remove them when `token` is null. */
export function setToken(line: string, kind: PickKind, token: string | null): string {
  const lead = /^\s*/.exec(line)?.[0] ?? '';
  const rest = line.slice(lead.length).replace(TOKENS[kind], '').replace(/[ \t]{2,}/g, ' ').trimEnd();
  return lead + (token ? `${rest} ${token}` : rest);
}

/** The shortest @mention that the server resolves to exactly this member. */
export function mentionFor(member: Member, members: Member[]): string {
  const names = (m: Member) => [
    m.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '',
    m.name.toLowerCase().replace(/\s+/g, ''),
    m.email.split('@')[0].toLowerCase(),
  ];
  const mine = names(member);
  const unique = mine.find((c) => /^[\w.-]+$/.test(c) && !members.some((o) => o.user_id !== member.user_id && names(o).includes(c)));
  return `@${unique ?? mine[2]}`;
}

/** The token a picker choice writes: medium priority, nobody and no date write nothing. */
export function pickToken(kind: PickKind, value: string | number | null, members: Member[]): string | null {
  if (value === null || value === '') return null;
  if (kind === 'priority') return value === 'medium' ? null : `!${value}`;
  if (kind === 'due') return `due:${value}`;
  const member = members.find((m) => m.user_id === value);
  return member ? mentionFor(member, members) : null;
}
