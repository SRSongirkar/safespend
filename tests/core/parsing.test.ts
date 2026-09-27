import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/core/csv';
import { addDays, diffDays, lastWorkingDay, nextMonthlyDate, parseDate } from '@/lib/core/dates';
import { fingerprintRows } from '@/lib/core/fingerprint';
import { detectFormat, normaliseRows } from '@/lib/core/formats';
import { cleanDescription, normaliseMerchant } from '@/lib/core/merchants';
import { toCents } from '@/lib/core/money';

describe('money', () => {
  it('parses amounts into integer cents', () => {
    expect(toCents('1,400.00')).toBe(140000);
    expect(toCents('-$15.49')).toBe(-1549);
    expect(toCents('')).toBe(0);
    expect(toCents('(12.00)')).toBe(-1200);
    expect(toCents('$ 3')).toBe(300);
    expect(toCents('15.5')).toBe(1550);
    expect(toCents('0.07')).toBe(7);
    expect(Number.isNaN(toCents('abc'))).toBe(true);
  });
});

describe('dates', () => {
  it('parses each format without timezone drift', () => {
    expect(parseDate('03/10/2025', 'DD/MM/YYYY')).toBe('2025-10-03');
    expect(parseDate('10/03/2025', 'MM/DD/YYYY')).toBe('2025-10-03');
    expect(parseDate('2025-10-03', 'YYYY-MM-DD')).toBe('2025-10-03');
    expect(parseDate('31/02/2025', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('garbage', 'DD/MM/YYYY')).toBeNull();
  });
  it('does date arithmetic in UTC', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(diffDays('2026-09-24', '2026-10-30')).toBe(36);
    expect(lastWorkingDay(2026, 10)).toBe('2026-10-30'); // 31 Oct is a Saturday
    expect(lastWorkingDay(2026, 5)).toBe('2026-05-29'); // 31 May is a Sunday
    expect(nextMonthlyDate('2026-01-31', 31)).toBe('2026-02-28');
  });
});

describe('csv', () => {
  it('handles quotes, escapes, CRLF, BOM and blank lines', () => {
    const text = '﻿a,b,c\r\n"1,000.00","say ""hi""",x\r\n\r\n"multi\nline",2,3\n\n';
    const p = parseCsv(text);
    expect(p.header).toEqual(['a', 'b', 'c']);
    expect(p.rows).toEqual([
      ['1,000.00', 'say "hi"', 'x'],
      ['multi\nline', '2', '3'],
    ]);
  });
  it('never throws on garbage', () => {
    expect(() => parseCsv('"unterminated,\n,,,\u0000')).not.toThrow();
    expect(parseCsv('').rows).toEqual([]);
  });
});

describe('formats', () => {
  it('detects by header signature, case-insensitive', () => {
    expect(detectFormat([' DATE', 'Description', 'Debit', 'Credit', 'Balance '])).toBe('A');
    expect(detectFormat(['Transaction Date', 'Details', 'Amount'])).toBe('B');
    expect(detectFormat(['Posted Date', 'Merchant', 'Amount', 'Type'])).toBe('C');
    expect(detectFormat(['When', 'What', 'Out', 'In'])).toBe('unknown');
  });
  it('signs amounts from the account point of view and reports bad rows', () => {
    const csv = parseCsv(
      'Posted Date,Merchant,Amount,Type\n10/03/2025,NETFLIX,15.49,DR\n10/04/2025,PAYMENT - THANK YOU,"1,000.00",CR\n99/99/2025,BAD,1,DR\n10/05/2025,BAD AMT,xx,DR\n',
    );
    const { rows, errors } = normaliseRows(csv, 'C');
    expect(rows.map((r) => r.amount)).toEqual([-1549, 100000]);
    expect(errors).toHaveLength(2);
    const a = normaliseRows(parseCsv('Date,Description,Debit,Credit,Balance\n03/10/2025,RENT,"1,400.00",,"2,000.00"\n'), 'A');
    expect(a.rows[0]).toEqual({ date: '2025-10-03', description: 'RENT', amount: -140000, balanceAfter: 200000 });
  });
});

describe('fingerprint', () => {
  it('keeps two identical rows in one file distinct but stable across imports', () => {
    const rows = [
      { date: '2026-09-01', amount: -550, description: 'SQ *BLUE BOTTLE COFFEE' },
      { date: '2026-09-01', amount: -550, description: 'sq *blue  bottle coffee' },
    ];
    const a = fingerprintRows('acc', rows);
    expect(a[0]).not.toBe(a[1]);
    expect(fingerprintRows('acc', rows)).toEqual(a);
    expect(fingerprintRows('other', rows)[0]).not.toBe(a[0]);
  });
});

describe('merchants', () => {
  it('normalises raw descriptions', () => {
    const m = (s: string) => normaliseMerchant(s).merchant;
    expect(m('NETFLIX.COM*8841 LOS GATOS CA')).toBe('Netflix');
    expect(m('SPOTIFY USA 877-778-1161')).toBe('Spotify');
    expect(m('Amazon Prime*3H2K1')).toBe('Amazon Prime');
    expect(m('AMZN Mktp US*2K4P0')).toBe('Amazon');
    expect(m('AMAZON.COM*MK1Z9')).toBe('Amazon');
    expect(m('SQ *BLUE BOTTLE COFFEE')).toBe('Blue Bottle Coffee');
    expect(m('TST* BLUE BOTTLE')).toBe('Blue Bottle Coffee');
    expect(m("TRADER JOE'S #552")).toBe("Trader Joe's");
    expect(m('ACH DEBIT GREENVIEW PROPERTY MGMT 00231')).toBe('Greenview Property Mgmt');
    expect(m('HULU 877-8244858 CA')).toBe('Hulu');
    expect(m('POS CORNER DELI 1234 NY')).toBe('Corner Deli');
    expect(cleanDescription('PAYPAL *SOMESHOP 402-935')).toBe('SOMESHOP');
  });
});
