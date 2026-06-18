import { redirect } from 'next/navigation';

import { getServerSession } from '@/server/session';
import { AuthForm } from '@/features/auth/AuthForm';

/**
 * The login page lives on the root route. Authenticated users are sent
 * straight to /home; everyone else sees the sign-in / create-account card.
 * Any unauthenticated hit on a protected route also lands here.
 */
export default async function LoginPage() {
  const session = await getServerSession();
  if (session?.user) redirect('/home');

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <AuthForm hasGoogle={hasGoogle} />
    </main>
  );
}
