import Constants from 'expo-constants';

/**
 * Backend API URL. In local dev, set EXPO_PUBLIC_API_URL in
 * `apps/mobile/.env.local` to the same origin as AUTH_URL in the root `.env`
 * (the ngrok domain). Google sign-in only works when the app, Better Auth's
 * baseURL, and Google's redirect URI share one origin.
 *
 * Without it, this falls back to the Metro host on port 3000, which is fine
 * for email/password but not Google.
 *
 * In production this is your hosted origin, e.g. https://your-domain.com.
 */
const fallbackDevUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return 'http://localhost:3000';
  const host = hostUri.split(':')[0];
  return `http://${host}:3000`;
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? fallbackDevUrl();

/** Custom URL scheme registered in app.json. Used for OAuth redirects. */
export const APP_SCHEME = 'postpilot';
