'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/Dialog';
import EmptyState, { ErrorAlert } from '@/components/EmptyState';
import Icon from '@/components/Icon';
import ManualTxForm from '@/components/ManualTxForm';
import { CATEGORY_LABELS } from '@/components/meta';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import TransactionTable from '@/components/TransactionTable';
import type { Account, EnrichedTransaction, Settings } from '@/lib/core/types';
import { txApi, type TxListResponse } from '@/lib/client/api';
import { formatMonth, plural } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const toast = useToast();
  const [month, setMonth] = useState('');
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EnrichedTransaction | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);
  useEffect(() => setPage(1), [month, accountId, category, kind, q]);

  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (accountId) params.set('accountId', accountId);
  if (category) params.set('category', category);
  if (kind) params.set('kind', kind);
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));

  const list = useApi<TxListResponse>(`/api/transactions?${params.toString()}`);
  const accounts = useApi<{ accounts: Account[] }>('/api/accounts');
  const settings = useApi<{ settings: Settings }>('/api/settings');
  const currency = settings.data?.settings.currency ?? 'USD';
  const accountList = accounts.data?.accounts ?? [];
  const names = useMemo(() => new Map(accountList.map((a) => [a.id, a.name])), [accountList]);
  const [months, setMonths] = useState<string[]>([]);
  useEffect(() => {
    if (list.data?.months?.length) setMonths(list.data.months);
  }, [list.data]);

  const onCategory = async (tx: EnrichedTransaction, next: string | null) => {
    try {
      await txApi.patch(tx.id, { categoryOverride: next });
      list.reload();
      if (next) {
        toast({
          message: `${tx.merchant} → ${CATEGORY_LABELS[next] ?? next}`,
          action: {
            label: `Apply to all ${tx.merchant}`,
            onClick: async () => {
              try {
                const r = await txApi.patch(tx.id, { categoryOverride: next, applyToMerchant: true });
                toast({ message: `Updated ${plural(r.updated, 'payment')} from ${tx.merchant}. New ones will follow this too.` });
                list.reload();
              } catch (e) {
                toast({ message: (e as Error).message, kind: 'error' });
              }
            },
          },
        });
      } else toast({ message: 'Category will be chosen for you' });
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await txApi.remove(deleting.id);
      toast({ message: 'Cash payment deleted' });
      setDeleting(null);
      list.reload();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    }
  };

  const filtered = !!(month || accountId || category || kind || q);
  const total = list.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-sub">All your payments in one place. Money moved between your own accounts and card bill payments are not counted as spending.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={accountList.length === 0}>
          <Icon name="plus" size={16} /> Add cash payment
        </button>
      </header>

      {adding ? (
        <ManualTxForm
          accounts={accountList}
          currency={currency}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            toast({ message: 'Cash payment added' });
            list.reload();
          }}
        />
      ) : null}

      <div className="filters" role="search">
        <div className="field">
          <label className="label" htmlFor="f-month">
            Month
          </label>
          <select id="f-month" className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="f-account">
            Account
          </label>
          <select id="f-account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="f-category">
            Category
          </label>
          <select id="f-category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="f-kind">
            Type
          </label>
          <select id="f-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Everything</option>
            <option value="normal">Spending & income</option>
            <option value="transfer">Between my accounts</option>
            <option value="card_payment">Card bill payments</option>
          </select>
        </div>
        <div className="field grow">
          <label className="label" htmlFor="f-q">
            Search
          </label>
          <div className="input-affix">
            <span>
              <Icon name="search" size={15} />
            </span>
            <input id="f-q" className="input" type="search" placeholder="Merchant, description or note" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
        </div>
        {filtered ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setMonth('');
              setAccountId('');
              setCategory('');
              setKind('');
              setQInput('');
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      {list.error && !list.data ? <ErrorAlert message={list.error} onRetry={list.reload} /> : null}

      <section className={`card card-flush ${list.loading && list.data ? 'refetching' : ''}`} aria-label="Transactions" aria-busy={list.loading}>
        {list.initialLoading ? (
          <LoadingBlock />
        ) : total === 0 ? (
          filtered ? (
            <EmptyState icon="search" title="No matching transactions">
              Try a different month, account or search term.
            </EmptyState>
          ) : (
            <EmptyState
              icon="list"
              title="No transactions yet"
              actions={
                <Link href="/import" className="btn btn-primary">
                  <Icon name="upload" size={16} /> Upload a statement
                </Link>
              }
            >
              Upload a bank or card statement, or add a cash payment.
            </EmptyState>
          )
        ) : (
          <>
            <TransactionTable items={list.data?.items ?? []} currency={currency} accountName={(id) => names.get(id) ?? '—'} onCategory={onCategory} onDelete={setDeleting} />
            <div className="pager">
              <span className="num">
                {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
              </span>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <Icon name="chevron_left" size={15} /> Newer
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setPage((p) => p + 1)} disabled={to >= total}>
                  Older <Icon name="chevron_right" size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {deleting ? (
        <ConfirmDialog
          title="Delete this cash payment?"
          message={`${deleting.merchant} will be removed. Uploaded payments can only be removed by undoing the upload.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
