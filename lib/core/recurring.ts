import { addDays, addMonths, clampedDate, diffDays, nextMonthlyDate, parts } from './dates';
import { coefficientOfVariation, median, medianCents } from './money';
import type { AccountType, Cadence, Cents, EnrichedTransaction, ISODate, RecurringSeries } from './types';

export const CADENCES: { cadence: Cadence; days: number; tol: number; perYear: number }[] = [
  { cadence: 'weekly', days: 7, tol: 2, perYear: 52 },
  { cadence: 'biweekly', days: 14, tol: 3, perYear: 26 },
  { cadence: 'monthly', days: 30, tol: 4, perYear: 12 },
  { cadence: 'quarterly', days: 91, tol: 10, perYear: 4 },
  { cadence: 'yearly', days: 365, tol: 20, perYear: 1 },
];

export const cadenceInfo = (c: Cadence) => CADENCES.find((x) => x.cadence === c)!;

export function seriesKeyFor(accountId: string, merchant: string, direction: 'out' | 'in'): string {
  return direction === 'out' ? `${accountId}|${merchant}` : `${accountId}|${merchant}|in`;
}

const within = (v: number, pct: number, ref: number) => Math.abs(v - ref) <= Math.abs(ref) * pct;
const allNear = (values: number[], pct: number) => {
  const m = median(values);
  return values.every((v) => within(v, pct, m));
};

interface AmountProfile {
  amountType: 'fixed' | 'variable';
  stability: number;
  predicted: Cents;
  priceChange?: { from: Cents; to: Cents; date: ISODate };
}

/** fixed: every amount within ±2% of the median (or one clean price step); variable: CV ≤ 0.25; otherwise not recurring. */
export function amountProfile(amounts: Cents[], dates: ISODate[]): AmountProfile | null {
  const n = amounts.length;
  const last = amounts[n - 1];
  if (allNear(amounts, 0.02)) {
    const prev = amounts[n - 2];
    const priceChange = prev !== undefined && !within(last, 0.03, prev) ? { from: prev, to: last, date: dates[n - 1] } : undefined;
    return { amountType: 'fixed', stability: 1, predicted: last, priceChange };
  }
  // A single price step: both segments fixed, levels differ by > 3% (e.g. Spotify $10.99 → $11.99)
  for (let s = n - 1; s >= 2; s--) {
    const older = amounts.slice(0, s);
    const newer = amounts.slice(s);
    if (allNear(older, 0.02) && allNear(newer, 0.02)) {
      const from = older[older.length - 1];
      const to = newer[0];
      if (!within(to, 0.03, from)) return { amountType: 'fixed', stability: 0.95, predicted: last, priceChange: { from, to, date: dates[s] } };
    }
  }
  const cv = coefficientOfVariation(amounts);
  if (cv <= 0.25) {
    return { amountType: 'variable', stability: Math.max(0, 1 - (cv / 0.25) * 0.5), predicted: medianCents(amounts.slice(-3)) };
  }
  return null;
}

function mostCommonDay(dates: ISODate[]): number {
  const counts = new Map<number, number>();
  for (const d of dates) counts.set(parts(d).d, (counts.get(parts(d).d) ?? 0) + 1);
  let best = parts(dates[dates.length - 1]).d;
  let bestCount = 0;
  for (const [day, c] of counts) if (c > bestCount || (c === bestCount && day === parts(dates[dates.length - 1]).d)) [best, bestCount] = [day, c];
  return best;
}

/** First predicted date strictly after `asOf`. */
export function nextOccurrence(cadence: Cadence, dates: ISODate[], asOf: ISODate): ISODate {
  const last = dates[dates.length - 1];
  if (cadence === 'monthly') return nextMonthlyDate(asOf, mostCommonDay(dates), 1, last);
  if (cadence === 'quarterly' || cadence === 'yearly') {
    const step = cadence === 'quarterly' ? 3 : 12;
    const day = mostCommonDay(dates);
    let { y, m } = parts(last);
    for (let i = 0; i < 200; i++) {
      ({ y, m } = addMonths(y, m, step));
      const d = clampedDate(y, m, day);
      if (d > asOf) return d;
    }
  }
  const stepDays = cadenceInfo(cadence).days;
  let d = last;
  while (d <= asOf) d = addDays(d, stepDays);
  return d;
}

/** Occurrences from `first` (inclusive) while ≤ `until`. */
export function occurrences(series: Pick<RecurringSeries, 'cadence' | 'nextDate'>, dayOfMonth: number | null, until: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let d = series.nextDate;
  let guard = 0;
  while (d <= until && guard++ < 500) {
    out.push(d);
    if (series.cadence === 'monthly' || series.cadence === 'quarterly' || series.cadence === 'yearly') {
      const step = series.cadence === 'monthly' ? 1 : series.cadence === 'quarterly' ? 3 : 12;
      const { y, m } = parts(d);
      const n = addMonths(y, m, step);
      d = clampedDate(n.y, n.m, dayOfMonth ?? parts(d).d);
    } else {
      d = addDays(d, cadenceInfo(series.cadence).days);
    }
  }
  return out;
}

export function dayOfMonthFor(series: RecurringSeries, txDates: ISODate[]): number | null {
  if (series.cadence === 'weekly' || series.cadence === 'biweekly') return null;
  return mostCommonDay(txDates);
}

export interface DetectOptions {
  asOf: ISODate;
  accountTypes: Map<string, AccountType>;
  receiptMerchants: Set<string>;
}

/**
 * Detect recurring series per (account, merchant, direction). Card payments are never considered; own transfers
 * only as outflows (a planned savings transfer is real money leaving checking), never as spending or income.
 */
export function detectRecurring(txs: EnrichedTransaction[], opts: DetectOptions): RecurringSeries[] {
  const groups = new Map<string, EnrichedTransaction[]>();
  for (const t of txs) {
    if (t.kind === 'card_payment' || t.date > opts.asOf || t.amount === 0) continue;
    const direction = t.amount < 0 ? 'out' : 'in';
    if (t.kind === 'transfer' && direction === 'in') continue;
    const key = seriesKeyFor(t.accountId, t.merchant, direction);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const result: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const n = list.length;
    if (n < 2) continue;
    const dates = list.map((t) => t.date);
    const intervals = dates.slice(1).map((d, i) => diffDays(dates[i], d));
    const medInterval = median(intervals);
    const cad = CADENCES.find((c) => Math.abs(medInterval - c.days) <= c.tol);
    if (!cad) continue;
    const merchant = list[0].merchant;
    const minCount = (cad.cadence === 'quarterly' || cad.cadence === 'yearly') && opts.receiptMerchants.has(merchant) ? 2 : 3;
    if (n < minCount) continue;
    const intervalConsistency = intervals.filter((i) => Math.abs(i - cad.days) <= cad.tol).length / intervals.length;
    if (intervalConsistency < 0.7) continue;
    const span = Math.max(1, diffDays(dates[0], dates[n - 1]));
    if ((n * 30) / span > 6) continue; // frequency guard: coffee, groceries…
    const amounts = list.map((t) => Math.abs(t.amount));
    const profile = amountProfile(amounts, dates);
    if (!profile) continue;

    const confidence = 0.4 * intervalConsistency + 0.4 * profile.stability + 0.2 * Math.min(1, n / 6);
    const lastDate = dates[n - 1];
    const stopped = diffDays(lastDate, opts.asOf) > 1.5 * cad.days;
    const direction = list[0].amount < 0 ? 'out' : 'in';
    result.push({
      key,
      accountId: list[0].accountId,
      accountType: opts.accountTypes.get(list[0].accountId) ?? 'checking',
      merchant,
      category: list[list.length - 1].category,
      direction,
      isTransfer: list[0].kind === 'transfer',
      cadence: cad.cadence,
      amountType: profile.amountType,
      txIds: list.map((t) => t.id),
      count: n,
      firstDate: dates[0],
      lastDate,
      lastAmount: amounts[n - 1],
      predictedAmount: profile.predicted,
      nextDate: nextOccurrence(cad.cadence, dates, opts.asOf),
      confidence: Math.round(confidence * 100) / 100,
      status: stopped ? 'stopped' : confidence < 0.6 ? 'possible' : 'active',
      priceChange: profile.priceChange,
      receiptIds: [],
    });
  }
  return result.sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
}
