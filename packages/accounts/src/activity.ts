import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';

/**
 * Account activity: what keeps a free account's media from the inactivity
 * purge (see ./inactivity).
 *
 * Activity is a sign-in, any authenticated API call, an upload (always an API
 * call) or a successful publish. Only the day matters — the purge counts in
 * months — so `User.lastActiveAt` is written at most once a day per user. That
 * keeps an active user to one extra UPDATE a day, and lets an otherwise idle
 * database stay asleep.
 */

/** How stale `lastActiveAt` must be before activity is written again. */
const ACTIVITY_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether activity now would be written. Lets a caller that already has
 * `lastActiveAt` (the tRPC middleware, from the session user) skip the query
 * entirely on all but the first request of the day. Unknown counts as stale:
 * `recordActivity` is conditional, so the cost of guessing wrong is one UPDATE
 * that matches nothing.
 */
export function isActivityStale(
  lastActiveAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastActiveAt) return true;
  const at = new Date(lastActiveAt).getTime();
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= ACTIVITY_WRITE_INTERVAL_MS;
}

/**
 * Record activity for a user. One conditional UPDATE that only matches when
 * the stored `lastActiveAt` is a day or more old, so concurrent requests write
 * once between them. It also clears the inactivity warning stamps: a creator
 * who comes back resets the clock, and the next inactive stretch warns afresh.
 * Returns whether anything was written.
 */
export async function recordActivity(
  userId: string,
  options: { client?: PrismaClient; now?: Date } = {},
): Promise<boolean> {
  const prisma = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();

  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      lastActiveAt: { lte: new Date(now.getTime() - ACTIVITY_WRITE_INTERVAL_MS) },
    },
    data: {
      lastActiveAt: now,
      inactivityWarningSentAt: null,
      inactivityFinalWarningSentAt: null,
    },
  });
  return count > 0;
}
