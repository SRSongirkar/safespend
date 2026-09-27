'use client';

import { useMemo, useState } from 'react';
import type { DateFormat } from '@/lib/core/types';
import type { ImportBody } from '@/lib/client/api';

export type MappingInput = NonNullable<ImportBody['mapping']>;

function firstDataCells(text: string): string[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  return (lines[1] ?? '').split(',').map((c) => c.replace(/^"|"$/g, '').trim());
}

function guessDateFormat(value: string): DateFormat {
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return 'YYYY-MM-DD';
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/.exec(value);
  if (m && Number(m[2]) > 12) return 'MM/DD/YYYY';
  return 'DD/MM/YYYY';
}

/** Map an unknown CSV's columns. The mapping is remembered for files with the same headers. */
export default function ColumnMapper({ header, text, onApply, busy }: { header: string[]; text: string; onApply: (m: MappingInput) => void; busy?: boolean }) {
  const guess = useMemo(() => {
    const find = (re: RegExp) => header.find((h) => re.test(h)) ?? '';
    const date = find(/date|when|posted|time/i) || header[0];
    const cells = firstDataCells(text);
    return {
      dateCol: date,
      dateFormat: guessDateFormat(cells[header.indexOf(date)] ?? ''),
      descCol: find(/desc|detail|merchant|what|payee|narrative|memo|name/i) || header[1] || '',
      amountCol: find(/^amount$|amount|value|sum/i),
      debitCol: find(/debit|out|withdraw|paid out|spent/i),
      creditCol: find(/credit|^in$|deposit|paid in|received/i),
      balanceCol: find(/balance/i),
    };
  }, [header, text]);

  const [dateCol, setDateCol] = useState(guess.dateCol);
  const [dateFormat, setDateFormat] = useState<DateFormat>(guess.dateFormat);
  const [descCol, setDescCol] = useState(guess.descCol);
  const [mode, setMode] = useState<'split' | 'single'>(guess.debitCol && guess.creditCol ? 'split' : guess.amountCol ? 'single' : 'split');
  const [amountCol, setAmountCol] = useState(guess.amountCol || header[2] || '');
  const [amountSign, setAmountSign] = useState<'negative_is_out' | 'positive_is_out'>('negative_is_out');
  const [debitCol, setDebitCol] = useState(guess.debitCol || header[2] || '');
  const [creditCol, setCreditCol] = useState(guess.creditCol || header[3] || '');
  const [balanceCol, setBalanceCol] = useState(guess.balanceCol);

  const preview = firstDataCells(text);
  const col = (label: string, value: string, set: (v: string) => void, id: string, optional = false) => (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => set(e.target.value)}>
        {optional ? <option value="">None</option> : null}
        {header.map((h, i) => (
          <option key={h + i} value={h}>
            {h} {preview[i] ? `— e.g. ${preview[i].slice(0, 24)}` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  const apply = () =>
    onApply({
      dateCol,
      dateFormat,
      descCol,
      ...(mode === 'single' ? { amountCol, amountSign } : { debitCol, creditCol }),
      ...(balanceCol ? { balanceCol } : {}),
    });

  return (
    <div className="mapper" role="group" aria-label="Map columns">
      <div className="span-3">
        <strong>We don’t recognise these columns yet.</strong>
        <p className="small muted">Tell us which column is which. We’ll remember it for files with the same headers.</p>
      </div>
      {col('Date column', dateCol, setDateCol, 'map-date')}
      <div className="field">
        <label className="label" htmlFor="map-datefmt">
          Date format
        </label>
        <select id="map-datefmt" className="select" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
          <option value="DD/MM/YYYY">DD/MM/YYYY (24/09/2026)</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY (09/24/2026)</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD (2026-09-24)</option>
        </select>
      </div>
      {col('Description column', descCol, setDescCol, 'map-desc')}
      <div className="field span-3">
        <span className="label">Amounts</span>
        <div className="seg" role="group" aria-label="Amount columns" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={mode === 'split'} onClick={() => setMode('split')}>
            Money out + money in columns
          </button>
          <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
            One amount column
          </button>
        </div>
      </div>
      {mode === 'single' ? (
        <>
          {col('Amount column', amountCol, setAmountCol, 'map-amount')}
          <div className="field">
            <label className="label" htmlFor="map-sign">
              Sign
            </label>
            <select id="map-sign" className="select" value={amountSign} onChange={(e) => setAmountSign(e.target.value as typeof amountSign)}>
              <option value="negative_is_out">Negative = money out</option>
              <option value="positive_is_out">Positive = money out</option>
            </select>
          </div>
        </>
      ) : (
        <>
          {col('Money out column', debitCol, setDebitCol, 'map-debit')}
          {col('Money in column', creditCol, setCreditCol, 'map-credit')}
        </>
      )}
      {col('Balance column', balanceCol, setBalanceCol, 'map-balance', true)}
      <div className="span-3 row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          Apply mapping
        </button>
      </div>
    </div>
  );
}
