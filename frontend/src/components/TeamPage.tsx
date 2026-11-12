import { api } from '../api';
import type { Member, Team, User } from '../types';
import { Avatar, errorText } from './bits';
import { TeamForms } from './TeamGate';

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
          <div className="members">
            {members.map((m) => (
              <div key={m.user_id} className="member">
                <Avatar name={m.name} />
                <span className="who"><b>{m.name}{m.user_id === me.id ? ' (you)' : ''}</b><span>{m.email} · {m.role === 'owner' ? 'Owner' : 'Member'}</span></span>
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
