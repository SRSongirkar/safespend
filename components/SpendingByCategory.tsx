'use client';

import type { MonthlySummary } from '@/lib/core/types';
import { formatMoney, formatMonth } from '@/lib/client/format';
import Icon from './Icon';
import { categoryLabel } from './meta';

/** One series → one colour (slot 1) for every bar; last month is a thin ink tick for comparison. */
export default function SpendingByCategory({ month, currency }: { month: MonthlySummary; currency: string }) {
  const rows = month.byCategory.filter((c) => c.amount > 0 || c.prevAmount > 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.amount, r.prevAmount)));
  const prevLabel = formatMonth(prevKey(month.month));
  const money = (c: number) => formatMoney(c, currency);

  if (rows.length === 0) return <p className="muted">No spending recorded this month.</p>;

  return (
    <div>
      <ul className="legend" style={{ margin: '0 0 10px' }}>
        <li>
          <span className="swatch" style={{ background: 'var(--s1)' }} /> {formatMonth(month.month)}
        </li>
        <li>
          <span className="line-key" style={{ width: 2, height: 12, background: 'var(--ink-2)' }} /> {prevLabel}
        </li>
      </ul>
      <div className="hbars" role="list">
        {rows.map((r) => {
          const up = r.change > 0;
          const title = `${categoryLabel(r.category)}: ${money(r.amount)} in ${formatMonth(month.month)}, ${money(r.prevAmount)} in ${prevLabel}`;
          return (
            <div key={r.category} className="hbar" role="listitem" tabIndex={0} title={title} aria-label={title}>
              <div className="hbar-label">
                <span>{categoryLabel(r.category)}</span>
              </div>
              <div className="hbar-track" aria-hidden="true">
                {r.amount > 0 ? <div className="hbar-fill" style={{ width: `${(r.amount / max) * 100}%` }} /> : null}
                {r.prevAmount > 0 ? <div className="hbar-prev" style={{ left: `${(r.prevAmount / max) * 100}%` }} /> : null}
              </div>
              <div className="hbar-value">{money(r.amount)}</div>
              <div className={`hbar-delta ${r.change === 0 ? 'faint' : up ? 'text-critical' : 'text-good'}`}>
                {r.change === 0 ? (
                  'no change'
                ) : (
                  <span className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                    <Icon name={up ? 'arrow_up' : 'arrow_down'} size={12} strokeWidth={2.6} />
                    {money(Math.abs(r.change))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function prevKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
