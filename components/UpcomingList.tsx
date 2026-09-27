'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, UpcomingItem } from '@/lib/core/types';
import { addDaysISO, dayOfMonth, diffDaysISO, formatDate, formatMoney, weekday } from '@/lib/client/format';
import Icon from './Icon';
import { TYPE_META } from './meta';

export type CorrectionRequest = { item: UpcomingItem; action: 'not_recurring' | 'cancelled' | 'override_amount' };

function mondayOf(iso: string) {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return addDaysISO(iso, -dow);
}

export function evidenceLabel(item: UpcomingItem, a: AnalysisResult): string {
  if (item.source === 'receipt') return 'From receipt email';
  if (item.source === 'card_bill') return item.breakdown && item.breakdown.length > 1 ? 'Open statement + estimate' : 'Closed statement';
  if (item.source === 'payslip') return 'From payslip';
  if (item.type === 'income') return 'From bank credits';
  const s = a.series.find((x) => x.key === item.seriesKey);
  const n = s?.count ?? item.evidence.txIds.length;
  return `Based on ${n} payment${n === 1 ? '' : 's'}${item.evidence.receiptIds.length ? ' + receipt' : ''}`;
}

function RowMenu({ item, onCorrect, onOpen }: { item: UpcomingItem; onCorrect: (r: CorrectionRequest) => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const pick = (action: CorrectionRequest['action']) => {
    setOpen(false);
    onCorrect({ item, action });
  };
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="btn btn-ghost btn-icon" aria-label={`More actions for ${item.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="dots" size={18} />
      </button>
      {open ? (
        <div className="menu menu-down" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => (setOpen(false), onOpen())}>
            <Icon name="info" size={16} /> Why is this here?
          </button>
          {item.seriesKey ? (
            <>
              <div className="menu-sep" />
              <button type="button" role="menuitem" className="menu-item" onClick={() => pick('cancelled')}>
                <Icon name="x_circle" size={16} /> I cancelled this
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => pick('not_recurring')}>
                <Icon name="repeat" size={16} /> Not recurring
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => pick('override_amount')}>
                <Icon name="edit" size={16} /> Change amount…
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function UpcomingList({
  a,
  onOpen,
  onCorrect,
}: {
  a: AnalysisResult;
  onOpen: (item: UpcomingItem) => void;
  onCorrect: (r: CorrectionRequest) => void;
}) {
  const [showCard, setShowCard] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const all = a.upcoming.filter((i) => showCard || !i.viaCard);
  const LIMIT = 10;
  const items = expanded ? all : all.slice(0, LIMIT);
  const thisWeek = mondayOf(a.now);
  const groups = new Map<string, UpcomingItem[]>();
  for (const i of items) {
    const w = mondayOf(i.date);
    groups.set(w, [...(groups.get(w) ?? []), i]);
  }
  const cardName = (id: string) => a.accounts.find((x) => x.id === id)?.name ?? 'your card';
  const weekLabel = (w: string) => {
    const diff = diffDaysISO(thisWeek, w);
    return diff === 0 ? 'This week' : diff === 7 ? 'Next week' : `Week of ${formatDate(w)}`;
  };

  return (
    <section className="card" aria-labelledby="upcoming-title">
      <div className="card-header">
        <div>
          <h2 id="upcoming-title" className="card-title">
            Coming up
          </h2>
          <p className="card-sub">Every item is traceable — open one to see what it’s based on.</p>
        </div>
        <label className="checkbox small">
          <input type="checkbox" checked={showCard} onChange={(e) => setShowCard(e.target.checked)} />
          Card charges
        </label>
      </div>
      {items.length === 0 ? <p className="muted">Nothing predicted yet. Import a few months of statements to find your recurring bills.</p> : null}
      {[...groups.entries()].map(([w, list]) => {
        const out = list.filter((i) => i.amount < 0 && !i.viaCard).reduce((s, i) => s - i.amount, 0);
        return (
          <div className="week" key={w}>
            <div className="week-head">
              <span>{weekLabel(w)}</span>
              {out > 0 ? <span className="num">{formatMoney(out, a.currency)} out of checking</span> : null}
            </div>
            {list.map((item) => {
              const meta = TYPE_META[item.type];
              return (
                <div key={item.id} className={`up-row ${item.viaCard ? 'via-card' : ''}`}>
                  <div className="up-date" aria-label={formatDate(item.date)}>
                    <b>{dayOfMonth(item.date)}</b>
                    <span>{weekday(item.date)}</span>
                  </div>
                  <div className="up-main">
                    <div className="up-label">{item.label}</div>
                    <div className="up-meta">
                      <span className="chip">
                        <span className="swatch" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <button type="button" className="link-btn small" onClick={() => onOpen(item)}>
                        {evidenceLabel(item, a)}
                      </button>
                      {item.viaCard ? <span>on {cardName(item.accountId)} · paid via card bill</span> : null}
                    </div>
                  </div>
                  <div className={`up-amount ${item.amount > 0 ? 'amount-in' : ''}`}>
                    {formatMoney(item.amount, a.currency, { exact: true, signed: true })}
                    {item.estimatePart ? <small>incl. {formatMoney(item.estimatePart, a.currency)} estimate</small> : null}
                  </div>
                  <RowMenu item={item} onCorrect={onCorrect} onOpen={() => onOpen(item)} />
                </div>
              );
            })}
          </div>
        );
      })}
      {all.length > LIMIT ? (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {expanded ? 'Show less' : `Show all ${all.length} upcoming items`}
            <Icon name="chevron_down" size={15} className={expanded ? 'flip' : undefined} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
