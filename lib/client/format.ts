// Display-only formatting. Money is integer cents everywhere; this is the only place it becomes a string.

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, digits: number): Intl.NumberFormat {
  const key = `${currency}|${digits}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    moneyFormatters.set(key, f);
  }
  return f;
}

/** $1,004 (default) · $15.49 (exact) · +$4,850 (signed) */
export function formatMoney(cents: number, currency = 'INR', opts: { exact?: boolean; signed?: boolean } = {}): string {
  const digits = opts.exact ? 2 : 0;
  const value = opts.exact ? cents / 100 : Math.round(cents / 100);
  const s = formatter(currency, digits).format(opts.signed ? Math.abs(value) : value);
  if (!opts.signed) return s.replace('-', '−');
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

/** Compact axis labels: ₹1.5L, ₹25k, ₹950, −₹2k (L = lakh for INR) */
export function formatMoneyCompact(cents: number, currency = 'INR'): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  const symbol = formatter(currency, 0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$';
  if (currency === 'INR' && abs >= 100000) {
    const l = abs / 100000;
    return `${sign}${symbol}${Number.isInteger(l) ? l : l.toFixed(1)}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${symbol}${k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${sign}${symbol}${Math.round(abs)}`;
}

export function currencySymbol(currency = 'INR'): string {
  return formatter(currency, 0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** 29 Oct */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** 29 Oct 2026 */
export function formatDateYear(iso: string): string {
  if (!iso) return '';
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Thu 29 Oct */
export function formatDateDay(iso: string): string {
  if (!iso) return '';
  const { m, d, dow } = parts(iso);
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1]}`;
}

/** Thursday 24 September */
export function formatDateLong(iso: string): string {
  if (!iso) return '';
  const { m, d, dow } = parts(iso);
  return `${DAYS_LONG[dow]} ${d} ${MONTHS_LONG[m - 1]}`;
}

export function weekday(iso: string): string {
  return DAYS[parts(iso).dow];
}

export function dayOfMonth(iso: string): number {
  return parts(iso).d;
}

export function monthShort(iso: string): string {
  return MONTHS[parts(iso).m - 1];
}

/** '2026-08' → 'Aug 2026' ; long → 'August 2026' */
export function formatMonth(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function addDaysISO(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDaysISO(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function todayISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

/** Parse a user-typed money amount ("1,200.50", "$600") into cents, or null. */
export function parseMoneyInput(s: string): number | null {
  const cleaned = s.replace(/[\s,$€£¥₹]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
