import { addMonths, clampedDate, diffDays, parts } from './dates';
import { dayOfMonthFor, occurrences } from './recurring';
import type { Account, CardBillInfo, Cents, EnrichedTransaction, ISODate, RecurringSeries } from './types';

export interface CardCycle {
  closeDate: ISODate;
  openExclusive: ISODate; // cycle covers (openExclusive, closeDate]
  dueDate: ISODate;
}

/** The cycle closing on day `c` of month M covers (c of M−1, c of M] and is due on dueDay (M if dueDay > c, else M+1). */
export function cycleFor(closeDay: number, dueDay: number, y: number, m: number): CardCycle {
  const prev = addMonths(y, m, -1);
  const due = dueDay > closeDay ? { y, m } : addMonths(y, m, 1);
  return {
    closeDate: clampedDate(y, m, closeDay),
    openExclusive: clampedDate(prev.y, prev.m, closeDay),
    dueDate: clampedDate(due.y, due.m, dueDay),
  };
}

/** Most recent cycle whose close date is ≤ asOf. */
export function lastClosedCycle(closeDay: number, dueDay: number, asOf: ISODate): CardCycle {
  const { y, m } = parts(asOf);
  const thisMonth = cycleFor(closeDay, dueDay, y, m);
  if (thisMonth.closeDate <= asOf) return thisMonth;
  const p = addMonths(y, m, -1);
  return cycleFor(closeDay, dueDay, p.y, p.m);
}

export function nextCycle(cycle: CardCycle, closeDay: number, dueDay: number): CardCycle {
  const { y, m } = parts(cycle.closeDate);
  const n = addMonths(y, m, 1);
  return cycleFor(closeDay, dueDay, n.y, n.m);
}

export interface CardBillPart {
  cycle: CardCycle;
  amount: Cents;
  actual: Cents; // posted purchases − refunds
  recurring: Cents; // predicted recurring card charges until close
  estimate: Cents; // everyday estimate × remaining days
  paid: boolean;
  txIds: string[];
  recurringLabels: { label: string; amount: Cents; date: ISODate }[];
}

/**
 * Card bills for one card, from the last closed cycle through every cycle due on or before `horizonEnd`.
 * Recurring card charges only ever feed the card bill — never the checking forecast directly.
 */
export function cardBillsFor(
  card: Account,
  txs: EnrichedTransaction[],
  series: RecurringSeries[],
  seriesTxDates: Map<string, ISODate[]>,
  dailyEstimate: Cents,
  asOf: ISODate,
  horizonEnd: ISODate,
): CardBillPart[] {
  if (!card.statementCloseDay || !card.dueDay) return [];
  const closeDay = card.statementCloseDay;
  const dueDay = card.dueDay;
  const cardTxs = txs.filter((t) => t.accountId === card.id && t.date <= asOf);
  const purchases = cardTxs.filter((t) => t.kind === 'normal');
  const payments = cardTxs.filter((t) => t.kind === 'card_payment' && t.amount > 0);
  const cardSeries = series.filter((s) => s.accountId === card.id && s.status === 'active' && s.direction === 'out');

  const sumCycle = (c: CardCycle, until: ISODate) => {
    const inCycle = purchases.filter((t) => t.date > c.openExclusive && t.date <= until && t.date <= c.closeDate);
    return { total: -inCycle.reduce((s, t) => s + t.amount, 0), ids: inCycle.map((t) => t.id) };
  };

  const bills: CardBillPart[] = [];
  let cycle = lastClosedCycle(closeDay, dueDay, asOf);
  for (let i = 0; i < 24; i++) {
    const closed = cycle.closeDate <= asOf;
    const posted = sumCycle(cycle, asOf);
    let recurring = 0;
    const recurringLabels: CardBillPart['recurringLabels'] = [];
    let estimate = 0;
    if (!closed) {
      const from = cycle.openExclusive > asOf ? cycle.openExclusive : asOf;
      for (const s of cardSeries) {
        for (const d of occurrences(s, dayOfMonthFor(s, seriesTxDates.get(s.key) ?? []), cycle.closeDate)) {
          if (d > from) {
            recurring += s.predictedAmount;
            recurringLabels.push({ label: s.merchant, amount: s.predictedAmount, date: d });
          }
        }
      }
      estimate = dailyEstimate * Math.max(0, diffDays(from, cycle.closeDate));
    }
    const paid = closed && payments.some((p) => p.date > cycle.closeDate);
    if (i <= 1 || cycle.dueDate <= horizonEnd) {
      bills.push({
        cycle,
        amount: Math.max(0, posted.total + recurring + estimate),
        actual: posted.total,
        recurring,
        estimate,
        paid,
        txIds: posted.ids,
        recurringLabels,
      });
    }
    if (i >= 1 && cycle.dueDate > horizonEnd) break;
    cycle = nextCycle(cycle, closeDay, dueDay);
  }
  return bills;
}

export function toCardBillInfo(card: Account, bills: CardBillPart[], asOf: ISODate): CardBillInfo {
  const due = bills.find((b) => b.cycle.closeDate <= asOf);
  const next = bills.find((b) => b.cycle.closeDate > asOf);
  return {
    accountId: card.id,
    accountName: card.name,
    due: due && { closeDate: due.cycle.closeDate, dueDate: due.cycle.dueDate, amount: due.amount, paid: due.paid, txIds: due.txIds },
    next: next && {
      closeDate: next.cycle.closeDate,
      dueDate: next.cycle.dueDate,
      amount: next.amount,
      actual: next.actual,
      recurring: next.recurring,
      estimate: next.estimate,
      txIds: next.txIds,
    },
  };
}
