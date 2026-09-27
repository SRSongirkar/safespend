import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { deleteManual, patchTransaction } from '@/lib/server/services/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = requireUser(req);
  const { id } = await params;
  return json(await patchTransaction(user.id, id, await readJson(req)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = requireUser(req);
  const { id } = await params;
  await deleteManual(user.id, id);
  return new Response(null, { status: 204 });
});
