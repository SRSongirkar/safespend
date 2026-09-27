import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { getAnalysis } from '@/lib/server/services/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => json(getAnalysis(requireUser(req).id)));
