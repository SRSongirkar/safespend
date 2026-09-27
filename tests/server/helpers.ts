import fs from 'fs';
import os from 'os';
import path from 'path';
import { __resetRateLimit } from '@/lib/server/auth';
import { __resetRepoState } from '@/lib/server/repo';
import { __resetAnalysisCache } from '@/lib/server/services/analysis';
import { POST as signupPOST } from '@/app/api/auth/signup/route';

export function freshDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'committed-test-'));
  process.env.DATA_DIR = dir;
  __resetRepoState();
  __resetRateLimit();
  __resetAnalysisCache();
  return dir;
}

type AnyHandler = (req: Request, ctx: never) => Promise<Response>;

export async function call(
  handler: AnyHandler,
  opts: { method?: string; path?: string; body?: unknown; cookie?: string; origin?: string; params?: Record<string, string> } = {},
): Promise<{ status: number; body: any; res: Response }> {
  const headers: Record<string, string> = { host: 'localhost:3000' };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(`http://localhost:3000${opts.path ?? '/api/x'}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) } as never);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, res };
}

export function cookieFrom(res: Response): string {
  const set = res.headers.get('set-cookie') ?? '';
  const m = /cm_session=([^;]*)/.exec(set);
  if (!m) throw new Error('no session cookie');
  return `cm_session=${m[1]}`;
}

export async function signupUser(email: string, password = 'password123', name = 'Test'): Promise<string> {
  const r = await call(signupPOST as AnyHandler, { body: { name, email, password } });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
  return cookieFrom(r.res);
}

export const demoFile = (name: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'demo', name), 'utf8');
