import { randomUUID } from 'crypto';
import { toCents } from '@/lib/core/money';
import type { Account, AccountType } from '@/lib/core/types';
import { HttpError, int, oneOf, str } from '../http';
import { readVault, withVault } from '../repo';

const TYPES: readonly AccountType[] = ['checking', 'savings', 'card'];

function parseOpening(body: Record<string, unknown>): number | undefined {
  const v = body.openingBalanceCents;
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e12) return v;
  if (typeof v === 'string' && !Number.isNaN(toCents(v))) return toCents(v);
  throw new HttpError(400, 'openingBalanceCents must be a whole number of cents');
}

function applyCardFields(account: Account, body: Record<string, unknown>, accounts: Account[]) {
  if (account.type !== 'card') {
    delete account.statementCloseDay;
    delete account.dueDay;
    delete account.autopayFromId;
    return;
  }
  if ('statementCloseDay' in body) account.statementCloseDay = int(body, 'statementCloseDay', { min: 1, max: 31, optional: true });
  if ('dueDay' in body) account.dueDay = int(body, 'dueDay', { min: 1, max: 31, optional: true });
  if ('autopayFromId' in body) {
    const id = str(body, 'autopayFromId', { max: 64, optional: true });
    if (id && !accounts.some((a) => a.id === id && a.type !== 'card')) throw new HttpError(400, 'Autopay account must be one of your bank accounts');
    account.autopayFromId = id;
  }
}

export function listAccounts(userId: string): Account[] {
  return readVault(userId).accounts;
}

export function createAccount(userId: string, body: Record<string, unknown>): Promise<Account> {
  const name = str(body, 'name', { max: 60 })!;
  const type = oneOf(body, 'type', TYPES)!;
  const opening = parseOpening(body);
  return withVault(userId, (vault) => {
    if (vault.accounts.length >= 50) throw new HttpError(400, 'You can have up to 50 accounts');
    const account: Account = { id: randomUUID(), name, type, createdAt: new Date().toISOString() };
    if (opening !== undefined) account.openingBalanceCents = opening;
    applyCardFields(account, body, vault.accounts);
    vault.accounts.push(account);
    return account;
  });
}

export function updateAccount(userId: string, id: string, body: Record<string, unknown>): Promise<Account> {
  return withVault(userId, (vault) => {
    const account = vault.accounts.find((a) => a.id === id);
    if (!account) throw new HttpError(404, 'Account not found');
    if ('name' in body) account.name = str(body, 'name', { max: 60 })!;
    if ('openingBalanceCents' in body) {
      const opening = parseOpening(body);
      if (opening === undefined) delete account.openingBalanceCents;
      else account.openingBalanceCents = opening;
    }
    applyCardFields(account, body, vault.accounts);
    return account;
  });
}

/** Deletes the account and all of its transactions. */
export function deleteAccountById(userId: string, id: string): Promise<void> {
  return withVault(userId, (vault) => {
    if (!vault.accounts.some((a) => a.id === id)) throw new HttpError(404, 'Account not found');
    vault.accounts = vault.accounts.filter((a) => a.id !== id);
    vault.transactions = vault.transactions.filter((t) => t.accountId !== id);
    vault.imports = vault.imports.filter((i) => i.accountId !== id);
    for (const a of vault.accounts) if (a.autopayFromId === id) delete a.autopayFromId;
  });
}
