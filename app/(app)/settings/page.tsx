'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/Dialog';
import { ErrorAlert } from '@/components/EmptyState';
import Icon from '@/components/Icon';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import { applyTheme, readTheme } from '@/components/UserMenu';
import type { Settings } from '@/lib/core/types';
import type { PublicUser } from '@/lib/client/api';
import { googleErrorMessage } from '@/lib/client/googleMessages';
import { settingsApi } from '@/lib/client/api';
import { currencySymbol, formatDateYear, parseMoneyInput } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'SGD', 'JPY', 'CHF', 'SEK', 'AED'];

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, initialLoading, reload, setData } = useApi<{ settings: Settings }>('/api/settings');
  const me = useApi<{ user: PublicUser; googleEnabled: boolean }>('/api/auth/me');
  const hasPassword = me.data?.user.hasPassword !== false;
  const [googleNote, setGoogleNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('google') === 'linked') setGoogleNote({ ok: true, text: 'Google account connected. You can now sign in with Google.' });
    else if (p.get('error')) setGoogleNote({ ok: false, text: googleErrorMessage(p.get('error')) ?? '' });
    if (p.has('google') || p.has('error')) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [currency, setCurrency] = useState('INR');
  const [buffer, setBuffer] = useState('');
  const [asOf, setAsOf] = useState('');
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (!data) return;
    setCurrency(data.settings.currency);
    setBuffer((data.settings.bufferCents / 100).toFixed(2));
    setAsOf(data.settings.asOfOverride ?? '');
  }, [data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const bufferCents = parseMoneyInput(buffer);
    if (bufferCents === null) return toast({ message: 'Enter a valid minimum balance, e.g. 12500', kind: 'error' });
    setSaving(true);
    try {
      const r = await settingsApi.patch({ currency, bufferCents, asOfOverride: asOf || null });
      setData(r);
      toast({ message: 'Settings saved' });
    } catch (err) {
      toast({ message: (err as Error).message, kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pw.next.length < 8) return setPwError('Your new password needs at least 8 characters');
    if (pw.next !== pw.confirm) return setPwError('The new passwords don’t match');
    setPwBusy(true);
    try {
      await settingsApi.changePassword(pw.current, pw.next);
      me.reload();
      setPw({ current: '', next: '', confirm: '' });
      toast({ message: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await settingsApi.deleteMe(deletePw);
      window.location.href = '/login';
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleteBusy(false);
    }
  };

  if (initialLoading) return <LoadingBlock />;
  if (error && !data) return <ErrorAlert message={error} onRetry={reload} />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Your preferences, security and data.</p>
        </div>
      </header>

      <div className="settings-grid">
        <form className="card stack" onSubmit={save} aria-labelledby="prefs-title">
          <div>
            <h2 id="prefs-title" className="card-title">
              Money settings
            </h2>
            <p className="card-sub">How money is shown, and how much you want to keep safe.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="s-currency">
              Currency
            </label>
            <select id="s-currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="hint">Only changes how money is shown. Nothing is converted.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="s-buffer">
              Minimum balance to keep
            </label>
            <div className="input-affix">
              <span>{currencySymbol(currency)}</span>
              <input id="s-buffer" className="input" inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
            </div>
            <span className="hint">We warn you if a purchase takes your bank balance below this.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="s-asof">
              Show data as of <span className="faint">(for demos)</span>
            </label>
            <div className="row">
              <input id="s-asof" className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              {asOf ? (
                <button type="button" className="btn btn-ghost" onClick={() => setAsOf('')}>
                  Clear
                </button>
              ) : null}
            </div>
            <span className="hint">
              {data?.settings.asOfOverride
                ? `Showing data as of ${formatDateYear(data.settings.asOfOverride)}.`
                : 'Normally we use the date of your latest payment.'}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : null}
              Save settings
            </button>
          </div>
        </form>

        <div className="stack">
          <section className="card stack" aria-labelledby="appearance-title">
            <div>
              <h2 id="appearance-title" className="card-title">
                Appearance
              </h2>
              <p className="card-sub">Saved on this device.</p>
            </div>
            <div className="seg" role="group" aria-label="Theme" style={{ alignSelf: 'flex-start' }}>
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={theme === t}
                  onClick={() => {
                    setTheme(t);
                    applyTheme(t);
                  }}
                >
                  {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </section>

          <section className="card stack" aria-labelledby="google-title">
            <div>
              <h2 id="google-title" className="card-title">
                Google account
              </h2>
              <p className="card-sub">Sign in with Google, and import bills from Gmail on the Upload page.</p>
            </div>
            {me.data?.user.google ? (
              <div className="alert alert-good">
                <Icon name="check" size={16} />
                <span>Connected. You can sign in with Google.</span>
              </div>
            ) : me.data?.googleEnabled ? (
              <div>
                <a className="btn" href="/api/auth/google/start?mode=link">
                  Connect Google account
                </a>
              </div>
            ) : (
              <p className="small muted">Google sign-in is not set up on this server yet.</p>
            )}
            {googleNote ? (
              <div className={`alert ${googleNote.ok ? 'alert-good' : 'alert-error'}`} role="status">
                <Icon name={googleNote.ok ? 'check' : 'alert'} size={16} />
                <span>{googleNote.text}</span>
              </div>
            ) : null}
          </section>

          <form className="card stack" onSubmit={changePassword} aria-labelledby="pw-title">
            <div>
              <h2 id="pw-title" className="card-title">
                {hasPassword ? 'Change password' : 'Set a password'}
              </h2>
              <p className="card-sub">{hasPassword ? 'You will be signed out on other devices.' : 'Optional: lets you also sign in with your email and a password.'}</p>
            </div>
            {hasPassword ? (
              <div className="field">
                <label className="label" htmlFor="pw-current">
                  Current password
                </label>
                <input id="pw-current" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </div>
            ) : null}
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="pw-next">
                  New password
                </label>
                <input id="pw-next" className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="pw-confirm">
                  Repeat new password
                </label>
                <input id="pw-confirm" className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </div>
            </div>
            {pwError ? (
              <div className="error-text" role="alert">
                <Icon name="alert" size={14} /> {pwError}
              </div>
            ) : null}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn" disabled={pwBusy || (hasPassword && !pw.current) || !pw.next}>
                {pwBusy ? <span className="spinner" /> : null}
                {hasPassword ? 'Change password' : 'Set password'}
              </button>
            </div>
          </form>
        </div>

        <section className="card stack" aria-labelledby="data-title">
          <div>
            <h2 id="data-title" className="card-title">
              Your data
            </h2>
            <p className="card-sub">Your data is encrypted (AES-256) and used only for your account. No bank login, no AI, no sharing.</p>
          </div>
          <div className="row-wrap">
            <a className="btn" href="/api/export" download>
              <Icon name="download" size={16} /> Download my data
            </a>
          </div>
        </section>

        <section className="card stack danger-zone" aria-labelledby="danger-title">
          <div>
            <h2 id="danger-title" className="card-title">
              Delete my account
            </h2>
            <p className="card-sub">Deletes your account and everything you uploaded, for ever.</p>
          </div>
          <div>
            <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" size={16} /> Delete my account
            </button>
          </div>
        </section>
      </div>

      {deleteOpen ? (
        <Dialog
          title="Delete your account and all data?"
          onClose={() => {
            setDeleteOpen(false);
            setDeletePw('');
            setDeleteError(null);
          }}
          footer={
            <>
              <button type="button" className="btn" data-close onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={deleteAccount} disabled={!deletePw || deleteBusy}>
                {deleteBusy ? <span className="spinner" /> : null}
                Delete everything
              </button>
            </>
          }
        >
          <p className="muted small">You cannot undo this. You may want to download your data first. {hasPassword ? 'Enter your password to confirm.' : 'Type DELETE to confirm.'}</p>
          <input
            className="input"
            type={hasPassword ? 'password' : 'text'}
            autoComplete={hasPassword ? 'current-password' : 'off'}
            aria-label={hasPassword ? 'Password' : 'Type DELETE'}
            placeholder={hasPassword ? 'Your password' : 'DELETE'}
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && deletePw && void deleteAccount()}
          />
          {deleteError ? (
            <div className="error-text" role="alert">
              <Icon name="alert" size={14} /> {deleteError}
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
