'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/Dialog';
import Icon from '@/components/Icon';
import ImportHistory from '@/components/ImportHistory';
import ImportWizard from '@/components/ImportWizard';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import type { Account, ImportRecord, Settings } from '@/lib/core/types';
import { importApi } from '@/lib/client/api';
import { plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

export default function ImportPage() {
  const toast = useToast();
  const accounts = useApi<{ accounts: Account[] }>('/api/accounts');
  const imports = useApi<{ imports: ImportRecord[] }>('/api/imports');
  const settings = useApi<{ settings: Settings }>('/api/settings');
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
          <h1 className="page-title">Import</h1>
          <p className="page-sub">Add statements whenever you like. Overlapping files are safe: anything you already imported is skipped.</p>
        </div>
      </header>

      <div className="alert alert-info">
        <Icon name="lock" size={16} />
        <div>
          <strong>Stored encrypted in your private space. Never shared.</strong>
          <div className="small muted">
            We keep each transaction’s date, description, amount and balance, plus the payslips and emails you add — not the original file. Nothing is sent to any third party, and
            you can export or delete everything in Settings.
          </div>
        </div>
      </div>

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
              Recent imports
            </h2>
            <p className="card-sub">Undo removes exactly what an import added.</p>
          </div>
        </div>
        <ImportHistory imports={(imports.data?.imports ?? []).slice(0, 12)} onUndo={setUndoing} />
      </section>

      {undoing ? (
        <ConfirmDialog
          title={`Undo “${undoing.fileName}”?`}
          message={`This removes the ${plural(undoing.added, 'item')} this import added.`}
          confirmLabel="Undo import"
          busy={busy}
          onConfirm={confirmUndo}
          onClose={() => setUndoing(null)}
        />
      ) : null}
    </div>
  );
}
