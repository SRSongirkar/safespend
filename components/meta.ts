import type { UpcomingType } from '@/lib/core/types';

// Categorical colour follows the entity (type), in fixed slot order — never by rank.
export const TYPE_META: Record<UpcomingType, { label: string; plural: string; color: string; icon: string }> = {
  card_bill: { label: 'Card bill', plural: 'Card bills', color: 'var(--s1)', icon: 'card' },
  bill: { label: 'Bill', plural: 'Bills', color: 'var(--s2)', icon: 'file' },
  renewal: { label: 'Renewal', plural: 'Renewals', color: 'var(--s3)', icon: 'receipt' },
  subscription: { label: 'Subscription', plural: 'Subscriptions', color: 'var(--s4)', icon: 'repeat' },
  transfer: { label: 'To savings', plural: 'To savings', color: 'var(--s5)', icon: 'piggy' },
  income: { label: 'Income', plural: 'Income', color: 'var(--s6)', icon: 'coins' },
};

export const COMMITTED_ORDER: UpcomingType[] = ['card_bill', 'bill', 'renewal', 'subscription', 'transfer'];

export const CATEGORY_LABELS: Record<string, string> = {
  housing: 'Housing',
  utilities: 'Utilities',
  'phone & internet': 'Phone & internet',
  subscriptions: 'Subscriptions',
  insurance: 'Insurance',
  groceries: 'Groceries',
  dining: 'Dining',
  transport: 'Transport',
  shopping: 'Shopping',
  'health & fitness': 'Health & fitness',
  loan: 'Loan',
  income: 'Income',
  transfer: 'Transfer',
  'card payment': 'Card payment',
  other: 'Other',
};

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS);

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export const ACCOUNT_ICONS: Record<string, string> = { checking: 'bank', savings: 'piggy', card: 'card' };
export const ACCOUNT_LABELS: Record<string, string> = { checking: 'Bank account', savings: 'Savings account', card: 'Credit card' };
