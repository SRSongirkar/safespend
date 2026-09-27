import { requireUser } from '@/lib/server/auth';
import { int, isoDate, json, oneOf, readJson, route } from '@/lib/server/http';
import { afford } from '@/lib/server/services/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const user = requireUser(req);
  const body = await readJson(req);
  const amountCents = int(body, 'amountCents', { min: 1, max: 100_000_000 })!;
  const date = isoDate(body, 'date')!;
  const repeat = oneOf(body, 'repeat', ['once', 'monthly'] as const, true) ?? 'once';
  return json(afford(user.id, { amountCents, date, repeat }));
});
