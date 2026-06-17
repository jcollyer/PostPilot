import { redirect } from 'next/navigation';

import { auth } from '@/server/auth';
import { getFirstName } from '@/lib/utils';

/**
 * /home — the landing page for authenticated users. Greets the user by their
 * first name, falling back to their email. This is the blank canvas where
 * your app's real content goes.
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect('/');

  const greetingName = getFirstName(session.user.name, session.user.email);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Hello {greetingName}</h1>
      <p className="text-muted-foreground mt-2">
        You&apos;re signed in. This is your home page — start building from here.
      </p>
    </div>
  );
}
