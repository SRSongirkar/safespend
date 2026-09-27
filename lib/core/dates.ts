import type { DateFormat, ISODate } from './types';

// All dates are 'YYYY-MM-DD' strings handled with UTC helpers. Never `new Date('DD/MM/YYYY')`.

const DAY_MS = 86_400_000;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function toUTC(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeDate(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** m is 1-12 */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

/** b − a in whole days */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function dayOfWeek(iso: ISODate): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export function parts(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const p = addMonths(y, m, -1);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

/** Date for day-of-month `day` in (y, m), clamped to the month length. */
export function clampedDate(y: number, m: number, day: number): ISODate {
  return makeDate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Last working day of the month (Sat/Sun roll back to Friday). */
export function lastWorkingDay(y: number, m: number): ISODate {
  let iso = makeDate(y, m, daysInMonth(y, m));
  while (dayOfWeek(iso) === 0 || dayOfWeek(iso) === 6) iso = addDays(iso, -1);
  return iso;
}

/** First date strictly after `after` that falls on `day` of the month (clamped), stepping `stepMonths` from `from`'s month. */
export function nextMonthlyDate(after: ISODate, day: number, stepMonths = 1, anchor?: ISODate): ISODate {
  const base = parts(anchor ?? after);
  let { y, m } = base;
  for (let i = 0; i < 400; i++) {
    const candidate = clampedDate(y, m, day);
    if (candidate > after) return candidate;
    ({ y, m } = addMonths(y, m, stepMonths));
  }
  return addDays(after, 30);
}

/** First last-working-day strictly after `after`. */
export function nextLastWorkingDay(after: ISODate): ISODate {
  let { y, m } = parts(after);
  for (let i = 0; i < 3; i++) {
    const lwd = lastWorkingDay(y, m);
    if (lwd > after) return lwd;
    ({ y, m } = addMonths(y, m, 1));
  }
  return lastWorkingDay(y, m);
}

/** Parse a bank date string in a known format. Returns null if invalid. */
export function parseDate(input: string, fmt: DateFormat): ISODate | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  if (fmt === 'YYYY-MM-DD') {
    const r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (!r) return null;
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else {
    const r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
    if (!r) return null;
    const a = Number(r[1]);
    const b = Number(r[2]);
    y = Number(r[3]);
    if (r[3].length === 2) y += 2000;
    if (fmt === 'DD/MM/YYYY') [d, m] = [a, b];
    else [m, d] = [a, b];
  }
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || y < 1900 || y > 2200) return null;
  return makeDate(y, m, d);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Month name (full or 3-letter) → 1-12, or 0. */
export function monthFromName(name: string): number {
  const n = name.toLowerCase().slice(0, 3);
  const idx = MONTHS.findIndex((m) => m.startsWith(n));
  return idx + 1;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-29" → "29 Oct" */
export function formatShortDate(iso: ISODate): string {
  const { m, d } = parts(iso);
  return `${d} ${SHORT_MONTHS[m - 1]}`;
}
