import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => json({ user: requireUser(req) }));
