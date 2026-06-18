'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/server/auth';

/**
 * Server action invoked from the delete-account modal after the tRPC
 * `user.deleteAccount` mutation has already wiped the user.
 *
 * The mutation cascades the session rows, so the server session may already be
 * gone — we still call signOut to clear the browser cookie, ignoring any error
 * from an already-invalid session, then send the user back to the login page.
 */
export async function signOutAfterAccountDelete() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session already invalidated by the account deletion — nothing to clear.
  }
  redirect('/');
}
