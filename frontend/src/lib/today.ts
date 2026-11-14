import type { DailyUpdate, Task } from '../types';

/** "tasking-backend,  auth , Auth" -> ["tasking-backend", "auth"] */
export function parseAreas(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const area = raw.trim().replace(/\s+/g, ' ');
    if (area && !out.some((a) => a.toLowerCase() === area.toLowerCase())) out.push(area);
  }
  return out;
}

export interface Overlap { area: string; userIds: number[] }

/** Repos or areas that more than one person named for the same day: the "don't both push there" warning. */
export function overlaps(updates: DailyUpdate[]): Overlap[] {
  const byKey = new Map<string, Overlap>();
  for (const u of updates) {
    for (const area of u.areas) {
      const key = area.trim().toLowerCase();
      const o = byKey.get(key) ?? { area, userIds: [] };
      if (!o.userIds.includes(u.user_id)) o.userIds.push(u.user_id);
      byKey.set(key, o);
    }
  }
  return [...byKey.values()].filter((o) => o.userIds.length > 1).sort((a, b) => a.area.localeCompare(b.area));
}

/** "You and Ravi", "Meera, Ravi and Pavan" */
export function peopleText(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Someone's tasks that are on the go right now: in progress first, then blocked. */
export function activeTasks(tasks: Task[], userId: number): Task[] {
  const rank = { in_progress: 0, blocked: 1 } as Record<string, number>;
  return tasks.filter((t) => t.assignee_id === userId && t.status in rank)
    .sort((a, b) => rank[a.status] - rank[b.status] || b.number - a.number);
}

/** What someone put on their Today list for `day`: unfinished first (in progress, to do, blocked), then done. */
export function plannedTasks(tasks: Task[], userId: number, day: string): Task[] {
  const rank = { in_progress: 0, todo: 1, blocked: 2, done: 3 } as Record<string, number>;
  return tasks.filter((t) => t.assignee_id === userId && t.planned_on === day)
    .sort((a, b) => rank[a.status] - rank[b.status] || b.number - a.number);
}

/** Tasks on a teammate's card: their Today list, plus (today only) anything else they have on the go. */
export function cardTasks(tasks: Task[], userId: number, day: string, isToday: boolean): Task[] {
  const planned = plannedTasks(tasks, userId, day);
  if (!isToday) return planned;
  return [...planned, ...activeTasks(tasks, userId).filter((t) => t.planned_on !== day)];
}

/** My open tasks that could go on today's list: in progress first, then by urgency order of the list. */
export function pickable(tasks: Task[], userId: number, day: string): Task[] {
  return activeTasks(tasks, userId).concat(tasks.filter((t) => t.assignee_id === userId && t.status === 'todo'))
    .filter((t) => t.planned_on !== day);
}
