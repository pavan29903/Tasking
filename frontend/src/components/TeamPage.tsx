import { useEffect, useState } from 'react';
import { api } from '../api';
import { JOB_SUGGESTIONS, jobRoles } from '../lib/tasks';
import type { Member, Team, User } from '../types';
import { Avatar, errorText } from './bits';
import { TeamForms } from './TeamGate';

/** What someone does in the team (Developer, BDA…). Editable by that person and by the owner. */
function JobRole({ teamId, member, editable, onSaved, toast }: {
  teamId: number; member: Member; editable: boolean; onSaved: () => void; toast: (msg: string, bad?: boolean) => void;
}) {
  const saved = member.job_title ?? '';
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);

  async function save() {
    const next = value.trim().replace(/\s+/g, ' ');
    if (next === saved) { setValue(saved); return; }
    try {
      await api.setJobTitle(teamId, member.user_id, next || null);
      onSaved();
      toast(next ? `${member.name}: ${next}` : `Removed ${member.name}'s role`);
    } catch (e) {
      setValue(saved);
      toast(errorText(e), true);
    }
  }

  if (!editable) return saved ? <span className="chip job">{saved}</span> : null;
  return (
    <input className="input job" list="job-roles" maxLength={40} value={value} aria-label={`Role of ${member.name}`}
      placeholder="Add role, e.g. Developer" onChange={(e) => setValue(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setValue(saved); } }} />
  );
}

// Public address of the web app, used in invite links. Placeholder until you deploy.
const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');

export function TeamPage({ team, members, me, onTeamUpdated, onMembersChanged, onLeft, onTeamReady, toast }: {
  team: Team; members: Member[]; me: User;
  onTeamUpdated: (t: Team) => void; onMembersChanged: () => void; onLeft: () => void; onTeamReady: (t: Team) => void;
  toast: (msg: string, bad?: boolean) => void;
}) {
  const link = `${APP_URL}/?join=${team.invite_code}`;
  const owner = team.role === 'owner';

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast(`Copy failed. Select the ${what.toLowerCase()} and copy it.`, true); }
  };

  async function rotate() {
    if (!window.confirm('Make a new invite code? The old code and link stop working.')) return;
    try { onTeamUpdated(await api.rotateInvite(team.id)); toast('New invite code ready'); } catch (e) { toast(errorText(e), true); }
  }

  async function remove(m: Member) {
    const self = m.user_id === me.id;
    if (!window.confirm(self ? `Leave ${team.name}? You will lose access to its tasks.` : `Remove ${m.name} from ${team.name}? Their open tasks become unassigned.`)) return;
    try {
      await api.removeMember(team.id, m.user_id);
      if (self) onLeft(); else { onMembersChanged(); toast(`Removed ${m.name}`); }
    } catch (e) { toast(errorText(e), true); }
  }

  return (
    <div className="team-grid">
      <div className="split">
        <section className="sheet invite">
          <h3>Invite people</h3>
          <p className="muted small">Share this code or link with your lead, manager or teammates. Anyone with it can join.</p>
          <span className="code" aria-label="Invite code">{team.invite_code}</span>
          <span className="filters">
            <button className="btn small primary" onClick={() => copy(team.invite_code, 'Code')}>Copy code</button>
            <button className="btn small" onClick={() => copy(link, 'Link')}>Copy invite link</button>
            {owner && <button className="btn small ghost" onClick={rotate}>New code</button>}
          </span>
        </section>
        <section className="sheet">
          <div style={{ padding: '14px 16px 4px' }}><h3>{members.length} member{members.length === 1 ? '' : 's'}</h3></div>
          <p className="muted small" style={{ padding: '0 16px' }}>
            Give everyone a role, like Developer or Sales, to filter the board by role. Set your own; the owner can set anyone's.
          </p>
          <datalist id="job-roles">
            {[...new Set([...jobRoles(members), ...JOB_SUGGESTIONS])].map((r) => <option key={r} value={r} />)}
          </datalist>
          <div className="members">
            {members.map((m) => (
              <div key={m.user_id} className="member">
                <Avatar name={m.name} />
                <span className="who"><b>{m.name}{m.user_id === me.id ? ' (you)' : ''}</b><span>{m.email} · {m.role === 'owner' ? 'Owner' : 'Member'}</span></span>
                <JobRole teamId={team.id} member={m} editable={m.user_id === me.id || owner} onSaved={onMembersChanged} toast={toast} />
                {(m.user_id === me.id || owner) && (
                  <button className="btn ghost small danger" onClick={() => remove(m)}>{m.user_id === me.id ? 'Leave' : 'Remove'}</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="sheet panel" style={{ width: '100%' }}>
        <p className="muted small">In another team too? Join it or start a new one. Switch teams from the top bar.</p>
        <TeamForms onReady={onTeamReady} />
      </section>
    </div>
  );
}
