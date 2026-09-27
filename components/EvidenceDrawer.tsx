'use client';

import { useEffect, useRef } from 'react';
import type { AnalysisResult, Receipt, UpcomingItem } from '@/lib/core/types';
import { formatDate, formatDateDay, formatDateYear, formatMoney } from '@/lib/client/format';
import Icon from './Icon';
import { TYPE_META } from './meta';
import type { CorrectionRequest } from './UpcomingList';

const HIGHLIGHT = /(\$\s?[\d,]+\.\d{2}|renews on[^.]*|renewal[^.]*|will be charged[^.]*|next billing date[^.]*)/gi;

/** Receipt body with amounts and renewal phrases highlighted (React nodes, never innerHTML). */
function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(HIGHLIGHT);
  return (
    <pre>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </pre>
  );
}

function ReceiptCard({ r }: { r: Receipt }) {
  return (
    <div className="receipt-card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Icon name="mail" size={16} className="faint" />
        <div className="spacer">
          <strong>{r.subject || '(no subject)'}</strong>
          <div className="tiny faint">
            {r.from} · {formatDateYear(r.date)}
          </div>
        </div>
      </div>
      <HighlightedBody text={r.body} />
    </div>
  );
}

export default function EvidenceDrawer({
  item,
  a,
  onClose,
  onCorrect,
}: {
  item: UpcomingItem;
  a: AnalysisResult;
  onClose: () => void;
  onCorrect: (r: CorrectionRequest) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const money = (c: number, exact = true) => formatMoney(c, a.currency, { exact });
  const series = item.seriesKey ? a.series.find((s) => s.key === item.seriesKey) : undefined;
  const txs = item.evidence.txIds.map((id) => a.refs.transactions[id]).filter(Boolean).sort((x, y) => (x.date < y.date ? 1 : -1));
  const receipts = item.evidence.receiptIds.map((id) => a.refs.receipts[id]).filter(Boolean);
  const payslips = item.evidence.payslipIds.map((id) => a.refs.payslips[id]).filter(Boolean);
  const account = a.accounts.find((x) => x.id === item.accountId);
  const meta = TYPE_META[item.type];
  const breakdownMax = Math.max(1, ...(item.breakdown ?? []).map((b) => b.amount));

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <div className="insight-icon" style={{ color: 'var(--ink-2)' }}>
            <Icon name={meta.icon} size={17} />
          </div>
          <div className="spacer">
            <h2 id="drawer-title" style={{ fontSize: 18 }}>
              {item.label}
            </h2>
            <div className="small muted">
              {formatDateDay(item.date)} · <span className={item.amount > 0 ? 'text-good' : ''}>{formatMoney(item.amount, a.currency, { exact: true, signed: true })}</span>
              {account ? ` · ${account.name}` : ''}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="alert alert-info">
            <Icon name="info" size={16} />
            <span>{item.evidence.note}</span>
          </div>

          <dl className="kv">
            <dt>Type</dt>
            <dd>{meta.label}</dd>
            <dt>Source</dt>
            <dd>
              {item.source === 'recurring'
                ? 'Recurring pattern in your transactions'
                : item.source === 'receipt'
                  ? 'Receipt / renewal email'
                  : item.source === 'card_bill'
                    ? 'Card statement'
                    : item.source === 'payslip'
                      ? 'Payslip'
                      : 'Bank credits'}
            </dd>
            {series ? (
              <>
                <dt>Cadence</dt>
                <dd>
                  {series.cadence}, {series.amountType === 'fixed' ? 'fixed amount' : 'amount varies'}
                </dd>
                <dt>History</dt>
                <dd>
                  {series.count} payments since {formatDate(series.firstDate)}
                </dd>
              </>
            ) : null}
            {item.viaCard ? (
              <>
                <dt>Paid</dt>
                <dd>on your card — included in the card bill, not counted twice</dd>
              </>
            ) : null}
            <dt>Confidence</dt>
            <dd>{Math.round(item.confidence * 100)}%</dd>
          </dl>
          <div className="meter" aria-hidden="true">
            <div style={{ width: `${Math.round(item.confidence * 100)}%` }} />
          </div>

          {item.breakdown ? (
            <div>
              <h3 className="card-section-title" style={{ marginTop: 0 }}>
                How the bill is built
              </h3>
              <div className="breakdown">
                {item.breakdown.map((b) => (
                  <div key={b.label} className="breakdown-row">
                    <span>
                      {b.label}
                      {b.estimate ? <span className="badge" style={{ marginLeft: 6 }}>Estimate</span> : null}
                    </span>
                    <strong className="num">{money(b.amount)}</strong>
                    <div className={`breakdown-bar ${b.estimate ? 'estimate hatch' : ''}`} style={{ width: `${Math.max(2, (b.amount / breakdownMax) * 100)}%` }} />
                  </div>
                ))}
              </div>
              {item.estimatePart ? (
                <p className="tiny faint" style={{ marginTop: 8 }}>
                  The hatched part is an estimate from your last 90 days of everyday card spending. It’s in the forecast, but not in “already committed”.
                </p>
              ) : null}
              {item.includes && item.includes.length > 0 ? (
                <>
                  <h3 className="card-section-title">Recurring card charges included</h3>
                  <ul className="evidence-list">
                    {item.includes.map((c, k) => (
                      <li key={k}>
                        <span className="faint">{formatDate(c.date)}</span>
                        <span>{c.label}</span>
                        <span className="num">{money(-c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          {receipts.length > 0 ? (
            <div className="stack-sm">
              <h3 className="card-section-title" style={{ marginTop: 0 }}>
                {receipts.length === 1 ? 'Receipt email' : 'Receipt emails'}
              </h3>
              {receipts.map((r) => (
                <ReceiptCard key={r.id} r={r} />
              ))}
            </div>
          ) : null}

          {payslips.length > 0 ? (
            <div>
              <h3 className="card-section-title" style={{ marginTop: 0 }}>
                Payslips
              </h3>
              <ul className="evidence-list">
                {payslips.map((p) => (
                  <li key={p.id}>
                    <span className="faint">{formatDate(p.payDate)}</span>
                    <span>
                      {p.employer}
                      <span className="tiny faint"> · gross {money(p.grossCents, false)}, deductions {money(p.deductionsCents, false)}</span>
                    </span>
                    <span className="num text-good">{money(p.netCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {txs.length > 0 ? (
            <div>
              <h3 className="card-section-title" style={{ marginTop: 0 }}>
                {item.source === 'card_bill' ? `Purchases in this statement (${txs.length})` : 'Past payments'}
              </h3>
              <ul className="evidence-list">
                {txs.slice(0, 40).map((t) => (
                  <li key={t.id}>
                    <span className="faint">{formatDateYear(t.date)}</span>
                    <span className="tx-raw" title={t.rawDescription} style={{ fontSize: 12.5 }}>
                      {t.rawDescription}
                    </span>
                    <span className={`num ${t.amount > 0 ? 'text-good' : ''}`}>{formatMoney(t.amount, a.currency, { exact: true, signed: true })}</span>
                  </li>
                ))}
              </ul>
              {txs.length > 40 ? <p className="tiny faint">…and {txs.length - 40} more</p> : null}
            </div>
          ) : null}

          {item.seriesKey ? (
            <div>
              <h3 className="card-section-title" style={{ marginTop: 0 }}>
                Not right?
              </h3>
              <div className="row-wrap">
                <button type="button" className="btn btn-sm" onClick={() => onCorrect({ item, action: 'cancelled' })}>
                  <Icon name="x_circle" size={15} /> I cancelled this
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onCorrect({ item, action: 'not_recurring' })}>
                  Not recurring
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onCorrect({ item, action: 'override_amount' })}>
                  <Icon name="edit" size={15} /> Change amount
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
