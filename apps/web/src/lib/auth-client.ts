import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side Better Auth client. With no `baseURL` it targets the current
 * origin's `/api/auth/*` routes, which is what we want for the web app.
 *
 * Use the exported helpers from client components:
 *   signIn.email(...) / signUp.email(...) / signIn.social(...) / signOut()
 *   useSession() for reactive session state.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
