import { cardBillsFor, toCardBillInfo, type CardBillPart } from './cardBill';
import { categorise } from './categories';
import { addDays, diffDays, formatShortDate } from './dates';
import { buildForecast, lowestOf, type ForecastInputEvent } from './forecast';
import { paydaysBetween, planIncome, type IncomePlan } from './income';
import { buildInsights } from './insights';
import { normaliseMerchant } from './merchants';
import { formatCentsExact } from './money';
import { parseReceipt, type ParsedReceipt } from './receipts';
import { dayOfMonthFor, detectRecurring, occurrences } from './recurring';
import { everydayDailyByAccount, historyDays } from './spending';
import { matchTransfers } from './transfers';
import type {
  Account,
  AccountSummary,
  AccountType,
  AnalysisResult,
  CardBillInfo,
  Cents,
  CommittedTotals,
  EnrichedTransaction,
  EvidenceRefs,
  ISODate,
  RecurringSeries,
  UpcomingItem,
  UpcomingType,
  UserVault,
} from './types';

export interface ForecastModel {
  asOf: ISODate;
  start: Cents;
  checkingDaily: Cents;
  bufferCents: Cents;
  savingsBalance: Cents;
  currency: string;
  defaultEnd: ISODate;
  eventsUntil: (end: ISODate) => ForecastInputEvent[];
}

export interface AnalysisBundle {
  result: AnalysisResult;
  model: ForecastModel;
  enriched: EnrichedTransaction[];
}

const byDateStable = <T extends { date: ISODate }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Derive merchant, category and kind for every transaction (transfer matching runs before anything else). */
export function enrichTransactions(vault: Pick<UserVault, 'accounts' | 'transactions' | 'merchantRules'>): EnrichedTransaction[] {
  const accountIds = new Set(vault.accounts.map((a) => a.id));
  const txs = vault.transactions.filter((t) => accountIds.has(t.accountId)).sort(byDateStable);
  const links = matchTransfers(txs, vault.accounts);
  const rules = new Map(vault.merchantRules.map((r) => [r.merchant, r.category]));
  return txs.map((t) => {
    const { merchant, aliasCategory } = normaliseMerchant(t.rawDescription);
    const link = links.get(t.id);
    const kind = link?.kind ?? 'normal';
    const category =
      kind === 'transfer' ? 'transfer' : kind === 'card_payment' ? 'card payment' : t.categoryOverride ?? rules.get(merchant) ?? categorise(t.rawDescription, aliasCategory);
    return { ...t, merchant, category, kind, linkedTxId: link?.linkedTxId };
  });
}

function balanceOf(account: Account, txs: EnrichedTransaction[]): Cents {
  const list = txs.filter((t) => t.accountId === account.id);
  let lastIdx = -1;
  for (let i = 0; i < list.length; i++) if (list[i].balanceAfter !== undefined) lastIdx = i;
  let bal = lastIdx >= 0 ? (list[lastIdx].balanceAfter as Cents) : account.openingBalanceCents ?? 0;
  for (let i = lastIdx + 1; i < list.length; i++) bal += list[i].amount;
  return bal;
}

const SUBSCRIPTION_CATEGORIES = new Set(['subscriptions', 'health & fitness']);

const upcomingType = (s: RecurringSeries): UpcomingType =>
  s.direction === 'in' ? 'income' : s.isTransfer ? 'transfer' : SUBSCRIPTION_CATEGORIES.has(s.category) ? 'subscription' : 'bill';

const CADENCE_WORDS: Record<string, string> = { weekly: 'every week', biweekly: 'every 2 weeks', monthly: 'every month', quarterly: 'every 3 months', yearly: 'every year' };

function describeSeries(s: RecurringSeries, currency: string): string {
  const amount = s.amountType === 'fixed' ? `always ${formatCentsExact(s.predictedAmount, currency)}` : `amount changes, we expect about ${formatCentsExact(s.predictedAmount, currency)}`;
  return `Paid ${s.count} times before, ${CADENCE_WORDS[s.cadence]} (${amount}). Last paid on ${formatShortDate(s.lastDate)}.`;
}

export function analyze(vault: UserVault, opts: { today?: ISODate } = {}): AnalysisBundle {
  const t0 = Date.now();
  const { settings } = vault;
  const currency = settings.currency || 'USD';
  const accounts = vault.accounts;
  const typeOf = new Map<string, AccountType>(accounts.map((a) => [a.id, a.type]));
  const checkingIds = accounts.filter((a) => a.type === 'checking').map((a) => a.id);
  const enriched = enrichTransactions(vault);

  const latest = enriched.reduce<ISODate | undefined>((m, t) => (!m || t.date > m ? t.date : m), undefined);
  const asOf = settings.asOfOverride ?? latest ?? opts.today ?? '2026-01-01';
  const txs = enriched.filter((t) => t.date <= asOf);

  // ---- receipts ----
  const parsedReceipts: ParsedReceipt[] = vault.receipts.map(parseReceipt);
  const receiptMerchants = new Set(parsedReceipts.map((r) => r.merchant));

  // ---- recurring series + user corrections ----
  const series = detectRecurring(txs, { asOf, accountTypes: typeOf, receiptMerchants });
  const latestCorrection = new Map<string, (typeof vault.corrections)[number]>();
  for (const c of vault.corrections) latestCorrection.set(c.seriesKey, c);
  for (const s of series) {
    const c = latestCorrection.get(s.key);
    if (!c) continue;
    if (c.action === 'not_recurring') s.status = 'ignored';
    else if (c.action === 'cancelled') s.status = 'cancelled';
    else if (c.action === 'confirm' && s.status === 'possible') s.status = 'active';
    else if (c.action === 'override_amount' && c.amount && c.amount > 0) s.predictedAmount = c.amount;
  }
  const seriesTxDates = new Map<string, ISODate[]>();
  const recurringTxIds = new Set<string>();
  const txById = new Map(enriched.map((t) => [t.id, t]));
  for (const s of series) {
    seriesTxDates.set(s.key, s.txIds.map((id) => txById.get(id)!.date));
    if (s.status === 'ignored') continue;
    for (const id of s.txIds) {
      recurringTxIds.add(id);
      txById.get(id)!.seriesKey = s.key;
    }
  }
  for (const r of parsedReceipts) {
    if (r.renewalDate && r.renewalDate > asOf) continue;
    const s = series.find((x) => x.merchant === r.merchant && x.direction === 'out');
    if (s && !s.receiptIds.includes(r.receiptId)) s.receiptIds.push(r.receiptId);
  }

  // ---- income ----
  const income: IncomePlan | undefined = planIncome(txs, vault.payslips, asOf, checkingIds);

  // ---- everyday estimate ----
  const dailyByAccount = everydayDailyByAccount(txs, asOf, recurringTxIds);
  const checkingDaily = checkingIds.reduce((s, id) => s + (dailyByAccount.get(id) ?? 0), 0);
  const cards = accounts.filter((a) => a.type === 'card');
  const cardDaily = cards.reduce((s, a) => s + (dailyByAccount.get(a.id) ?? 0), 0);

  // ---- balances ----
  const balances = new Map(accounts.map((a) => [a.id, balanceOf(a, txs)]));
  const start = checkingIds.reduce((s, id) => s + (balances.get(id) ?? 0), 0);
  const savingsBalance = accounts.filter((a) => a.type === 'savings').reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

  const nextPayday = income?.nextPayday;
  const followingPayday = income?.followingPayday;
  const defaultEnd = followingPayday ?? addDays(asOf, 60);

  // ---- upcoming items for any horizon ----
  const cardBillCache = new Map<string, Map<string, CardBillPart[]>>();
  const billsFor = (card: Account, end: ISODate) => {
    let perCard = cardBillCache.get(end);
    if (!perCard) cardBillCache.set(end, (perCard = new Map()));
    let bills = perCard.get(card.id);
    if (!bills) {
      bills = cardBillsFor(card, txs, series, seriesTxDates, dailyByAccount.get(card.id) ?? 0, asOf, end);
      perCard.set(card.id, bills);
    }
    return bills;
  };

  const buildUpcoming = (end: ISODate): UpcomingItem[] => {
    const items: UpcomingItem[] = [];
    for (const s of series) {
      if (s.status !== 'active') continue;
      if (s.accountType === 'savings') continue;
      if (s.direction === 'in' && (s.accountType === 'card' || income?.salaryMerchants.has(s.merchant))) continue;
      const sign = s.direction === 'out' ? -1 : 1;
      for (const d of occurrences(s, dayOfMonthFor(s, seriesTxDates.get(s.key) ?? []), end)) {
        items.push({
          id: `${s.key}|${d}`,
          date: d,
          label: s.isTransfer ? 'Transfer to savings' : s.merchant,
          merchant: s.merchant,
          type: upcomingType(s),
          accountId: s.accountId,
          amount: sign * s.predictedAmount,
          source: 'recurring',
          seriesKey: s.key,
          cadence: s.cadence,
          confidence: s.confidence,
          viaCard: s.accountType === 'card',
          evidence: { txIds: s.txIds.slice(-12), receiptIds: [...s.receiptIds], payslipIds: [], note: describeSeries(s, currency) },
        });
      }
    }

    // Receipt renewals: merge with a predicted charge (same merchant, ±5 days) or add as a new upcoming item.
    const seenRenewals = new Set<string>();
    for (const r of parsedReceipts) {
      if (!r.renewalDate || r.renewalDate <= asOf || !r.amount) continue;
      const match = items.find((i) => i.source === 'recurring' && i.merchant === r.merchant && Math.abs(diffDays(i.date, r.renewalDate!)) <= 5);
      const s = series.find((x) => x.merchant === r.merchant && x.direction === 'out');
      if (s && !s.receiptIds.includes(r.receiptId)) s.receiptIds.push(r.receiptId);
      if (match) {
        if (!match.evidence.receiptIds.includes(r.receiptId)) match.evidence.receiptIds.push(r.receiptId);
        match.evidence.note += ' Confirmed by a receipt email.';
        continue;
      }
      if (s && (s.status === 'active' || s.status === 'cancelled' || s.status === 'ignored')) continue;
      if (r.renewalDate > end) continue;
      const dedupeKey = `${r.merchant}|${r.renewalDate}`;
      if (seenRenewals.has(dedupeKey)) continue;
      seenRenewals.add(dedupeKey);
      const past = txs.filter((t) => t.merchant === r.merchant && t.amount < 0);
      const accountId = past[past.length - 1]?.accountId ?? checkingIds[0] ?? '';
      items.push({
        id: `receipt|${r.receiptId}`,
        date: r.renewalDate,
        label: `${r.merchant} renewal`,
        merchant: r.merchant,
        type: 'renewal',
        accountId,
        amount: -r.amount,
        source: 'receipt',
        confidence: 0.9,
        viaCard: typeOf.get(accountId) === 'card',
        evidence: {
          txIds: past.slice(-3).map((t) => t.id),
          receiptIds: [r.receiptId],
          payslipIds: [],
          note: `We found this in an email from ${formatShortDate(r.date)}${past.length ? `. You last paid it on ${formatShortDate(past[past.length - 1].date)}` : ''}.`,
        },
      });
    }

    for (const card of cards) {
      const payFrom = card.autopayFromId && typeOf.has(card.autopayFromId) ? card.autopayFromId : checkingIds[0] ?? '';
      for (const b of billsFor(card, end)) {
        if (b.paid || b.amount <= 0) continue;
        let date = b.cycle.dueDate;
        const overdue = date <= asOf;
        if (overdue) date = addDays(asOf, 1);
        if (date > end) continue;
        const closed = b.cycle.closeDate <= asOf;
        items.push({
          id: `card|${card.id}|${b.cycle.closeDate}`,
          date,
          label: `${card.name} bill${overdue ? ' (overdue)' : ''}`,
          merchant: card.name,
          type: 'card_bill',
          accountId: payFrom,
          amount: -b.amount,
          source: 'card_bill',
          confidence: closed ? 1 : 0.8,
          viaCard: false,
          estimatePart: b.estimate,
          breakdown: closed
            ? [{ label: `Card spending ${formatShortDate(addDays(b.cycle.openExclusive, 1))} – ${formatShortDate(b.cycle.closeDate)}`, amount: b.actual }]
            : [
                { label: 'Already spent on the card', amount: b.actual },
                ...(b.recurring ? [{ label: `Regular card payments before ${formatShortDate(b.cycle.closeDate)}`, amount: b.recurring }] : []),
                { label: `Our guess for other spending (${diffDays(asOf > b.cycle.openExclusive ? asOf : b.cycle.openExclusive, b.cycle.closeDate)} days)`, amount: b.estimate, estimate: true },
              ],
          evidence: {
            txIds: b.txIds,
            receiptIds: [],
            payslipIds: [],
            note: closed
              ? `Your card bill for spending up to ${formatShortDate(b.cycle.closeDate)} (${b.txIds.length} purchases). It is paid automatically from ${accounts.find((a) => a.id === payFrom)?.name ?? 'your bank account'}.`
              : `This bill is still being made (it closes on ${formatShortDate(b.cycle.closeDate)}): what you spent so far + regular card payments + our guess for the rest.`,
          },
          includes: b.recurringLabels,
          card: { accountId: card.id, open: b.cycle.openExclusive, close: b.cycle.closeDate },
        });
      }
    }

    if (income) {
      for (const d of paydaysBetween(asOf, end)) {
        items.push({
          id: `income|${d}`,
          date: d,
          label: 'Salary',
          merchant: [...income.salaryMerchants][0] ?? 'Salary',
          type: 'income',
          accountId: income.accountId,
          amount: income.amount,
          source: income.source === 'payslip' ? 'payslip' : 'bank',
          cadence: 'monthly',
          confidence: 0.95,
          viaCard: false,
          evidence: {
            txIds: income.bankTxIds,
            receiptIds: [],
            payslipIds: income.payslipIds,
            note: `Your salary comes on the last working day of every month. Amount from your ${income.source === 'payslip' ? 'latest salary slip (take-home pay)' : 'last salary in your bank'}.`,
          },
        });
      }
    }
    return items.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.amount - b.amount));
  };

  const isForecastItem = (i: UpcomingItem) => !i.viaCard && typeOf.get(i.accountId) === 'checking';
  const toEvents = (items: UpcomingItem[]): ForecastInputEvent[] => {
    const events: ForecastInputEvent[] = [];
    for (const i of items) {
      if (!isForecastItem(i)) continue;
      const est = i.estimatePart ?? 0;
      if (est > 0) {
        events.push({ date: i.date, itemId: i.id, label: i.label, amount: i.amount + est });
        events.push({ date: i.date, itemId: i.id, label: `${i.label} (estimate part)`, amount: -est, estimate: true });
      } else {
        events.push({ date: i.date, itemId: i.id, label: i.label, amount: i.amount });
      }
    }
    return events;
  };

  const upcoming = buildUpcoming(defaultEnd);
  const forecast = buildForecast(start, asOf, defaultEnd, toEvents(upcoming), checkingDaily);
  const lowestPoint = lowestOf(forecast);

  // Committed = facts only (no estimates). Card charges count once: inside a card bill due in the window, or on their
  // own if their bill falls after the window (they're still money already promised).
  const committed = (until: ISODate): CommittedTotals => {
    const out: CommittedTotals = { until, total: 0, byType: {}, items: [] };
    const inWindow = upcoming.filter((i) => i.date > asOf && i.date <= until && i.amount < 0);
    const billsInWindow = inWindow.filter((i) => i.type === 'card_bill' && i.card && isForecastItem(i));
    for (const i of inWindow) {
      if (i.viaCard) {
        const covered = billsInWindow.some((b) => b.card!.accountId === i.accountId && i.date > b.card!.open && i.date <= b.card!.close);
        if (covered) continue;
      } else if (!isForecastItem(i)) continue;
      const v = -i.amount - (i.estimatePart ?? 0);
      out.total += v;
      out.byType[i.type] = (out.byType[i.type] ?? 0) + v;
      out.items.push(i.id);
    }
    return out;
  };

  const cardBills: CardBillInfo[] = cards.map((c) => toCardBillInfo(c, billsFor(c, defaultEnd), asOf));
  const insights = buildInsights({ asOf, currency, series, upcoming, cardBills, income, horizonEnd: defaultEnd });

  const accountSummaries: AccountSummary[] = accounts.map((a) => {
    const own = txs.filter((t) => t.accountId === a.id);
    return { id: a.id, name: a.name, type: a.type, balance: own.length || a.openingBalanceCents ? balances.get(a.id) ?? 0 : null, txCount: own.length, lastDate: own[own.length - 1]?.date };
  });

  // ---- evidence references (only what the UI may open) ----
  const refs: EvidenceRefs = { transactions: {}, receipts: {}, payslips: {} };
  const addTx = (id: string) => {
    const t = txById.get(id);
    if (t) refs.transactions[id] = { id, accountId: t.accountId, date: t.date, amount: t.amount, rawDescription: t.rawDescription, merchant: t.merchant };
  };
  for (const i of upcoming) i.evidence.txIds.forEach(addTx);
  for (const s of series) s.txIds.slice(-12).forEach(addTx);
  for (const r of vault.receipts) refs.receipts[r.id] = r;
  for (const p of vault.payslips) refs.payslips[p.id] = p;

  const result: AnalysisResult = {
    now: asOf,
    hasData: enriched.length > 0,
    currency,
    bufferCents: settings.bufferCents,
    nextPayday,
    followingPayday,
    payAmount: income?.amount,
    startBalance: start,
    committedUntilPayday: committed(nextPayday ?? addDays(asOf, 30)),
    committedUntilFollowingPayday: committed(defaultEnd),
    everydayDailyEstimate: checkingDaily,
    cardDailyEstimate: cardDaily,
    forecast,
    lowestPoint,
    safeToSpend: Math.max(0, lowestPoint.amount - settings.bufferCents),
    savingsBalance,
    upcoming,
    series: series.filter((s) => s.status !== 'possible'),
    possibleSeries: series.filter((s) => s.status === 'possible'),
    cardBills,
    insights,
    accounts: accountSummaries,
    historyDays: historyDays(txs, asOf),
    refs,
    tookMs: 0,
  };

  const model: ForecastModel = {
    asOf,
    start,
    checkingDaily,
    bufferCents: settings.bufferCents,
    savingsBalance,
    currency,
    defaultEnd,
    eventsUntil: (end) => toEvents(buildUpcoming(end)),
  };
  result.tookMs = Date.now() - t0;
  return { result, model, enriched };
}

