import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';
import {
  ASSUMED_BYTES_PER_VIDEO,
  formatBytes,
  PLAN_LIMITS,
  type PlanId,
  type PlanLimits,
} from '@postpilot/types';

/**
 * What a user is currently costing, measured rather than assumed.
 *
 * Two numbers drive the whole cost model: bytes stored (billed every month, for
 * as long as a file is held) and videos processed (billed once each, at upload).
 * Everything here exists to make those observable before there is an invoice to
 * argue with.
 *
 * Always computed live from Video/Image rather than read from a counter. At the
 * scale this product targets — hundreds to low thousands of rows per user, all
 * behind a `userId` index — the aggregate is cheap, and it cannot drift out of
 * sync the way an incrementing counter silently does after a failed delete or a
 * cascade. UsageSnapshot stores the history; this is the truth.
 */

export interface Usage {
  /** Billable bytes: video sources still stored, plus image sources. */
  storageBytes: number;
  /** The video-source portion of storageBytes. */
  videoBytes: number;
  /** The image portion of storageBytes. */
  imageBytes: number;
  /** Every video in the library, including any whose source was removed. */
  videoCount: number;
  /** Videos whose source file is still stored. */
  videosWithSource: number;
  /** Videos the AI pipeline has completed — cumulative one-off AI spend. */
  videosProcessed: number;
  imageCount: number;
  /**
   * Mean stored bytes per video with a source, or null when the user has none.
   * This is the figure the pricing model assumed at ASSUMED_BYTES_PER_VIDEO.
   */
  bytesPerVideo: number | null;
}

/** BigInt sums come back as bigint | null; normalize to a plain number. */
function toNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * Live usage for one user.
 *
 * Videos with `sourceDeletedAt` set are excluded from byte totals — the
 * retention sweep removed those files, so counting them would hide exactly the
 * saving retention exists to produce. They stay in `videoCount` because the
 * library entry is still there.
 *
 * Derived objects (thumbnail candidates, covers) are not counted: no size is
 * recorded for them, and at five JPEGs per video they sit well under 1% of a
 * source file. Treat the result as source bytes, which is what dominates
 * the bill.
 */
export async function computeUsage(userId: string, client?: PrismaClient): Promise<Usage> {
  const prisma = client ?? defaultPrisma;

  const [videoBytesAgg, videoCount, videosWithSource, videosProcessed, imageAgg] =
    await Promise.all([
      prisma.video.aggregate({
        where: { userId, sourceDeletedAt: null },
        _sum: { fileSize: true },
      }),
      prisma.video.count({ where: { userId } }),
      prisma.video.count({ where: { userId, sourceDeletedAt: null } }),
      prisma.video.count({ where: { userId, aiStatus: 'COMPLETED' } }),
      prisma.image.aggregate({ where: { userId }, _sum: { fileSize: true }, _count: true }),
    ]);

  const videoBytes = toNumber(videoBytesAgg._sum.fileSize);
  const imageBytes = toNumber(imageAgg._sum.fileSize);
  const imageCount = imageAgg._count;

  return {
    storageBytes: videoBytes + imageBytes,
    videoBytes,
    imageBytes,
    videoCount,
    videosWithSource,
    videosProcessed,
    imageCount,
    // Guarded: a library of only source-deleted videos divides by zero.
    bytesPerVideo: videosWithSource > 0 ? Math.round(videoBytes / videosWithSource) : null,
  };
}

export interface PlanUsage extends Usage {
  plan: PlanId;
  /** Fraction of the plan's byte cap used; can exceed 1 when over. */
  storageRatio: number;
  /** Fraction of the plan's video cap used; can exceed 1 when over. */
  videoRatio: number;
  overStorage: boolean;
  overVideos: boolean;
  /** True when either cap is exceeded — what enforcement would gate on. */
  overLimit: boolean;
}

/**
 * Usage measured against a plan's caps.
 *
 * Nothing enforces these yet: there is no `plan` column on User and no payment
 * processor, so callers pass the plan they want to compare against. Once a plan
 * lives on the user this reads it from there instead, and the ratios below
 * become the gate.
 */
export function withPlan(usage: Usage, plan: PlanId): PlanUsage {
  const limits = PLAN_LIMITS[plan];
  const storageRatio = usage.storageBytes / limits.storageBytes;
  const videoRatio = usage.videoCount / limits.videos;
  const overStorage = usage.storageBytes > limits.storageBytes;
  const overVideos = usage.videoCount > limits.videos;

  return {
    ...usage,
    plan,
    storageRatio,
    videoRatio,
    overStorage,
    overVideos,
    overLimit: overStorage || overVideos,
  };
}

export interface CapCheck {
  ok: boolean;
  /** Which cap would be broken, when one would. */
  reason: 'storage' | 'videos' | null;
  /** User-facing explanation, ready to show. Null when the upload is allowed. */
  message: string | null;
  plan: PlanId;
  limits: PlanLimits;
}

/**
 * Whether one more upload fits inside the plan.
 *
 * Checked *before* any bytes move — `initUpload` receives the file size up
 * front, so a rejection costs the user nothing but a message. Being over a cap
 * only ever blocks new uploads: nothing already stored is deleted, and the
 * queue keeps publishing, so a lapsed subscription never costs someone their
 * library.
 *
 * The incoming file is included in the comparison rather than checked after the
 * fact, so a single huge upload can't step over a cap it started underneath.
 */
export function checkUploadAllowed(
  usage: Usage,
  plan: PlanId,
  incoming: { bytes: number; addsVideo: boolean },
): CapCheck {
  const limits = PLAN_LIMITS[plan];
  const base = { plan, limits };

  if (incoming.addsVideo && usage.videoCount + 1 > limits.videos) {
    return {
      ...base,
      ok: false,
      reason: 'videos',
      message:
        `Your ${limits.name} plan holds ${limits.videos.toLocaleString()} videos and you have ` +
        `${usage.videoCount.toLocaleString()}. Upgrade, or remove some videos to make room.`,
    };
  }

  if (usage.storageBytes + incoming.bytes > limits.storageBytes) {
    return {
      ...base,
      ok: false,
      reason: 'storage',
      message:
        `That upload would put you over the ${formatBytes(limits.storageBytes)} of storage on ` +
        `your ${limits.name} plan — you're using ${formatBytes(usage.storageBytes)}. Upgrade, or ` +
        'free up space by removing published source files.',
    };
  }

  return { ...base, ok: true, reason: null, message: null };
}

/**
 * How far this user's real videos diverge from the size the plans were sized
 * against, as a ratio (1 = exactly the assumption, 2 = twice as heavy). Null
 * when they have no stored videos to measure.
 *
 * If this runs consistently above 1 across users, the byte caps bind long
 * before the video caps and the plan capacities need re-cutting.
 */
export function assumptionDrift(usage: Usage): number | null {
  if (usage.bytesPerVideo == null) return null;
  return usage.bytesPerVideo / ASSUMED_BYTES_PER_VIDEO;
}
