import { signup } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { setSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const { user, token } = await signup(await readJson(req));
  const res = json({ user }, 201);
  setSessionCookie(res, token);
  return res;
});
