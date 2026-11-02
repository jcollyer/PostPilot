import { TRPCError } from '@trpc/server';

import { requestAccountDeletion, restoreAccount } from '@postpilot/accounts';
import {
  deleteAccountSchema,
  updateProfileSchema,
  updateStorageSettingsSchema,
} from '@postpilot/types';

import { pendingDeletionProcedure, protectedProcedure, publicProcedure, router } from '../trpc';

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
   * When on, the retention sweep removes source files for videos published
   * more than SOURCE_RETENTION_DAYS ago. It is on by default for accounts
   * created from 2026-11 on — onboarding shows it as a pre-checked toggle that
   * calls this — and older accounts keep what they had. Either way it stays
   * the user's call in Settings. Turning it off stops future deletions; it
   * cannot restore sources that were already removed, which is why the UI
   * says so plainly.
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
   * Delete the signed-in user's account: deactivated now, purged after the
   * grace period. See requestAccountDeletion for what "deactivated" covers.
   *
   * Safety: the caller must pass `confirmEmail` matching the user's current
   * email exactly (case-insensitive). The UI also gates this behind a typed
   * confirmation modal.
   *
   * Every session row is removed, but the cookie on the client is not cleared
   * by this mutation — the caller signs out afterwards to drop it.
   */
  deleteAccount: protectedProcedure.input(deleteAccountSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true },
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

    try {
      const { scheduledFor } = await requestAccountDeletion(user.id, { client: ctx.prisma });
      return { success: true as const, scheduledFor };
    } catch (err) {
      console.error(`[user] failed to delete account for userId=${user.id}:`, err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: "We couldn't delete your account. Nothing was changed — please try again.",
      });
    }
  }),

  /**
   * Whether the signed-in account is scheduled for deletion, and when. Open to
   * pending accounts: it is what the restore screen reads.
   */
  deletionStatus: pendingDeletionProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, deletionScheduledFor: true },
    });
    return { email: user?.email ?? null, scheduledFor: user?.deletionScheduledFor ?? null };
  }),

  /**
   * Cancel a scheduled deletion. The queue stays paused and platforms stay
   * disconnected; the creator resumes and reconnects when ready.
   */
  restoreAccount: pendingDeletionProcedure.mutation(async ({ ctx }) => {
    const restored = await restoreAccount(ctx.userId, { client: ctx.prisma });
    return { restored };
  }),
});
