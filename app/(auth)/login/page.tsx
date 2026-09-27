import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/server/auth';
import { getGoogleConfig } from '@/lib/server/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in — SafeSpend' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const c = await cookies();
  if (getUserFromToken(c.get(SESSION_COOKIE)?.value)) redirect('/');
  const { next, error } = await searchParams;
  return <AuthForm mode="login" next={typeof next === 'string' ? next : undefined} google={!!getGoogleConfig()} error={typeof error === 'string' ? error : undefined} />;
}
