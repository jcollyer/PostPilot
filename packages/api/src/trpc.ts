import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

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

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

export const createCallerFactory = t.createCallerFactory;
