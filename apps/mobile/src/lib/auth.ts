import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { API_URL, APP_SCHEME } from './config';

const TOKEN_KEY = 'saas.sessionToken';
const EXPIRES_KEY = 'saas.sessionExpires';

export interface StoredSession {
  token: string;
  expires: Date;
}

export async function getStoredSession(): Promise<StoredSession | null> {
  const [token, expiresIso] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_KEY),
  ]);
  if (!token || !expiresIso) return null;
  const expires = new Date(expiresIso);
  if (Number.isNaN(expires.getTime()) || expires <= new Date()) {
    await clearStoredSession();
    return null;
  }
  return { token, expires };
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, session.token),
    SecureStore.setItemAsync(EXPIRES_KEY, session.expires.toISOString()),
  ]);
}

export async function clearStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(EXPIRES_KEY),
  ]);
}

/**
 * Launches the hosted sign-in flow in an in-app browser.
 *
 * 1. Compute the correct return URL for this runtime:
 *      - Expo Go:         exp://<devserver>/--/auth
 *      - dev/prod build:  saas://auth
 * 2. Open `${API_URL}/auth/mobile?returnUrl=<encoded>` so the server knows
 *    exactly where to bounce us after sign-in (custom schemes don't resolve
 *    inside Expo Go, which is why we can't hardcode saas://).
 * 3. The server redirects through Auth.js sign-in (Google / magic link).
 * 4. On success the bridge redirects to `<returnUrl>?token=...&expires=...`.
 * 5. `WebBrowser.openAuthSessionAsync` resolves with that URL.
 * 6. We parse the token and return it.
 *
 * Throws on cancel or any non-success result.
 */
export async function signInWithBrowser(): Promise<StoredSession> {
  const returnUrl = Linking.createURL('auth');
  const startUrl =
    `${API_URL}/auth/mobile` +
    `?returnUrl=${encodeURIComponent(returnUrl)}` +
    `&scheme=${APP_SCHEME}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl, {
    // Ephemeral in dev so the OAuth flow doesn't silently re-use Safari's
    // existing Google cookies. In production, returning users get one-tap
    // sign-in; their app session is persisted in SecureStore regardless.
    preferEphemeralSession: __DEV__,
  });

  if (result.type !== 'success' || !result.url) {
    throw new Error(result.type === 'cancel' ? 'Sign in was cancelled.' : 'Sign in failed.');
  }

  const parsed = Linking.parse(result.url);
  const token = parsed.queryParams?.token;
  const expires = parsed.queryParams?.expires;

  if (typeof token !== 'string' || typeof expires !== 'string') {
    throw new Error('Sign in completed without a session token.');
  }

  const session: StoredSession = { token, expires: new Date(expires) };
  await saveStoredSession(session);
  return session;
}
