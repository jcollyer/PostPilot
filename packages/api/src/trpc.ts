import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { isActivityStale, recordActivity } from '@postpilot/accounts';
import { ACCOUNT_PENDING_DELETION } from '@postpilot/types';

import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Reusable middleware that asserts a logged-in user. Procedures defined with
 * `protectedProcedure` get a non-null `ctx.session.user` and `ctx.userId`.
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      session: ctx.session,
      headers: ctx.headers,
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
    },
  });
});

/**
 * A deleted account can still sign in during its grace period, but only to
 * restore itself. Everything else refuses it, so an old tab or a stale mobile
 * screen can't upload, schedule or reconnect on a deactivated account.
 */
const enforceNotPendingDeletion = t.middleware(({ ctx, next }) => {
  if (ctx.session?.user?.deletionScheduledFor) {
    throw new TRPCError({ code: 'FORBIDDEN', message: ACCOUNT_PENDING_DELETION });
  }
  return next();
});

/**
 * Authenticated API use is activity: it keeps a free account's media from the
 * inactivity purge (see @postpilot/accounts). The session user carries
 * `lastActiveAt`, so all but the first request of a user's day skip the
 * database entirely. That one write isn't awaited — the request doesn't
 * depend on it — and if it is lost, the next request simply tries again.
 */
const trackActivity = t.middleware(({ ctx, next }) => {
  const user = ctx.session?.user;
  if (user?.id && isActivityStale(user.lastActiveAt)) {
    void recordActivity(user.id, { client: ctx.prisma }).catch((err) => {
      console.error('[api] failed to record activity:', err);
    });
  }
  return next();
});

export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceNotPendingDeletion)
  .use(trackActivity);

/** Signed in, deletion pending or not — for the restore flow only. */
export const pendingDeletionProcedure = t.procedure.use(enforceUserIsAuthed);

export const createCallerFactory = t.createCallerFactory;
