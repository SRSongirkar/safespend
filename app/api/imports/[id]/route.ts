import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { undoImport } from '@/lib/server/services/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = requireUser(req);
  const { id } = await params;
  return json(await undoImport(user.id, id));
});
