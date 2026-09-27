import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Server-side guard for every app page (no middleware: it runs on the Edge runtime without fs/crypto).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const user = getUserFromToken(c.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login');
  return <AppShell user={user}>{children}</AppShell>;
}
