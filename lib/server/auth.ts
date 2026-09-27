import { randomUUID } from 'crypto';
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto';
import type { GoogleProfile } from './google';
import { HttpError } from './http';
import { deleteVault, findSession, findUserByEmail, findUserById, listSessions, mutateSessions, mutateUsers, type UserRecord } from './repo';

export const SESSION_COOKIE = 'cm_session';
export const SESSION_DAYS = 7;
const LOGIN_FAILED = 'Email or password is incorrect';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_FAILURES = 5;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  hasPassword: boolean;
  google: boolean;
}

const toPublic = (u: UserRecord): PublicUser => ({ id: u.id, name: u.name, email: u.email, hasPassword: !!u.passwordHash, google: !!u.googleSub });

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(input: { email?: unknown; password?: unknown; name?: unknown }, withName: boolean) {
  const email = typeof input.email === 'string' ? normaliseEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (withName && (name.length < 1 || name.length > 80)) throw new HttpError(400, 'Please enter your name (up to 80 characters)');
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (password.length > 200) throw new HttpError(400, 'Password is too long');
  return { email, password, name };
}

// ---------- rate limit (in memory, per email) ----------

const g = globalThis as unknown as { __committedRate?: Map<string, number[]> };
const failures: Map<string, number[]> = (g.__committedRate ??= new Map());

function recentFailures(email: string, now: number): number[] {
  const list = (failures.get(email) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  failures.set(email, list);
  return list;
}

export function __resetRateLimit() {
  failures.clear();
}

// ---------- sessions ----------

async function createSession(userId: string): Promise<string> {
  const token = newToken();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_DAYS * 86_400_000).toISOString();
  await mutateSessions((sessions) => [...sessions.filter((s) => new Date(s.expiresAt).getTime() > now), { tokenHash: hashToken(token), userId, expiresAt }]);
  return token;
}

export async function signup(input: { name?: unknown; email?: unknown; password?: unknown }): Promise<{ user: PublicUser; token: string }> {
  const { name, email, password } = validateCredentials(input, true);
  const { hash, salt } = await hashPassword(password);
  const user = await mutateUsers((users) => {
    if (users.some((u) => u.email === email)) throw new HttpError(409, 'An account with this email already exists');
    const record: UserRecord = { id: randomUUID(), email, name, passwordHash: hash, salt, createdAt: new Date().toISOString() };
    users.push(record);
    return record;
  });
  return { user: toPublic(user), token: await createSession(user.id) };
}

const DUMMY_SALT = '00000000000000000000000000000000';
const DUMMY_HASH = '0'.repeat(128);

export async function login(input: { email?: unknown; password?: unknown }): Promise<{ user: PublicUser; token: string }> {
  const email = typeof input.email === 'string' ? normaliseEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || !password || password.length > 200) throw new HttpError(401, LOGIN_FAILED);
  const now = Date.now();
  if (recentFailures(email, now).length >= RATE_MAX_FAILURES) {
    throw new HttpError(429, 'Too many failed attempts. Please wait 10 minutes and try again.');
  }
  const user = findUserByEmail(email);
  // Always run scrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH, user?.salt ?? DUMMY_SALT);
  if (!user || !ok) {
    failures.get(email)!.push(now);
    throw new HttpError(401, LOGIN_FAILED);
  }
  failures.delete(email);
  return { user: toPublic(user), token: await createSession(user.id) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const h = hashToken(token);
  await mutateSessions((sessions) => sessions.filter((s) => s.tokenHash !== h));
}

export function getUserFromToken(token: string | undefined | null): PublicUser | null {
  if (!token || token.length > 200) return null;
  const session = findSession(hashToken(token));
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = findUserById(session.userId);
  return user ? toPublic(user) : null;
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function sessionToken(req: Request): string | undefined {
  return readCookie(req.headers.get('cookie'), SESSION_COOKIE);
}

/** Resolve the signed-in user from the request cookie, or throw 401. */
export function requireUser(req: Request): PublicUser {
  const user = getUserFromToken(sessionToken(req));
  if (!user) throw new HttpError(401, 'Please sign in');
  return user;
}

export async function changePassword(userId: string, currentToken: string | undefined, currentPassword: string, newPassword: string) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(401, 'Please sign in');
  // Google-only accounts have no password yet: they can set one without a current password.
  if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash, user.salt))) throw new HttpError(400, 'Your current password is incorrect');
  validateCredentials({ email: user.email, password: newPassword }, false);
  const { hash, salt } = await hashPassword(newPassword);
  await mutateUsers((users) => {
    const u = users.find((x) => x.id === userId);
    if (u) Object.assign(u, { passwordHash: hash, salt });
  });
  const keep = currentToken ? hashToken(currentToken) : '';
  await mutateSessions((sessions) => sessions.filter((s) => s.userId !== userId || s.tokenHash === keep));
}

export async function deleteAccount(userId: string, password: string) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(401, 'Please sign in');
  if (user.passwordHash) {
    if (!(await verifyPassword(password, user.passwordHash, user.salt))) throw new HttpError(400, 'Password is incorrect');
  } else if (password !== 'DELETE') {
    throw new HttpError(400, 'Type DELETE to confirm');
  }
  await deleteVault(userId);
  await mutateSessions((sessions) => sessions.filter((s) => s.userId !== userId));
  await mutateUsers((users) => {
    const idx = users.findIndex((u) => u.id === userId);
    if (idx >= 0) users.splice(idx, 1);
  });
}

// ---------- Google sign-in ----------

/**
 * Sign in with Google: an existing Google-linked user signs in; a new email gets a new account. An existing
 * password account is never auto-linked (signup doesn't verify email ownership) — the user links it in Settings.
 */
export async function loginWithGoogle(p: GoogleProfile): Promise<{ user: PublicUser; token: string }> {
  if (!p.emailVerified) throw new HttpError(403, 'google_unverified');
  const user = await mutateUsers((users) => {
    const bySub = users.find((u) => u.googleSub === p.sub);
    if (bySub) return bySub;
    const byEmail = users.find((u) => u.email === p.email);
    if (byEmail) {
      if (byEmail.passwordHash || byEmail.googleSub) throw new HttpError(409, 'google_exists');
      byEmail.googleSub = p.sub;
      return byEmail;
    }
    const record: UserRecord = { id: randomUUID(), email: p.email, name: p.name, passwordHash: '', salt: '', createdAt: new Date().toISOString(), googleSub: p.sub };
    users.push(record);
    return record;
  });
  return { user: toPublic(user), token: await createSession(user.id) };
}

/** Link a Google account to the signed-in user, so they can sign in with Google next time. */
export async function linkGoogle(userId: string, p: GoogleProfile): Promise<void> {
  if (!p.emailVerified) throw new HttpError(403, 'google_unverified');
  await mutateUsers((users) => {
    if (users.some((u) => u.googleSub === p.sub && u.id !== userId)) throw new HttpError(409, 'google_in_use');
    const u = users.find((x) => x.id === userId);
    if (!u) throw new HttpError(401, 'Please sign in');
    u.googleSub = p.sub;
  });
}

export function sessionCount(userId: string): number {
  return listSessions().filter((s) => s.userId === userId).length;
}

export const sessionCookieOptions = (isProd: boolean) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: isProd,
  maxAge: SESSION_DAYS * 86_400,
});
