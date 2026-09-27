import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { exportData } from '@/lib/server/services/exportDelete';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const user = requireUser(req);
  const date = new Date().toISOString().slice(0, 10);
  return json(exportData(user), 200, { headers: { 'Content-Disposition': `attachment; filename="committed-export-${date}.json"` } });
});
