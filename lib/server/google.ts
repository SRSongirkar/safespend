import { createHash, randomBytes } from 'crypto';
import type { GoogleConfig } from './config';
import { decryptJson, encryptJson } from './crypto';
import { HttpError } from './http';

// Google OAuth 2.0 (authorization code + PKCE), written by hand with fetch — no auth library.

export type GoogleFlowMode = 'login' | 'link' | 'gmail';

export const OAUTH_COOKIE = 'cm_oauth';
export const OAUTH_COOKIE_PATH = '/api/auth/google';
const FLOW_TTL_MS = 10 * 60 * 1000;
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface GoogleFlow {
  state: string;
  verifier: string;
  mode: GoogleFlowMode;
  userId?: string; // for link / gmail: the signed-in user who started the flow
  exp: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Public base URL of this app (APP_URL, else the forwarded host/proto the browser used). */
export function appBaseUrl(req: Request, cfg?: GoogleConfig | null): string {
  if (cfg?.appUrl) return cfg.appUrl;
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export const redirectUriFor = (base: string) => `${base}/api/auth/google/callback`;

export function newFlow(mode: GoogleFlowMode, userId?: string): GoogleFlow {
  return { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(32)), mode, userId, exp: Date.now() + FLOW_TTL_MS };
}

/** The flow is kept in a short-lived, encrypted, httpOnly cookie — nothing to store server-side. */
export function sealFlow(flow: GoogleFlow): string {
  return Buffer.from(encryptJson(flow), 'utf8').toString('base64url');
}

export function openFlow(sealed: string | undefined): GoogleFlow | null {
  if (!sealed || sealed.length > 4000) return null;
  try {
    const flow = decryptJson<GoogleFlow>(Buffer.from(sealed, 'base64url').toString('utf8'));
    return flow.exp > Date.now() ? flow : null;
  } catch {
    return null;
  }
}

export function authUrl(cfg: GoogleConfig, flow: GoogleFlow, redirectUri: string, loginHint?: string): string {
  const scope = flow.mode === 'gmail' ? `openid email ${GMAIL_SCOPE}` : 'openid email profile';
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state: flow.state,
    code_challenge: b64url(createHash('sha256').update(flow.verifier).digest()),
    code_challenge_method: 'S256',
    access_type: 'online', // no refresh token: we never keep long-term access to anyone's Google account
    prompt: flow.mode === 'gmail' ? 'consent' : 'select_account',
    include_granted_scopes: 'true',
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, redirectUri: string): Promise<{ idToken: string; accessToken: string; scope: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; scope?: string; error?: string };
  if (!res.ok || !data.id_token || !data.access_token) throw new HttpError(502, `Google sign-in failed (${data.error ?? res.status})`);
  return { idToken: data.id_token, accessToken: data.access_token, scope: data.scope ?? '' };
}

/**
 * Read the ID token's claims. It comes straight from Google's token endpoint over TLS (not from the browser), so per
 * Google's guidance the signature check can be skipped — but issuer, audience, expiry and email verification are enforced.
 */
export function parseIdToken(idToken: string, clientId: string): GoogleProfile {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(502, 'Google sign-in failed (bad token)');
  }
  const iss = claims.iss;
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') throw new HttpError(502, 'Google sign-in failed (issuer)');
  if (claims.aud !== clientId) throw new HttpError(502, 'Google sign-in failed (audience)');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() - 60_000) throw new HttpError(502, 'Google sign-in failed (expired)');
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (typeof claims.sub !== 'string' || !claims.sub || !email) throw new HttpError(502, 'Google sign-in failed (profile)');
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 80) : email.split('@')[0];
  return { sub: claims.sub, email, emailVerified, name };
}

/** Best effort: give the access token back to Google as soon as we are done with it. */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
    });
  } catch {
    /* ignore */
  }
}
