/**
 * Plan capacity limits — the single source of truth for the pricing page, usage
 * metering, and (later) cap enforcement.
 *
 * Plans are separated by capacity, not features: every plan runs the full AI
 * pipeline on every upload. That mirrors the cost shape. AI is charged once per
 * video at upload (~$0.011 measured), while storage recurs every month for as
 * long as a file is held — so past a few months storage is the larger bill, and
 * a cap on videos + bytes is the one lever that bounds both.
 *
 * Two caps per plan because file sizes vary far too much for one to cover both:
 * the byte cap stops a drone creator shooting 4K, the video cap stops someone
 * uploading five thousand tiny clips. Whichever is reached first binds.
 *
 * NOTE: nothing enforces these yet. There is no `plan` column on User and no
 * payment processor wired, so today they are the published pricing plus the
 * yardstick that metering reports against.
 */

const GB = 1024 ** 3;

/** Plan identifiers, matching the tiers published on /pricing. */
export const PLAN_IDS = ['FREE', 'CREATOR', 'PRO'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  /** Display name as shown on /pricing. */
  name: string;
  /** Monthly price in whole dollars. */
  monthly: number;
  /** Annual price in whole dollars — ten months, so two are free. */
  annual: number;
  /** Max videos in the library. */
  videos: number;
  /** Max stored bytes across video sources and images. */
  storageBytes: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: { name: 'Free', monthly: 0, annual: 0, videos: 25, storageBytes: 5 * GB },
  CREATOR: { name: 'Creator', monthly: 5, annual: 50, videos: 300, storageBytes: 60 * GB },
  PRO: { name: 'Pro', monthly: 12, annual: 120, videos: 1200, storageBytes: 220 * GB },
};

/**
 * Average source bytes per video assumed when the plans were sized (a measured
 * 200 GB across 1,100 videos). Storage and video caps are only consistent with
 * each other while this holds, which is exactly what the usage snapshots are
 * there to check — see UsageSnapshot.videoBytes / videosWithSource.
 */
export const ASSUMED_BYTES_PER_VIDEO = 182 * 1024 * 1024;

/** Bytes rendered the way the rest of the app renders them (binary units). */
export function formatBytes(bytes: number | bigint): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n <= 0) return '0 GB';
  if (n >= GB) {
    const gb = n / GB;
    // A round number reads better than "5.0 GB" on a pricing card; keep one
    // decimal only where it carries information.
    return `${gb.toFixed(gb >= 10 || Number.isInteger(gb) ? 0 : 1)} GB`;
  }
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
