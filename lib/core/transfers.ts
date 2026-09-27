import { diffDays } from './dates';
import type { Account, Transaction, TxKind } from './types';

const CARD_PAYMENT_DEBIT = /(CARD|CREDIT CARD|ONLINE PMT|AUTOPAY)/i;
const CARD_PAYMENT_CREDIT = /(PAYMENT|THANK YOU)/i;
const TRANSFER_TEXT = /(TRANSFER|TFR|XFER|TO SAV|FROM CHK)/i;

export interface TransferLink {
  kind: Exclude<TxKind, 'normal'>;
  linkedTxId: string;
}

type Tx = Pick<Transaction, 'id' | 'accountId' | 'date' | 'amount' | 'rawDescription'>;

/**
 * Match card payments and own-account transfers so they're never counted as spending, income or bills.
 * Greedy one-to-one matching: each debit takes the closest-dated unused credit of the same absolute amount.
 */
export function matchTransfers(txs: Tx[], accounts: Account[]): Map<string, TransferLink> {
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
  const links = new Map<string, TransferLink>();
  const isBank = (t: Tx) => {
    const type = typeOf.get(t.accountId);
    return type === 'checking' || type === 'savings';
  };

  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const pair = (
    debits: Tx[],
    credits: Tx[],
    windowDays: number,
    kind: TransferLink['kind'],
    extra: (d: Tx, c: Tx) => boolean,
  ) => {
    const byAmount = new Map<number, Tx[]>();
    for (const c of credits) {
      const list = byAmount.get(c.amount) ?? [];
      list.push(c);
      byAmount.set(c.amount, list);
    }
    for (const d of debits) {
      if (links.has(d.id)) continue;
      const candidates = byAmount.get(-d.amount);
      if (!candidates) continue;
      let best: Tx | undefined;
      let bestGap = Infinity;
      for (const c of candidates) {
        if (links.has(c.id) || c.accountId === d.accountId) continue;
        const gap = Math.abs(diffDays(d.date, c.date));
        if (gap <= windowDays && gap < bestGap && extra(d, c)) {
          best = c;
          bestGap = gap;
        }
      }
      if (best) {
        links.set(d.id, { kind, linkedTxId: best.id });
        links.set(best.id, { kind, linkedTxId: d.id });
      }
    }
  };

  // 1. Card payments: bank debit ↔ card credit, ±5 days
  pair(
    sorted.filter((t) => t.amount < 0 && isBank(t) && CARD_PAYMENT_DEBIT.test(t.rawDescription)),
    sorted.filter((t) => t.amount > 0 && typeOf.get(t.accountId) === 'card' && CARD_PAYMENT_CREDIT.test(t.rawDescription)),
    5,
    'card_payment',
    () => true,
  );

  // 2. Own transfers: bank debit ↔ credit in another own bank account, ±3 days, either side mentions a transfer
  pair(
    sorted.filter((t) => t.amount < 0 && isBank(t)),
    sorted.filter((t) => t.amount > 0 && isBank(t)),
    3,
    'transfer',
    (d, c) => TRANSFER_TEXT.test(d.rawDescription) || TRANSFER_TEXT.test(c.rawDescription),
  );

  return links;
}
