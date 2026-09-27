'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/Dialog';
import Icon from '@/components/Icon';
import ImportHistory from '@/components/ImportHistory';
import GmailImport from '@/components/GmailImport';
import ImportWizard from '@/components/ImportWizard';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import type { Account, ImportRecord, Settings } from '@/lib/core/types';
import type { PublicUser } from '@/lib/client/api';
import { importApi } from '@/lib/client/api';
import { plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

export default function ImportPage() {
  const toast = useToast();
  const accounts = useApi<{ accounts: Account[] }>('/api/accounts');
  const imports = useApi<{ imports: ImportRecord[] }>('/api/imports');
  const settings = useApi<{ settings: Settings }>('/api/settings');
  const me = useApi<{ user: PublicUser; googleEnabled: boolean }>('/api/auth/me');
  const [undoing, setUndoing] = useState<ImportRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmUndo = async () => {
    if (!undoing) return;
    setBusy(true);
    try {
      const r = await importApi.undo(undoing.id);
      toast({ message: `Removed ${plural(r.removed, 'item')} from ${undoing.fileName}` });
      setUndoing(null);
      imports.reload();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Upload statements</h1>
          <p className="page-sub">Add your statements any time. Payments you already added are skipped automatically — no double entries.</p>
        </div>
      </header>

      <div className="alert alert-info">
        <Icon name="lock" size={16} />
        <div>
          <strong>Your data is private and encrypted. We never share it.</strong>
          <div className="small muted">
            We save the date, details, amount and balance of each payment, and the salary slips and emails you add — not the file itself. Nothing is sent to anyone else, and
            you can download or delete everything in Settings.
          </div>
        </div>
      </div>

      <GmailImport enabled={!!me.data?.googleEnabled} onDone={imports.reload} />

      {accounts.initialLoading ? (
        <LoadingBlock />
      ) : (
        <ImportWizard
          accounts={accounts.data?.accounts ?? []}
          currency={settings.data?.settings.currency ?? 'USD'}
          onAccountsChanged={accounts.reload}
          onImported={imports.reload}
        />
      )}

      <section className="card" aria-labelledby="history-title">
        <div className="card-header">
          <div>
            <h2 id="history-title" className="card-title">
              Recently uploaded
            </h2>
            <p className="card-sub">Undo removes only what that upload added.</p>
          </div>
        </div>
        <ImportHistory imports={(imports.data?.imports ?? []).slice(0, 12)} onUndo={setUndoing} />
      </section>

      {undoing ? (
        <ConfirmDialog
          title={`Undo “${undoing.fileName}”?`}
          message={`This removes the ${plural(undoing.added, 'item')} this upload added.`}
          confirmLabel="Undo upload"
          busy={busy}
          onConfirm={confirmUndo}
          onClose={() => setUndoing(null)}
        />
      ) : null}
    </div>
  );
}
