import { planImport } from './ingest';
import { toCents } from './money';
import type { Account, AccountType, ImportRecord, ISODate, UserVault } from './types';

interface DemoAccountJson {
  id: string;
  name: string;
  type: AccountType;
  statementCloseDay?: number;
  dueDay?: number;
  autopayFrom?: string;
  openingBalance?: string;
}

export interface DemoFiles {
  accounts: string; // accounts.json
  files: { fileName: string; text: string; account?: string }[]; // account = demo id (chk / sav / card)
}

/** The demo file set, in import order, with the demo account each CSV belongs to. */
export const DEMO_FILE_PLAN: { fileName: string; account?: string }[] = [
  { fileName: 'bank_checking.csv', account: 'chk' },
  { fileName: 'bank_savings.csv', account: 'sav' },
  { fileName: 'card_rewards.csv', account: 'card' },
  { fileName: 'payslips.json' },
  { fileName: 'receipts.json' },
];

/**
 * Load demo data into a vault through the normal import path (so dedupe applies and loading twice adds 0).
 * Demo ids are mapped to real account ids; existing accounts with the same name and type are reused.
 */
export function loadDemoIntoVault(vault: UserVault, demo: DemoFiles, ctx: { newId: () => string; nowIso: string; today: ISODate }): ImportRecord[] {
  const parsed = JSON.parse(demo.accounts) as { accounts: DemoAccountJson[]; settings?: { currency?: string; buffer?: string } };
  const idMap = new Map<string, string>();
  for (const a of parsed.accounts) {
    const existing = vault.accounts.find((x) => x.name === a.name && x.type === a.type);
    if (existing) {
      idMap.set(a.id, existing.id);
      continue;
    }
    const account: Account = { id: ctx.newId(), name: a.name, type: a.type, createdAt: ctx.nowIso };
    if (a.openingBalance) account.openingBalanceCents = toCents(a.openingBalance);
    if (a.type === 'card') {
      account.statementCloseDay = a.statementCloseDay;
      account.dueDay = a.dueDay;
    }
    vault.accounts.push(account);
    idMap.set(a.id, account.id);
  }
  for (const a of parsed.accounts) {
    const acct = vault.accounts.find((x) => x.id === idMap.get(a.id));
    if (acct && a.autopayFrom && !acct.autopayFromId) acct.autopayFromId = idMap.get(a.autopayFrom);
  }
  if (parsed.settings?.buffer && vault.transactions.length === 0) vault.settings.bufferCents = toCents(parsed.settings.buffer);

  const records: ImportRecord[] = [];
  for (const f of demo.files) {
    const importId = ctx.newId();
    const accountId = f.account ? idMap.get(f.account) : undefined;
    const plan = planImport(vault, { fileName: f.fileName, text: f.text, accountId }, { newId: ctx.newId, today: ctx.today, importId });
    vault.transactions.push(...plan.transactions);
    vault.receipts.push(...plan.receipts);
    vault.payslips.push(...plan.payslips);
    const record: ImportRecord = {
      id: importId,
      fileName: f.fileName,
      kind: plan.kind,
      accountId,
      format: plan.format === 'unknown' ? 'mapped' : plan.format,
      rowsTotal: plan.rows,
      added: plan.added,
      duplicates: plan.duplicates,
      errors: plan.errors,
      createdAt: ctx.nowIso,
    };
    if (plan.added > 0) vault.imports.push(record);
    records.push(record);
  }
  return records;
}

export function emptyVault(): UserVault {
  return {
    version: 1,
    settings: { currency: 'INR', bufferCents: 1250000 },
    accounts: [],
    transactions: [],
    receipts: [],
    payslips: [],
    imports: [],
    mappings: [],
    corrections: [],
    merchantRules: [],
  };
}
