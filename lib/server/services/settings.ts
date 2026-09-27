import type { Settings } from '@/lib/core/types';
import { HttpError, int, isoDate, str } from '../http';
import { readVault, withVault } from '../repo';

export function getSettings(userId: string): Settings {
  return readVault(userId).settings;
}

export function patchSettings(userId: string, body: Record<string, unknown>): Promise<Settings> {
  const currency = 'currency' in body ? str(body, 'currency', { min: 3, max: 3 })!.toUpperCase() : undefined;
  if (currency) {
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency });
    } catch {
      throw new HttpError(400, 'Unknown currency code');
    }
  }
  const bufferCents = 'bufferCents' in body ? int(body, 'bufferCents', { min: 0, max: 100_000_000 }) : undefined;
  const hasAsOf = 'asOfOverride' in body;
  const asOf = hasAsOf ? isoDate(body, 'asOfOverride', true) : undefined;
  return withVault(userId, (vault) => {
    if (currency) vault.settings.currency = currency;
    if (bufferCents !== undefined) vault.settings.bufferCents = bufferCents;
    if (hasAsOf) {
      if (asOf) vault.settings.asOfOverride = asOf;
      else delete vault.settings.asOfOverride;
    }
    return vault.settings;
  });
}
