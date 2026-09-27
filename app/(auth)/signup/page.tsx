import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account — Committed' };

export default async function SignupPage() {
  const c = await cookies();
  if (getUserFromToken(c.get(SESSION_COOKIE)?.value)) redirect('/');
  return <AuthForm mode="signup" />;
}
