import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { spending } from '@/lib/server/services/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const user = requireUser(req);
  const months = Math.max(1, Math.min(36, parseInt(new URL(req.url).searchParams.get('months') ?? '6', 10) || 6));
  return json({ months: spending(user.id, months) });
});
