import fs from 'fs';
import path from 'path';
import { emptyVault } from '@/lib/core/demoAccounts';
import type { UserVault } from '@/lib/core/types';
import { getConfig } from './config';
import { decryptJson, encryptJson } from './crypto';
import { HttpError } from './http';

// The only module that touches disk. Writes are atomic (tmp + rename) and serialised per key.

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // '' for accounts created with Google sign-in
  salt: string;
  createdAt: string;
  googleSub?: string; // Google account id, when the user signs in with Google
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

// Module state lives on globalThis so Next.js dev (which may load a module more than once) shares one copy.
interface RepoState {
  locks: Map<string, Promise<unknown>>;
  versions: Map<string, number>;
}
const g = globalThis as unknown as { __committedRepo?: RepoState };
const state: RepoState = (g.__committedRepo ??= { locks: new Map(), versions: new Map() });

const META_LOCK = '__meta__';
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dataDir(): string {
  const dir = getConfig().dataDir;
  fs.mkdirSync(path.join(dir, 'vault'), { recursive: true });
  return dir;
}

function writeAtomic(file: string, content: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new HttpError(500, `Data file ${path.basename(file)} is unreadable.`);
  }
}

/** Serialise async work per key (a promise chain). */
export async function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = state.locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => next);
  state.locks.set(key, chained);
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (state.locks.get(key) === chained) state.locks.delete(key);
  }
}

// ---------- users ----------

const usersFile = () => path.join(dataDir(), 'users.json');
const sessionsFile = () => path.join(dataDir(), 'sessions.json');

export function listUsers(): UserRecord[] {
  return readJson<UserRecord[]>(usersFile(), []);
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return listUsers().find((u) => u.email === email);
}

export function findUserById(id: string): UserRecord | undefined {
  return listUsers().find((u) => u.id === id);
}

export function mutateUsers<T>(fn: (users: UserRecord[]) => T): Promise<T> {
  return withLock(META_LOCK, () => {
    const users = listUsers();
    const result = fn(users);
    writeAtomic(usersFile(), JSON.stringify(users, null, 2));
    return result;
  });
}

// ---------- sessions ----------

export function listSessions(): SessionRecord[] {
  return readJson<SessionRecord[]>(sessionsFile(), []);
}

export function findSession(tokenHash: string): SessionRecord | undefined {
  return listSessions().find((s) => s.tokenHash === tokenHash);
}

/** Replace the session list with `fn(current)` under the metadata lock. */
export function mutateSessions(fn: (sessions: SessionRecord[]) => SessionRecord[]): Promise<void> {
  return withLock(META_LOCK, () => {
    writeAtomic(sessionsFile(), JSON.stringify(fn(listSessions()), null, 2));
  });
}

// ---------- vaults (AES-256-GCM encrypted per user) ----------

function vaultFile(userId: string): string {
  if (!USER_ID.test(userId)) throw new HttpError(400, 'Invalid user id');
  return path.join(dataDir(), 'vault', `${userId}.enc`);
}

function normalise(v: Partial<UserVault>): UserVault {
  const base = emptyVault();
  return { ...base, ...v, settings: { ...base.settings, ...(v.settings ?? {}) }, version: 1 };
}

export function readVault(userId: string): UserVault {
  const file = vaultFile(userId);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyVault();
    throw e;
  }
  try {
    return normalise(decryptJson<Partial<UserVault>>(text));
  } catch {
    throw new HttpError(
      500,
      'Your data could not be decrypted. It may be corrupted, or APP_SECRET changed since it was saved. Run "npm run reset" to start fresh.',
    );
  }
}

/** Load → decrypt → fn → encrypt → save, inside this user's lock. */
export function withVault<T>(userId: string, fn: (vault: UserVault) => T | Promise<T>): Promise<T> {
  return withLock(`vault:${userId}`, async () => {
    const vault = readVault(userId);
    const result = await fn(vault);
    writeAtomic(vaultFile(userId), encryptJson(vault));
    state.versions.set(userId, (state.versions.get(userId) ?? 0) + 1);
    return result;
  });
}

export function vaultVersion(userId: string): number {
  return state.versions.get(userId) ?? 0;
}

export function vaultExists(userId: string): boolean {
  return fs.existsSync(vaultFile(userId));
}

export function vaultPath(userId: string): string {
  return vaultFile(userId);
}

export function deleteVault(userId: string): Promise<void> {
  return withLock(`vault:${userId}`, () => {
    fs.rmSync(vaultFile(userId), { force: true });
    state.versions.set(userId, (state.versions.get(userId) ?? 0) + 1);
  });
}

/** Test helper: forget in-memory state (used with a fresh DATA_DIR per test). */
export function __resetRepoState() {
  state.locks.clear();
  state.versions.clear();
}
