import { randomUUID } from 'crypto';
import { planImport, type ImportInput, type ImportPlan } from '@/lib/core/ingest';
import type { ColumnMapping, DateFormat, ImportRecord } from '@/lib/core/types';
import { HttpError, MB, oneOf, str } from '../http';
import { readVault, withVault } from '../repo';

export const MAX_FILE_BYTES = 5 * MB;
const DATE_FORMATS: readonly DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

function parseMapping(raw: unknown): ColumnMapping | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'mapping must be an object');
  const m = raw as Record<string, unknown>;
  const col = (k: string) => str(m, k, { max: 200, optional: true, trim: false });
  return {
    headerSignature: '',
    dateCol: col('dateCol') ?? '',
    dateFormat: oneOf(m, 'dateFormat', DATE_FORMATS)!,
    descCol: col('descCol') ?? '',
    amountCol: col('amountCol'),
    amountSign: oneOf(m, 'amountSign', ['negative_is_out', 'positive_is_out'] as const, true),
    debitCol: col('debitCol'),
    creditCol: col('creditCol'),
    balanceCol: col('balanceCol'),
  };
}

export function parseImportBody(body: Record<string, unknown>): ImportInput {
  const text = body.text;
  if (typeof text !== 'string') throw new HttpError(400, 'text is required');
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new HttpError(413, 'File too large (limit 5 MB)');
  return {
    fileName: str(body, 'fileName', { max: 200, optional: true }) ?? 'upload.csv',
    text,
    accountId: str(body, 'accountId', { max: 64, optional: true }),
    mapping: parseMapping(body.mapping),
    kind: oneOf(body, 'kind', ['receipt_text'] as const, true),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export type PreviewResponse = Omit<ImportPlan, 'transactions' | 'receipts' | 'payslips' | 'mappingToSave' | 'fatal'>;

function toPreview(plan: ImportPlan): PreviewResponse {
  const { transactions: _t, receipts: _r, payslips: _p, mappingToSave: _m, fatal: _f, ...rest } = plan;
  return rest;
}

function assertOk(plan: ImportPlan) {
  if (plan.fatal === 'too_many_rows') throw new HttpError(413, plan.errors[0] ?? 'Too many rows');
}

/** Preview an import. Nothing is saved. */
export function previewImport(userId: string, input: ImportInput): PreviewResponse {
  const vault = readVault(userId);
  if (input.accountId && !vault.accounts.some((a) => a.id === input.accountId)) throw new HttpError(404, 'Account not found');
  const plan = planImport(vault, input, { newId: randomUUID, today: today() });
  assertOk(plan);
  return toPreview(plan);
}

export function commitImport(userId: string, input: ImportInput): Promise<{ import: ImportRecord; preview: PreviewResponse }> {
  return withVault(userId, (vault) => {
    if (input.accountId && !vault.accounts.some((a) => a.id === input.accountId)) throw new HttpError(404, 'Account not found');
    const importId = randomUUID();
    const plan = planImport(vault, input, { newId: randomUUID, today: today(), importId });
    assertOk(plan);
    if (plan.fatal) throw new HttpError(400, plan.errors[0] ?? 'This file could not be imported');
    if (plan.needsMapping) throw new HttpError(400, plan.errors[0] ?? 'Please match the columns of this file first');
    if (plan.needsAccount) throw new HttpError(400, 'Choose which account this file belongs to');
    vault.transactions.push(...plan.transactions);
    vault.receipts.push(...plan.receipts);
    vault.payslips.push(...plan.payslips);
    if (plan.mappingToSave) {
      vault.mappings = vault.mappings.filter((m) => m.headerSignature !== plan.mappingToSave!.headerSignature);
      vault.mappings.push(plan.mappingToSave);
    }
    const record: ImportRecord = {
      id: importId,
      fileName: input.fileName,
      kind: plan.kind,
      accountId: plan.kind === 'csv' ? input.accountId : undefined,
      format: plan.format === 'unknown' ? 'mapped' : plan.format,
      rowsTotal: plan.rows,
      added: plan.added,
      duplicates: plan.duplicates,
      errors: plan.errors.slice(0, 20),
      createdAt: new Date().toISOString(),
    };
    vault.imports.push(record);
    if (vault.imports.length > 500) vault.imports = vault.imports.slice(-500);
    return { import: record, preview: toPreview(plan) };
  });
}

export function listImports(userId: string): ImportRecord[] {
  return [...readVault(userId).imports].reverse();
}

/** Undo an import: removes exactly the transactions, receipts and payslips it added. */
export function undoImport(userId: string, importId: string): Promise<{ removed: number }> {
  return withVault(userId, (vault) => {
    if (!vault.imports.some((i) => i.id === importId)) throw new HttpError(404, 'Import not found');
    const before = vault.transactions.length + vault.receipts.length + vault.payslips.length;
    vault.transactions = vault.transactions.filter((t) => t.importId !== importId);
    vault.receipts = vault.receipts.filter((r) => r.importId !== importId);
    vault.payslips = vault.payslips.filter((p) => p.importId !== importId);
    vault.imports = vault.imports.filter((i) => i.id !== importId);
    return { removed: before - (vault.transactions.length + vault.receipts.length + vault.payslips.length) };
  });
}
