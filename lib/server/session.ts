import type { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from './auth';
import { getConfig } from './config';

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(getConfig().isProd));
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(getConfig().isProd), maxAge: 0 });
}
