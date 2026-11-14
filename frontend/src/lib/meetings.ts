import type { Meeting, Note } from '../types';
import { daysBetween, isoDate } from './tasks';

export type MeetingState = 'done' | 'now' | 'soon' | 'later';
const SOON_MS = 15 * 60_000;

/** Ended, happening now, starting within 15 minutes, or later. */
export function meetingState(m: Pick<Meeting, 'starts_at' | 'ends_at'>, now: Date): MeetingState {
  const start = Date.parse(m.starts_at);
  const end = Math.max(Date.parse(m.ends_at), start + 60_000); // a meeting with no end time is "now" for a minute
  const t = now.getTime();
  if (t >= end) return 'done';
  if (t >= start) return 'now';
  return start - t <= SOON_MS ? 'soon' : 'later';
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Today, Tomorrow, Yesterday, or "Mon 16 Nov". */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export interface Day<T> { day: string; label: string; items: T[] }

/** Meetings by local day, from today for `days` days. Earlier ones today stay (to write notes afterwards). */
export function meetingDays(meetings: Meeting[], now: Date, days = 7): Day<Meeting>[] {
  const today = isoDate(now);
  const out: Day<Meeting>[] = [];
  for (const m of meetings) {
    const day = isoDate(new Date(m.starts_at));
    const ahead = daysBetween(today, day);
    if (ahead < 0 || ahead >= days) continue;
    let group = out.find((g) => g.day === day);
    if (!group) out.push((group = { day, label: dayLabel(day, today), items: [] }));
    group.items.push(m);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Notes newest first, under "Upcoming", "This week", "Last week", then month names. */
export function noteGroups(notes: Note[], today: string): { label: string; items: Note[] }[] {
  const label = (n: Note) => {
    if (!n.meeting_date) return 'No date';
    const ago = daysBetween(n.meeting_date, today);
    if (ago < 0) return 'Upcoming';
    if (ago < 7) return 'This week';
    if (ago < 14) return 'Last week';
    const [y, m] = n.meeting_date.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  const sorted = [...notes].sort((a, b) =>
    (b.meeting_date ?? '').localeCompare(a.meeting_date ?? '') || (b.starts_at ?? '').localeCompare(a.starts_at ?? '')
    || b.updated_at.localeCompare(a.updated_at));
  const out: { label: string; items: Note[] }[] = [];
  for (const n of sorted) {
    const l = label(n);
    const group = out.find((g) => g.label === l);
    if (group) group.items.push(n); else out.push({ label: l, items: [n] });
  }
  return out;
}

/** Only real web links become clickable. */
export const safeLink = (link: string | null | undefined): string | null =>
  link && /^https?:\/\/\S+$/i.test(link) ? link : null;
