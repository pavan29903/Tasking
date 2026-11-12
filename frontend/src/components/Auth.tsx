import { useState, type FormEvent } from 'react';
import { api, session } from '../api';
import type { User } from '../types';
import { errorText, Logo } from './bits';

export function Auth({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joining = new URLSearchParams(window.location.search).has('join');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = mode === 'signin' ? await api.login(email, password) : await api.register(name, email, password);
      session.set(res.token);
      onSignedIn(res.user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="panel sheet" onSubmit={submit}>
        <div className="brand"><Logo size={28} /> Tasking</div>
        <p className="muted">
          {joining ? 'You were invited to a team. Sign in or create an account to join it.'
            : 'One shared list for what you agreed in meetings: who does what, by when.'}
        </p>
        <div className="tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>Create account</button>
        </div>
        {mode === 'register' && (
          <label className="field"><span>Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label className="field"><span>Work email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field"><span>Password{mode === 'register' && ' (8 or more characters)'}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
    </div>
  );
}
