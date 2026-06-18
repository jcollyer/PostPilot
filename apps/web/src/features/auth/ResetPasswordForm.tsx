'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

interface ResetPasswordFormProps {
  token?: string;
  /** Set by Better Auth when the reset link itself is invalid/expired. */
  linkError?: string;
}

/**
 * Sets a new password using the one-time token from the reset email, then
 * sends the user back to sign in.
 */
export function ResetPasswordForm({ token, linkError }: ResetPasswordFormProps) {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const invalidLink = !token || Boolean(linkError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message ?? 'Could not reset your password.');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/'), 1500);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invalidLink ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            This reset link is invalid or has expired. Request a new one from the sign-in page.
          </div>
        ) : done ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Password updated. Redirecting you to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error ? (
              <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
