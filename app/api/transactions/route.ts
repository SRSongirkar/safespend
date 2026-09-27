import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { createManual, listTransactions, parseFilters } from '@/lib/server/services/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const user = requireUser(req);
  return json(listTransactions(user.id, parseFilters(new URL(req.url))));
});

export const POST = route(async (req) => {
  const user = requireUser(req);
  return json({ transaction: await createManual(user.id, await readJson(req)) }, 201);
});
