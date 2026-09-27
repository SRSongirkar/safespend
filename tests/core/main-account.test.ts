import { describe, expect, it } from 'vitest';
import { analyze } from '@/lib/core/analyze';
import { emptyVault } from '@/lib/core/demoAccounts';
import { planImport } from '@/lib/core/ingest';
import type { AccountType } from '@/lib/core/types';

const CSV = 'Date,Description,Debit,Credit,Balance\n25/09/2026,UPI/SWIGGY/ORDER 1,386.00,,"125,999.75"\n26/09/2026,HP PETROL PUMP,"1,500.00",,"124,499.75"\n';
const EMAILS = JSON.stringify([
  { from: 'Acko Insurance <r@acko.example>', subject: 'Renewal', date: '2026-09-26', body: 'Your policy renews on October 12, 2026. Premium: ₹8,450.00.' },
]);

function vaultWith(type: AccountType) {
  const v = emptyVault();
  v.accounts.push({ id: 'a1', name: 'My Bank', type, createdAt: '' });
  let n = 0;
  const newId = () => `x${++n}`;
  for (const f of [
    { fileName: 'b.csv', text: CSV, accountId: 'a1' },
    { fileName: 'e.json', text: EMAILS },
  ]) {
    const p = planImport(v, f, { newId, today: '2026-09-27' });
    v.transactions.push(...p.transactions);
    v.receipts.push(...p.receipts);
  }
  return v;
}

describe('main account', () => {
  it('uses a savings account as the main account when there is no checking account (Indian salary accounts)', () => {
    for (const type of ['checking', 'savings'] as const) {
      const { result } = analyze(vaultWith(type));
      expect(result.hasMainAccount).toBe(true);
      expect(result.startBalance).toBe(12449975);
      expect(result.committedUntilPayday.total).toBe(845000);
      expect(result.lowestPoint.amount).toBeGreaterThan(0);
      expect(result.savingsBalance).toBe(0);
    }
  });

  it('flags a user who has added only a credit card', () => {
    expect(analyze(vaultWith('card')).result.hasMainAccount).toBe(false);
  });
});
