import { requireUser } from '@/lib/server/auth';
import { json, MB, readJson, route } from '@/lib/server/http';
import { commitImport, parseImportBody } from '@/lib/server/services/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const user = requireUser(req);
  return json(await commitImport(user.id, parseImportBody(await readJson(req, 6 * MB))), 201);
});
