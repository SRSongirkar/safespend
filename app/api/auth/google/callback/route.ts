import { NextResponse } from 'next/server';
import { getUserFromToken, linkGoogle, loginWithGoogle, readCookie, sessionToken } from '@/lib/server/auth';
import { getGoogleConfig } from '@/lib/server/config';
import { appBaseUrl, exchangeCode, GMAIL_SCOPE, OAUTH_COOKIE, OAUTH_COOKIE_PATH, openFlow, parseIdToken, redirectUriFor, revokeToken } from '@/lib/server/google';
import { HttpError } from '@/lib/server/http';
import { fetchBillEmails, importBillEmails } from '@/lib/server/services/gmail';
import { setSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/auth/google/callback?code&state — Google sends the user back here.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cfg = getGoogleConfig();
  const base = appBaseUrl(req, cfg);
  const flow = openFlow(readCookie(req.headers.get('cookie'), OAUTH_COOKIE));
  const back = !flow || flow.mode === 'login' ? '/login' : flow.mode === 'link' ? '/settings' : '/import';

  const done = (path: string) => {
    const res = NextResponse.redirect(`${base}${path}`, 303);
    res.cookies.set(OAUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };
  const fail = (code: string) => done(`${back}?error=${encodeURIComponent(code)}`);

  if (!cfg) return fail('google_not_configured');
  if (!flow || url.searchParams.get('state') !== flow.state) return fail('google_failed');
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) return fail(flow.mode === 'gmail' ? 'gmail_denied' : 'google_cancelled');

  let accessToken: string | undefined;
  try {
    const tokens = await exchangeCode(cfg, code, flow.verifier, redirectUriFor(base));
    accessToken = tokens.accessToken;
    const profile = parseIdToken(tokens.idToken, cfg.clientId);

    if (flow.mode === 'login') {
      const { token } = await loginWithGoogle(profile);
      const res = done('/');
      setSessionCookie(res, token);
      return res;
    }

    const user = getUserFromToken(sessionToken(req));
    if (!user || user.id !== flow.userId) return fail('google_failed');

    if (flow.mode === 'link') {
      await linkGoogle(user.id, profile);
      return done('/settings?google=linked');
    }

    // gmail: read-only search for bill emails, then import them (dedupe applies)
    if (!tokens.scope.split(' ').includes(GMAIL_SCOPE)) return fail('gmail_denied');
    const { scanned, emails } = await fetchBillEmails(tokens.accessToken);
    const record = await importBillEmails(user.id, emails, profile.email);
    return done(`/import?gmail=done&scanned=${scanned}&found=${emails.length}&added=${record.added}&dup=${record.duplicates}`);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 409 || e.status === 403)) return fail(e.message);
    console.error('[safespend] Google callback failed', e);
    return fail('google_failed');
  } finally {
    // We never keep access to anyone's Google account: hand the token back as soon as we are done.
    if (accessToken) await revokeToken(accessToken);
  }
}
