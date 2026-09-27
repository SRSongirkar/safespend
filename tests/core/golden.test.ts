import { beforeAll, describe, expect, it } from 'vitest';
import { affordCheck } from '@/lib/core/afford';
import { analyze, type AnalysisBundle } from '@/lib/core/analyze';
import { emptyVault } from '@/lib/core/demoAccounts';
import { planImport } from '@/lib/core/ingest';
import { monthlySummaries } from '@/lib/core/monthly';
import type { UserVault } from '@/lib/core/types';
import { demoVault, newId, readDemo } from '../helpers';

// Golden tests on the demo data, as-of 2026-09-24, no corrections.
let vault: UserVault;
let bundle: AnalysisBundle;
const series = (merchant: string) => bundle.result.series.find((s) => s.merchant === merchant && s.direction === 'out');

beforeAll(() => {
  vault = demoVault();
  bundle = analyze(vault);
});

describe('golden', () => {
  it('G1: the 3 CSVs are detected as A/B/C with 0 row errors', () => {
    const v = emptyVault();
    v.accounts.push({ id: 'x', name: 'x', type: 'checking', createdAt: '' });
    for (const [file, format] of [
      ['bank_checking.csv', 'A'],
      ['bank_savings.csv', 'B'],
      ['card_rewards.csv', 'C'],
    ] as const) {
      const plan = planImport(v, { fileName: file, text: readDemo(file), accountId: 'x' }, { newId, today: '2026-09-24' });
      expect(plan.format).toBe(format);
      expect(plan.errors).toEqual([]);
      expect(plan.added).toBe(plan.rows);
    }
  });

  it('G2: dates parse per format (checking 03/10/2025 and card 10/03/2025 are both 2025-10-03)', () => {
    expect(readDemo('bank_checking.csv')).toContain('03/10/2025,HOMESHIELD INS PREMIUM');
    expect(readDemo('card_rewards.csv')).toContain('10/03/2025,SPOTIFY USA');
    const byMerchant = (m: string) => bundle.enriched.filter((t) => t.merchant === m).map((t) => t.date);
    expect(byMerchant('HomeShield')).toContain('2025-10-03');
    expect(byMerchant('Spotify')).toContain('2025-10-03');
  });

  it('G3: rent is monthly, fixed, next 2026-10-01, ₹35,000', () => {
    expect(series('Greenview Property Mgmt')).toMatchObject({ cadence: 'monthly', amountType: 'fixed', nextDate: '2026-10-01', predictedAmount: 3500000, status: 'active' });
  });

  it('G4: phone is monthly, variable, predicted = median of the last 3', () => {
    const s = series('Verizon')!;
    expect(s).toMatchObject({ cadence: 'monthly', amountType: 'variable' });
    const last3 = s.txIds.slice(-3).map((id) => -bundle.enriched.find((t) => t.id === id)!.amount).sort((a, b) => a - b);
    expect(s.predictedAmount).toBe(last3[1]);
  });

  it('G5: water is quarterly, next 2026-10-20', () => {
    expect(series('City Water')).toMatchObject({ cadence: 'quarterly', nextDate: '2026-10-20', status: 'active' });
  });

  it('G6: Netflix, Spotify, Prime, Gym (weekly) and the car loan are detected; Amazon ≠ Amazon Prime', () => {
    for (const m of ['Netflix', 'Spotify', 'Amazon Prime', 'AutoFin Loan']) expect(series(m)?.cadence).toBe('monthly');
    expect(series('CityGym')?.cadence).toBe('weekly');
    expect(series('Amazon')).toBeUndefined();
    expect(bundle.enriched.some((t) => t.merchant === 'Amazon')).toBe(true);
  });

  it('G7: Spotify price-change insight ₹274.75 → ₹299.75', () => {
    expect(series('Spotify')?.priceChange).toMatchObject({ from: 27475, to: 29975 });
    expect(series('Spotify')?.predictedAmount).toBe(29975);
    const insight = bundle.result.insights.find((i) => i.kind === 'price_change');
    expect(insight?.title).toContain('Spotify price went up from ₹274.75 to ₹299.75');
  });

  it('G8: Hulu is stopped and absent from upcoming', () => {
    expect(series('Hulu')?.status).toBe('stopped');
    expect(bundle.result.upcoming.some((u) => u.merchant === 'Hulu')).toBe(false);
    expect(bundle.result.insights.some((i) => i.kind === 'stopped' && i.title.includes('Hulu'))).toBe(true);
  });

  it('G9: coffee, groceries, Amazon shopping and the Apple Store are not recurring (0 false subscriptions)', () => {
    for (const m of ['Blue Bottle Coffee', "Trader Joe's", 'Whole Foods', 'Amazon', 'Apple Store', 'Uber', 'DoorDash', 'Shell', 'Target', 'Venmo', 'ATM Withdrawal', 'CVS Pharmacy']) {
      expect(series(m), m).toBeUndefined();
    }
    const detected = [...bundle.result.series, ...bundle.result.possibleSeries].map((s) => `${s.merchant}:${s.direction}`).sort();
    expect(detected).toEqual(
      [
        'Acme Design Co:in',
        'Amazon Prime:out',
        'AutoFin Loan:out',
        'City Water:out',
        'CityGym:out',
        'Greenview Property Mgmt:out',
        'Hulu:out',
        'Interest:in',
        'Netflix:out',
        'Spotify:out',
        'Transfer to savings:out',
        'Verizon:out',
      ].sort(),
    );
  });

  it('G10: autopay pairs are linked card payments, savings transfers are transfers, none count as spending', () => {
    const autopay = bundle.enriched.filter((t) => t.rawDescription.includes('AUTOPAY'));
    const thanks = bundle.enriched.filter((t) => t.rawDescription === 'PAYMENT - THANK YOU');
    expect(autopay.length).toBe(12);
    expect(thanks.length).toBe(12);
    for (const t of [...autopay, ...thanks]) {
      expect(t.kind).toBe('card_payment');
      const other = bundle.enriched.find((x) => x.id === t.linkedTxId)!;
      expect(other.linkedTxId).toBe(t.id);
      expect(other.amount).toBe(-t.amount);
    }
    const transfers = bundle.enriched.filter((t) => /TRANSFER (TO|FROM)/.test(t.rawDescription));
    expect(transfers.length).toBe(26);
    for (const t of transfers) expect(t.kind).toBe('transfer');
    for (const m of monthlySummaries(bundle.enriched)) {
      expect(m.byCategory.find((c) => c.category === 'transfer' || c.category === 'card payment')).toBeUndefined();
    }
  });

  it('G11: the insurance renewal 2026-10-03 ₹4,650 appears exactly once, from the receipt', () => {
    const items = bundle.result.upcoming.filter((u) => u.merchant === 'HomeShield');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: '2026-10-03', amount: -465000, source: 'receipt' });
    // The Netflix receipt merges into the predicted Netflix charge instead of duplicating it.
    const netflix = bundle.result.upcoming.filter((u) => u.merchant === 'Netflix' && u.date === '2026-10-12');
    expect(netflix).toHaveLength(1);
    expect(netflix[0].evidence.receiptIds).toHaveLength(1);
  });

  it('G12: card bill due 2026-09-28 = exact Aug 8–Sep 8 cycle sum; next bill > 0; card subscriptions are not checking outflows', () => {
    const card = vault.accounts.find((a) => a.type === 'card')!;
    const cycle = bundle.enriched.filter((t) => t.accountId === card.id && t.kind === 'normal' && t.date > '2026-08-08' && t.date <= '2026-09-08');
    const expected = -cycle.reduce((s, t) => s + t.amount, 0);
    const bill = bundle.result.cardBills[0];
    expect(bill.due).toMatchObject({ dueDate: '2026-09-28', amount: expected, paid: false });
    expect(bill.next?.dueDate).toBe('2026-10-28');
    expect(bill.next!.amount).toBeGreaterThan(0);
    const dueItem = bundle.result.upcoming.find((u) => u.type === 'card_bill' && u.date === '2026-09-28')!;
    expect(dueItem.amount).toBe(-expected);
    const cardItemIds = new Set(bundle.result.upcoming.filter((u) => u.viaCard).map((u) => u.id));
    expect(cardItemIds.size).toBeGreaterThan(0);
    for (const day of bundle.result.forecast) for (const e of day.events) expect(cardItemIds.has(e.itemId)).toBe(false);
  });

  it('G13: next payday 2026-09-30 (+₹1,21,250), the one after is 2026-10-30', () => {
    expect(bundle.result.nextPayday).toBe('2026-09-30');
    expect(bundle.result.followingPayday).toBe('2026-10-30');
    expect(bundle.result.payAmount).toBe(12125000);
    const pay = bundle.result.upcoming.filter((u) => u.type === 'income').map((u) => [u.date, u.amount]);
    expect(pay).toEqual([
      ['2026-09-30', 12125000],
      ['2026-10-30', 12125000],
    ]);
  });

  it('G14: the lowest point without extra spend is within ₹23,750–₹26,250', () => {
    expect(bundle.result.lowestPoint.amount).toBeGreaterThanOrEqual(2375000);
    expect(bundle.result.lowestPoint.amount).toBeLessThanOrEqual(2625000);
    expect(bundle.result.safeToSpend).toBe(Math.max(0, bundle.result.lowestPoint.amount - bundle.result.bufferCents));
  });

  it('G15: afford ₹7,500 → comfortable, ₹15,000 → tight, ₹50,000 → no (covered by savings)', () => {
    const check = (amountCents: number) => affordCheck(bundle.model, { amountCents, date: '2026-10-02', repeat: 'once' });
    expect(check(750000).verdict).toBe('comfortable');
    const tight = check(1500000);
    expect(tight.verdict).toBe('tight');
    expect(tight.firstBelowBuffer).toBeDefined();
    const no = check(5000000);
    expect(no.verdict).toBe('no');
    expect(no.coveredBySavings).toBe(bundle.result.savingsBalance + no.lowest.amount >= 0);
    expect(no.coveredBySavings).toBe(true);
  });

  it('G16: Aug 2026 spending excludes transfers and card payments and includes the ₹24,975 Apple Store purchase under shopping', () => {
    const aug = monthlySummaries(bundle.enriched).find((m) => m.month === '2026-08')!;
    const augTx = bundle.enriched.filter((t) => t.date.startsWith('2026-08') && t.kind === 'normal' && t.category !== 'income');
    expect(aug.totalSpend).toBe(-augTx.reduce((s, t) => s + t.amount, 0));
    const shopping = aug.byCategory.find((c) => c.category === 'shopping')!;
    expect(shopping.amount).toBeGreaterThanOrEqual(2497500);
    expect(bundle.enriched.find((t) => t.merchant === 'Apple Store')?.category).toBe('shopping');
    expect(aug.topMerchants.map((m) => m.merchant)).toContain('Apple Store');
  });

  it('G17: analysis of ~1,500 transactions finishes in < 1 s', () => {
    const big = demoVault();
    // pad with extra manual cash rows to reach ~1,500
    for (let i = 0; i < 300; i++) {
      big.transactions.push({
        id: `pad-${i}`,
        accountId: big.accounts[0].id,
        date: `2026-0${1 + (i % 8)}-${String(1 + (i % 27)).padStart(2, '0')}`,
        rawDescription: `CASH MARKET ${i % 17}`,
        amount: -(500 + ((i * 37) % 4000)),
        source: 'manual',
        fingerprint: `pad-${i}`,
      });
    }
    expect(big.transactions.length).toBeGreaterThanOrEqual(1500);
    const t0 = performance.now();
    analyze(big);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
