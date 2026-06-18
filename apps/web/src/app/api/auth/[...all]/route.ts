import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/server/auth';

/**
 * Mounts the entire Better Auth API (sign-up, sign-in, verify email, reset
 * password, social callbacks, session, sign-out, …) at `/api/auth/*` for both
 * the web and mobile clients.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
