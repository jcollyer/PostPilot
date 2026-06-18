import { headers } from 'next/headers';

import { auth } from './auth';

/**
 * Resolve the current Better Auth session in a Server Component or Route
 * Handler. Returns `{ session, user } | null`.
 *
 * This is the server-side analog of the client's `authClient.useSession()`.
 * Pages and layouts use it to guard access and read the signed-in user.
 */
export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}
