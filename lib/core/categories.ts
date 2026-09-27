import { CATEGORIES } from './types';

const KEYWORD_RULES: [RegExp, string][] = [
  [/\b(RENT|PROPERTY|LEASING|APARTMENT|MORTGAGE|HOA)\b/, 'housing'],
  [/\b(UTIL|UTILITY|UTILITIES|WATER|ELECTRIC|POWER|ENERGY|GAS CO)\b/, 'utilities'],
  [/\b(WIRELESS|MOBILE|TELECOM|INTERNET|BROADBAND|FIBER)\b/, 'phone & internet'],
  [/\b(INSURANCE|INS|ASSURANCE)\b/, 'insurance'],
  [/\b(PAYROLL|SALARY|DIRECT DEP|INTEREST)\b/, 'income'],
  [/\b(LOAN|FINANCE|AUTOPAY LOAN)\b/, 'loan'],
  [/\b(GROCER|GROCERY|MARKET|MKT|FOODS|SUPERMARKET)\b/, 'groceries'],
  [/\b(COFFEE|CAFE|RESTAURANT|PIZZA|GRILL|BAR|BURGER|SUSHI|THAI|TACO|BAKERY|KITCHEN|DINER)\b/, 'dining'],
  [/\b(TAXI|TRANSIT|PARKING|FUEL|OIL|GAS|METRO|TRAIN|AIRLINE|TOLL)\b/, 'transport'],
  [/\b(GYM|FITNESS|YOGA|PHARMACY|CLINIC|DENTAL|DOCTOR|HEALTH)\b/, 'health & fitness'],
  [/\b(SUBSCRIPTION|MEMBERSHIP|STREAMING|PREMIUM)\b/, 'subscriptions'],
  [/\b(STORE|SHOP|MART|OUTLET|MKTP)\b/, 'shopping'],
];

export function isCategory(s: unknown): s is string {
  return typeof s === 'string' && (CATEGORIES as readonly string[]).includes(s);
}

/** Alias category → keyword rules on the cleaned/raw description → 'other'. */
export function categorise(rawDescription: string, aliasCategory?: string): string {
  if (aliasCategory) return aliasCategory;
  const upper = rawDescription.toUpperCase();
  for (const [re, cat] of KEYWORD_RULES) if (re.test(upper)) return cat;
  return 'other';
}
