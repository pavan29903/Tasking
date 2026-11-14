import { describe, expect, it } from 'vitest';
import type { Activity, Task } from '../types';
import {
  activityText, byUrgency, daysBetween, dueInfo, filterTasks, groupMine, initials, isoDate, NO_FILTERS,
  jobRoles, mentionFor, pickToken, relativeTime, setToken, sortTasks,
} from './tasks';

const TODAY = '2026-11-09'; // a Monday
let n = 0;
function task(over: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: n, key: `SRC-${n}`, number: n, team_id: 1, title: `Task ${n}`, description: '', status: 'todo',
    priority: 'medium', assignee_id: null, reporter_id: 1, due_date: null, note_id: null, planned_on: null, comment_count: 0,
    created_at: '2026-11-01T10:00:00+00:00', updated_at: '2026-11-08T10:00:00+00:00', ...over,
  };
}

describe('dates', () => {
  it('isoDate uses the local calendar day', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('daysBetween across month and year ends', () => {
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-09', '2026-11-02')).toBe(-7);
  });
  it.each([
    [null, 'todo', null],
    ['2026-11-08', 'todo', { label: 'Yesterday', tone: 'overdue' }],
    ['2026-11-01', 'in_progress', { label: '8 days late', tone: 'overdue' }],
    ['2026-11-09', 'todo', { label: 'Today', tone: 'soon' }],
    ['2026-11-10', 'todo', { label: 'Tomorrow', tone: 'soon' }],
    ['2026-11-01', 'done', { tone: 'done' }], // a finished task is never "late"
  ])('dueInfo(%s, %s)', (due, status, expected) => {
    const info = dueInfo({ due_date: due as string | null, status: status as Task['status'] }, TODAY);
    if (expected === null) expect(info).toBeNull();
    else expect(info).toMatchObject(expected);
  });
  it('relativeTime', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(relativeTime('2026-11-09T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-09T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-11-09T07:00:00Z', now)).toBe('5 h ago');
    expect(relativeTime('2026-11-08T11:00:00Z', now)).toBe('yesterday');
  });
});

describe('filter and sort', () => {
  const a = task({ title: 'Fix LOGIN bug', assignee_id: 2, priority: 'urgent' });
  const b = task({ description: 'about login', assignee_id: null, priority: 'low', due_date: '2026-11-10' });
  const c = task({ title: 'Deck', assignee_id: 3, priority: 'low', due_date: '2026-11-09' });
  const all = [a, b, c];

  it('searches key, title and description, case-insensitively', () => {
    expect(filterTasks(all, { ...NO_FILTERS, query: 'login' }, 2)).toEqual([a, b]);
    expect(filterTasks(all, { ...NO_FILTERS, query: c.key.toLowerCase() }, 2)).toEqual([c]);
    expect(filterTasks(all, { ...NO_FILTERS, query: '   ' }, 2)).toEqual(all);
  });
  it('filters by assignee and priority', () => {
    expect(filterTasks(all, { ...NO_FILTERS, assignee: 'me' }, 2)).toEqual([a]);
    expect(filterTasks(all, { ...NO_FILTERS, assignee: 'none' }, 2)).toEqual([b]);
    expect(filterTasks(all, { ...NO_FILTERS, assignee: 3 }, 2)).toEqual([c]);
    expect(filterTasks(all, { ...NO_FILTERS, priority: 'low' }, 2)).toEqual([b, c]);
  });
  it('byUrgency: priority, then due date with undated last', () => {
    const d = task({ priority: 'low' });
    expect([d, b, c, a].sort(byUrgency)).toEqual([a, c, b, d]);
  });
  it('sortTasks by assignee puts unassigned last in both directions only when ascending', () => {
    const names = new Map([[2, 'Zara'], [3, 'Anil']]);
    expect(sortTasks(all, 'assignee', 1, names)).toEqual([c, a, b]);
    expect(sortTasks(all, 'due', 1, names)).toEqual([c, b, a]);
    expect(sortTasks(all, 'key', -1, names)).toEqual([c, b, a]);
  });
});

describe('groupMine', () => {
  it('buckets my open work by due date and lists what I am waiting on', () => {
    const me = 7;
    const overdue = task({ assignee_id: me, due_date: '2026-11-01' });
    const today = task({ assignee_id: me, due_date: TODAY });
    const week = task({ assignee_id: me, due_date: '2026-11-16' });
    const later = task({ assignee_id: me, due_date: '2026-12-25' });
    const undated = task({ assignee_id: me });
    const waiting = task({ reporter_id: me, assignee_id: 9 });
    const unassignedByMe = task({ reporter_id: me });
    const doneRecently = task({ assignee_id: me, status: 'done', updated_at: '2026-11-08T10:00:00Z' });
    const doneLongAgo = task({ assignee_id: me, status: 'done', updated_at: '2026-09-01T10:00:00Z' });
    const g = groupMine([overdue, today, week, later, undated, waiting, unassignedByMe, doneRecently, doneLongAgo, task()], me, TODAY);
    expect(g).toEqual({
      overdue: [overdue], today: [today], week: [week], later: [later], undated: [undated],
      waiting: [waiting], doneRecently: [doneRecently], leftover: [], onToday: [],
    });
  });

  it("moves tasks on today's list out, and brings unfinished ones from earlier days back on top", () => {
    const me = 7;
    const onToday = task({ assignee_id: me, planned_on: TODAY, due_date: TODAY });
    const doneToday = task({ assignee_id: me, planned_on: TODAY, status: 'done', updated_at: '2026-11-09T10:00:00Z' });
    const fromFriday = task({ assignee_id: me, planned_on: '2026-11-06', status: 'in_progress', due_date: '2026-12-25' });
    const doneFriday = task({ assignee_id: me, planned_on: '2026-11-06', status: 'done', updated_at: '2026-11-06T10:00:00Z' });
    const someoneElses = task({ assignee_id: 9, planned_on: TODAY });
    const g = groupMine([onToday, doneToday, fromFriday, doneFriday, someoneElses], me, TODAY);
    expect(g.onToday).toEqual([onToday]);
    expect(g.today).toEqual([]); // due today, but it is on the Today list instead
    expect(g.leftover).toEqual([fromFriday]);
    expect(g.later).toEqual([]); // shown once, as leftover, not again by due date
    expect(g.doneRecently).toEqual([doneToday, doneFriday].sort(byUrgency)); // done stays done
  });
});

describe('text helpers', () => {
  it.each([['Pavan Kumar', 'PK'], ['meera', 'M'], ['  Ravi  S  Iyer ', 'RI'], ['', '?']])('initials(%s)', (name, out) => {
    expect(initials(name)).toBe(out);
  });
  const names = new Map([[2, 'Ravi']]);
  const row = (field: string, old: string | null, nw: string | null): Activity =>
    ({ id: 1, actor_id: 1, actor_name: 'Meera', field, old, new: nw, created_at: '' });
  it.each([
    [row('created', null, 'x'), 'created the task'],
    [row('status', 'todo', 'done'), 'moved it from To do to Done'],
    [row('priority', 'low', 'urgent'), 'changed priority from Low to Urgent'],
    [row('assignee_id', null, '2'), 'assigned it to Ravi'],
    [row('assignee_id', '2', null), 'unassigned Ravi'],
    [row('assignee_id', null, '99'), 'assigned it to a former member'],
    [row('due_date', null, '2026-11-20'), 'set the due date to 2026-11-20'],
    [row('planned_on', null, '2026-11-14'), "put it on Today's tasks for 2026-11-14"],
    [row('planned_on', '2026-11-14', null), 'moved it back to My tasks'],
    [row('due_date', '2026-11-20', null), 'removed the due date'],
    [row('description', null, null), 'edited the description'],
  ])('activityText %#', (a, text) => {
    expect(activityText(a, names)).toBe(text);
  });
});

describe('pickers write shortcuts', () => {
  const ravi = { user_id: 1, name: 'Ravi Kumar', email: 'ravi.k@x.in', role: 'member' as const };
  const ravi2 = { user_id: 2, name: 'Ravi Shah', email: 'rshah@x.in', role: 'member' as const };
  const meera = { user_id: 3, name: 'Meera', email: 'meera@x.in', role: 'owner' as const };

  it.each([
    ['[ ] Send deck', 'priority', '!high', '[ ] Send deck !high'],
    ['[ ] Send deck !low', 'priority', '!urgent', '[ ] Send deck !urgent'],
    ['[ ] Send !high deck !low', 'priority', null, '[ ] Send deck'],
    ['  - [ ] Send deck due:fri', 'due', 'due:2026-11-20', '  - [ ] Send deck due:2026-11-20'],
    ['todo: Ask @ravi about it', 'who', '@meera', 'todo: Ask about it @meera'],
    ['[ ] Mail ravi@x.in the file', 'who', '@meera', '[ ] Mail ravi@x.in the file @meera'],
    ['[ ] Book room!high soon', 'priority', null, '[ ] Book room!high soon'],
    ['Plain quick-add text   ', 'due', null, 'Plain quick-add text'],
  ] as const)('%s + %s %s', (line, kind, token, want) => {
    expect(setToken(line, kind, token)).toBe(want);
  });

  it('mentions the shortest name the server resolves to one person', () => {
    expect(mentionFor(meera, [ravi, meera])).toBe('@meera');
    expect(mentionFor(ravi, [ravi, meera])).toBe('@ravi');
    expect(mentionFor(ravi, [ravi, ravi2, meera])).toBe('@ravikumar');
    expect(mentionFor(ravi2, [ravi, ravi2, meera])).toBe('@ravishah');
  });

  it('turns choices into tokens', () => {
    expect(pickToken('priority', 'medium', [])).toBeNull();
    expect(pickToken('priority', 'urgent', [])).toBe('!urgent');
    expect(pickToken('due', '2026-11-20', [])).toBe('due:2026-11-20');
    expect(pickToken('due', '', [])).toBeNull();
    expect(pickToken('who', null, [meera])).toBeNull();
    expect(pickToken('who', 3, [meera])).toBe('@meera');
    expect(pickToken('who', 99, [meera])).toBeNull();
  });
});

describe('people and job roles', () => {
  const people = [
    { user_id: 1, name: 'Meera Lead', email: 'm@x.in', role: 'owner' as const, job_title: 'Manager' },
    { user_id: 2, name: 'Ravi Kumar', email: 'r@x.in', role: 'member' as const, job_title: 'Developer' },
    { user_id: 3, name: 'Sana Iyer', email: 's@x.in', role: 'member' as const, job_title: ' developer ' },
    { user_id: 4, name: 'Anil Rao', email: 'a@x.in', role: 'member' as const, job_title: 'BDA' },
    { user_id: 5, name: 'New Joiner', email: 'n@x.in', role: 'member' as const, job_title: null },
  ];
  const api = task({ title: 'Fix API', assignee_id: 2, reporter_id: 1 });
  const ui = task({ title: 'Fix UI', assignee_id: 3, reporter_id: 2 });
  const lead = task({ title: 'Call Acme', assignee_id: 4, reporter_id: 1 });
  const open = task({ title: 'Unowned', assignee_id: null, reporter_id: 5 });
  const gone = task({ title: 'Left the team', assignee_id: 99, reporter_id: 99 });
  const all = [api, ui, lead, open, gone];

  it('search finds tasks by the assignee or reporter name', () => {
    expect(filterTasks(all, { ...NO_FILTERS, query: 'ravi' }, 1, people)).toEqual([api, ui]); // assignee, reporter
    expect(filterTasks(all, { ...NO_FILTERS, query: 'Anil Rao' }, 1, people)).toEqual([lead]);
    expect(filterTasks(all, { ...NO_FILTERS, query: 'joiner' }, 1, people)).toEqual([open]);
    expect(filterTasks(all, { ...NO_FILTERS, query: 'ravi' }, 1)).toEqual([]); // no member list: names unknown
  });
  it('role filter matches the assignee job role, ignoring case and spaces', () => {
    expect(filterTasks(all, { ...NO_FILTERS, role: 'Developer' }, 1, people)).toEqual([api, ui]);
    expect(filterTasks(all, { ...NO_FILTERS, role: 'bda' }, 1, people)).toEqual([lead]);
    expect(filterTasks(all, { ...NO_FILTERS, role: 'Manager' }, 1, people)).toEqual([]); // reporter's role doesn't count
    expect(filterTasks(all, { ...NO_FILTERS, role: '' }, 1, people)).toEqual(all);
  });
  it('combines role with other filters', () => {
    expect(filterTasks(all, { ...NO_FILTERS, role: 'Developer', query: 'ui' }, 1, people)).toEqual([ui]);
    expect(filterTasks(all, { ...NO_FILTERS, role: 'Developer', assignee: 2 }, 1, people)).toEqual([api]);
  });
  it('lists each job role once, sorted, skipping people without one', () => {
    expect(jobRoles(people)).toEqual(['BDA', 'Developer', 'Manager']);
    expect(jobRoles([])).toEqual([]);
  });
});
