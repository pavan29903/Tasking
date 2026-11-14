import { describe, expect, it } from 'vitest';
import type { Meeting, Note } from '../types';
import { dayLabel, meetingDays, meetingState, noteGroups, safeLink } from './meetings';

// local times, so the tests pass in any time zone
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const NOW = new Date(2026, 10, 13, 10, 5); // Fri 13 Nov 2026, 10:05

function meeting(over: Partial<Meeting>): Meeting {
  return { id: Math.random().toString(), title: 'Stand-up', starts_at: at(13, 10), ends_at: at(13, 10, 15), link: null, attendees: [], ...over };
}

function note(over: Partial<Note>): Note {
  return { id: 1, team_id: 1, author_id: 1, title: 'Notes', meeting_date: '2026-11-13', body: '',
    created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z', ...over };
}

describe('meetingState', () => {
  it('knows ended, now, soon and later', () => {
    expect(meetingState(meeting({ starts_at: at(13, 9), ends_at: at(13, 10) }), NOW)).toBe('done');
    expect(meetingState(meeting({}), NOW)).toBe('now');
    expect(meetingState(meeting({ starts_at: at(13, 10, 20), ends_at: at(13, 11) }), NOW)).toBe('soon');
    expect(meetingState(meeting({ starts_at: at(13, 10, 21), ends_at: at(13, 11) }), NOW)).toBe('later');
  });
  it('treats a meeting without an end time as one minute long', () => {
    expect(meetingState(meeting({ starts_at: at(13, 10, 5), ends_at: at(13, 10, 5) }), NOW)).toBe('now');
    expect(meetingState(meeting({ starts_at: at(13, 10, 3), ends_at: at(13, 10, 3) }), NOW)).toBe('done');
  });
});

describe('dayLabel', () => {
  it('names nearby days and dates the rest', () => {
    expect(dayLabel('2026-11-13', '2026-11-13')).toBe('Today');
    expect(dayLabel('2026-11-14', '2026-11-13')).toBe('Tomorrow');
    expect(dayLabel('2026-11-12', '2026-11-13')).toBe('Yesterday');
    expect(dayLabel('2026-11-16', '2026-11-13')).toMatch(/Mon.*16.*Nov/);
  });
});

describe('meetingDays', () => {
  it('groups by local day from today, keeps earlier meetings today, drops yesterday and far ahead', () => {
    const list = [
      meeting({ id: 'y', starts_at: at(12, 16), ends_at: at(12, 17) }),
      meeting({ id: 'early', starts_at: at(13, 8), ends_at: at(13, 9) }),
      meeting({ id: 'now' }),
      meeting({ id: 'mon', starts_at: at(16, 10), ends_at: at(16, 11) }),
      meeting({ id: 'far', starts_at: at(20, 10), ends_at: at(20, 11) }),
    ];
    const days = meetingDays(list, NOW);
    expect(days.map((d) => [d.label, d.items.map((m) => m.id)])).toEqual([
      ['Today', ['early', 'now']],
      [dayLabel('2026-11-16', '2026-11-13'), ['mon']],
    ]);
  });
  it('is empty with no meetings', () => {
    expect(meetingDays([], NOW)).toEqual([]);
  });
});

describe('noteGroups', () => {
  it('groups newest first by week, then by month', () => {
    const groups = noteGroups([
      note({ id: 1, meeting_date: '2026-10-02' }),
      note({ id: 2, meeting_date: '2026-11-13', starts_at: '2026-11-13T04:30:00Z' }),
      note({ id: 3, meeting_date: '2026-11-13', starts_at: '2026-11-13T09:00:00Z' }),
      note({ id: 4, meeting_date: '2026-11-04' }),
      note({ id: 5, meeting_date: null }),
      note({ id: 6, meeting_date: '2026-11-20' }),
    ], '2026-11-13');
    expect(groups.map((g) => [g.label, g.items.map((n) => n.id)])).toEqual([
      ['Upcoming', [6]],
      ['This week', [3, 2]],
      ['Last week', [4]],
      ['October 2026', [1]],
      ['No date', [5]],
    ]);
  });
});

describe('safeLink', () => {
  it('only lets web links through', () => {
    expect(safeLink('https://meet.google.com/abc')).toBe('https://meet.google.com/abc');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});
