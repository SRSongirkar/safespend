import { randomUUID } from 'crypto';
import { isCategory } from '@/lib/core/categories';
import { sha256 } from '@/lib/core/fingerprint';
import type { EnrichedTransaction, Transaction } from '@/lib/core/types';
import { bool, HttpError, int, isoDate, str } from '../http';
import { withVault } from '../repo';
import { getBundle } from './analysis';

export interface TxFilters {
  month?: string;
  accountId?: string;
  category?: string;
  kind?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export function parseFilters(url: URL): TxFilters {
  const p = url.searchParams;
  const month = p.get('month') || undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'month must be YYYY-MM');
  const page = Math.max(1, Math.min(10_000, parseInt(p.get('page') ?? '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(200, parseInt(p.get('pageSize') ?? '50', 10) || 50));
  const q = (p.get('q') ?? '').trim().slice(0, 100) || undefined;
  return { month, accountId: p.get('accountId') || undefined, category: p.get('category') || undefined, kind: p.get('kind') || undefined, q, page, pageSize };
}

export function listTransactions(userId: string, f: TxFilters): { items: EnrichedTransaction[]; total: number; months: string[] } {
  const { enriched } = getBundle(userId);
  const needle = f.q?.toLowerCase();
  const filtered = enriched.filter(
    (t) =>
      (!f.month || t.date.startsWith(f.month)) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.category || t.category === f.category) &&
      (!f.kind || t.kind === f.kind) &&
      (!needle || t.merchant.toLowerCase().includes(needle) || t.rawDescription.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle)),
  );
  const sorted = [...filtered].reverse(); // newest first
  const start = (f.page - 1) * f.pageSize;
  const months = [...new Set(enriched.map((t) => t.date.slice(0, 7)))].sort().reverse();
  return { items: sorted.slice(start, start + f.pageSize), total: sorted.length, months };
}

export function createManual(userId: string, body: Record<string, unknown>): Promise<Transaction> {
  const accountId = str(body, 'accountId', { max: 64 })!;
  const date = isoDate(body, 'date')!;
  const description = str(body, 'description', { max: 200 })!;
  const amountCents = int(body, 'amountCents', { min: -100_000_000, max: 100_000_000 })!;
  if (amountCents === 0) throw new HttpError(400, 'Amount cannot be zero');
  const category = str(body, 'category', { max: 40, optional: true });
  if (category && !isCategory(category)) throw new HttpError(400, 'Unknown category');
  return withVault(userId, (vault) => {
    if (!vault.accounts.some((a) => a.id === accountId)) throw new HttpError(404, 'Account not found');
    const id = randomUUID();
    const tx: Transaction = { id, accountId, date, rawDescription: description, amount: amountCents, source: 'manual', fingerprint: sha256(`manual|${id}`) };
    if (category) tx.categoryOverride = category;
    vault.transactions.push(tx);
    return tx;
  });
}

export function patchTransaction(userId: string, id: string, body: Record<string, unknown>): Promise<{ updated: number }> {
  const hasCategory = 'categoryOverride' in body;
  const category = hasCategory ? str(body, 'categoryOverride', { max: 40, optional: true }) : undefined;
  if (category && !isCategory(category)) throw new HttpError(400, 'Unknown category');
  const note = 'note' in body ? str(body, 'note', { max: 300, optional: true }) ?? '' : undefined;
  const applyToMerchant = bool(body, 'applyToMerchant');
  const { enriched } = getBundle(userId);
  return withVault(userId, (vault) => {
    const tx = vault.transactions.find((t) => t.id === id);
    if (!tx) throw new HttpError(404, 'Transaction not found');
    if (note !== undefined) {
      if (note) tx.note = note;
      else delete tx.note;
    }
    let updated = 1;
    if (hasCategory) {
      if (applyToMerchant && category) {
        const merchant = enriched.find((t) => t.id === id)?.merchant;
        if (merchant) {
          vault.merchantRules = vault.merchantRules.filter((r) => r.merchant !== merchant);
          vault.merchantRules.push({ merchant, category });
          const ids = new Set(enriched.filter((t) => t.merchant === merchant).map((t) => t.id));
          updated = ids.size;
          // Clear per-transaction overrides so the merchant rule applies consistently.
          for (const t of vault.transactions) if (ids.has(t.id)) delete t.categoryOverride;
        }
      } else if (category) tx.categoryOverride = category;
      else delete tx.categoryOverride;
    }
    return { updated };
  });
}

export function deleteManual(userId: string, id: string): Promise<void> {
  return withVault(userId, (vault) => {
    const tx = vault.transactions.find((t) => t.id === id);
    if (!tx) throw new HttpError(404, 'Transaction not found');
    if (tx.source !== 'manual') throw new HttpError(403, 'Only manual transactions can be deleted. Undo the import instead.');
    vault.transactions = vault.transactions.filter((t) => t.id !== id);
  });
}
