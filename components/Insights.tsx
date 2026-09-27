'use client';

import type { Insight } from '@/lib/core/types';
import Icon from './Icon';

const ICONS: Record<Insight['kind'], string> = {
  card_bill: 'card',
  renewal: 'receipt',
  price_change: 'trend_up',
  stopped: 'pause',
  payday_mismatch: 'alert',
  cancelled: 'check',
};

export default function Insights({ insights, onUndo }: { insights: Insight[]; onUndo: (seriesKey: string) => void }) {
  return (
    <section className="card" aria-labelledby="insights-title">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 id="insights-title" className="card-title">
            What you might not know
          </h2>
          <p className="card-sub">Ranked by how much money is involved.</p>
        </div>
      </div>
      {insights.length === 0 ? (
        <p className="muted small">No surprises right now. We’ll flag price changes, renewals and stopped subscriptions here.</p>
      ) : (
        <ul className="insights">
          {insights.map((i) => (
            <li key={i.id} className="insight">
              <div className="insight-icon">
                <Icon name={i.kind === 'price_change' && /down/.test(i.title) ? 'trend_down' : ICONS[i.kind]} size={16} />
              </div>
              <div>
                <div className="insight-title">{i.title}</div>
                <div className="insight-detail">{i.detail}</div>
                {i.kind === 'cancelled' && i.seriesKey ? (
                  <button type="button" className="link-btn small" style={{ marginTop: 4 }} onClick={() => onUndo(i.seriesKey!)}>
                    Undo
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
