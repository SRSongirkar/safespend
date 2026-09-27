import { logout, sessionToken } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { clearSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  await logout(sessionToken(req));
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
