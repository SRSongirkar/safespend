import { monthKey, prevMonthKey } from './dates';
import type { Cents, EnrichedTransaction, MonthlySummary } from './types';

interface Bucket {
  spend: Map<string, Cents>;
  merchants: Map<string, { amount: Cents; count: number }>;
  income: Cents;
  count: number;
}

/**
 * Per-month totals by category. Excludes transfers and card payments; card purchases count on their purchase date.
 * Refunds reduce their category's spend.
 */
export function monthlySummaries(txs: EnrichedTransaction[]): MonthlySummary[] {
  const buckets = new Map<string, Bucket>();
  for (const t of txs) {
    if (t.kind !== 'normal') continue;
    const key = monthKey(t.date);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { spend: new Map(), merchants: new Map(), income: 0, count: 0 }));
    b.count++;
    if (t.category === 'income') {
      b.income += t.amount;
      continue;
    }
    b.spend.set(t.category, (b.spend.get(t.category) ?? 0) - t.amount);
    const m = b.merchants.get(t.merchant) ?? { amount: 0, count: 0 };
    m.amount -= t.amount;
    m.count++;
    b.merchants.set(t.merchant, m);
  }
  if (buckets.size === 0) return [];

  const keys = [...buckets.keys()].sort();
  // fill gaps so month-over-month comparisons are honest
  const all: string[] = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; ) {
    all.push(k);
    const [y, m] = k.split('-').map(Number);
    k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  const empty: Bucket = { spend: new Map(), merchants: new Map(), income: 0, count: 0 };
  const total = (b: Bucket) => [...b.spend.values()].reduce((s, v) => s + v, 0);

  return all.map((key) => {
    const b = buckets.get(key) ?? empty;
    const prev = buckets.get(prevMonthKey(key)) ?? empty;
    const cats = new Set([...b.spend.keys(), ...prev.spend.keys()]);
    const byCategory = [...cats]
      .map((category) => {
        const amount = b.spend.get(category) ?? 0;
        const prevAmount = prev.spend.get(category) ?? 0;
        return { category, amount, prevAmount, change: amount - prevAmount };
      })
      .sort((x, y) => y.amount - x.amount);
    const topMerchants = [...b.merchants.entries()]
      .map(([merchant, v]) => ({ merchant, amount: v.amount, count: v.count }))
      .filter((m) => m.amount > 0)
      .sort((x, y) => y.amount - x.amount)
      .slice(0, 5);
    const totalSpend = total(b);
    return { month: key, totalSpend, prevTotalSpend: total(prev), income: b.income, net: b.income - totalSpend, byCategory, topMerchants, txCount: b.count };
  });
}
