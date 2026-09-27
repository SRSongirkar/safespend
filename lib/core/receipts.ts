import { isISODate, makeDate, monthFromName, daysInMonth } from './dates';
import { merchantFromSender } from './merchants';
import { toCents } from './money';
import type { Cents, ISODate, Receipt } from './types';

// Regex-only receipt/renewal email parsing (no AI).

const AMOUNT = /(?:\$|₹|\bRs\.?|\bINR)\s?([\d,]+\.\d{2})/i;
const RENEWAL_KEYWORD = /(renews on|renewal|will be charged|next billing date)/gi;
const DATE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => ISODate | null }[] = [
  { re: /\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/, build: (m) => mk(+m[3], monthFromName(m[1]), +m[2]) },
  { re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2,8})\.?,?\s+(\d{4})\b/, build: (m) => mk(+m[3], monthFromName(m[2]), +m[1]) },
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, build: (m) => mk(+m[1], +m[2], +m[3]) },
];

function mk(y: number, m: number, d: number): ISODate | null {
  if (!m || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  const iso = makeDate(y, m, d);
  return isISODate(iso) ? iso : null;
}

/** Find the first date that appears within ~80 chars after a renewal keyword. */
export function findRenewalDate(text: string): ISODate | null {
  RENEWAL_KEYWORD.lastIndex = 0;
  let k: RegExpExecArray | null;
  while ((k = RENEWAL_KEYWORD.exec(text))) {
    const window = text.slice(k.index + k[0].length, k.index + k[0].length + 80);
    let best: { pos: number; date: ISODate } | null = null;
    for (const p of DATE_PATTERNS) {
      const m = p.re.exec(window);
      if (m) {
        const date = p.build(m);
        if (date && (!best || m.index < best.pos)) best = { pos: m.index, date };
      }
    }
    if (best) return best.date;
  }
  return null;
}

export function findAmount(text: string): Cents | null {
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const c = toCents(m[1]);
  return Number.isNaN(c) ? null : c;
}

export interface ParsedReceipt {
  receiptId: string;
  merchant: string;
  aliasCategory?: string;
  amount: Cents | null;
  renewalDate: ISODate | null;
  date: ISODate;
}

export function parseReceipt(r: Receipt): ParsedReceipt {
  const text = `${r.subject}\n${r.body}`;
  const { merchant, aliasCategory } = merchantFromSender(r.from);
  return { receiptId: r.id, merchant, aliasCategory, amount: findAmount(text), renewalDate: findRenewalDate(text), date: r.date };
}

/** Split a pasted email into from / subject / date / body. Header lines are optional. */
export function parseEmailText(text: string, fallbackDate: ISODate): Omit<Receipt, 'id'> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let from = '';
  let subject = '';
  let date: ISODate = fallbackDate;
  let i = 0;
  for (; i < Math.min(lines.length, 12); i++) {
    const line = lines[i].trim();
    const h = /^(from|subject|date|to|sent):\s*(.*)$/i.exec(line);
    if (!h) {
      if (line === '' && (from || subject)) {
        i++;
        break;
      }
      if (line === '') continue;
      break;
    }
    const key = h[1].toLowerCase();
    if (key === 'from') from = h[2];
    if (key === 'subject') subject = h[2];
    if (key === 'date' || key === 'sent') {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(h[2].trim()) ? h[2].trim() : null;
      let parsed: ISODate | null = iso && isISODate(iso) ? iso : null;
      if (!parsed) {
        for (const p of DATE_PATTERNS) {
          const m = p.re.exec(h[2]);
          if (m && (parsed = p.build(m))) break;
        }
      }
      if (parsed) date = parsed;
    }
  }
  const body = lines.slice(i).join('\n').trim();
  if (!from) {
    // Use the first capitalised word(s) of the text as a hint, e.g. "HomeShield: your policy renews..."
    from = (/^([A-Z][\w&.' -]{1,40}?)(?::|\s-\s|,)/.exec(body)?.[1] ?? subject) || 'Pasted email';
  }
  return { from, subject: subject || body.slice(0, 60), date, body };
}
