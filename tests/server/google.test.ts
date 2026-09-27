import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as callbackGET } from '@/app/api/auth/google/callback/route';
import { GET as startGET } from '@/app/api/auth/google/start/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { GET as analysisGET } from '@/app/api/analysis/route';
import { GMAIL_SCOPE, parseIdToken } from '@/lib/server/google';
import { htmlToText, toBillEmail } from '@/lib/server/services/gmail';
import { listUsers } from '@/lib/server/repo';
import { call, freshDataDir, signupUser } from './helpers';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (claims: Record<string, unknown>) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true, ...claims })}.sig`;
const text64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

let google: { idClaims: Record<string, unknown>; scope: string; revoked: string[]; gmailAuth: string[] };

function fakeGoogle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  if (url === 'https://oauth2.googleapis.com/token') return ok({ id_token: idToken(google.idClaims), access_token: 'at-123', scope: google.scope });
  if (url === 'https://oauth2.googleapis.com/revoke') {
    google.revoked.push(String((init?.body as URLSearchParams | undefined)?.get?.('token')));
    return ok({});
  }
  if (url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages')) {
    google.gmailAuth.push(String((init?.headers as Record<string, string> | undefined)?.authorization));
    if (url.includes('/messages/m1')) {
      return ok({
        id: 'm1',
        internalDate: String(Date.UTC(2026, 8, 20)),
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'From', value: 'Airtel <bills@airtel.example>' },
            { name: 'Subject', value: 'Your Airtel bill' },
          ],
          parts: [{ mimeType: 'text/plain', body: { data: text64('Your Airtel bill of ₹599.00 is due on 5 October 2026.') } }],
        },
      });
    }
    if (url.includes('/messages/m2')) {
      return ok({ id: 'm2', internalDate: String(Date.UTC(2026, 8, 21)), payload: { mimeType: 'text/html', headers: [{ name: 'From', value: 'News <n@x.example>' }], body: { data: text64('<p>Weekly news, no money here</p>') } } });
    }
    return ok({ messages: [{ id: 'm1' }, { id: 'm2' }] });
  }
  return Promise.resolve(new Response('not mocked', { status: 500 }));
}

async function startFlow(mode: string, cookie?: string) {
  const r = await call(startGET, { path: `/api/auth/google/start?mode=${mode}`, cookie });
  const location = r.res.headers.get('location') ?? '';
  const flowCookie = /cm_oauth=([^;]+)/.exec(r.res.headers.get('set-cookie') ?? '')?.[1];
  return { r, location, state: new URL(location).searchParams.get('state') ?? '', flowCookie: `cm_oauth=${flowCookie}` };
}

async function finishFlow(state: string, cookies: string) {
  const r = await call(callbackGET, { path: `/api/auth/google/callback?code=abc&state=${state}`, cookie: cookies });
  return { status: r.status, location: r.res.headers.get('location') ?? '', setCookie: r.res.headers.get('set-cookie') ?? '' };
}

beforeEach(() => {
  freshDataDir();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  delete process.env.APP_URL;
  google = { idClaims: { sub: 'g-1', email: 'new.user@gmail.com', name: 'New User' }, scope: 'openid email profile', revoked: [], gmailAuth: [] };
  vi.stubGlobal('fetch', vi.fn(fakeGoogle));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe('Google sign-in', () => {
  it('redirects to Google with PKCE + state, then creates the account and signs in', async () => {
    const { r, location, state, flowCookie } = await startFlow('login');
    expect(r.status).toBe(303);
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const q = new URL(location).searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('redirect_uri')).toBe('http://localhost:3000/api/auth/google/callback');
    expect(q.get('scope')).toBe('openid email profile');

    const done = await finishFlow(state, flowCookie);
    expect(done.status).toBe(303);
    expect(done.location).toBe('http://localhost:3000/');
    const session = /cm_session=[^;]+/.exec(done.setCookie)![0];
    const me = await call(meGET, { cookie: session });
    expect(me.body.user).toMatchObject({ email: 'new.user@gmail.com', name: 'New User', google: true, hasPassword: false });
    expect(me.body.googleEnabled).toBe(true);
    expect(google.revoked).toEqual(['at-123']);

    // signing in again with the same Google account → same user
    const again = await startFlow('login');
    await finishFlow(again.state, again.flowCookie);
    expect(listUsers()).toHaveLength(1);
  });

  it('never auto-links to an existing password account, and rejects a wrong state', async () => {
    await signupUser('taken@gmail.com');
    google.idClaims = { sub: 'g-2', email: 'taken@gmail.com', name: 'X' };
    const f = await startFlow('login');
    expect((await finishFlow(f.state, f.flowCookie)).location).toBe('http://localhost:3000/login?error=google_exists');
    const g = await startFlow('login');
    expect((await finishFlow('wrong-state', g.flowCookie)).location).toBe('http://localhost:3000/login?error=google_failed');
    expect((await finishFlow(g.state, '')).location).toBe('http://localhost:3000/login?error=google_failed');
  });

  it('lets a signed-in password user connect Google in Settings', async () => {
    const cookie = await signupUser('me@example.com');
    google.idClaims = { sub: 'g-3', email: 'me.personal@gmail.com', name: 'Me' };
    const f = await startFlow('link', cookie);
    const done = await finishFlow(f.state, `${cookie}; ${f.flowCookie}`);
    expect(done.location).toBe('http://localhost:3000/settings?google=linked');
    expect((await call(meGET, { cookie })).body.user.google).toBe(true);
  });

  it('validates the ID token', () => {
    expect(() => parseIdToken(idToken({ sub: 's', email: 'a@b.com', aud: 'someone-else' }), CLIENT_ID)).toThrow(/audience/);
    expect(parseIdToken(idToken({ sub: 's', email: 'A@B.com', email_verified: false }), CLIENT_ID)).toMatchObject({ email: 'a@b.com', emailVerified: false });
  });
});

describe('Gmail bill import', () => {
  it('reads bill emails read-only, keeps only ones with an amount, dedupes, and revokes access', async () => {
    const cookie = await signupUser('aisha@example.com');
    google.idClaims = { sub: 'g-4', email: 'aisha.bills@gmail.com', name: 'Aisha' };
    google.scope = `openid email ${GMAIL_SCOPE}`;
    const f = await startFlow('gmail', cookie);
    expect(new URL(f.location).searchParams.get('scope')).toContain(GMAIL_SCOPE);

    const done = await finishFlow(f.state, `${cookie}; ${f.flowCookie}`);
    expect(done.location).toBe('http://localhost:3000/import?gmail=done&scanned=2&found=1&added=1&dup=0');
    expect(google.gmailAuth.every((h) => h === 'Bearer at-123')).toBe(true);
    expect(google.revoked).toEqual(['at-123']);

    const a = (await call(analysisGET, { cookie })).body;
    expect(Object.values(a.refs.receipts).map((r: any) => r.subject)).toEqual(['Your Airtel bill']);

    const again = await startFlow('gmail', cookie);
    expect((await finishFlow(again.state, `${cookie}; ${again.flowCookie}`)).location).toContain('added=0&dup=1');
  });

  it('needs the user to allow Gmail access', async () => {
    const cookie = await signupUser('b@example.com');
    google.scope = 'openid email'; // user unticked Gmail on the consent screen
    const f = await startFlow('gmail', cookie);
    expect((await finishFlow(f.state, `${cookie}; ${f.flowCookie}`)).location).toBe('http://localhost:3000/import?error=gmail_denied');
  });

  it('turns HTML emails into readable text', () => {
    expect(htmlToText('<style>x{}</style><p>Total&nbsp;due: &#8377;1,234</p><p>Due date: 05-Oct-2026</p>')).toBe('Total due: ₹1,234\nDue date: 05-Oct-2026');
    const e = toBillEmail({ id: 'x', internalDate: String(Date.UTC(2026, 0, 2)), payload: { mimeType: 'text/html', body: { data: text64('<b>Hi</b>') }, headers: [{ name: 'Subject', value: 'S' }] } });
    expect(e).toMatchObject({ from: 'Unknown sender', subject: 'S', date: '2026-01-02', body: 'Hi' });
  });
});
