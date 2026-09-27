import { changePassword, requireUser, sessionToken } from '@/lib/server/auth';
import { json, readJson, route, str } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const user = requireUser(req);
  const body = await readJson(req);
  const currentPassword = str(body, 'currentPassword', { max: 200, trim: false })!;
  const newPassword = str(body, 'newPassword', { max: 200, trim: false })!;
  await changePassword(user.id, sessionToken(req), currentPassword, newPassword);
  return json({ ok: true });
});
