'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BarChart from '@/components/BarChart';
import EmptyState, { ErrorAlert } from '@/components/EmptyState';
import Icon from '@/components/Icon';
import MonthPicker from '@/components/MonthPicker';
import SpendingByCategory from '@/components/SpendingByCategory';
import { LoadingBlock } from '@/components/Spinner';
import type { AnalysisResult, MonthlySummary } from '@/lib/core/types';
import { formatMoney, formatMonth } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

function Delta({ now, prev, currency, upIsGood = false }: { now: number; prev: number; currency: string; upIsGood?: boolean }) {
  if (!prev) return <span className="faint small">No data for the month before</span>;
  const diff = now - prev;
  if (diff === 0) return <span className="faint small">Same as the month before</span>;
  const up = diff > 0;
  const good = up === upIsGood;
  return (
    <span className={`small row ${good ? 'text-good' : 'text-critical'}`} style={{ gap: 4 }}>
      <Icon name={up ? 'arrow_up' : 'arrow_down'} size={13} strokeWidth={2.6} />
      {formatMoney(Math.abs(diff), currency)} ({Math.round((Math.abs(diff) / prev) * 100)}%) vs the month before
    </span>
  );
}

export default function SpendingPage() {
  const { data, error, initialLoading, reload } = useApi<{ months: MonthlySummary[] }>('/api/spending?months=24');
  const analysis = useApi<AnalysisResult>('/api/analysis');
  const currency = analysis.data?.currency ?? 'USD';
  const months = useMemo(() => data?.months ?? [], [data]);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (months.length && !months.some((m) => m.month === selected)) setSelected(months[months.length - 1].month);
  }, [months, selected]);

  if (initialLoading) return <LoadingBlock />;
  if (error && !data) return <ErrorAlert message={error} onRetry={reload} />;
  if (months.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Spending</h1>
        <div className="card">
          <EmptyState
            icon="chart"
            title="No spending to show yet"
            actions={
              <Link href="/import" className="btn btn-primary">
                <Icon name="upload" size={16} /> Import a statement
              </Link>
            }
          >
            Once you import statements you’ll see where your money goes each month, by category.
          </EmptyState>
        </div>
      </div>
    );
  }

  const idx = Math.max(0, months.findIndex((m) => m.month === selected));
  const m = months[idx];
  const asOf = analysis.data?.now;
  const partial = asOf && asOf.slice(0, 7) === months[months.length - 1].month ? months[months.length - 1].month : undefined;
  const trend = months.slice(Math.max(0, idx - 5), idx + 1).map((x) => ({ month: x.month, total: x.totalSpend }));
  const money = (c: number) => formatMoney(c, currency);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Spending</h1>
          <p className="page-sub">Where your money went, by category. Transfers between your accounts and card payments are excluded; card purchases count on the day you made them.</p>
        </div>
        <MonthPicker months={months.map((x) => x.month)} value={m.month} onChange={setSelected} partial={partial} />
      </header>

      {m.month === partial ? (
        <div className="alert alert-info">
          <Icon name="info" size={16} />
          <span>
            {formatMonth(m.month, true)} is still in progress — totals run to {asOf}. Compare full months for a fair picture.
          </span>
        </div>
      ) : null}

      <div className="stat-grid three">
        <section className="card stat">
          <h2 className="stat-label">Spent in {formatMonth(m.month)}</h2>
          <div className="stat-value">{money(m.totalSpend)}</div>
          <Delta now={m.totalSpend} prev={m.prevTotalSpend} currency={currency} />
        </section>
        <section className="card stat">
          <h2 className="stat-label">Income</h2>
          <div className="stat-value">{money(m.income)}</div>
          <span className="small muted">Salary, interest and other money in</span>
        </section>
        <section className="card stat">
          <h2 className="stat-label">Income minus spending</h2>
          <div className={`stat-value ${m.net < 0 ? 'warn' : ''}`}>{formatMoney(m.net, currency, { signed: true })}</div>
          <span className="small muted">{m.net < 0 ? 'You spent more than came in' : 'Left over this month'}</span>
        </section>
      </div>

      <div className="spend-grid">
        <section className="card" aria-labelledby="cat-title">
          <div className="card-header">
            <div>
              <h2 id="cat-title" className="card-title">
                By category
              </h2>
              <p className="card-sub">{idx > 0 ? `Compared with ${formatMonth(months[idx - 1].month)}` : 'No earlier month to compare with'}</p>
            </div>
          </div>
          <SpendingByCategory month={m} currency={currency} />
        </section>

        <div className="side-col">
          <section className="card" aria-labelledby="trend-title">
            <div className="card-header">
              <div>
                <h2 id="trend-title" className="card-title">
                  Total spending
                </h2>
                <p className="card-sub">Last {trend.length} months · select a month</p>
              </div>
            </div>
            <BarChart data={trend} selected={m.month} onSelect={setSelected} currency={currency} />
          </section>

          <section className="card" aria-labelledby="top-title">
            <div className="card-header" style={{ marginBottom: 8 }}>
              <div>
                <h2 id="top-title" className="card-title">
                  Top merchants
                </h2>
                <p className="card-sub">{formatMonth(m.month, true)}</p>
              </div>
            </div>
            {m.topMerchants.length === 0 ? (
              <p className="muted small">No merchants this month.</p>
            ) : (
              <ol className="evidence-list">
                {m.topMerchants.map((t, i) => (
                  <li key={t.merchant} style={{ gridTemplateColumns: '22px minmax(0,1fr) auto' }}>
                    <span className="faint num">{i + 1}</span>
                    <span>
                      <strong style={{ fontWeight: 600 }}>{t.merchant}</strong>
                      <span className="tiny faint"> · {t.count} {t.count === 1 ? 'payment' : 'payments'}</span>
                    </span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {money(t.amount)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
