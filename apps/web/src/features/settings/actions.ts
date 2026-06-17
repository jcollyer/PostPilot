'use server';

import { redirect } from 'next/navigation';

import { signOut } from '@/server/auth';

/**
 * Server action invoked from the delete-account modal after the tRPC
 * `user.deleteAccount` mutation has already wiped the user.
 *
 * The mutation cascades the Session row, but the browser still holds the
 * (now-invalid) session cookie. Calling signOut clears that cookie before we
 * send the user back to the login page.
 */
export async function signOutAfterAccountDelete() {
  await signOut({ redirect: false });
  redirect('/');
}
