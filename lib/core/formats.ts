import { headerSignature, type ParsedCsv } from './csv';
import { parseDate } from './dates';
import { toCents } from './money';
import type { AccountType, Cents, ColumnMapping, DateFormat, ISODate } from './types';

export type KnownFormat = 'A' | 'B' | 'C';
export type DetectedFormat = KnownFormat | 'unknown';

export interface FormatSpec {
  id: KnownFormat;
  label: string;
  columns: string[];
  dateFormat: DateFormat;
  suggestedAccountType: AccountType;
}

export const FORMATS: FormatSpec[] = [
  { id: 'A', label: 'Bank CSV (debit / credit / balance)', columns: ['date', 'description', 'debit', 'credit', 'balance'], dateFormat: 'DD/MM/YYYY', suggestedAccountType: 'checking' },
  { id: 'B', label: 'Bank CSV (signed amount)', columns: ['transaction date', 'details', 'amount'], dateFormat: 'YYYY-MM-DD', suggestedAccountType: 'savings' },
  { id: 'C', label: 'Card CSV (amount + DR/CR)', columns: ['posted date', 'merchant', 'amount', 'type'], dateFormat: 'MM/DD/YYYY', suggestedAccountType: 'card' },
];

/** Detect a known format by header signature (case-insensitive, trimmed, column order ignored). */
export function detectFormat(header: string[]): DetectedFormat {
  const cols = new Set(header.map((h) => h.trim().toLowerCase()).filter(Boolean));
  for (const f of FORMATS) {
    if (f.columns.length === cols.size && f.columns.every((c) => cols.has(c))) return f.id;
  }
  return 'unknown';
}

export interface NormalisedRow {
  date: ISODate;
  description: string;
  amount: Cents;
  balanceAfter?: Cents;
}

export interface NormaliseResult {
  rows: NormalisedRow[];
  errors: string[];
}

/** Internal mapping for each known format, expressed the same way as a user mapping. */
function mappingFor(format: KnownFormat, header: string[]): ColumnMapping {
  const find = (name: string) => header.find((h) => h.trim().toLowerCase() === name) ?? name;
  const sig = headerSignature(header);
  switch (format) {
    case 'A':
      return { headerSignature: sig, dateCol: find('date'), dateFormat: 'DD/MM/YYYY', descCol: find('description'), debitCol: find('debit'), creditCol: find('credit'), balanceCol: find('balance') };
    case 'B':
      return { headerSignature: sig, dateCol: find('transaction date'), dateFormat: 'YYYY-MM-DD', descCol: find('details'), amountCol: find('amount'), amountSign: 'negative_is_out' };
    case 'C':
      return { headerSignature: sig, dateCol: find('posted date'), dateFormat: 'MM/DD/YYYY', descCol: find('merchant'), amountCol: find('amount') };
  }
}

export function validateMapping(mapping: ColumnMapping, header: string[]): string | null {
  const has = (c?: string) => !!c && header.includes(c);
  if (!has(mapping.dateCol)) return 'Choose the date column';
  if (!has(mapping.descCol)) return 'Choose the description column';
  if (!['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(mapping.dateFormat)) return 'Choose a date format';
  const amountMode = has(mapping.amountCol);
  const splitMode = has(mapping.debitCol) || has(mapping.creditCol);
  if (!amountMode && !splitMode) return 'Choose an amount column, or debit and credit columns';
  if (amountMode && !mapping.amountSign) return 'Choose how the amount sign works';
  if (mapping.balanceCol && !has(mapping.balanceCol)) return 'Balance column not found';
  return null;
}

/**
 * Normalise CSV rows to signed integer cents from the account's point of view.
 * Bad rows are skipped and reported, never thrown.
 */
export function normaliseRows(csv: ParsedCsv, format: KnownFormat | 'mapped', mapping?: ColumnMapping): NormaliseResult {
  const m = format === 'mapped' ? mapping : mappingFor(format, csv.header);
  if (!m) return { rows: [], errors: ['A column mapping is required for this file'] };
  const idx = (col?: string) => (col ? csv.header.indexOf(col) : -1);
  const iDate = idx(m.dateCol);
  const iDesc = idx(m.descCol);
  const iAmount = idx(m.amountCol);
  const iDebit = idx(m.debitCol);
  const iCredit = idx(m.creditCol);
  const iBalance = idx(m.balanceCol);
  const iType = format === 'C' ? csv.header.findIndex((h) => h.trim().toLowerCase() === 'type') : -1;

  const rows: NormalisedRow[] = [];
  const errors: string[] = [];
  csv.rows.forEach((r, n) => {
    const line = csv.lineNumbers[n] ?? n + 2;
    const cell = (i: number) => (i >= 0 && i < r.length ? r[i].trim() : '');
    if (r.every((c) => c.trim() === '')) return;
    const date = parseDate(cell(iDate), m.dateFormat);
    if (!date) {
      errors.push(`Line ${line}: invalid date "${cell(iDate).slice(0, 20)}" (expected ${m.dateFormat})`);
      return;
    }
    const description = cell(iDesc).replace(/\s+/g, ' ');
    if (!description) {
      errors.push(`Line ${line}: missing description`);
      return;
    }
    let amount: number;
    if (iAmount >= 0) {
      const raw = toCents(cell(iAmount));
      if (Number.isNaN(raw) || cell(iAmount) === '') {
        errors.push(`Line ${line}: invalid amount "${cell(iAmount).slice(0, 20)}"`);
        return;
      }
      if (format === 'C') {
        const type = cell(iType).toUpperCase();
        if (type !== 'DR' && type !== 'CR' && type !== 'DEBIT' && type !== 'CREDIT') {
          errors.push(`Line ${line}: unknown type "${cell(iType).slice(0, 10)}" (expected DR or CR)`);
          return;
        }
        amount = type.startsWith('D') ? -Math.abs(raw) : Math.abs(raw);
      } else {
        amount = m.amountSign === 'positive_is_out' ? -raw : raw;
      }
    } else {
      const debit = toCents(cell(iDebit));
      const credit = toCents(cell(iCredit));
      if (Number.isNaN(debit) || Number.isNaN(credit)) {
        errors.push(`Line ${line}: invalid debit/credit amount`);
        return;
      }
      if (cell(iDebit) === '' && cell(iCredit) === '') {
        errors.push(`Line ${line}: no debit or credit amount`);
        return;
      }
      amount = Math.abs(credit) - Math.abs(debit);
    }
    const row: NormalisedRow = { date, description, amount };
    if (iBalance >= 0 && cell(iBalance) !== '') {
      const b = toCents(cell(iBalance));
      if (!Number.isNaN(b)) row.balanceAfter = b;
    }
    rows.push(row);
  });
  return { rows, errors };
}
