import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'crypto';
import { getConfig } from './config';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return { hash: key.toString('hex'), salt: salt.toString('hex') };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------- vault encryption (AES-256-GCM) ----------

const keyCache = new Map<string, Buffer>();
function vaultKey(): Buffer {
  const { secret } = getConfig();
  let key = keyCache.get(secret);
  if (!key) {
    key = scryptSync(secret, 'committed-vault-v1', 32);
    keyCache.set(secret, key);
  }
  return key;
}

/** Encrypt JSON with a fresh 12-byte IV. Output: JSON wrapper around base64(iv | authTag | ciphertext). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, alg: 'aes-256-gcm', data: Buffer.concat([iv, tag, ciphertext]).toString('base64') });
}

/** Decrypt; throws if the data was tampered with or the key is wrong. */
export function decryptJson<T>(text: string): T {
  const wrapper = JSON.parse(text) as { v: number; data: string };
  if (wrapper.v !== 1 || typeof wrapper.data !== 'string') throw new Error('Unknown vault format');
  const raw = Buffer.from(wrapper.data, 'base64');
  if (raw.length < 29) throw new Error('Vault too short');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as T;
}
