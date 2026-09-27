import { describe, expect, it } from 'vitest';
import { buildForecast, lowestOf } from '@/lib/core/forecast';
import { monthlySummaries } from '@/lib/core/monthly';
import { findAmount, findRenewalDate, parseEmailText } from '@/lib/core/receipts';
import { amountProfile, detectRecurring } from '@/lib/core/recurring';
import { matchTransfers } from '@/lib/core/transfers';
import type { Account, EnrichedTransaction } from '@/lib/core/types';

const acct = (id: string, type: Account['type']): Account => ({ id, name: id, type, createdAt: '' });
const tx = (id: string, accountId: string, date: string, amount: number, rawDescription: string, merchant = rawDescription): EnrichedTransaction => ({
  id,
  accountId,
  date,
  amount,
  rawDescription,
  source: 'import',
  fingerprint: id,
  merchant,
  category: 'other',
  kind: 'normal',
});

describe('transfers', () => {
  it('links card payments and own transfers one-to-one', () => {
    const accounts = [acct('chk', 'checking'), acct('sav', 'savings'), acct('card', 'card')];
    const links = matchTransfers(
      [
        tx('1', 'chk', '2026-09-28', -50000, 'ONLINE PMT REWARDS CARD AUTOPAY'),
        tx('2', 'card', '2026-09-29', 50000, 'PAYMENT - THANK YOU'),
        tx('3', 'chk', '2026-09-02', -30000, 'TRANSFER TO SAV'),
        tx('4', 'sav', '2026-09-02', 30000, 'TRANSFER FROM CHK'),
        tx('5', 'chk', '2026-09-03', -30000, 'RENT'),
        tx('6', 'sav', '2026-09-20', 30000, 'TRANSFER FROM CHK'), // too far away
      ],
      accounts,
    );
    expect(links.get('1')).toEqual({ kind: 'card_payment', linkedTxId: '2' });
    expect(links.get('3')).toEqual({ kind: 'transfer', linkedTxId: '4' });
    expect(links.has('5')).toBe(false);
    expect(links.has('6')).toBe(false);
  });
});

describe('recurring', () => {
  const opts = (asOf: string) => ({ asOf, accountTypes: new Map([['c', 'card' as const]]), receiptMerchants: new Set<string>() });
  const monthly = (merchant: string, amounts: number[], day = 12) =>
    amounts.map((a, i) => tx(`${merchant}${i}`, 'c', `2026-${String(i + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, -a, merchant));

  it('detects a fixed monthly series and predicts the next date', () => {
    const s = detectRecurring(monthly('Netflix', [1549, 1549, 1549, 1549]), opts('2026-04-20'));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ cadence: 'monthly', amountType: 'fixed', nextDate: '2026-05-12', status: 'active', predictedAmount: 1549 });
  });
  it('flags a stopped series and rejects erratic amounts', () => {
    expect(detectRecurring(monthly('Hulu', [799, 799, 799]), opts('2026-06-30'))[0].status).toBe('stopped');
    expect(detectRecurring(monthly('Shop', [1000, 9000, 2500, 12000]), opts('2026-04-20'))).toHaveLength(0);
  });
  it('rejects high-frequency merchants (coffee)', () => {
    const coffee = Array.from({ length: 40 }, (_, i) => tx(`k${i}`, 'c', `2026-03-${String((i % 28) + 1).padStart(2, '0')}`, -550, 'Coffee'));
    expect(detectRecurring(coffee, opts('2026-04-01'))).toHaveLength(0);
  });
  it('recognises a price step as fixed with a price change', () => {
    const p = amountProfile([1099, 1099, 1099, 1199, 1199], ['a', 'b', 'c', '2026-08-03', 'e']);
    expect(p).toMatchObject({ amountType: 'fixed', predicted: 1199, priceChange: { from: 1099, to: 1199, date: '2026-08-03' } });
  });
});

describe('receipts', () => {
  it('extracts amounts and renewal dates in several formats', () => {
    expect(findAmount('Amount: $186.00.')).toBe(18600);
    expect(findRenewalDate('Your policy renews on October 3, 2026.')).toBe('2026-10-03');
    expect(findRenewalDate('Your renewal is 3 October 2026')).toBe('2026-10-03');
    expect(findRenewalDate('You will be charged on 2026-10-03.')).toBe('2026-10-03');
    expect(findRenewalDate('Your price is changing in August 2026')).toBeNull();
  });
  it('parses pasted email headers', () => {
    const e = parseEmailText('From: HomeShield <b@h.example>\nSubject: Renewal\nDate: 2026-09-10\n\nRenews on October 3, 2026. $186.00', '2026-01-01');
    expect(e).toMatchObject({ from: 'HomeShield <b@h.example>', subject: 'Renewal', date: '2026-09-10' });
  });
});

describe('forecast', () => {
  it('applies outflows before income within a day', () => {
    const days = buildForecast(
      10000,
      '2026-09-24',
      '2026-09-26',
      [
        { date: '2026-09-25', itemId: 'pay', label: 'Pay', amount: 50000 },
        { date: '2026-09-25', itemId: 'rent', label: 'Rent', amount: -30000 },
      ],
      1000,
    );
    expect(days[1]).toMatchObject({ low: 10000 - 30000 - 1000, balance: 10000 - 30000 - 1000 + 50000 });
    expect(lowestOf(days)).toEqual({ date: '2026-09-25', amount: -21000 });
  });
});

describe('monthly', () => {
  it('excludes transfers and card payments and nets refunds', () => {
    const rows: EnrichedTransaction[] = [
      { ...tx('1', 'c', '2026-08-02', -5000, 'A'), category: 'shopping' },
      { ...tx('2', 'c', '2026-08-03', 1000, 'A'), category: 'shopping' },
      { ...tx('3', 'k', '2026-08-04', -30000, 'T'), kind: 'transfer', category: 'transfer' },
      { ...tx('4', 'k', '2026-08-31', 485000, 'P'), category: 'income' },
    ];
    expect(monthlySummaries(rows)[0]).toMatchObject({ month: '2026-08', totalSpend: 4000, income: 485000 });
  });
});
