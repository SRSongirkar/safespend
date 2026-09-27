import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { getSettings, patchSettings } from '@/lib/server/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => json({ settings: getSettings(requireUser(req).id) }));

export const PATCH = route(async (req) => {
  const user = requireUser(req);
  return json({ settings: await patchSettings(user.id, await readJson(req)) });
});
