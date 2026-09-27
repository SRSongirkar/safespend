'use client';

import type { EnrichedTransaction } from '@/lib/core/types';
import { formatDateYear, formatMoney } from '@/lib/client/format';
import CategorySelect from './CategorySelect';
import Icon from './Icon';

export default function TransactionTable({
  items,
  currency,
  accountName,
  onCategory,
  onDelete,
}: {
  items: EnrichedTransaction[];
  currency: string;
  accountName: (id: string) => string;
  onCategory: (tx: EnrichedTransaction, category: string | null) => void;
  onDelete: (tx: EnrichedTransaction) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="table tx-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th>Account</th>
            <th className="right">Amount</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const locked = t.kind !== 'normal';
            return (
              <tr key={t.id}>
                <td className="tx-date nowrap">{formatDateYear(t.date)}</td>
                <td className="tx-cell-merchant">
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className="tx-merchant" title={t.rawDescription}>
                      {t.merchant}
                    </span>
                    {t.kind === 'transfer' ? <span className="badge badge-accent">Transfer</span> : null}
                    {t.kind === 'card_payment' ? <span className="badge badge-accent">Card payment</span> : null}
                    {t.seriesKey ? (
                      <span className="badge" title="Part of a recurring series">
                        <Icon name="repeat" size={11} strokeWidth={2.4} /> Recurring
                      </span>
                    ) : null}
                    {t.source === 'manual' ? <span className="badge">Cash</span> : null}
                  </div>
                  <div className="tx-raw" title={t.rawDescription}>
                    {t.rawDescription}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </td>
                <td className="tx-cell-category">
                  {locked ? (
                    <span className="small muted" title="Matched automatically so it isn’t counted as spending">
                      {t.kind === 'transfer' ? 'Own transfer' : 'Card payment'} · not spending
                    </span>
                  ) : (
                    <CategorySelect value={t.category} overridden={!!t.categoryOverride} onChange={(c) => onCategory(t, c)} label={`Category for ${t.merchant}`} />
                  )}
                </td>
                <td className="small muted nowrap tx-cell-account">{accountName(t.accountId)}</td>
                <td className={`num ${t.amount > 0 ? 'amount-in' : 'amount-out'}`} style={{ fontWeight: 600 }}>
                  {formatMoney(t.amount, currency, { exact: true, signed: true })}
                </td>
                <td className="tx-cell-actions right">
                  {t.source === 'manual' ? (
                    <button type="button" className="btn btn-ghost btn-icon" aria-label={`Delete ${t.merchant}`} onClick={() => onDelete(t)}>
                      <Icon name="trash" size={16} />
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
