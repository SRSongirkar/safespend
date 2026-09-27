'use client';

import { formatMoney, formatMonth } from '@/lib/client/format';

/** Monthly total spending columns: the selected month in slot 1, the rest in a lighter step of the same hue. */
export default function BarChart({
  data,
  selected,
  onSelect,
  currency,
}: {
  data: { month: string; total: number }[];
  selected: string;
  onSelect: (month: string) => void;
  currency: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div>
      <div className="cols" role="list" aria-label="Total spending by month">
        {data.map((d) => {
          const isSel = d.month === selected;
          const label = `${formatMonth(d.month)}: ${formatMoney(d.total, currency)}`;
          return (
            <button
              key={d.month}
              type="button"
              role="listitem"
              className={`col ${isSel ? 'selected' : ''}`}
              onClick={() => onSelect(d.month)}
              title={label}
              aria-label={label}
              aria-current={isSel ? 'true' : undefined}
            >
              {isSel ? <span className="col-value">{formatMoney(d.total, currency)}</span> : null}
              <span className="col-bar" style={{ height: `${Math.max(1.5, (d.total / max) * 100 * 0.82)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="col-labels" aria-hidden="true">
        {data.map((d) => (
          <span key={d.month} className={d.month === selected ? 'selected' : ''}>
            {formatMonth(d.month).split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
