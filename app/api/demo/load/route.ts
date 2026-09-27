import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { loadDemo } from '@/lib/server/services/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => json(await loadDemo(requireUser(req).id)));
