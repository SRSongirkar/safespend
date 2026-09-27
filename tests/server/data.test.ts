import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE as accountDELETE, PATCH as accountPATCH } from '@/app/api/accounts/[id]/route';
import { GET as accountsGET, POST as accountsPOST } from '@/app/api/accounts/route';
import { POST as affordPOST } from '@/app/api/afford/route';
import { GET as analysisGET } from '@/app/api/analysis/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as correctionsPOST } from '@/app/api/corrections/route';
import { POST as demoPOST } from '@/app/api/demo/load/route';
import { GET as exportGET } from '@/app/api/export/route';
import { POST as commitPOST } from '@/app/api/import/commit/route';
import { POST as previewPOST } from '@/app/api/import/preview/route';
import { DELETE as importDELETE } from '@/app/api/imports/[id]/route';
import { DELETE as meDELETE } from '@/app/api/me/route';
import { POST as passwordPOST } from '@/app/api/settings/password/route';
import { GET as spendingGET } from '@/app/api/spending/route';
import { DELETE as txDELETE, PATCH as txPATCH } from '@/app/api/transactions/[id]/route';
import { GET as txGET, POST as txPOST } from '@/app/api/transactions/route';
import { listSessions, listUsers } from '@/lib/server/repo';
import { call, demoFile, freshDataDir, signupUser } from './helpers';

let dataDir: string;
beforeEach(() => {
  dataDir = freshDataDir();
});

async function newAccount(cookie: string, name = 'Checking', type = 'checking') {
  const r = await call(accountsPOST, { body: { name, type }, cookie });
  expect(r.status).toBe(201);
  return r.body.account.id as string;
}

async function importFile(cookie: string, accountId: string | undefined, fileName: string, text = demoFile(fileName)) {
  return call(commitPOST, { body: { fileName, text, accountId }, cookie });
}

describe('S5 isolation', () => {
  it("user B can't read, patch or delete user A's data, and B's analysis is empty", async () => {
    const a = await signupUser('a@x.com');
    const b = await signupUser('b@x.com');
    const accountId = await newAccount(a);
    const imp = await importFile(a, accountId, 'bank_checking.csv');
    expect(imp.status).toBe(201);
    const txs = await call(txGET, { cookie: a, path: '/api/transactions?pageSize=5' });
    const txId = txs.body.items[0].id;

    expect((await call(accountPATCH, { method: 'PATCH', body: { name: 'hacked' }, cookie: b, params: { id: accountId } })).status).toBe(404);
    expect((await call(accountDELETE, { method: 'DELETE', cookie: b, params: { id: accountId } })).status).toBe(404);
    expect((await call(txPATCH, { method: 'PATCH', body: { note: 'x' }, cookie: b, params: { id: txId } })).status).toBe(404);
    expect((await call(txDELETE, { method: 'DELETE', cookie: b, params: { id: txId } })).status).toBe(404);
    expect((await call(importDELETE, { method: 'DELETE', cookie: b, params: { id: imp.body.import.id } })).status).toBe(404);
    expect((await call(commitPOST, { body: { fileName: 'x.csv', text: demoFile('bank_checking.csv'), accountId }, cookie: b })).status).toBe(404);
    expect((await call(txPOST, { body: { accountId, date: '2026-09-01', description: 'x', amountCents: -100 }, cookie: b })).status).toBe(404);

    expect((await call(accountsGET, { cookie: b })).body.accounts).toEqual([]);
    expect((await call(txGET, { cookie: b })).body.total).toBe(0);
    const analysis = await call(analysisGET, { cookie: b });
    expect(analysis.body.hasData).toBe(false);
    expect(analysis.body.upcoming).toEqual([]);

    // A's data is untouched
    expect((await call(accountsGET, { cookie: a })).body.accounts[0].name).toBe('Checking');
    expect((await call(txGET, { cookie: a })).body.total).toBeGreaterThan(300);
  });

  it('every data route needs a session', async () => {
    for (const h of [accountsGET, analysisGET, txGET, spendingGET, exportGET]) expect((await call(h, {})).status).toBe(401);
    expect((await call(demoPOST, { method: 'POST' })).status).toBe(401);
  });
});

describe('S6 dedupe', () => {
  it('re-importing and overlapping files add 0; identical coffees in one file are both kept', async () => {
    const cookie = await signupUser('d@x.com');
    const accountId = await newAccount(cookie);
    const first = await importFile(cookie, accountId, 'bank_checking.csv');
    expect(first.body.import.added).toBe(407);
    const second = await importFile(cookie, accountId, 'bank_checking.csv');
    expect(second.body.import).toMatchObject({ added: 0, duplicates: 407 });

    const overlapPreview = await call(previewPOST, { body: { fileName: 'o.csv', text: demoFile('bank_checking_overlap.csv'), accountId }, cookie });
    expect(overlapPreview.body.added).toBe(0);
    expect(overlapPreview.body.duplicates).toBeGreaterThan(20);
    expect((await importFile(cookie, accountId, 'bank_checking_overlap.csv')).body.import.added).toBe(0);

    const coffees = 'Posted Date,Merchant,Amount,Type\n09/20/2026,SQ *BLUE BOTTLE COFFEE,5.50,DR\n09/20/2026,SQ *BLUE BOTTLE COFFEE,5.50,DR\n';
    const card = await newAccount(cookie, 'Card', 'card');
    expect((await importFile(cookie, card, 'coffee.csv', coffees)).body.import.added).toBe(2);
    expect((await importFile(cookie, card, 'coffee.csv', coffees)).body.import.added).toBe(0);
  });

  it('loading the demo twice adds 0', async () => {
    const cookie = await signupUser('e@x.com');
    const one = await call(demoPOST, { method: 'POST', cookie });
    expect(one.body.added).toBeGreaterThan(1000);
    const two = await call(demoPOST, { method: 'POST', cookie });
    expect(two.body.added).toBe(0);
    expect((await call(accountsGET, { cookie })).body.accounts).toHaveLength(3);
  });
});

describe('S7 undo import', () => {
  it('removes exactly that import', async () => {
    const cookie = await signupUser('u@x.com');
    const chk = await newAccount(cookie);
    const card = await newAccount(cookie, 'Card', 'card');
    await importFile(cookie, chk, 'bank_checking.csv');
    const cardImport = await importFile(cookie, card, 'card_rewards.csv');
    const before = (await call(txGET, { cookie })).body.total;
    const undo = await call(importDELETE, { method: 'DELETE', cookie, params: { id: cardImport.body.import.id } });
    expect(undo.body.removed).toBe(cardImport.body.import.added);
    expect((await call(txGET, { cookie })).body.total).toBe(before - cardImport.body.import.added);
    expect((await call(txGET, { cookie, path: `/api/transactions?accountId=${card}` })).body.total).toBe(0);
  });
});

describe('S10 delete account', () => {
  it('removes the user, their sessions and their vault file', async () => {
    const cookie = await signupUser('z@x.com');
    await call(demoPOST, { method: 'POST', cookie });
    const user = listUsers()[0];
    const vaultFile = path.join(dataDir, 'vault', `${user.id}.enc`);
    expect(fs.existsSync(vaultFile)).toBe(true);
    expect((await call(meDELETE, { method: 'DELETE', body: { password: 'wrong-password' }, cookie })).status).toBe(400);
    expect((await call(meDELETE, { method: 'DELETE', body: { password: 'password123' }, cookie })).status).toBe(200);
    expect(listUsers()).toHaveLength(0);
    expect(listSessions().filter((s) => s.userId === user.id)).toHaveLength(0);
    expect(fs.existsSync(vaultFile)).toBe(false);
    expect((await call(analysisGET, { cookie })).status).toBe(401);
  });
});

describe('API smoke', () => {
  it('fresh user → demo/load → analysis matches the golden numbers', async () => {
    const cookie = await signupUser('smoke@x.com');
    await call(demoPOST, { method: 'POST', cookie });
    const t0 = Date.now();
    const { status, body: a } = await call(analysisGET, { cookie });
    expect(status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(a.now).toBe('2026-09-24');
    expect(a.nextPayday).toBe('2026-09-30');
    expect(a.lowestPoint.amount).toBeGreaterThanOrEqual(95000);
    expect(a.lowestPoint.amount).toBeLessThanOrEqual(105000);
    expect(a.upcoming.filter((u: { merchant: string }) => u.merchant === 'HomeShield')).toHaveLength(1);

    const verdict = async (amountCents: number) => (await call(affordPOST, { body: { amountCents, date: '2026-10-02', repeat: 'once' }, cookie })).body.verdict;
    expect([await verdict(30000), await verdict(60000), await verdict(200000)]).toEqual(['comfortable', 'tight', 'no']);
    expect((await call(affordPOST, { body: { amountCents: -5, date: 'x' }, cookie })).status).toBe(400);

    const spending = await call(spendingGET, { cookie, path: '/api/spending?months=6' });
    expect(spending.body.months).toHaveLength(6);
    expect(spending.body.months.at(-1).month).toBe('2026-09');

    // "I cancelled Netflix" lowers the committed total (until the payday after next)
    const netflix = a.series.find((s: { merchant: string }) => s.merchant === 'Netflix');
    const spotify = a.series.find((s: { merchant: string }) => s.merchant === 'Spotify');
    expect((await call(correctionsPOST, { body: { seriesKey: netflix.key, action: 'cancelled' }, cookie })).status).toBe(201);
    const after = (await call(analysisGET, { cookie })).body;
    expect(after.committedUntilFollowingPayday.total).toBe(a.committedUntilFollowingPayday.total - netflix.predictedAmount);
    expect(after.insights.some((i: { kind: string }) => i.kind === 'cancelled')).toBe(true);
    expect(spotify).toBeDefined();

    const exp = await call(exportGET, { cookie });
    expect(exp.res.headers.get('content-disposition')).toMatch(/attachment/);
    expect(exp.body.data.transactions.length).toBeGreaterThan(1000);
  });

  it('manual transactions, recategorise with a merchant rule, ColumnMapper, limits', async () => {
    const cookie = await signupUser('m@x.com');
    const chk = await newAccount(cookie);
    const manual = await call(txPOST, { body: { accountId: chk, date: '2026-09-20', description: 'Farmers market', amountCents: -2500 }, cookie });
    expect(manual.status).toBe(201);
    expect((await call(txDELETE, { method: 'DELETE', cookie, params: { id: manual.body.transaction.id } })).status).toBe(204);

    // unknown headers → needsMapping; with a mapping → imports and the mapping is remembered
    const text = demoFile('renamed_headers.csv');
    const p1 = await call(previewPOST, { body: { fileName: 'r.csv', text, accountId: chk }, cookie });
    expect(p1.body.needsMapping).toBe(true);
    const mapping = { dateCol: 'When', dateFormat: 'DD/MM/YYYY', descCol: 'What', debitCol: 'Out', creditCol: 'In' };
    const c1 = await call(commitPOST, { body: { fileName: 'r.csv', text, accountId: chk, mapping }, cookie });
    expect(c1.status).toBe(201);
    expect(c1.body.import).toMatchObject({ format: 'mapped', added: 20, errors: [] });
    const p2 = await call(previewPOST, { body: { fileName: 'r.csv', text, accountId: chk }, cookie });
    expect(p2.body).toMatchObject({ needsMapping: false, added: 0, duplicates: 20 });

    // imported transactions can't be deleted; recategorise all from one merchant
    const list = (await call(txGET, { cookie, path: '/api/transactions?q=chipotle' })).body;
    expect(list.total).toBeGreaterThan(0);
    const id = list.items[0].id;
    expect((await call(txDELETE, { method: 'DELETE', cookie, params: { id } })).status).toBe(403);
    const patched = await call(txPATCH, { method: 'PATCH', body: { categoryOverride: 'groceries', applyToMerchant: true }, cookie, params: { id } });
    expect(patched.body.updated).toBe(list.total);
    const regrouped = (await call(txGET, { cookie, path: '/api/transactions?q=chipotle' })).body.items;
    expect(regrouped.every((t: { category: string }) => t.category === 'groceries')).toBe(true);

    // oversized upload → 413; garbage → no crash
    const big = 'Date,Description,Debit,Credit,Balance\n' + '01/01/2026,X,1.00,,1.00\n'.repeat(260_000);
    expect((await call(previewPOST, { body: { fileName: 'big.csv', text: big, accountId: chk }, cookie })).status).toBe(413);
    const garbage = await call(previewPOST, { body: { fileName: 'g.csv', text: 'Date,Description,Debit,Credit,Balance\nnot,a,real,row\n', accountId: chk }, cookie });
    expect(garbage.status).toBe(200);
    expect(garbage.body.errors.length).toBe(1);
    const empty = await call(previewPOST, { body: { fileName: 'e.csv', text: '', accountId: chk }, cookie });
    expect(empty.body.errors[0]).toMatch(/empty/);
  });

  it('change password logs out other sessions', async () => {
    const one = await signupUser('p@x.com');
    const { cookieFrom } = await import('./helpers');
    const two = cookieFrom((await call(loginPOST, { body: { email: 'p@x.com', password: 'password123' } })).res);
    expect((await call(passwordPOST, { body: { currentPassword: 'password123', newPassword: 'newpassword1' }, cookie: one })).status).toBe(200);
    expect((await call(analysisGET, { cookie: one })).status).toBe(200);
    expect((await call(analysisGET, { cookie: two })).status).toBe(401);
    expect((await call(loginPOST, { body: { email: 'p@x.com', password: 'newpassword1' } })).status).toBe(200);
  });
});
