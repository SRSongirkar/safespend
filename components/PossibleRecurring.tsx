'use client';

import type { RecurringSeries } from '@/lib/core/types';
import { formatDate, formatMoney } from '@/lib/client/format';

export default function PossibleRecurring({
  series,
  currency,
  onDecide,
}: {
  series: RecurringSeries[];
  currency: string;
  onDecide: (s: RecurringSeries, confirm: boolean) => void;
}) {
  if (series.length === 0) return null;
  return (
    <section className="card" aria-labelledby="possible-title">
      <div className="card-header" style={{ marginBottom: 10 }}>
        <div>
          <h2 id="possible-title" className="card-title">
            Possible recurring
          </h2>
          <p className="card-sub">We’re not sure about these. Confirm to add them to your forecast.</p>
        </div>
      </div>
      <ul className="insights">
        {series.map((s) => (
          <li key={s.key} className="insight" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <div>
              <div className="insight-title">
                {s.merchant} · {formatMoney(s.predictedAmount, currency, { exact: true })} {s.cadence}
              </div>
              <div className="insight-detail">
                {s.count} payments, last on {formatDate(s.lastDate)} · {Math.round(s.confidence * 100)}% confident
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onDecide(s, true)}>
                  Confirm
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onDecide(s, false)}>
                  Ignore
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
