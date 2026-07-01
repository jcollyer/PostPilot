import { updateCreatorProfileSchema } from '@postpilot/types';

import { protectedProcedure, router } from '../trpc';

/**
 * CreatorProfile — explicit creator-set context (niche, tone, audience,
 * banned words, an example caption, emoji preference) injected into every AI
 * metadata generation run. Distinct from the *inferred* voice signals in
 * ai-pipeline's style-examples step (platform bio + past posts): this is
 * what the creator told us directly, so the prompt treats it as the
 * highest-priority source.
 *
 * One row per user (upserted, never multiple), so there's no id-based CRUD —
 * just get/update the signed-in user's single profile.
 */
export const creatorProfileRouter = router({
  /**
   * The signed-in user's profile (null fields if never set) plus whether
   * they've been through the onboarding modal — used both by the settings
   * card and the first-run gate.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const [user, profile] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { creatorOnboardingCompletedAt: true },
      }),
      ctx.prisma.creatorProfile.findUnique({ where: { userId: ctx.userId } }),
    ]);
    return {
      onboardingCompleted: Boolean(user?.creatorOnboardingCompletedAt),
      profile,
    };
  }),

  /**
   * Full-replace upsert. Also marks onboarding complete (if not already) —
   * saving from either the settings card or the onboarding modal should
   * dismiss the first-run prompt for good.
   */
  update: protectedProcedure.input(updateCreatorProfileSchema).mutation(async ({ ctx, input }) => {
    const [profile] = await ctx.prisma.$transaction([
      ctx.prisma.creatorProfile.upsert({
        where: { userId: ctx.userId },
        create: { userId: ctx.userId, ...input },
        update: { ...input },
      }),
      ctx.prisma.user.updateMany({
        where: { id: ctx.userId, creatorOnboardingCompletedAt: null },
        data: { creatorOnboardingCompletedAt: new Date() },
      }),
    ]);
    return profile;
  }),

  /** Dismiss the onboarding modal without saving any profile data. */
  skipOnboarding: protectedProcedure.mutation(({ ctx }) =>
    ctx.prisma.user.update({
      where: { id: ctx.userId },
      data: { creatorOnboardingCompletedAt: new Date() },
      select: { id: true },
    }),
  ),
});
