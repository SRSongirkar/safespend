import { createHash } from 'crypto';
import type { Cents, ISODate } from './types';

export function normaliseRawDescription(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * fingerprint = sha256(accountId | date | amountCents | normalisedRawDescription | k), where k is the index of this
 * row among identical (date, amount, description) rows in the same file. Re-importing the same or an overlapping
 * file produces the same fingerprints, while two genuine identical coffees in one file stay distinct.
 */
export function fingerprintRows(accountId: string, rows: { date: ISODate; amount: Cents; description: string }[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.amount}|${normaliseRawDescription(r.description)}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return sha256(`${accountId}|${base}|${k}`);
  });
}

export function fingerprintDoc(kind: string, parts: (string | number)[]): string {
  return sha256(`${kind}|${parts.join('|')}`);
}
