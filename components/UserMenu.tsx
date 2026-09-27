'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authApi, type PublicUser } from '@/lib/client/api';
import Icon from './Icon';

type Theme = 'system' | 'light' | 'dark';

export function applyTheme(theme: Theme) {
  try {
    if (theme === 'system') {
      localStorage.removeItem('cm_theme');
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem('cm_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {
    /* storage unavailable */
  }
}

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem('cm_theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export default function UserMenu({ user, placement = 'up' }: { user: PublicUser; placement?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setTheme(readTheme()), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = async () => {
    setBusy(true);
    try {
      await authApi.logout();
    } finally {
      window.location.href = '/login';
    }
  };

  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">
          {initials || '?'}
        </span>
        <span className="user-meta">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </span>
        <Icon name="chevron_down" size={16} className="faint" />
      </button>
      {open ? (
        <div className={`menu ${placement === 'up' ? 'menu-up' : 'menu-down'}`} role="menu">
          <div className="menu-label">Signed in as {user.email}</div>
          <div className="menu-sep" />
          <div className="menu-label">Appearance</div>
          {(
            [
              ['system', 'monitor', 'System'],
              ['light', 'sun', 'Light'],
              ['dark', 'moon', 'Dark'],
            ] as const
          ).map(([t, icon, label]) => (
            <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} className="menu-item" onClick={() => choose(t)}>
              <Icon name={icon} size={16} />
              <span className="spacer">{label}</span>
              {theme === t ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}
            </button>
          ))}
          <div className="menu-sep" />
          <Link href="/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="settings" size={16} />
            Settings
          </Link>
          <button type="button" role="menuitem" className="menu-item danger" onClick={logout} disabled={busy}>
            <Icon name="logout" size={16} />
            {busy ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
