import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { clock, meetingDays, meetingState, safeLink } from '../lib/meetings';
import type { Meeting, MyMeetings, Note } from '../types';
import { errorText } from './bits';

function minutesText(m: Meeting): string | null {
  const min = Math.round((Date.parse(m.ends_at) - Date.parse(m.starts_at)) / 60_000);
  if (min <= 0) return null;
  return min < 60 ? `${min} min` : `${+(min / 60).toFixed(1)} h`;
}

function Slot({ m, now, hasNotes, onTakeNotes }: { m: Meeting; now: Date; hasNotes: boolean; onTakeNotes: (m: Meeting) => void }) {
  const state = meetingState(m, now);
  const link = safeLink(m.link);
  const startsIn = Math.max(1, Math.round((Date.parse(m.starts_at) - now.getTime()) / 60_000));
  const bits = [
    state === 'now' ? 'Now' : state === 'soon' ? `In ${startsIn} min` : null,
    hasNotes ? 'Notes ✓' : null,
    minutesText(m),
    m.attendees.length > 1 ? `${m.attendees.length} people` : null,
  ].filter(Boolean);
  return (
    <div className={`slot ${state}`}>
      <button className="slot-main" onClick={() => onTakeNotes(m)} title={m.title}
        aria-label={`${hasNotes ? 'Open notes for' : 'Take notes for'} ${m.title}, ${clock(m.starts_at)}`}>
        <span className="slot-time">{clock(m.starts_at)}</span>
        <span className="slot-body">
          <b>{m.title}</b>
          {bits.length > 0 && <span className={state === 'now' || state === 'soon' ? 'live' : undefined}>{bits.join(' · ')}</span>}
        </span>
      </button>
      {link && state !== 'done' && (
        <a className={`btn small${state === 'now' || state === 'soon' ? ' primary' : ''}`} href={link} target="_blank" rel="noopener noreferrer"
          aria-label={`Join ${m.title}`}>Join</a>
      )}
    </div>
  );
}

function Connect({ onConnected, toast }: { onConnected: (x: MyMeetings) => void; toast: (msg: string, bad?: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onConnected(await api.connectCalendar(url));
      toast('Calendar connected');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div className="connect">
        <p className="small muted">See today's meetings here and join them in one click.</p>
        <button className="btn small" onClick={() => setOpen(true)}>Connect Google Calendar</button>
      </div>
    );
  }
  return (
    <form className="connect" onSubmit={submit}>
      <ol className="steps">
        <li>Open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">Google Calendar settings</a> on a computer.</li>
        <li>Under <b>Settings for my calendars</b>, click your calendar.</li>
        <li>In <b>Integrate calendar</b>, copy the <b>Secret address in iCal format</b>.</li>
      </ol>
      <label className="sr-only" htmlFor="cal-url">Secret address in iCal format</label>
      <input id="cal-url" className="input" type="url" required autoFocus value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://calendar.google.com/calendar/ical/…" />
      {error && <p className="error small" role="alert">{error}</p>}
      <span className="filters">
        <button className="btn small primary" disabled={busy || !url.trim()}>{busy ? 'Checking…' : 'Connect'}</button>
        <button type="button" className="btn small ghost" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </span>
      <p className="small muted">Only you see your calendar. Notes you take are shared with your team.</p>
    </form>
  );
}

/** Your upcoming meetings from your own calendar, with Join and Take-notes. */
export function Agenda({ data, now, notes, onTakeNotes, onChange, onRefresh, toast }: {
  data: MyMeetings | null; now: Date; notes: Note[]; onTakeNotes: (m: Meeting) => void;
  onChange: (x: MyMeetings) => void; onRefresh: () => void; toast: (msg: string, bad?: boolean) => void;
}) {
  const days = data?.connected ? meetingDays(data.meetings, now) : [];
  const noted = new Set(notes.map((n) => n.event_id).filter(Boolean));

  async function disconnect() {
    if (!window.confirm('Disconnect your calendar? Notes you already took stay.')) return;
    try { await api.disconnectCalendar(); onChange({ connected: false, error: null, meetings: [] }); } catch (e) { toast(errorText(e), true); }
  }

  return (
    <section className="cal" aria-label="Your meetings">
      <div className="side-head">
        <h3>Your meetings</h3>
        {data?.connected && <button className="btn ghost small" onClick={onRefresh}>Refresh</button>}
      </div>
      {data === null && <p className="small muted">Loading…</p>}
      {data && !data.connected && <Connect onConnected={onChange} toast={toast} />}
      {data?.error && <p className="notice small" role="status">{data.error}</p>}
      {data?.connected && !data.error && days.length === 0 && <p className="small muted">Nothing on your calendar this week.</p>}
      {days.map((d) => (
        <div key={d.day} className="cal-day">
          <h4>{d.label}</h4>
          {d.items.map((m) => <Slot key={m.id} m={m} now={now} hasNotes={noted.has(m.id)} onTakeNotes={onTakeNotes} />)}
        </div>
      ))}
      {data?.connected && <button className="linkish small" onClick={disconnect}>Disconnect calendar</button>}
    </section>
  );
}
