'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from './auth';

/**
 * Sign out the current session and return to the login page. The `nextCookies`
 * plugin clears the session cookie as part of this call.
 */
export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/');
}
