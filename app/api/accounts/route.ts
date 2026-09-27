import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { createAccount, listAccounts } from '@/lib/server/services/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => json({ accounts: listAccounts(requireUser(req).id) }));

export const POST = route(async (req) => {
  const user = requireUser(req);
  return json({ account: await createAccount(user.id, await readJson(req)) }, 201);
});
