'use client';

import { useEffect, useState } from 'react';
import { googleErrorMessage } from '@/lib/client/googleMessages';
import Icon from './Icon';

/** "Import bills from Gmail": read-only, one-time search; results arrive back in the URL after Google's consent screen. */
export default function GmailImport({ enabled, onDone }: { enabled: boolean; onDone?: () => void }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gmail') === 'done') {
      const n = (k: string) => Number(p.get(k) ?? 0) || 0;
      const added = n('added');
      setResult({
        ok: true,
        text:
          `Checked ${n('scanned')} emails and found ${n('found')} with an amount: ${added} new` +
          (n('dup') ? `, ${n('dup')} already added` : '') +
          (added ? '. Renewals and due dates now show on Home.' : '.'),
      });
      onDone?.();
    } else if (p.get('error')) {
      setResult({ ok: false, text: googleErrorMessage(p.get('error')) ?? '' });
    }
    if (p.has('gmail') || p.has('error')) window.history.replaceState(null, '', window.location.pathname);
  }, [onDone]);

  return (
    <section className="card" aria-labelledby="gmail-title">
      <div className="row-wrap" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="file-icon">
          <Icon name="mail" size={19} />
        </div>
        <div className="spacer" style={{ minWidth: 220 }}>
          <h2 id="gmail-title" className="card-title">
            Import bills from Gmail
          </h2>
          <p className="card-sub">
            We search your Gmail (read-only) for bill, receipt and renewal emails from the last 12 months and keep only the ones with an amount. Access is used once and then
            given back to Google — we never keep a key to your mailbox.
          </p>
        </div>
        {enabled ? (
          <a className="btn btn-primary" href="/api/auth/google/start?mode=gmail">
            <Icon name="mail" size={16} /> Connect Gmail
          </a>
        ) : (
          <span className="badge">Not set up yet</span>
        )}
      </div>
      {!enabled ? (
        <p className="small muted" style={{ marginTop: 10 }}>
          To turn this on, the server needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README → Google sign-in).
        </p>
      ) : null}
      {result ? (
        <div className={`alert ${result.ok ? 'alert-good' : 'alert-error'}`} style={{ marginTop: 12 }} role="status">
          <Icon name={result.ok ? 'check' : 'alert'} size={16} />
          <span>{result.text}</span>
        </div>
      ) : null}
    </section>
  );
}
