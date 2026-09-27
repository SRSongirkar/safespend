import type { Correction, CorrectionAction } from '@/lib/core/types';
import { HttpError, int, oneOf, str } from '../http';
import { withVault } from '../repo';

const ACTIONS: readonly CorrectionAction[] = ['not_recurring', 'cancelled', 'confirm', 'override_amount'];

export function addCorrection(userId: string, body: Record<string, unknown>): Promise<Correction> {
  const seriesKey = str(body, 'seriesKey', { max: 200 })!;
  const action = oneOf(body, 'action', ACTIONS)!;
  const amount = action === 'override_amount' ? int(body, 'amount', { min: 1, max: 100_000_000 }) : undefined;
  return withVault(userId, (vault) => {
    const accountId = seriesKey.split('|')[0];
    if (!vault.accounts.some((a) => a.id === accountId)) throw new HttpError(404, 'Series not found');
    const correction: Correction = { seriesKey, action, createdAt: new Date().toISOString(), ...(amount ? { amount } : {}) };
    vault.corrections = vault.corrections.filter((c) => c.seriesKey !== seriesKey);
    vault.corrections.push(correction);
    return correction;
  });
}

export function removeCorrection(userId: string, body: Record<string, unknown>): Promise<void> {
  const seriesKey = str(body, 'seriesKey', { max: 200 })!;
  return withVault(userId, (vault) => {
    vault.corrections = vault.corrections.filter((c) => c.seriesKey !== seriesKey);
  });
}
