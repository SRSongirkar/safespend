// Core domain types. Pure — shared by the finance engine, the server and (as type-only imports) the client.

export type Cents = number; // integer
export type ISODate = string; // 'YYYY-MM-DD'

export type AccountType = 'checking' | 'savings' | 'card';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  statementCloseDay?: number; // cards
  dueDay?: number; // cards
  autopayFromId?: string; // cards
  openingBalanceCents?: Cents; // balance before the first imported transaction (used when a file has no balance column)
  createdAt: string;
}

export type TxKind = 'normal' | 'transfer' | 'card_payment';

export interface Transaction {
  id: string;
  accountId: string;
  date: ISODate;
  rawDescription: string;
  amount: Cents; // signed from the account's point of view; money out is negative
  balanceAfter?: Cents;
  source: 'import' | 'manual';
  importId?: string;
  fingerprint: string;
  categoryOverride?: string;
  note?: string;
}

export interface Receipt {
  id: string;
  from: string;
  subject: string;
  date: ISODate;
  body: string;
  importId?: string;
  fingerprint?: string;
}

export interface Payslip {
  id: string;
  employer: string;
  payDate: ISODate;
  grossCents: Cents;
  deductionsCents: Cents;
  netCents: Cents;
  importId?: string;
  fingerprint?: string;
}

export type ImportKind = 'csv' | 'payslips' | 'receipts' | 'receipt_text';
export type ImportFormat = 'A' | 'B' | 'C' | 'mapped' | 'json' | 'text';

export interface ImportRecord {
  id: string;
  fileName: string;
  kind: ImportKind;
  accountId?: string;
  format: ImportFormat;
  rowsTotal: number;
  added: number;
  duplicates: number;
  errors: string[];
  createdAt: string;
}

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface ColumnMapping {
  headerSignature: string;
  dateCol: string;
  dateFormat: DateFormat;
  descCol: string;
  amountCol?: string;
  amountSign?: 'negative_is_out' | 'positive_is_out';
  debitCol?: string;
  creditCol?: string;
  balanceCol?: string;
}

export type CorrectionAction = 'not_recurring' | 'cancelled' | 'confirm' | 'override_amount';

export interface Correction {
  seriesKey: string; // `${accountId}|${merchant}`
  action: CorrectionAction;
  amount?: Cents;
  createdAt: string;
}

export interface MerchantRule {
  merchant: string;
  category: string;
}

export interface Settings {
  currency: string; // ISO 4217
  bufferCents: Cents;
  asOfOverride?: ISODate;
}

export interface UserVault {
  version: 1;
  settings: Settings;
  accounts: Account[];
  transactions: Transaction[];
  receipts: Receipt[];
  payslips: Payslip[];
  imports: ImportRecord[];
  mappings: ColumnMapping[];
  corrections: Correction[];
  merchantRules: MerchantRule[];
}

// ---------- categories ----------

export const CATEGORIES = [
  'housing',
  'utilities',
  'phone & internet',
  'subscriptions',
  'insurance',
  'groceries',
  'dining',
  'transport',
  'shopping',
  'health & fitness',
  'loan',
  'income',
  'transfer',
  'card payment',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

// ---------- analysis output ----------

export interface EnrichedTransaction extends Transaction {
  merchant: string;
  category: string;
  kind: TxKind;
  linkedTxId?: string;
  seriesKey?: string; // set when the tx belongs to a detected recurring series
}

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringSeries {
  key: string; // `${accountId}|${merchant}`
  accountId: string;
  accountType: AccountType;
  merchant: string;
  category: string;
  direction: 'out' | 'in';
  isTransfer: boolean;
  cadence: Cadence;
  amountType: 'fixed' | 'variable';
  txIds: string[];
  count: number;
  firstDate: ISODate;
  lastDate: ISODate;
  lastAmount: Cents; // absolute
  predictedAmount: Cents; // absolute
  nextDate: ISODate;
  confidence: number;
  status: 'active' | 'stopped' | 'cancelled' | 'possible' | 'ignored';
  priceChange?: { from: Cents; to: Cents; date: ISODate };
  receiptIds: string[];
}

export type UpcomingType = 'bill' | 'subscription' | 'card_bill' | 'renewal' | 'transfer' | 'income';

export interface Evidence {
  txIds: string[];
  receiptIds: string[];
  payslipIds: string[];
  note: string;
}

export interface UpcomingItem {
  id: string;
  date: ISODate;
  label: string;
  merchant: string;
  type: UpcomingType;
  accountId: string;
  amount: Cents; // signed from the paying account's point of view
  source: 'recurring' | 'receipt' | 'payslip' | 'card_bill' | 'bank';
  seriesKey?: string;
  cadence?: Cadence;
  confidence: number;
  viaCard: boolean; // charged to a card → counted inside the card bill, not directly in checking
  evidence: Evidence;
  breakdown?: { label: string; amount: Cents; estimate?: boolean }[];
  estimatePart?: Cents; // card bills: the part of `amount` that is an everyday estimate (not committed)
  includes?: { label: string; amount: Cents; date: ISODate }[]; // card bills: predicted recurring card charges
  card?: { accountId: string; open: ISODate; close: ISODate }; // card bills: which card and cycle (open exclusive, close inclusive)
}

export interface ForecastEvent {
  itemId: string;
  label: string;
  amount: Cents;
  estimate?: boolean;
}

export interface ForecastDay {
  date: ISODate;
  low: Cents; // balance after the day's outflows, before income (conservative)
  balance: Cents; // end of day
  events: ForecastEvent[];
}

export interface BalancePoint {
  date: ISODate;
  amount: Cents;
}

export interface CommittedTotals {
  until: ISODate;
  total: Cents; // positive number: money already promised
  byType: Partial<Record<UpcomingType, Cents>>;
  items: string[]; // upcoming item ids
}

export type Verdict = 'comfortable' | 'tight' | 'no';

export interface AffordResult {
  verdict: Verdict;
  amountCents: Cents;
  date: ISODate;
  repeat: 'once' | 'monthly';
  lowest: BalancePoint;
  firstBelowBuffer?: ISODate;
  firstBelowZero?: ISODate;
  bufferCents: Cents;
  savingsBalance: Cents;
  coveredBySavings: boolean;
  sentence: string;
  forecast: ForecastDay[];
}

export type InsightKind = 'card_bill' | 'renewal' | 'price_change' | 'stopped' | 'payday_mismatch' | 'cancelled';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  impactCents: Cents;
  seriesKey?: string;
}

export interface MonthlyCategory {
  category: string;
  amount: Cents;
  prevAmount: Cents;
  change: Cents;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  totalSpend: Cents;
  prevTotalSpend: Cents;
  income: Cents;
  net: Cents;
  byCategory: MonthlyCategory[];
  topMerchants: { merchant: string; amount: Cents; count: number }[];
  txCount: number;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  balance: Cents | null;
  txCount: number;
  lastDate?: ISODate;
}

export interface CardBillInfo {
  accountId: string;
  accountName: string;
  due?: { closeDate: ISODate; dueDate: ISODate; amount: Cents; paid: boolean; txIds: string[] };
  next?: {
    closeDate: ISODate;
    dueDate: ISODate;
    amount: Cents;
    actual: Cents;
    recurring: Cents;
    estimate: Cents;
    txIds: string[];
  };
}

export interface AnalysisResult {
  now: ISODate;
  hasData: boolean;
  currency: string;
  bufferCents: Cents;
  nextPayday?: ISODate;
  followingPayday?: ISODate;
  payAmount?: Cents;
  startBalance: Cents;
  committedUntilPayday: CommittedTotals;
  committedUntilFollowingPayday: CommittedTotals;
  everydayDailyEstimate: Cents; // checking accounts, per day
  cardDailyEstimate: Cents; // card accounts, per day
  forecast: ForecastDay[];
  lowestPoint: BalancePoint;
  safeToSpend: Cents;
  savingsBalance: Cents;
  upcoming: UpcomingItem[];
  series: RecurringSeries[];
  possibleSeries: RecurringSeries[];
  cardBills: CardBillInfo[];
  insights: Insight[];
  accounts: AccountSummary[];
  refs: EvidenceRefs;
  tookMs: number;
}

export interface EvidenceTx {
  id: string;
  accountId: string;
  date: ISODate;
  amount: Cents;
  rawDescription: string;
  merchant: string;
}

export interface EvidenceRefs {
  transactions: Record<string, EvidenceTx>;
  receipts: Record<string, Receipt>;
  payslips: Record<string, Payslip>;
}
