import { TRPCError } from '@trpc/server';

import { cancelAllSubscriptions, isBillingConfigured } from '@postpilot/billing';
import { deletePrefix, isStorageConfigured, userPrefix } from '@postpilot/storage';
import {
  deleteAccountSchema,
  updateProfileSchema,
  updateStorageSettingsSchema,
} from '@postpilot/types';

import { protectedProcedure, publicProcedure, router } from '../trpc';

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  createdAt: true,
  deleteSourceAfterPublish: true,
} as const;

export const userRouter = router({
  /** Returns the current session, or null if signed out. */
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),

  /** Returns the full user record for the signed-in user. */
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: userSelect,
    }),
  ),

  /** Update the signed-in user's display name. */
  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(({ ctx, input }) =>
    ctx.prisma.user.update({
      where: { id: ctx.userId },
      data: { name: input.name },
      select: userSelect,
    }),
  ),

  /**
   * Update the signed-in user's storage retention preference.
   *
   * Turning this on lets the retention sweep remove source files for videos
   * published more than SOURCE_RETENTION_DAYS ago. Turning it off stops future
   * deletions; it cannot restore sources that were already removed, which is
   * why the UI states that plainly before the first opt-in.
   */
  updateStorageSettings: protectedProcedure
    .input(updateStorageSettingsSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { deleteSourceAfterPublish: input.deleteSourceAfterPublish },
        select: userSelect,
      }),
    ),

  /**
   * Permanently delete the signed-in user and all of their data.
   *
   * Every User relation in the schema declares `onDelete: Cascade`, so a
   * single `user.delete` atomically removes the entire ownership graph —
   * including all Session rows, which invalidates every signed-in device.
   *
   * The two things outside the database go first, in order, so a failure
   * stops before anything is lost and the user can simply try again:
   *
   *  1. Stripe — every running subscription is canceled. Otherwise a paying
   *     creator keeps being charged for an account that no longer exists.
   *  2. Storage — everything under `users/<id>/` is removed. Once the rows are
   *     gone nothing points at those objects, so a failure after the row
   *     delete would strand them in R2 for good; before it, a retry finds them.
   *
   * A retry after a partial failure is safe: there are no live subscriptions
   * left to cancel and the prefix listing simply comes back shorter.
   *
   * Safety: the caller must pass `confirmEmail` matching the user's current
   * email exactly (case-insensitive). The UI also gates this behind a typed
   * confirmation modal.
   *
   * The session cookie on the client is not cleared by this mutation — the
   * caller is responsible for triggering sign-out afterwards so the now
   * invalid cookie is removed.
   */
  deleteAccount: protectedProcedure.input(deleteAccountSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, stripeCustomerId: true },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
    }

    const typed = input.confirmEmail.toLowerCase();
    const expected = (user.email ?? '').toLowerCase();

    if (!expected || typed !== expected) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "The email you typed doesn't match the account email.",
      });
    }

    if (user.stripeCustomerId) {
      if (isBillingConfigured()) {
        try {
          const canceled = await cancelAllSubscriptions(user.stripeCustomerId);
          if (canceled > 0) {
            console.log(`[user] canceled ${canceled} subscription(s): userId=${user.id}`);
          }
        } catch (err) {
          console.error(`[user] failed to cancel subscriptions for userId=${user.id}:`, err);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              "We couldn't cancel your subscription, so your account was not deleted. Please try again.",
          });
        }
      } else {
        console.warn(
          `[user] billing is not configured — not canceling subscriptions for userId=${user.id}`,
        );
      }
    }

    if (isStorageConfigured()) {
      try {
        await deletePrefix(userPrefix(user.id));
      } catch (err) {
        console.error(`[user] failed to delete storage for userId=${user.id}:`, err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            "We couldn't remove your media, so your account was not deleted. Please try again.",
        });
      }
    } else {
      console.warn(`[user] storage is not configured — not deleting media for userId=${user.id}`);
    }

    await ctx.prisma.user.delete({ where: { id: user.id } });

    console.log(`[user] account deleted: userId=${user.id}`);

    return { success: true as const };
  }),
});
