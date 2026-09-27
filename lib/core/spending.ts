import { addDays } from './dates';
import type { Cents, EnrichedTransaction, ISODate } from './types';

export const ESTIMATE_WINDOW_DAYS = 90;

/**
 * Everyday spending estimate per account: non-recurring, non-transfer outflows over the last 90 days,
 * minus the top 5% by amount (one-offs like a laptop), divided by 90. Always an estimate — never "committed".
 */
export function everydayDailyByAccount(txs: EnrichedTransaction[], asOf: ISODate, recurringTxIds: Set<string>): Map<string, Cents> {
  const from = addDays(asOf, -ESTIMATE_WINDOW_DAYS);
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
    out.set(accountId, Math.round(total / ESTIMATE_WINDOW_DAYS));
  }
  return out;
}
