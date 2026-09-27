import { MERCHANT_ALIASES, type MerchantAlias } from './data/merchantAliases';

const PREFIX = /^(POS|ACH DEBIT|ACH CREDIT|DEBIT CARD|CARD \d+|PURCHASE|SQ\s*\*|TST\s*\*|PAYPAL\s*\*|UPI[/-]|UPI\s|NEFT[/-]|IMPS[/-])\s*/;

const STATE_CODES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC US'.split(' '),
);

const SORTED_ALIASES = [...MERCHANT_ALIASES].sort((a, b) => b.pattern.length - a.pattern.length);

/** Clean a raw bank description into an uppercase merchant key (before alias lookup). */
export function cleanDescription(raw: string): string {
  let s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(PREFIX, '');
    if (next === s) break;
    s = next;
  }
  s = s.split(/[*#]/)[0];
  let tokens = s
    .split(' ')
    .filter((t) => t && !/\d/.test(t))
    .join(' ')
    .replace(/'/g, '')
    .replace(/[^A-Z&+ ]/g, ' ')
    .split(' ')
    .filter(Boolean);
  while (tokens.length > 1 && tokens[tokens.length - 1].length === 2 && STATE_CODES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(' ');
}

export function findAlias(cleaned: string): MerchantAlias | undefined {
  const padded = ` ${cleaned} `;
  return SORTED_ALIASES.find((a) => padded.includes(` ${a.pattern} `));
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface MerchantInfo {
  merchant: string;
  aliasCategory?: string;
}

const cache = new Map<string, MerchantInfo>();

/** Normalise a raw description to a display merchant name. "Amazon" and "Amazon Prime" stay separate. */
export function normaliseMerchant(raw: string): MerchantInfo {
  const hit = cache.get(raw);
  if (hit) return hit;
  const cleaned = cleanDescription(raw);
  const alias = findAlias(cleaned);
  const info: MerchantInfo = alias
    ? { merchant: alias.name, aliasCategory: alias.category }
    : { merchant: cleaned ? titleCase(cleaned) : raw.trim().slice(0, 40) || 'Unknown' };
  if (cache.size > 20000) cache.clear();
  cache.set(raw, info);
  return info;
}

/** Merchant from an email sender, e.g. "Netflix <info@netflix.com>" → "Netflix". */
export function merchantFromSender(from: string): MerchantInfo {
  const display = from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  const domain = (/@([^>\s]+)/.exec(from)?.[1] ?? '').split('.').filter((p) => !['com', 'net', 'org', 'example', 'account', 'mail', 'email', 'billing', 'no-reply'].includes(p));
  for (const candidate of [display, ...domain]) {
    const cleaned = cleanDescription(candidate);
    const alias = cleaned ? findAlias(cleaned) : undefined;
    if (alias) return { merchant: alias.name, aliasCategory: alias.category };
  }
  return { merchant: display ? titleCase(cleanDescription(display) || display) : 'Unknown' };
}
