import { deleteAccount, requireUser } from '@/lib/server/auth';
import { json, readJson, route, str } from '@/lib/server/http';
import { forgetUser } from '@/lib/server/services/analysis';
import { clearSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = route(async (req) => {
  const user = requireUser(req);
  const password = str(await readJson(req), 'password', { max: 200, trim: false })!;
  await deleteAccount(user.id, password);
  forgetUser(user.id);
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
