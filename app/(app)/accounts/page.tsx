'use client';

import Link from 'next/link';
import { useState } from 'react';
import AccountForm from '@/components/AccountForm';
import { ConfirmDialog } from '@/components/Dialog';
import EmptyState, { ErrorAlert } from '@/components/EmptyState';
import Icon from '@/components/Icon';
import ImportHistory from '@/components/ImportHistory';
import { ACCOUNT_ICONS, ACCOUNT_LABELS } from '@/components/meta';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import type { Account, AnalysisResult, ImportRecord } from '@/lib/core/types';
import { accountsApi, analysisApi, importApi } from '@/lib/client/api';
import { formatDateYear, formatMoney, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

export default function AccountsPage() {
  const toast = useToast();
  const accounts = useApi<{ accounts: Account[] }>('/api/accounts');
  const analysis = useApi<AnalysisResult>('/api/analysis');
  const imports = useApi<{ imports: ImportRecord[] }>('/api/imports');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [undoing, setUndoing] = useState<ImportRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const currency = analysis.data?.currency ?? 'USD';
  const list = accounts.data?.accounts ?? [];
  const summary = new Map((analysis.data?.accounts ?? []).map((s) => [s.id, s]));
  const allImports = imports.data?.imports ?? [];
  const reloadAll = () => {
    accounts.reload();
    analysis.reload();
    imports.reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await accountsApi.remove(deleting.id);
      toast({ message: `Deleted ${deleting.name} and its transactions` });
      setDeleting(null);
      reloadAll();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const confirmUndo = async () => {
    if (!undoing) return;
    setBusy(true);
    try {
      const r = await importApi.undo(undoing.id);
      toast({ message: `Undid ${undoing.fileName}: removed ${plural(r.removed, 'item')}` });
      setUndoing(null);
      reloadAll();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      const r = await analysisApi.loadDemo();
      toast({ message: `Loaded demo data: ${r.added.toLocaleString('en-US')} items added` });
      reloadAll();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (accounts.initialLoading) return <LoadingBlock />;
  if (accounts.error && !accounts.data) return <ErrorAlert message={accounts.error} onRetry={accounts.reload} />;

  const docs = allImports.filter((r) => r.kind !== 'csv');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-sub">Your bank accounts and cards. Card settings tell Committed when each bill is due and which account pays it.</p>
        </div>
        <div className="row-wrap">
          <Link href="/import" className="btn">
            <Icon name="upload" size={16} /> Import
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Add account
          </button>
        </div>
      </header>

      {adding ? (
        <section className="card" aria-labelledby="new-account-title">
          <div className="card-header">
            <h2 id="new-account-title" className="card-title">
              New account
            </h2>
          </div>
          <AccountForm
            accounts={list}
            currency={currency}
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              await accountsApi.create(input);
              toast({ message: `Added ${input.name}` });
              setAdding(false);
              reloadAll();
            }}
          />
        </section>
      ) : null}

      {list.length === 0 && !adding ? (
        <div className="card">
          <EmptyState
            icon="wallet"
            title="No accounts yet"
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  <Icon name="plus" size={16} /> Add account
                </button>
                <button type="button" className="btn" onClick={loadDemo} disabled={busy}>
                  <Icon name="sparkle" size={16} /> Load demo data
                </button>
              </>
            }
          >
            Add your checking, savings and card accounts, then import their statements.
          </EmptyState>
        </div>
      ) : null}

      <div className="accounts-grid">
        {list.map((acct) => {
          const s = summary.get(acct.id);
          const own = allImports.filter((r) => r.accountId === acct.id);
          const payFrom = list.find((x) => x.id === acct.autopayFromId);
          const bill = analysis.data?.cardBills.find((b) => b.accountId === acct.id);
          return (
            <section key={acct.id} className="card account-card" aria-labelledby={`acct-${acct.id}`}>
              <div className="account-head">
                <div className="account-icon">
                  <Icon name={ACCOUNT_ICONS[acct.type]} size={19} />
                </div>
                <div className="spacer" style={{ minWidth: 0 }}>
                  <h2 id={`acct-${acct.id}`} className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acct.name}
                  </h2>
                  <div className="small faint">{ACCOUNT_LABELS[acct.type]}</div>
                </div>
                {editing !== acct.id ? (
                  <div className="row" style={{ gap: 2 }}>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label={`Edit ${acct.name}`} onClick={() => setEditing(acct.id)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label={`Delete ${acct.name}`} onClick={() => setDeleting(acct)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ) : null}
              </div>

              {editing === acct.id ? (
                <AccountForm
                  account={acct}
                  accounts={list}
                  currency={currency}
                  compact
                  onCancel={() => setEditing(null)}
                  onSave={async (input) => {
                    await accountsApi.update(acct.id, input);
                    toast({ message: `Saved ${input.name ?? acct.name}` });
                    setEditing(null);
                    reloadAll();
                  }}
                />
              ) : (
                <>
                  <div>
                    <div className="small faint">{acct.type === 'card' ? 'Balance owed' : 'Balance'}</div>
                    <div className="account-balance">
                      {s?.balance === null || s?.balance === undefined ? '—' : formatMoney(acct.type === 'card' ? -s.balance : s.balance, currency, { exact: true })}
                    </div>
                    <div className="small muted">
                      {s?.txCount ? `${plural(s.txCount, 'transaction')} · latest ${formatDateYear(s.lastDate!)}` : 'No transactions yet'}
                    </div>
                  </div>
                  {acct.type === 'card' ? (
                    <dl className="kv">
                      <dt>Statement closes</dt>
                      <dd>{acct.statementCloseDay ? `day ${acct.statementCloseDay}` : <span className="text-critical">not set</span>}</dd>
                      <dt>Payment due</dt>
                      <dd>{acct.dueDay ? `day ${acct.dueDay}` : <span className="text-critical">not set</span>}</dd>
                      <dt>Autopay from</dt>
                      <dd>{payFrom?.name ?? 'first checking account'}</dd>
                      {bill?.due ? (
                        <>
                          <dt>Current bill</dt>
                          <dd>
                            {formatMoney(bill.due.amount, currency, { exact: true })} due {formatDateYear(bill.due.dueDate)} {bill.due.paid ? '(paid)' : ''}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  ) : null}
                  {acct.type === 'card' && (!acct.statementCloseDay || !acct.dueDay) ? (
                    <div className="alert">
                      <Icon name="info" size={16} />
                      <span className="small">Set the statement and due days so card spending shows up as an upcoming bill.</span>
                    </div>
                  ) : null}
                  <div>
                    <h3 className="card-section-title" style={{ marginTop: 4 }}>
                      Import history
                    </h3>
                    <ImportHistory imports={own.slice(0, 6)} onUndo={setUndoing} empty="No statements imported for this account." />
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {docs.length > 0 ? (
        <section className="card" aria-labelledby="docs-title">
          <div className="card-header">
            <div>
              <h2 id="docs-title" className="card-title">
                Payslips & receipts
              </h2>
              <p className="card-sub">Documents that aren’t tied to one account.</p>
            </div>
          </div>
          <ImportHistory imports={docs} onUndo={setUndoing} />
        </section>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={`This removes the account and all ${summary.get(deleting.id)?.txCount ?? 0} of its transactions from your private space. This can’t be undone.`}
          confirmLabel="Delete account"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {undoing ? (
        <ConfirmDialog
          title={`Undo “${undoing.fileName}”?`}
          message={`This removes exactly the ${plural(undoing.added, 'item')} this import added. Everything else stays.`}
          confirmLabel="Undo import"
          busy={busy}
          onConfirm={confirmUndo}
          onClose={() => setUndoing(null)}
        />
      ) : null}
    </div>
  );
}
