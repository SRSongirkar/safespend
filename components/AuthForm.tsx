'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authApi } from '@/lib/client/api';
import Icon from './Icon';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/api') ? next : '/';
}

export default function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = {
    name: mode === 'signup' && !name.trim() ? 'Please enter your name' : null,
    email: !EMAIL.test(email.trim()) ? 'Please enter a valid email address' : null,
    password: mode === 'signup' ? (password.length < 8 ? 'Use at least 8 characters' : null) : !password ? 'Please enter your password' : null,
  };
  const show_ = (k: keyof typeof errors) => (touched[k] ? errors[k] : null);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setTouched({ name: true, email: true, password: true });
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    if (!creds && (errors.name || errors.email || errors.password)) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await authApi.login(em, pw);
      else await authApi.signup(name.trim(), em, pw);
      window.location.assign(safeNext(next));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const useDemo = () => {
    setEmail('aisha@demo.com');
    setPassword('demo1234');
    void submit(undefined, { email: 'aisha@demo.com', password: 'demo1234' });
  };

  return (
    <div className="auth-card">
      <div>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your private space'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {mode === 'login' ? 'Sign in to see what’s already committed before payday.' : 'Your data is encrypted and visible only to you.'}
        </p>
      </div>

      {mode === 'login' ? (
        <div className="demo-hint">
          <Icon name="sparkle" size={20} className="faint" />
          <div className="spacer">
            <strong>Try the demo</strong>
            <div className="small muted">
              <code>aisha@demo.com</code> / <code>demo1234</code>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={useDemo} disabled={busy}>
            Use demo
          </button>
        </div>
      ) : null}

      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'signup' ? (
          <div className="field">
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={!!show_('name')}
              aria-describedby="name-err"
              maxLength={80}
            />
            {show_('name') ? (
              <span id="name-err" className="error-text">
                {show_('name')}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={!!show_('email')}
            aria-describedby="email-err"
            maxLength={254}
          />
          {show_('email') ? (
            <span id="email-err" className="error-text">
              {show_('email')}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="input-affix">
            <input
              id="password"
              className="input"
              style={{ paddingLeft: 12, paddingRight: 44 }}
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!show_('password')}
              aria-describedby="password-err"
              maxLength={200}
            />
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
              <Icon name={show ? 'eye_off' : 'eye'} size={17} />
            </button>
          </div>
          {show_('password') ? (
            <span id="password-err" className="error-text">
              {show_('password')}
            </span>
          ) : mode === 'signup' ? (
            <span className="hint">At least 8 characters.</span>
          ) : null}
        </div>

        {error ? (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary btn-block" style={{ height: 44 }} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="small muted" style={{ textAlign: 'center' }}>
        {mode === 'login' ? (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
