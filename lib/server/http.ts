import { NextResponse } from 'next/server';
import { isISODate } from '@/lib/core/dates';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, init?: { headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...(init?.headers ?? {}) } });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error('[committed] unexpected error', e);
  return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
}

/** Reject non-GET requests whose Origin header is present and doesn't match the Host. */
export function checkOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Cross-origin request blocked');
  }
  if (!host || originHost !== host) throw new HttpError(403, 'Cross-origin request blocked');
}

export const MB = 1024 * 1024;

/** Read a JSON object body with a size limit. */
export async function readJson(req: Request, maxBytes = 1 * MB): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, `Request too large (limit ${Math.round(maxBytes / MB)} MB)`);
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new HttpError(413, `Request too large (limit ${Math.round(maxBytes / MB)} MB)`);
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
  return body as Record<string, unknown>;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler: CSRF origin check + JSON errors (never an HTML error page). */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      checkOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

// ---------- hand-written validation ----------

export function str(body: Record<string, unknown>, key: string, opts: { min?: number; max: number; optional?: boolean; trim?: boolean }): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined;
    throw new HttpError(400, `${key} is required`);
  }
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be text`);
  const s = opts.trim === false ? v : v.trim();
  if (s.length < (opts.min ?? 1)) throw new HttpError(400, `${key} is too short`);
  if (s.length > opts.max) throw new HttpError(400, `${key} is too long`);
  return s;
}

export function int(body: Record<string, unknown>, key: string, opts: { min: number; max: number; optional?: boolean }): number | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined;
    throw new HttpError(400, `${key} is required`);
  }
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new HttpError(400, `${key} must be a whole number`);
  if (v < opts.min || v > opts.max) throw new HttpError(400, `${key} must be between ${opts.min} and ${opts.max}`);
  return v;
}

export function oneOf<T extends string>(body: Record<string, unknown>, key: string, values: readonly T[], optional = false): T | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw new HttpError(400, `${key} is required`);
  }
  if (typeof v !== 'string' || !values.includes(v as T)) throw new HttpError(400, `${key} must be one of: ${values.join(', ')}`);
  return v as T;
}

export function isoDate(body: Record<string, unknown>, key: string, optional = false): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw new HttpError(400, `${key} is required`);
  }
  if (!isISODate(v)) throw new HttpError(400, `${key} must be a date (YYYY-MM-DD)`);
  return v;
}

export function bool(body: Record<string, unknown>, key: string): boolean {
  const v = body[key];
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw new HttpError(400, `${key} must be true or false`);
  return v;
}
