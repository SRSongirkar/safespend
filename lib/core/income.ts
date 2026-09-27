import { nextLastWorkingDay } from './dates';
import type { Cents, EnrichedTransaction, ISODate, Payslip } from './types';

const PAYROLL = /PAYROLL|SALARY/i;

export interface IncomePlan {
  nextPayday: ISODate;
  followingPayday: ISODate;
  amount: Cents;
  accountId: string;
  source: 'payslip' | 'bank';
  payslipIds: string[];
  bankTxIds: string[];
  salaryMerchants: Set<string>; // merchants whose recurring inflow series is replaced by this plan
  mismatch?: { payslipNet: Cents; bankNet: Cents; date: ISODate };
}

/**
 * Pay date = last working day of the month (Sat/Sun roll back to Friday).
 * Amount = latest payslip net pay, cross-checked with the latest PAYROLL/SALARY credit; if they disagree, trust the bank.
 */
export function planIncome(
  txs: EnrichedTransaction[],
  payslips: Payslip[],
  asOf: ISODate,
  checkingIds: string[],
): IncomePlan | undefined {
  const credits = txs
    .filter((t) => t.kind === 'normal' && t.amount > 0 && checkingIds.includes(t.accountId) && PAYROLL.test(t.rawDescription) && t.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const slips = payslips.filter((p) => p.payDate <= asOf).sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
  if (credits.length === 0 && slips.length === 0) return undefined;

  const latestCredit = credits[credits.length - 1];
  const latestSlip = slips[slips.length - 1];
  let amount: Cents;
  let source: IncomePlan['source'];
  let mismatch: IncomePlan['mismatch'];
  if (latestSlip && latestCredit) {
    if (latestSlip.netCents !== latestCredit.amount) {
      amount = latestCredit.amount;
      source = 'bank';
      mismatch = { payslipNet: latestSlip.netCents, bankNet: latestCredit.amount, date: latestCredit.date };
    } else {
      amount = latestSlip.netCents;
      source = 'payslip';
    }
  } else if (latestSlip) {
    amount = latestSlip.netCents;
    source = 'payslip';
  } else {
    amount = latestCredit.amount;
    source = 'bank';
  }

  const nextPayday = nextLastWorkingDay(asOf);
  return {
    nextPayday,
    followingPayday: nextLastWorkingDay(nextPayday),
    amount,
    accountId: latestCredit?.accountId ?? checkingIds[0] ?? '',
    source,
    payslipIds: slips.slice(-3).map((p) => p.id),
    bankTxIds: credits.slice(-6).map((t) => t.id),
    salaryMerchants: new Set(credits.map((t) => t.merchant)),
    mismatch,
  };
}

/** Paydays strictly after `after`, up to and including `until`. */
export function paydaysBetween(after: ISODate, until: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let d = nextLastWorkingDay(after);
  while (d <= until) {
    out.push(d);
    d = nextLastWorkingDay(d);
  }
  return out;
}
