'use client';

import type { AnalysisResult, CommittedTotals } from '@/lib/core/types';
import { formatDate, formatDateDay, formatMoney } from '@/lib/client/format';
import Icon from './Icon';
import { COMMITTED_ORDER, TYPE_META } from './meta';

export type Horizon = 'payday' | 'following';

export default function HeadlineNumbers({ a, horizon, onHorizon }: { a: AnalysisResult; horizon: Horizon; onHorizon: (h: Horizon) => void }) {
  const money = (c: number) => formatMoney(c, a.currency);
  const committed: CommittedTotals = horizon === 'payday' ? a.committedUntilPayday : a.committedUntilFollowingPayday;
  const segments = COMMITTED_ORDER.map((t) => ({ type: t, amount: committed.byType[t] ?? 0 })).filter((s) => s.amount > 0);
  const total = segments.reduce((s, x) => s + x.amount, 0) || 1;
  const paydayLabel = a.nextPayday ? `Before ${formatDate(a.nextPayday)}` : 'Next 30 days';
  const followingLabel = a.followingPayday ? `Before ${formatDate(a.followingPayday)}` : 'Next 60 days';
  const lowBelowBuffer = a.lowestPoint.amount < a.bufferCents;
  const isPaydayMorning = a.lowestPoint.date === a.followingPayday || a.lowestPoint.date === a.nextPayday;
  const horizonEnd = a.followingPayday ?? a.forecast[a.forecast.length - 1]?.date;

  return (
    <div className="stat-grid">
      <section className="card stat" aria-labelledby="committed-label">
        <div className="stat-top">
          <h2 id="committed-label" className="stat-label">
            Bills to pay before payday
          </h2>
          <div className="seg" role="group" aria-label="Time period">
            <button type="button" aria-pressed={horizon === 'payday'} onClick={() => onHorizon('payday')}>
              {paydayLabel}
            </button>
            <button type="button" aria-pressed={horizon === 'following'} onClick={() => onHorizon('following')}>
              {followingLabel}
            </button>
          </div>
        </div>
        <div className="stat-value">{money(committed.total)}</div>
        <div className="stat-sub">
          {committed.items.length === 0
            ? 'No bills to pay in this time.'
            : `${committed.items.length} ${committed.items.length === 1 ? 'payment' : 'payments'} you must make ${
                horizon === 'payday' && a.nextPayday ? `before your salary on ${formatDateDay(a.nextPayday)}` : `before ${formatDate(committed.until)}`
              }.`}
        </div>
        {segments.length > 0 ? (
          <>
            <div className="stackbar" role="img" aria-label={`Bills by type: ${segments.map((s) => `${TYPE_META[s.type].plural} ${money(s.amount)}`).join(', ')}`}>
              {segments.map((s) => (
                <div
                  key={s.type}
                  className="stackbar-seg"
                  style={{ width: `${(s.amount / total) * 100}%`, background: TYPE_META[s.type].color }}
                  title={`${TYPE_META[s.type].plural}: ${money(s.amount)}`}
                />
              ))}
            </div>
            <ul className="legend">
              {segments.map((s) => (
                <li key={s.type}>
                  <span className="swatch" style={{ background: TYPE_META[s.type].color }} />
                  {TYPE_META[s.type].plural} <strong>{money(s.amount)}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card stat" aria-labelledby="lowest-label">
        <div className="stat-top">
          <h2 id="lowest-label" className="stat-label">
            Lowest balance
          </h2>
          {lowBelowBuffer ? (
            <span className="badge badge-critical">
              <Icon name="alert" size={12} strokeWidth={2.6} /> Below minimum
            </span>
          ) : (
            <span className="badge badge-good">
              <Icon name="check" size={12} strokeWidth={2.6} /> Above minimum
            </span>
          )}
        </div>
        <div className={`stat-value ${a.lowestPoint.amount < 0 ? 'warn' : ''}`}>{money(a.lowestPoint.amount)}</div>
        <div className="stat-sub">
          Your bank balance goes down to this on {formatDateDay(a.lowestPoint.date)}
          {isPaydayMorning ? ', just before your salary comes' : ''}. This already counts your normal daily spending.
        </div>
      </section>

      <section className="card stat accent" aria-labelledby="safe-label">
        <div className="stat-top">
          <h2 id="safe-label" className="stat-label">
            Safe to spend
          </h2>
          <Icon name="shield" size={18} className="faint" />
        </div>
        <div className="stat-value">{money(a.safeToSpend)}</div>
        <div className="stat-sub">
          {a.safeToSpend > 0
            ? `You can spend this and still keep your minimum balance of ${money(a.bufferCents)} until ${horizonEnd ? formatDate(horizonEnd) : 'your next salary'}.`
            : `Nothing extra right now — your balance already goes down to ${money(a.lowestPoint.amount)} on ${formatDate(a.lowestPoint.date)}.`}
        </div>
      </section>
    </div>
  );
}
