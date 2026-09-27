'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authApi } from '@/lib/client/api';
import { googleErrorMessage } from '@/lib/client/googleMessages';
import Icon from './Icon';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/api') ? next : '/';
}

export default function AuthForm({ mode, next, google = false, error: redirectError }: { mode: 'login' | 'signup'; next?: string; google?: boolean; error?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(googleErrorMessage(redirectError));
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
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your private account'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {mode === 'login' ? 'Sign in to see the bills you must pay before your next salary.' : 'Only you can see your data. It is encrypted.'}
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

      {google ? (
        <>
          <a className="btn btn-block google-btn" href="/api/auth/google/start?mode=login">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </a>
          <div className="divider">or use email</div>
        </>
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
