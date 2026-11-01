'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';

interface RestoreAccountProps {
  email: string;
  /** ISO timestamp of the scheduled purge. */
  scheduledFor: string;
}

/**
 * Offered to an account scheduled for deletion when it signs back in: restore
 * it, or sign out and let the deletion go ahead.
 */
export function RestoreAccount({ email, scheduledFor }: RestoreAccountProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const date = new Date(scheduledFor).toLocaleDateString(undefined, { dateStyle: 'long' });

  const restore = trpc.user.restoreAccount.useMutation({
    onSuccess: () => {
      // The layout re-reads the session, which no longer carries the flag.
      router.replace('/home');
      router.refresh();
    },
    onError: (err) => setError(err.message),
  });

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace('/');
  }

  const busy = restore.isPending || signingOut;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Restore your account?</CardTitle>
        <CardDescription>
          {email} is scheduled to be permanently deleted on {date}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Restoring keeps your media library, queue and settings. Your queue comes back paused and
          your platforms need reconnecting — they were disconnected when you deleted the account.
        </p>

        {error ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button onClick={() => restore.mutate()} disabled={busy}>
            {restore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Restore account
          </Button>
          <Button variant="ghost" onClick={handleSignOut} disabled={busy}>
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Keep it deleted and sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
