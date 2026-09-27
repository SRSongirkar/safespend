import type { Cents } from './types';

/**
 * Parse a money string into integer cents without float arithmetic.
 * Accepts "$1,400.00", "-$15.49", "(12.00)", "1400", "15.5", " 3 ". Empty → 0. Invalid → NaN.
 */
export function toCents(input: string | number | null | undefined): Cents {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return NaN;
    return Math.round(input * 100);
  }
  let s = input.trim();
  if (s === '') return 0;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  s = s.replace(/^[A-Z]{3}\s*/i, '').replace(/[$€£¥₹]/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d{0,2})\d*)?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) return NaN;
  const whole = m[1] === '' ? 0 : parseInt(m[1], 10);
  const frac = m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0;
  const value = whole * 100 + frac;
  return negative ? -value : value;
}

export function sumCents(values: Cents[]): Cents {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function medianCents(values: Cents[]): Cents {
  return Math.round(median(values));
}

/** Coefficient of variation (population std dev / mean). */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

export const localeFor = (currency: string) => (currency === 'INR' ? 'en-IN' : 'en-US');

/** Plain formatting for server-side sentences (the client uses Intl with the user's currency). */
export function formatCents(c: Cents, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(c / 100));
  } catch {
    return `${currency} ${Math.round(c / 100)}`;
  }
}

export function formatCentsExact(c: Cents, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency }).format(c / 100);
  } catch {
    return `${currency} ${(c / 100).toFixed(2)}`;
  }
}
