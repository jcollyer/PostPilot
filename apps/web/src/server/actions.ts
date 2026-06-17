'use server';

import { redirect } from 'next/navigation';

import { signIn, signOut } from './auth';

/** Start the Google OAuth flow, returning to /home afterwards. */
export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/home' });
}

/** Send a Resend magic-link email for the given address. */
export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return;
  await signIn('resend', { email, redirectTo: '/home' });
}

/** Sign out and return to the login page. */
export async function signOutAction() {
  await signOut({ redirect: false });
  redirect('/');
}
