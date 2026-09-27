// Deterministic demo data generator for Committed.
// Plain Node, no dependencies. Seeded PRNG (mulberry32, seed 42) → identical output every run.
// Usage: npm run gen:demo
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'demo');

// Amounts are generated on a base scale, then multiplied by SCALE so the demo reads naturally in rupees (salary ₹1,21,250).
const SCALE = 25;
// Calibrated so the lowest forecast checking balance (as-of → 30 Oct payday) lands in ₹23,750–₹26,250 (base $950–$1,050).
const OPENING_BALANCE = 1111000; // base units (×SCALE → paise), checking balance before 2025-09-01
const SAVINGS_OPENING = 600000;
const START = '2025-09-01';
const AS_OF = '2026-09-24';

// ---------- PRNG ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const chance = (p) => rng() < p;
const cents = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 100);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');
const alnum = (n) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return Array.from({ length: n }, () => chars[Math.floor(rng() * chars.length)]).join('');
};

// ---------- dates (UTC, ISO strings) ----------
const toDate = (iso) => new Date(iso + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0-11
const lastWorkingDay = (y, m) => {
  const d = new Date(Date.UTC(y, m, daysInMonth(y, m)));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
};
const parts = (s) => ({ y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) });
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const mdy = (s) => `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}`;

// ---------- money formatting ----------
const plain = (c) => (Math.abs(c) / 100).toFixed(2);
const withCommas = (c) => {
  const [i, f] = (Math.abs(c) / 100).toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
};
const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvLine = (fields) => fields.map((f) => csvField(String(f))).join(',');

// ---------- generate events ----------
const checking = []; // { date, desc, amount }
const savings = [];
const card = [];

function everydayChecking(date, list) {
  if (!chance(0.85)) return;
  const kind = pick(['cvs', 'atm', 'venmo', 'chipotle', 'safeway', 'venmo', 'cvs']);
  switch (kind) {
    case 'cvs':
      list.push({ date, desc: 'DEBIT CARD PURCHASE CVS/PHARMACY #0921', amount: -cents(8, 60) });
      break;
    case 'atm':
      list.push({ date, desc: 'ATM WITHDRAWAL 1123 MAIN ST', amount: -pick([2000, 4000, 6000, 10000]) });
      break;
    case 'venmo':
      list.push({ date, desc: `VENMO PAYMENT ${digits(7)}`, amount: -cents(10, 90) });
      break;
    case 'chipotle':
      list.push({ date, desc: 'DEBIT CARD PURCHASE CHIPOTLE 2231', amount: -cents(9, 35) });
      break;
    default:
      list.push({ date, desc: 'DEBIT CARD PURCHASE SAFEWAY #1234', amount: -cents(15, 80) });
  }
}

for (let date = START; date <= AS_OF; date = addDays(date, 1)) {
  const { y, m, d } = parts(date);
  const dow = toDate(date).getUTCDay();

  // --- checking (bank A) ---
  if (d === 1) checking.push({ date, desc: 'ACH DEBIT GREENVIEW PROPERTY MGMT 00231', amount: -140000 });
  if (d === 2) {
    checking.push({ date, desc: 'TRANSFER TO SAV XX4521', amount: -30000 });
    savings.push({ date, desc: 'TRANSFER FROM CHK XX1187', amount: 30000 });
  }
  if (d === 5) checking.push({ date, desc: 'ACH DEBIT AUTOFIN LOAN PMT', amount: -31000 });
  if (d === 15) checking.push({ date, desc: 'ACH DEBIT VERIZON WIRELESS PAYMENTS', amount: -cents(45, 52) });
  if (d === 20 && [9, 0, 3, 6].includes(m)) checking.push({ date, desc: 'CITY WATER UTIL #4471', amount: -cents(118, 124) });
  if (date === '2025-10-03') checking.push({ date, desc: 'HOMESHIELD INS PREMIUM', amount: -18600 });
  everydayChecking(date, checking);
  if (date === lastWorkingDay(y, m)) checking.push({ date, desc: 'PAYROLL ACME DESIGN CO PPD ID:99812', amount: 485000 });

  // --- savings (bank B) ---
  if (d === daysInMonth(y, m)) savings.push({ date, desc: 'INTEREST PAYMENT', amount: cents(3, 5) });

  // --- card (C) ---
  if (d === 3) card.push({ date, desc: 'SPOTIFY USA 877-778-1161', amount: date >= '2026-08-01' ? -1199 : -1099 });
  if (d === 12) card.push({ date, desc: `NETFLIX.COM*${digits(4)} LOS GATOS CA`, amount: -1549 });
  if (d === 18) card.push({ date, desc: `Amazon Prime*${alnum(5)}`, amount: -1499 });
  if (d === 20 && date <= '2026-06-20') card.push({ date, desc: 'HULU 877-8244858 CA', amount: -799 });
  if (dow === 1) card.push({ date, desc: 'CITYGYM MEMBERSHIP', amount: -1200 });
  if (chance(0.1)) card.push({ date, desc: pick([`AMZN Mktp US*${alnum(5)}`, `AMAZON.COM*${alnum(5)}`]), amount: -cents(12, 90) });
  if (chance(4 / 7)) card.push({ date, desc: pick(['SQ *BLUE BOTTLE COFFEE', 'TST* BLUE BOTTLE']), amount: -cents(4.5, 7.8) });
  if (chance(2 / 7)) card.push({ date, desc: pick(["TRADER JOE'S #552", 'WHOLEFDS MKT 10233']), amount: -cents(35, 110) });
  if (chance(0.2)) card.push({ date, desc: 'UBER *TRIP', amount: -cents(9, 45) });
  if (chance(0.2)) card.push({ date, desc: pick(['DOORDASH*THAI', 'DOORDASH*SUSHI', 'DOORDASH*PIZZA']), amount: -cents(15, 65) });
  if (chance(0.13)) card.push({ date, desc: 'SHELL OIL 5741', amount: -cents(20, 75) });
  if (chance(0.1)) card.push({ date, desc: `TARGET T-${digits(4)}`, amount: -cents(20, 150) });
  if (chance(0.12)) card.push({ date, desc: 'CHEESECAKE FACTORY #0112', amount: -cents(30, 95) });
  if (date === '2026-08-14') card.push({ date, desc: 'APPLE STORE R102', amount: -99900 });
  if (date === '2026-03-10') card.push({ date, desc: 'AMAZON.COM REFUND*RF12K', amount: 2599 });
}

// --- card autopay (D17): due on the 28th, amount = the cycle that closed on the 8th ---
const cycleTotal = (closeIso) => {
  const openExclusive = (() => {
    const { y, m } = parts(closeIso);
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return `${py}-${String(pm + 1).padStart(2, '0')}-08`;
  })();
  return card
    .filter((t) => t.date > openExclusive && t.date <= closeIso && !t.isPayment)
    .reduce((s, t) => s - t.amount, 0);
};
const payments = [];
for (let date = START; date <= AS_OF; date = addDays(date, 1)) {
  const { y, m, d } = parts(date);
  if (d !== 28) continue;
  const close = `${y}-${String(m + 1).padStart(2, '0')}-08`;
  const bill = cycleTotal(close);
  payments.push({ date, bill });
}
for (const p of payments) {
  checking.push({ date: p.date, desc: 'ONLINE PMT REWARDS CARD AUTOPAY', amount: -p.bill });
  card.push({ date: p.date, desc: 'PAYMENT - THANK YOU', amount: p.bill, isPayment: true });
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
checking.sort(byDate); // stable: keeps generation order within a day
for (const list of [checking, savings, card]) for (const t of list) t.amount *= SCALE;
savings.sort(byDate);
card.sort(byDate);

// ---------- write files ----------
fs.mkdirSync(OUT, { recursive: true });
const write = (name, content) => fs.writeFileSync(path.join(OUT, name), content);

// Checking: format A, DD/MM/YYYY, separate debit/credit, running balance, CRLF
let bal = OPENING_BALANCE * SCALE;
const checkingRows = checking.map((t) => {
  bal += t.amount;
  return { ...t, balance: bal };
});
const checkingLine = (t) =>
  csvLine([dmy(t.date), t.desc, t.amount < 0 ? withCommas(t.amount) : '', t.amount > 0 ? withCommas(t.amount) : '', withCommas(t.balance)]);
const checkingHeader = 'Date,Description,Debit,Credit,Balance';
write('bank_checking.csv', [checkingHeader, ...checkingRows.map(checkingLine)].join('\r\n') + '\r\n');

// Overlap: last 45 days of checking, 0 new rows
const overlapFrom = addDays(AS_OF, -45);
write(
  'bank_checking_overlap.csv',
  [checkingHeader, ...checkingRows.filter((t) => t.date > overlapFrom).map(checkingLine)].join('\r\n') + '\r\n',
);

// Savings: format B, YYYY-MM-DD, signed amounts, UTF-8 BOM
write(
  'bank_savings.csv',
  '﻿' + ['Transaction Date,Details,Amount', ...savings.map((t) => csvLine([t.date, t.desc, (t.amount < 0 ? '-' : '') + plain(t.amount)]))].join('\n') + '\n',
);

// Card: format C, MM/DD/YYYY, positive amounts + DR/CR
write(
  'card_rewards.csv',
  ['Posted Date,Merchant,Amount,Type', ...card.map((t) => csvLine([mdy(t.date), t.desc, plain(t.amount), t.amount < 0 ? 'DR' : 'CR']))].join('\n') + '\n',
);

// Renamed headers (ColumnMapper demo): 20 checking rows from Aug 2025, before the main history.
const aug = [
  { date: '2025-08-01', desc: 'ACH DEBIT GREENVIEW PROPERTY MGMT 00231', amount: -140000 },
  { date: '2025-08-05', desc: 'ACH DEBIT AUTOFIN LOAN PMT', amount: -31000 },
  { date: '2025-08-15', desc: 'ACH DEBIT VERIZON WIRELESS PAYMENTS', amount: -4871 },
  { date: '2025-08-29', desc: 'PAYROLL ACME DESIGN CO PPD ID:99812', amount: 485000 },
];
for (let date = '2025-08-02'; aug.length < 20 && date <= '2025-08-31'; date = addDays(date, 1)) everydayChecking(date, aug);
aug.sort(byDate);
for (const t of aug) t.amount *= SCALE;
write(
  'renamed_headers.csv',
  ['When,What,Out,In', ...aug.map((t) => csvLine([dmy(t.date), t.desc, t.amount < 0 ? plain(t.amount) : '', t.amount > 0 ? plain(t.amount) : '']))].join('\n') + '\n',
);

// Accounts & settings
write(
  'accounts.json',
  JSON.stringify(
    {
      accounts: [
        { id: 'chk', name: 'Salary Account', type: 'checking' },
        { id: 'sav', name: 'Savings Account', type: 'savings', openingBalance: plain(SAVINGS_OPENING * SCALE) },
        { id: 'card', name: 'Credit Card', type: 'card', statementCloseDay: 8, dueDay: 28, autopayFrom: 'chk' },
      ],
      settings: { currency: 'INR', buffer: '12,500.00' },
    },
    null,
    2,
  ) + '\n',
);

// Payslips (Jul + Aug 2026)
write(
  'payslips.json',
  JSON.stringify(
    [
      { employer: 'Acme Design Co', period: '2026-07', payDate: '2026-07-31', gross: '162,500.00', deductions: '41,250.00', net: '121,250.00' },
      { employer: 'Acme Design Co', period: '2026-08', payDate: '2026-08-31', gross: '162,500.00', deductions: '41,250.00', net: '121,250.00' },
    ],
    null,
    2,
  ) + '\n',
);

// Receipts / renewal emails
write(
  'receipts.json',
  JSON.stringify(
    [
      {
        from: 'HomeShield Insurance <billing@homeshield.example>',
        subject: 'Your renters insurance renewal',
        date: '2026-09-10',
        body: 'Hi Aisha, your renters insurance policy renews on October 3, 2026. Amount: ₹4,650.00. It will be charged to your checking account on file.',
      },
      {
        from: 'Netflix <info@account.netflix.example>',
        subject: 'Your Netflix receipt',
        date: '2026-09-12',
        body: 'Thanks for your payment of ₹387.25 for your Standard plan. Next billing date: October 12, 2026.',
      },
      {
        from: 'Spotify <no-reply@spotify.example>',
        subject: 'An update to your Premium price',
        date: '2026-07-05',
        body: 'Your Premium price is changing to ₹299.75 starting August 2026. You don\'t need to do anything.',
      },
      {
        from: 'Parcel Tracker <track@parcels.example>',
        subject: 'Your package has shipped',
        date: '2026-09-15',
        body: 'Good news! Your order is on its way and should arrive in 2-3 business days.',
      },
      {
        from: 'Design Weekly <news@designweekly.example>',
        subject: 'This week in design',
        date: '2026-09-20',
        body: 'The best new typefaces of the month, a deep dive into colour systems, and more.',
      },
    ],
    null,
    2,
  ) + '\n',
);

console.log(
  `Generated demo data: ${checking.length} checking, ${savings.length} savings, ${card.length} card rows. ` +
    `Checking balance on ${AS_OF}: ₹${withCommas(bal)}. Card bill due 2026-09-28: ₹${withCommas(cycleTotal('2026-09-08'))}.`,
);
