import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';

import { appRouter, createTRPCContext, type SessionLike } from '@saas/api';
import { prisma } from '@saas/db';
import { auth } from '@/server/auth';

/**
 * Resolve a caller session from either:
 *   - the Auth.js cookie (web client), or
 *   - an `Authorization: Bearer <sessionToken>` header (mobile client)
 *
 * Both paths end at the same `Session` table that Auth.js's Prisma adapter
 * populates, so the shared tRPC context looks identical to downstream code.
 */
async function resolveSession(req: NextRequest): Promise<SessionLike | null> {
  // Try cookie-based Auth.js first (the web case).
  const cookieSession = await auth();
  if (cookieSession?.user?.id) {
    return {
      user: {
        id: cookieSession.user.id,
        email: cookieSession.user.email,
        name: cookieSession.user.name,
        image: cookieSession.user.image,
      },
      expires: cookieSession.expires,
    };
  }

  // Fall back to bearer token (mobile case).
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const record = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          select: { id: true, email: true, name: true, image: true },
        },
      },
    });
    if (!record || record.expires <= new Date()) return null;

    return {
      user: record.user,
      expires: record.expires.toISOString(),
    };
  }

  return null;
}

const handler = async (req: NextRequest) => {
  const session = await resolveSession(req);

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ session, headers: req.headers }),
    onError({ error, path }) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`tRPC error on ${path ?? '<unknown>'}:`, error);
      }
    },
  });
};

export { handler as GET, handler as POST };
