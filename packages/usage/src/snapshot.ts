import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';

import { computeUsage } from './compute';

/**
 * Nightly usage history.
 *
 * One row per user per day. This is deliberately not the source of truth —
 * live usage is always recomputed (see computeUsage) — so a missed or partial
 * night leaves a gap in the history and nothing worse.
 *
 * It answers the questions a point-in-time number can't: whether a user is
 * trending toward their caps, and whether the ~182 MB/video figure the pricing
 * model was built on survives contact with real creators.
 */

/** How many users to measure per batch. Keeps the aggregate queries bounded. */
const USER_BATCH = 100;

export interface SnapshotResult {
  /** Users measured. */
  users: number;
  /** Snapshot rows written or updated. */
  written: number;
  /** Users whose snapshot threw; the gap is left for tomorrow. */
  failed: number;
  /** The UTC day the snapshots describe. */
  day: Date;
}

/**
 * Midnight UTC of the given instant. Snapshots are keyed by date, so every run
 * on a given day upserts the same row regardless of what time it fires.
 */
export function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export interface SnapshotOptions {
  client?: PrismaClient;
  /** Overridable for tests; defaults to now. */
  now?: Date;
}

/**
 * Measure every user and record today's snapshot.
 *
 * Paged by user id so the working set stays flat no matter how many accounts
 * exist. A single user's failure is logged and skipped rather than aborting the
 * run — one bad row shouldn't cost the whole night's history.
 */
export async function snapshotAllUsers(options: SnapshotOptions = {}): Promise<SnapshotResult> {
  const prisma = options.client ?? defaultPrisma;
  const day = utcDay(options.now ?? new Date());

  let users = 0;
  let written = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.user.findMany({
      take: USER_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (batch.length === 0) break;

    for (const user of batch) {
      users++;
      try {
        const usage = await computeUsage(user.id, prisma);
        const row = {
          storageBytes: BigInt(usage.storageBytes),
          videoBytes: BigInt(usage.videoBytes),
          videoCount: usage.videoCount,
          videosWithSource: usage.videosWithSource,
          videosProcessed: usage.videosProcessed,
          imageCount: usage.imageCount,
        };
        await prisma.usageSnapshot.upsert({
          where: { userId_day: { userId: user.id, day } },
          create: { userId: user.id, day, ...row },
          update: row,
        });
        written++;
      } catch (err) {
        failed++;
        console.warn(
          `[usage] snapshot failed for user ${user.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    cursor = batch[batch.length - 1]?.id;
    if (batch.length < USER_BATCH) break;
  }

  console.log(
    `[usage] snapshot ${day.toISOString().slice(0, 10)}: ${written} written, ${failed} failed, ${users} user(s)`,
  );

  return { users, written, failed, day };
}
