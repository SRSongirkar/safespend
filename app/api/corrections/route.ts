import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { addCorrection, removeCorrection } from '@/lib/server/services/corrections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const user = requireUser(req);
  return json({ correction: await addCorrection(user.id, await readJson(req)) }, 201);
});

export const DELETE = route(async (req) => {
  const user = requireUser(req);
  await removeCorrection(user.id, await readJson(req));
  return json({ ok: true });
});
