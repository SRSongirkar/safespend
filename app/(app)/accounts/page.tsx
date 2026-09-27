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
      toast({ message: `Deleted ${deleting.name} and its payments` });
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
          <p className="page-sub">Your bank accounts and credit cards. For a card, add the bill dates so we can plan the bill.</p>
        </div>
        <div className="row-wrap">
          <Link href="/import" className="btn">
            <Icon name="upload" size={16} /> Upload
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
            Add your bank, savings and credit card accounts, then upload their statements.
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
                    <div className="small faint">{acct.type === 'card' ? 'You owe' : 'Balance'}</div>
                    <div className="account-balance">
                      {s?.balance === null || s?.balance === undefined ? '—' : formatMoney(acct.type === 'card' ? -s.balance : s.balance, currency, { exact: true })}
                    </div>
                    <div className="small muted">
                      {s?.txCount ? `${plural(s.txCount, 'payment')} · last on ${formatDateYear(s.lastDate!)}` : 'No payments yet'}
                    </div>
                  </div>
                  {acct.type === 'card' ? (
                    <dl className="kv">
                      <dt>Bill is made on</dt>
                      <dd>{acct.statementCloseDay ? `day ${acct.statementCloseDay} of the month` : <span className="text-critical">not set</span>}</dd>
                      <dt>Pay by</dt>
                      <dd>{acct.dueDay ? `day ${acct.dueDay} of the month` : <span className="text-critical">not set</span>}</dd>
                      <dt>Paid from</dt>
                      <dd>{payFrom?.name ?? 'your main bank account'}</dd>
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
                      <span className="small">Add the bill dates so your card spending shows up as a bill to pay.</span>
                    </div>
                  ) : null}
                  <div>
                    <h3 className="card-section-title" style={{ marginTop: 4 }}>
                      Uploaded files
                    </h3>
                    <ImportHistory imports={own.slice(0, 6)} onUndo={setUndoing} empty="No files uploaded for this account yet." />
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
                Salary slips & emails
              </h2>
              <p className="card-sub">Files that are not linked to one account.</p>
            </div>
          </div>
          <ImportHistory imports={docs} onUndo={setUndoing} />
        </section>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={`This deletes the account and all ${summary.get(deleting.id)?.txCount ?? 0} of its payments. You cannot undo this.`}
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
          message={`This removes only the ${plural(undoing.added, 'item')} this upload added. Everything else stays.`}
          confirmLabel="Undo upload"
          busy={busy}
          onConfirm={confirmUndo}
          onClose={() => setUndoing(null)}
        />
      ) : null}
    </div>
  );
}
