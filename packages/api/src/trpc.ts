import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

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

export const protectedProcedure = t.procedure
  .use(enforceUserIsAuthed)
  .use(enforceNotPendingDeletion);

/** Signed in, deletion pending or not — for the restore flow only. */
export const pendingDeletionProcedure = t.procedure.use(enforceUserIsAuthed);

export const createCallerFactory = t.createCallerFactory;
