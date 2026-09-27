import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { deleteAccountById, updateAccount } from '@/lib/server/services/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = requireUser(req);
  const { id } = await params;
  return json({ account: await updateAccount(user.id, id, await readJson(req)) });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = requireUser(req);
  const { id } = await params;
  await deleteAccountById(user.id, id);
  return new Response(null, { status: 204 });
});
