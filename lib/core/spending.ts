import { addDays, diffDays } from './dates';
import type { Cents, EnrichedTransaction, ISODate } from './types';

export const ESTIMATE_WINDOW_DAYS = 90;
/** With very little history, never average over fewer days than this (keeps one busy day from exploding the estimate). */
export const MIN_ESTIMATE_DAYS = 7;

/**
 * Everyday spending estimate per account: non-recurring, non-transfer outflows over the last 90 days,
 * minus the top 5% by amount (one-offs like a laptop), divided by the number of days covered — 90 for established
 * accounts, fewer for a new user who has only uploaded a few days (so the estimate isn't diluted to almost nothing).
 * Always an estimate — never "committed".
 */
export function everydayDailyByAccount(txs: EnrichedTransaction[], asOf: ISODate, recurringTxIds: Set<string>): Map<string, Cents> {
  const from = addDays(asOf, -ESTIMATE_WINDOW_DAYS);
  const firstDate = new Map<string, ISODate>();
  for (const t of txs) {
    if (t.date > asOf) continue;
    const f = firstDate.get(t.accountId);
    if (!f || t.date < f) firstDate.set(t.accountId, t.date);
  }
  const byAccount = new Map<string, Cents[]>();
  for (const t of txs) {
    if (t.kind !== 'normal' || t.amount >= 0 || t.date <= from || t.date > asOf || recurringTxIds.has(t.id)) continue;
    const list = byAccount.get(t.accountId) ?? [];
    list.push(-t.amount);
    byAccount.set(t.accountId, list);
  }
  const out = new Map<string, Cents>();
  for (const [accountId, amounts] of byAccount) {
    amounts.sort((a, b) => b - a);
    const trimmed = amounts.slice(Math.floor(amounts.length * 0.05));
    const total = trimmed.reduce((s, a) => s + a, 0);
    const covered = diffDays(firstDate.get(accountId) ?? from, asOf) + 1;
    const days = Math.max(MIN_ESTIMATE_DAYS, Math.min(ESTIMATE_WINDOW_DAYS, covered));
    out.set(accountId, Math.round(total / days));
  }
  return out;
}

/** Days of history available (earliest transaction → asOf, inclusive). 0 when there are no transactions. */
export function historyDays(txs: EnrichedTransaction[], asOf: ISODate): number {
  let first: ISODate | undefined;
  for (const t of txs) if (t.date <= asOf && (!first || t.date < first)) first = t.date;
  return first ? diffDays(first, asOf) + 1 : 0;
}
