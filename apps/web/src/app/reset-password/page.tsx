import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm';

/**
 * /reset-password — landing page for the password-reset link emailed by Better
 * Auth. The one-time `token` arrives as a query param.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <ResetPasswordForm token={token} linkError={error} />
    </main>
  );
}
