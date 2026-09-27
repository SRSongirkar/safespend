import { diffDays, formatShortDate } from './dates';
import type { IncomePlan } from './income';
import { formatCents, formatCentsExact } from './money';
import { cadenceInfo } from './recurring';
import type { CardBillInfo, ISODate, Insight, RecurringSeries, UpcomingItem } from './types';

/** "What you didn't know", ranked by money impact, max 4. */
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
        title: `${bill.accountName} bill of ${money(bill.due.amount)} is due ${formatShortDate(bill.due.dueDate)}`,
        detail: `Your bank balance doesn't show it yet — it's spending already done on the card in the statement that closed ${formatShortDate(
          bill.due.closeDate,
        )}.`,
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
      detail: `Found in an email. It isn't on any statement yet, so your bank balance doesn't include it.`,
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
        title: `${s.merchant} went ${up ? 'up' : 'down'} from ${exact(s.priceChange.from)} to ${exact(s.priceChange.to)}`,
        detail: `Since ${formatShortDate(s.priceChange.date)}. That's ${money(Math.abs(s.priceChange.to - s.priceChange.from) * perYear)} a year ${up ? 'more' : 'less'}.`,
        impactCents: Math.abs(s.priceChange.to - s.priceChange.from) * perYear,
        seriesKey: s.key,
      });
    }
    if (s.status === 'stopped' && s.direction === 'out' && diffDays(s.lastDate, asOf) <= 365) {
      out.push({
        id: `stopped|${s.key}`,
        kind: 'stopped',
        title: `${s.merchant} seems to have stopped`,
        detail: `Last charge ${exact(s.lastAmount)} on ${formatShortDate(s.lastDate)}. It's no longer in your forecast.`,
        impactCents: s.lastAmount * perYear,
        seriesKey: s.key,
      });
    }
    if (s.status === 'cancelled' && s.direction === 'out') {
      out.push({
        id: `cancelled|${s.key}`,
        kind: 'cancelled',
        title: `You cancelled ${s.merchant}`,
        detail: `That frees up ${money(s.predictedAmount * perYear)} a year. It's been removed from your forecast.`,
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
      title: `Your last pay was ${exact(m.bankNet)}, not ${exact(m.payslipNet)}`,
      detail: `Your payslip and the bank credit on ${formatShortDate(m.date)} disagree. We're using the bank amount.`,
      impactCents: Math.abs(m.bankNet - m.payslipNet),
    });
  }

  return out.sort((a, b) => b.impactCents - a.impactCents).slice(0, 4);
}
