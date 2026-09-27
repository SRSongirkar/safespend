import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { listImports } from '@/lib/server/services/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => json({ imports: listImports(requireUser(req).id) }));
