import { describe, expect, it } from 'vitest';
import type { DailyUpdate, Task } from '../types';
import { activeTasks, overlaps, parseAreas, peopleText, shiftDay } from './today';

const update = (user_id: number, areas: string[]): DailyUpdate =>
  ({ user_id, day: '2026-11-13', text: 'x', areas, updated_at: '2026-11-13T04:00:00Z' });

let n = 0;
const task = (over: Partial<Task>): Task => {
  n += 1;
  return { id: n, key: `SRC-${n}`, number: n, team_id: 1, title: `Task ${n}`, description: '', status: 'todo',
    priority: 'medium', assignee_id: null, reporter_id: 1, due_date: null, note_id: null, comment_count: 0,
    created_at: '2026-11-01T10:00:00+00:00', updated_at: '2026-11-08T10:00:00+00:00', ...over };
};

describe('parseAreas', () => {
  it('splits on commas, tidies spaces, drops blanks and case duplicates', () => {
    expect(parseAreas(' tasking-backend,  auth ,, Auth, mobile   app ')).toEqual(['tasking-backend', 'auth', 'mobile app']);
    expect(parseAreas('')).toEqual([]);
  });
});

describe('overlaps', () => {
  it('finds areas two or more people named, ignoring case', () => {
    expect(overlaps([
      update(1, ['tasking-backend', 'auth']),
      update(2, ['Tasking-Backend']),
      update(3, ['web', 'auth']),
      update(4, ['reports']),
    ])).toEqual([
      { area: 'auth', userIds: [1, 3] },
      { area: 'tasking-backend', userIds: [1, 2] },
    ]);
  });
  it('is empty when nobody overlaps, or one person repeats an area', () => {
    expect(overlaps([update(1, ['api', 'API']), update(2, ['web'])])).toEqual([]);
    expect(overlaps([])).toEqual([]);
  });
});

describe('peopleText', () => {
  it('joins names like a sentence', () => {
    expect(peopleText(['You'])).toBe('You');
    expect(peopleText(['You', 'Ravi'])).toBe('You and Ravi');
    expect(peopleText(['Meera', 'Ravi', 'Pavan'])).toBe('Meera, Ravi and Pavan');
  });
});

describe('shiftDay', () => {
  it('moves across month and year ends', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('activeTasks', () => {
  it("lists someone's in-progress then blocked tasks, newest first", () => {
    const list = [
      task({ assignee_id: 7, status: 'in_progress' }),
      task({ assignee_id: 7, status: 'blocked' }),
      task({ assignee_id: 7, status: 'todo' }),
      task({ assignee_id: 7, status: 'done' }),
      task({ assignee_id: 8, status: 'in_progress' }),
      task({ assignee_id: 7, status: 'in_progress' }),
    ];
    expect(activeTasks(list, 7).map((t) => [t.status, t.number])).toEqual([
      ['in_progress', list[5].number], ['in_progress', list[0].number], ['blocked', list[1].number],
    ]);
  });
});
