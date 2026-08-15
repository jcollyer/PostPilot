import { z } from 'zod';

import { computeUsage, withPlan } from '@postpilot/usage';
import { PLAN_IDS, PLAN_LIMITS } from '@postpilot/types';

import { protectedProcedure, router } from '../trpc';

/**
 * What the signed-in user is currently storing and how much AI work their
 * library has consumed.
 *
 * Measured live rather than read from a counter, so it can be trusted at the
 * moment a cap is checked. History lives in UsageSnapshot, written nightly.
 */
export const usageRouter = router({
  /**
   * Live usage, optionally compared against a plan's caps.
   *
   * `plan` is a parameter because no plan is stored on the user yet — there is
   * no `plan` column and no payment processor wired. Callers that want the
   * ratios pass the plan to compare against; once plans are persisted this
   * reads from the user instead and the argument goes away.
   */
  get: protectedProcedure
    .input(z.object({ plan: z.enum(PLAN_IDS).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const usage = await computeUsage(ctx.userId, ctx.prisma);
      return input?.plan ? withPlan(usage, input.plan) : usage;
    }),

  /** The published plan capacities, so clients don't restate them. */
  plans: protectedProcedure.query(() => PLAN_LIMITS),

  /**
   * This user's recent daily snapshots, oldest first — the series behind
   * "is my storage trending toward the cap".
   */
  history: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const rows = await ctx.prisma.usageSnapshot.findMany({
        where: { userId: ctx.userId },
        orderBy: { day: 'desc' },
        take: days,
        select: {
          day: true,
          storageBytes: true,
          videoBytes: true,
          videoCount: true,
          videosWithSource: true,
          videosProcessed: true,
          imageCount: true,
        },
      });

      // BigInt doesn't survive JSON serialization; the byte counts are far
      // inside Number's safe range (9 PB), so widening is lossless here.
      return rows
        .map((r) => ({
          ...r,
          storageBytes: Number(r.storageBytes),
          videoBytes: Number(r.videoBytes),
        }))
        .reverse();
    }),
});
