import { diffDays, formatShortDate } from './dates';
import type { IncomePlan } from './income';
import { formatCents, formatCentsExact } from './money';
import { cadenceInfo } from './recurring';
import type { CardBillInfo, ISODate, Insight, RecurringSeries, UpcomingItem } from './types';

/** "Things you should know", ranked by money impact, max 4. Written in plain words. */
export function buildInsights(input: {
  asOf: ISODate;
  currency: string;
  series: RecurringSeries[];
  upcoming: UpcomingItem[];
  cardBills: CardBillInfo[];
  income?: IncomePlan;
  horizonEnd: ISODate;
}): Insight[] {
  const { asOf, currency } = input;
  const money = (c: number) => formatCents(c, currency);
  const exact = (c: number) => formatCentsExact(c, currency);
  const out: Insight[] = [];

  for (const bill of input.cardBills) {
    if (bill.due && !bill.due.paid && bill.due.amount > 0 && bill.due.dueDate > asOf) {
      out.push({
        id: `card_bill|${bill.accountId}`,
        kind: 'card_bill',
        title: `${bill.accountName} bill of ${money(bill.due.amount)} is due on ${formatShortDate(bill.due.dueDate)}`,
        detail: `Your bank balance doesn’t show this yet. You already spent this money on the card (bill made on ${formatShortDate(bill.due.closeDate)}).`,
        impactCents: bill.due.amount,
      });
    }
  }

  for (const item of input.upcoming) {
    if (item.source !== 'receipt' || item.date > input.horizonEnd) continue;
    out.push({
      id: `renewal|${item.id}`,
      kind: 'renewal',
      title: `${item.merchant} renews on ${formatShortDate(item.date)} — ${money(-item.amount)}`,
      detail: `We found this in your email. It is not in your bank statement yet.`,
      impactCents: -item.amount,
    });
  }

  for (const s of input.series) {
    const perYear = cadenceInfo(s.cadence).perYear;
    if (s.status === 'active' && s.priceChange && diffDays(s.priceChange.date, asOf) <= 120 && s.priceChange.to !== s.priceChange.from) {
      const up = s.priceChange.to > s.priceChange.from;
      out.push({
        id: `price|${s.key}`,
        kind: 'price_change',
        title: `${s.merchant} price went ${up ? 'up' : 'down'} from ${exact(s.priceChange.from)} to ${exact(s.priceChange.to)}`,
        detail: `From ${formatShortDate(s.priceChange.date)}. You will pay ${money(Math.abs(s.priceChange.to - s.priceChange.from) * perYear)} ${up ? 'more' : 'less'} per year.`,
        impactCents: Math.abs(s.priceChange.to - s.priceChange.from) * perYear,
        seriesKey: s.key,
      });
    }
    if (s.status === 'stopped' && s.direction === 'out' && diffDays(s.lastDate, asOf) <= 365) {
      out.push({
        id: `stopped|${s.key}`,
        kind: 'stopped',
        title: `${s.merchant} payments have stopped`,
        detail: `Last paid ${exact(s.lastAmount)} on ${formatShortDate(s.lastDate)}. We removed it from your plan.`,
        impactCents: s.lastAmount * perYear,
        seriesKey: s.key,
      });
    }
    if (s.status === 'cancelled' && s.direction === 'out') {
      out.push({
        id: `cancelled|${s.key}`,
        kind: 'cancelled',
        title: `You cancelled ${s.merchant}`,
        detail: `You save ${money(s.predictedAmount * perYear)} a year. We removed it from your plan.`,
        impactCents: s.predictedAmount * perYear,
        seriesKey: s.key,
      });
    }
  }

  if (input.income?.mismatch) {
    const m = input.income.mismatch;
    out.push({
      id: 'payday_mismatch',
      kind: 'payday_mismatch',
      title: `Your last salary was ${exact(m.bankNet)}, not ${exact(m.payslipNet)}`,
      detail: `Your salary slip and the bank credit on ${formatShortDate(m.date)} don’t match. We are using the bank amount.`,
      impactCents: Math.abs(m.bankNet - m.payslipNet),
    });
  }

  return out.sort((a, b) => b.impactCents - a.impactCents).slice(0, 4);
}
