import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  createCheckoutSession,
  createPortalSession,
  isBillingConfigured,
  originFromHeaders,
  type PaidPlanId,
} from '@postpilot/billing';
import { PLAN_LIMITS } from '@postpilot/types';
import { computeUsage, withPlan } from '@postpilot/usage';

import { protectedProcedure, router } from '../trpc';

/**
 * Plan selection and subscription management.
 *
 * None of these mutations change `plan` — that only ever moves through the
 * Stripe webhook. `startCheckout` and `openPortal` hand back a Stripe URL and
 * nothing more, so a user who abandons the flow is left exactly as they were.
 * The one exception is `chooseFree`, which involves no money and so has nothing
 * to confirm asynchronously.
 */

// Typed as PaidPlanId rather than plain strings, so adding a plan to PlanId
// without handling it here is a compile error instead of a runtime surprise.
const PAID_PLANS: [PaidPlanId, ...PaidPlanId[]] = ['CREATOR', 'PRO'];
const paidPlanSchema = z.enum(PAID_PLANS);
const periodSchema = z.enum(['monthly', 'annual']);

function assertConfigured() {
  if (!isBillingConfigured()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Billing is not set up yet. Add your Stripe keys to enable paid plans.',
    });
  }
}

export const billingRouter = router({
  /**
   * Current plan, subscription state, and usage measured against the plan's
   * caps. Drives both the billing card and the plan-selection gate.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        plan: true,
        planSelectedAt: true,
        stripeSubscriptionStatus: true,
        stripePriceId: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

    const usage = withPlan(await computeUsage(ctx.userId, ctx.prisma), user.plan);

    return {
      ...user,
      limits: PLAN_LIMITS[user.plan],
      usage,
      /** The selection gate shows until a plan has been chosen. */
      needsPlanSelection: user.planSelectedAt == null,
      /** Whether paid plans can be bought at all in this deployment. */
      billingConfigured: isBillingConfigured(),
    };
  }),

  /**
   * Record a choice of the free plan. Safe to write directly: there is nothing
   * to charge and so nothing for a webhook to confirm later.
   */
  chooseFree: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.userId },
      // Only the selection marker moves. An existing paid subscription is left
      // alone — downgrades belong in the Customer Portal, where Stripe can
      // prorate and schedule them properly.
      data: { planSelectedAt: new Date() },
    });
    return { success: true as const };
  }),

  /** A Stripe Checkout URL for a paid plan. */
  startCheckout: protectedProcedure
    .input(z.object({ plan: paidPlanSchema, period: periodSchema }))
    .mutation(async ({ ctx, input }) => {
      assertConfigured();
      const url = await createCheckoutSession({
        userId: ctx.userId,
        plan: input.plan,
        period: input.period,
        // Return them to the origin they're on, so their session survives.
        requestOrigin: originFromHeaders(ctx.headers),
        client: ctx.prisma,
      });
      return { url };
    }),

  /** A Customer Portal URL for changing, pausing or cancelling a plan. */
  openPortal: protectedProcedure.mutation(async ({ ctx }) => {
    assertConfigured();
    const url = await createPortalSession({
      userId: ctx.userId,
      requestOrigin: originFromHeaders(ctx.headers),
      client: ctx.prisma,
    });
    return { url };
  }),
});
