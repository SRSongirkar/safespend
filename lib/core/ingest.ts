import { headerSignature, parseCsv } from './csv';
import { isISODate } from './dates';
import { fingerprintDoc, fingerprintRows } from './fingerprint';
import { detectFormat, FORMATS, normaliseRows, validateMapping } from './formats';
import { toCents } from './money';
import { parseEmailText } from './receipts';
import type { AccountType, Cents, ColumnMapping, ImportFormat, ImportKind, ISODate, Payslip, Receipt, Transaction, UserVault } from './types';

export const MAX_ROWS = 20_000;

export interface ImportInput {
  fileName: string;
  text: string;
  accountId?: string;
  mapping?: ColumnMapping;
  kind?: 'receipt_text';
}

export interface ImportPlan {
  kind: ImportKind;
  format: ImportFormat | 'unknown';
  headerSignature?: string;
  header?: string[];
  needsMapping: boolean;
  needsAccount: boolean;
  suggestedAccountType?: AccountType;
  rows: number;
  added: number;
  duplicates: number;
  errors: string[];
  sample: { date: ISODate; description: string; amount: Cents; duplicate: boolean }[];
  fatal?: 'too_many_rows' | 'invalid';
  transactions: Transaction[];
  receipts: Receipt[];
  payslips: Payslip[];
  mappingToSave?: ColumnMapping;
}

interface Ctx {
  newId: () => string;
  today: ISODate;
  importId?: string;
}

const emptyPlan = (kind: ImportKind, format: ImportPlan['format']): ImportPlan => ({
  kind,
  format,
  needsMapping: false,
  needsAccount: false,
  rows: 0,
  added: 0,
  duplicates: 0,
  errors: [],
  sample: [],
  transactions: [],
  receipts: [],
  payslips: [],
});

const money = (v: unknown): Cents => (typeof v === 'number' ? Math.round(v * 100) : typeof v === 'string' ? toCents(v) : NaN);
const str = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');

function looksLikeJson(fileName: string, text: string) {
  return /\.json$/i.test(fileName) || /^\s*[[{]/.test(text);
}

/**
 * Plan an import without saving anything: detect kind/format, normalise, fingerprint and dedupe against the vault.
 * The same function powers the preview (nothing saved) and the commit (server saves `transactions/receipts/payslips`).
 */
export function planImport(vault: UserVault, input: ImportInput, ctx: Ctx): ImportPlan {
  if (input.kind === 'receipt_text') return planReceiptText(vault, input, ctx);
  if (looksLikeJson(input.fileName, input.text)) return planJson(vault, input, ctx);
  return planCsv(vault, input, ctx);
}

function planCsv(vault: UserVault, input: ImportInput, ctx: Ctx): ImportPlan {
  const csv = parseCsv(input.text);
  const plan = emptyPlan('csv', 'unknown');
  if (csv.header.length === 0) {
    plan.errors.push('The file is empty.');
    plan.fatal = 'invalid';
    return plan;
  }
  plan.header = csv.header;
  plan.headerSignature = headerSignature(csv.header);
  if (csv.rows.length > MAX_ROWS) {
    plan.fatal = 'too_many_rows';
    plan.errors.push(`Too many rows (${csv.rows.length}). The limit is ${MAX_ROWS.toLocaleString('en-US')} per file.`);
    return plan;
  }
  if (csv.rows.length === 0) {
    plan.errors.push('The file has a header row but no transactions.');
  }

  const detected = detectFormat(csv.header);
  let mapping: ColumnMapping | undefined;
  if (detected === 'unknown') {
    mapping = input.mapping ?? vault.mappings.find((m) => m.headerSignature === plan.headerSignature);
    if (!mapping) {
      plan.needsMapping = true;
      plan.rows = csv.rows.length;
      return plan;
    }
    mapping = { ...mapping, headerSignature: plan.headerSignature };
    const problem = validateMapping(mapping, csv.header);
    if (problem) {
      plan.needsMapping = true;
      plan.errors.push(problem);
      plan.rows = csv.rows.length;
      return plan;
    }
    plan.format = 'mapped';
    if (input.mapping) plan.mappingToSave = mapping;
  } else {
    plan.format = detected;
    plan.suggestedAccountType = FORMATS.find((f) => f.id === detected)?.suggestedAccountType;
  }

  const { rows, errors } = normaliseRows(csv, detected === 'unknown' ? 'mapped' : detected, mapping);
  plan.rows = csv.rows.length;
  plan.errors.push(...errors.slice(0, 50));
  if (errors.length > 50) plan.errors.push(`…and ${errors.length - 50} more row errors`);

  const account = vault.accounts.find((a) => a.id === input.accountId);
  if (!account) {
    plan.needsAccount = true;
    plan.sample = rows.slice(0, 5).map((r) => ({ date: r.date, description: r.description, amount: r.amount, duplicate: false }));
    return plan;
  }

  const existing = new Set(vault.transactions.map((t) => t.fingerprint));
  const fps = fingerprintRows(account.id, rows);
  rows.forEach((r, i) => {
    const duplicate = existing.has(fps[i]);
    if (plan.sample.length < 5) plan.sample.push({ date: r.date, description: r.description, amount: r.amount, duplicate });
    if (duplicate) {
      plan.duplicates++;
      return;
    }
    plan.transactions.push({
      id: ctx.newId(),
      accountId: account.id,
      date: r.date,
      rawDescription: r.description.slice(0, 200),
      amount: r.amount,
      ...(r.balanceAfter !== undefined ? { balanceAfter: r.balanceAfter } : {}),
      source: 'import',
      importId: ctx.importId,
      fingerprint: fps[i],
    });
  });
  plan.added = plan.transactions.length;
  return plan;
}

function planJson(vault: UserVault, input: ImportInput, ctx: Ctx): ImportPlan {
  let data: unknown;
  try {
    data = JSON.parse(input.text.replace(/^﻿/, ''));
  } catch {
    const plan = emptyPlan('receipts', 'json');
    plan.errors.push('This JSON file could not be read.');
    plan.fatal = 'invalid';
    return plan;
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : null;
  if (!list) {
    const plan = emptyPlan('receipts', 'json');
    plan.errors.push(
      (data as { accounts?: unknown })?.accounts ? 'accounts.json describes demo accounts — use "Load demo data" instead.' : 'Expected a list of payslips or receipts.',
    );
    plan.fatal = 'invalid';
    return plan;
  }
  if (list.length > MAX_ROWS) {
    const plan = emptyPlan('receipts', 'json');
    plan.fatal = 'too_many_rows';
    plan.errors.push(`Too many items (${list.length}).`);
    return plan;
  }
  const first = (list[0] ?? {}) as Record<string, unknown>;
  const isPayslips = 'net' in first || 'netCents' in first || 'employer' in first;
  return isPayslips ? planPayslips(vault, list, ctx) : planReceipts(vault, list, ctx);
}

function planPayslips(vault: UserVault, list: unknown[], ctx: Ctx): ImportPlan {
  const plan = emptyPlan('payslips', 'json');
  plan.rows = list.length;
  const existing = new Set(vault.payslips.map((p) => p.fingerprint));
  list.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const employer = str(o.employer, 100).trim();
    const payDate = str(o.payDate, 10);
    const net = 'netCents' in o ? Number(o.netCents) : money(o.net);
    const gross = 'grossCents' in o ? Number(o.grossCents) : money(o.gross ?? 0);
    const deductions = 'deductionsCents' in o ? Number(o.deductionsCents) : money(o.deductions ?? 0);
    if (!employer || !isISODate(payDate) || !Number.isInteger(net) || net <= 0) {
      plan.errors.push(`Item ${i + 1}: needs employer, payDate (YYYY-MM-DD) and net pay`);
      return;
    }
    const fingerprint = fingerprintDoc('payslip', [employer.toUpperCase(), payDate, net]);
    const duplicate = existing.has(fingerprint);
    if (plan.sample.length < 5) plan.sample.push({ date: payDate, description: `${employer} payslip (net)`, amount: net, duplicate });
    if (duplicate) {
      plan.duplicates++;
      return;
    }
    existing.add(fingerprint);
    plan.payslips.push({
      id: ctx.newId(),
      employer,
      payDate,
      grossCents: Number.isInteger(gross) ? gross : 0,
      deductionsCents: Number.isInteger(deductions) ? deductions : 0,
      netCents: net,
      importId: ctx.importId,
      fingerprint,
    });
  });
  plan.added = plan.payslips.length;
  return plan;
}

function addReceipt(plan: ImportPlan, existing: Set<string | undefined>, r: Omit<Receipt, 'id' | 'fingerprint' | 'importId'>, ctx: Ctx) {
  const fingerprint = fingerprintDoc('receipt', [r.from, r.date, r.subject, r.body]);
  const duplicate = existing.has(fingerprint);
  if (plan.sample.length < 5) plan.sample.push({ date: r.date, description: `${r.from} — ${r.subject}`.slice(0, 120), amount: 0, duplicate });
  if (duplicate) {
    plan.duplicates++;
    return;
  }
  existing.add(fingerprint);
  plan.receipts.push({ id: ctx.newId(), ...r, importId: ctx.importId, fingerprint });
}

function planReceipts(vault: UserVault, list: unknown[], ctx: Ctx): ImportPlan {
  const plan = emptyPlan('receipts', 'json');
  plan.rows = list.length;
  const existing = new Set(vault.receipts.map((r) => r.fingerprint));
  list.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const from = str(o.from, 200).trim();
    const body = str(o.body, 20000);
    const date = str(o.date, 10);
    if (!from || !body || !isISODate(date)) {
      plan.errors.push(`Item ${i + 1}: needs from, date (YYYY-MM-DD) and body`);
      return;
    }
    addReceipt(plan, existing, { from, subject: str(o.subject, 300), date, body }, ctx);
  });
  plan.added = plan.receipts.length;
  return plan;
}

function planReceiptText(vault: UserVault, input: ImportInput, ctx: Ctx): ImportPlan {
  const plan = emptyPlan('receipt_text', 'text');
  const text = input.text.trim();
  plan.rows = text ? 1 : 0;
  if (!text) {
    plan.errors.push('Paste the email text first.');
    plan.fatal = 'invalid';
    return plan;
  }
  const email = parseEmailText(text.slice(0, 20000), ctx.today);
  addReceipt(plan, new Set(vault.receipts.map((r) => r.fingerprint)), email, ctx);
  plan.added = plan.receipts.length;
  return plan;
}
