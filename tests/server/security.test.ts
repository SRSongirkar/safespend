import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { POST as signupPOST } from '@/app/api/auth/signup/route';
import { POST as demoPOST } from '@/app/api/demo/load/route';
import { POST as accountsPOST } from '@/app/api/accounts/route';
import { decryptJson, encryptJson, hashPassword, verifyPassword } from '@/lib/server/crypto';
import { getConfig } from '@/lib/server/config';
import { requireUser } from '@/lib/server/auth';
import { listUsers, vaultPath } from '@/lib/server/repo';
import { call, cookieFrom, freshDataDir, signupUser } from './helpers';

let dataDir: string;
beforeEach(() => {
  dataDir = freshDataDir();
});

describe('S1 passwords', () => {
  it('round-trips, rejects a wrong password, and salts every hash', async () => {
    const a = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', a.hash, a.salt)).toBe(true);
    expect(await verifyPassword('wrong horse', a.hash, a.salt)).toBe(false);
    const b = await hashPassword('correct horse');
    expect(b.hash).not.toBe(a.hash);
    expect(b.salt).not.toBe(a.salt);
  });
});

describe('S2 encryption at rest', () => {
  it('round-trips, detects tampering, and leaves no plaintext on disk', async () => {
    const enc = encryptJson({ hello: 'NETFLIX' });
    expect(decryptJson(enc)).toEqual({ hello: 'NETFLIX' });
    const w = JSON.parse(enc);
    const raw = Buffer.from(w.data, 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptJson(JSON.stringify({ ...w, data: raw.toString('base64') }))).toThrow();

    const cookie = await signupUser('a@x.com');
    expect((await call(demoPOST, { method: 'POST', cookie })).status).toBe(200);
    const user = listUsers()[0];
    const onDisk = fs.readFileSync(vaultPath(user.id), 'utf8');
    for (const secret of ['NETFLIX', 'Netflix', 'PAYROLL', 'HomeShield', 'Salary Account']) expect(onDisk).not.toContain(secret);
    expect(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8')).not.toContain('password123');
  });

  it('refuses to run without a strong APP_SECRET', () => {
    const saved = process.env.APP_SECRET;
    process.env.APP_SECRET = 'short';
    expect(() => getConfig()).toThrow(/APP_SECRET/);
    delete process.env.APP_SECRET;
    expect(() => getConfig()).toThrow(/APP_SECRET/);
    process.env.APP_SECRET = saved;
  });
});

describe('S3 sessions', () => {
  it('signup → login → requireUser → logout invalidates; expired sessions are rejected', async () => {
    await signupUser('b@x.com', 'password123', 'Bee');
    const login = await call(loginPOST, { body: { email: ' B@X.com ', password: 'password123' } });
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login.res);
    expect(login.res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(login.res.headers.get('set-cookie')).toMatch(/SameSite=lax/i);

    const me = await call(meGET, { cookie });
    expect(me.body.user).toMatchObject({ email: 'b@x.com', name: 'Bee' });
    expect(requireUser(new Request('http://localhost/', { headers: { cookie } })).email).toBe('b@x.com');

    await call(logoutPOST, { method: 'POST', cookie });
    expect((await call(meGET, { cookie })).status).toBe(401);

    const again = cookieFrom((await call(loginPOST, { body: { email: 'b@x.com', password: 'password123' } })).res);
    const file = path.join(dataDir, 'sessions.json');
    const sessions = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const s of sessions) s.expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(file, JSON.stringify(sessions));
    expect((await call(meGET, { cookie: again })).status).toBe(401);
    expect((await call(meGET, {})).status).toBe(401);
  });

  it('stores only hashed tokens', async () => {
    const cookie = await signupUser('c@x.com');
    const token = cookie.split('=')[1];
    expect(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf8')).not.toContain(token);
  });
});

describe('S4 signup/login errors', () => {
  it('duplicate email → 409; login errors are identical for unknown email and wrong password', async () => {
    await signupUser('d@x.com');
    const dup = await call(signupPOST, { body: { name: 'D', email: 'D@x.com', password: 'password123' } });
    expect(dup.status).toBe(409);
    const unknown = await call(loginPOST, { body: { email: 'nobody@x.com', password: 'password123' } });
    const wrong = await call(loginPOST, { body: { email: 'd@x.com', password: 'wrongpass1' } });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.error).toBe('Email or password is incorrect');
    const weak = await call(signupPOST, { body: { name: 'E', email: 'e@x.com', password: 'short' } });
    expect(weak.status).toBe(400);
  });
});

describe('S8 rate limit', () => {
  it('6 failed logins in a row → 429', async () => {
    await signupUser('f@x.com');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(loginPOST, { body: { email: 'f@x.com', password: 'nope-nope' } })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe('S9 CSRF', () => {
  it('a POST with a foreign Origin → 403; same origin is fine', async () => {
    const cookie = await signupUser('g@x.com');
    const bad = await call(accountsPOST, { body: { name: 'X', type: 'checking' }, cookie, origin: 'https://evil.example' });
    expect(bad.status).toBe(403);
    const ok = await call(accountsPOST, { body: { name: 'X', type: 'checking' }, cookie, origin: 'http://localhost:3000' });
    expect(ok.status).toBe(201);
  });
});
