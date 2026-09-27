import { NextResponse } from 'next/server';
import { getUserFromToken, sessionToken } from '@/lib/server/auth';
import { getGoogleConfig } from '@/lib/server/config';
import { appBaseUrl, authUrl, newFlow, OAUTH_COOKIE, OAUTH_COOKIE_PATH, redirectUriFor, sealFlow, type GoogleFlowMode } from '@/lib/server/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODES: GoogleFlowMode[] = ['login', 'link', 'gmail'];
const BACK: Record<GoogleFlowMode, string> = { login: '/login', link: '/settings', gmail: '/import' };

// GET /api/auth/google/start?mode=login|link|gmail → redirect to Google's consent screen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get('mode') ?? 'login';
  const mode: GoogleFlowMode = (MODES as string[]).includes(requested) ? (requested as GoogleFlowMode) : 'login';
  const cfg = getGoogleConfig();
  const base = appBaseUrl(req, cfg);
  if (!cfg) return NextResponse.redirect(`${base}${BACK[mode]}?error=google_not_configured`, 303);

  let userId: string | undefined;
  let hint: string | undefined;
  if (mode !== 'login') {
    const user = getUserFromToken(sessionToken(req));
    if (!user) return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(BACK[mode])}`, 303);
    userId = user.id;
    if (user.google) hint = user.email;
  }
  const flow = newFlow(mode, userId);
  const res = NextResponse.redirect(authUrl(cfg, flow, redirectUriFor(base), hint), 303);
  res.cookies.set(OAUTH_COOKIE, sealFlow(flow), { httpOnly: true, sameSite: 'lax', secure: base.startsWith('https://'), path: OAUTH_COOKIE_PATH, maxAge: 600 });
  return res;
}
