import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Team } from '../types';
import { errorText } from './bits';

/** Create a team or join one with an invite code. */
export function TeamForms({ onReady, initialCode = '' }: { onReady: (t: Team) => void; initialCode?: string }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<Team>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { onReady(await fn()); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <div className="split">
      <form className="split" onSubmit={run(() => api.joinTeam(code))}>
        <h2>Join your team</h2>
        <label className="field"><span>Invite code from your lead or manager</span>
          <input className="input key-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. K7MP2QXA" required />
        </label>
        <button className="btn primary" disabled={busy || !code.trim()}>Join team</button>
      </form>
      <div className="or">or</div>
      <form className="split" onSubmit={run(() => api.createTeam(name, key.trim() || undefined))}>
        <h2>Start a new team</h2>
        <label className="field"><span>Team name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Search team" required maxLength={80} />
        </label>
        <label className="field"><span>Task prefix (optional, 2–6 letters)</span>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="SRC → SRC-1, SRC-2…" maxLength={6} />
        </label>
        <button className="btn" disabled={busy || !name.trim()}>Create team</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function TeamGate({ onReady, initialCode, onSignOut }: { onReady: (t: Team) => void; initialCode?: string; onSignOut: () => void }) {
  return (
    <div className="center">
      <div className="panel sheet">
        <p className="muted">Tasks live in a team, shared by you and the people you work with.</p>
        <TeamForms onReady={onReady} initialCode={initialCode} />
        <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
