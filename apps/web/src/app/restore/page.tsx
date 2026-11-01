import { redirect } from 'next/navigation';

import { RestoreAccount } from '@/features/auth/RestoreAccount';
import { getServerSession } from '@/server/session';

/**
 * /restore — where an account scheduled for deletion lands after signing in.
 * The app layout sends it here; it offers a restore or a way back out, and
 * nothing else in the app is reachable until the creator picks one.
 */
export default async function RestorePage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  const scheduledFor = session.user.deletionScheduledFor;
  if (!scheduledFor) redirect('/home');

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <RestoreAccount email={session.user.email} scheduledFor={new Date(scheduledFor).toISOString()} />
    </main>
  );
}
