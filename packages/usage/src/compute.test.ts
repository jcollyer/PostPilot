import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * These numbers decide what a user gets charged and when a cap bites, so the
 * cases that matter are the ones that silently produce a wrong total: a video
 * whose source retention already deleted (must not be billed), a row with no
 * recorded size, and an empty library (must not divide by zero).
 */

const videoAggregate = vi.fn();
const videoCount = vi.fn();
const imageAggregate = vi.fn();

vi.mock('@postpilot/db', () => ({
  prisma: {
    video: {
      aggregate: (args: unknown) => videoAggregate(args),
      count: (args: unknown) => videoCount(args),
    },
    image: { aggregate: (args: unknown) => imageAggregate(args) },
  },
}));

const { computeUsage, withPlan, assumptionDrift } = await import('./compute');
const { PLAN_LIMITS, ASSUMED_BYTES_PER_VIDEO } = await import('@postpilot/types');

const MB = 1024 ** 2;
const GB = 1024 ** 3;

beforeEach(() => {
  vi.clearAllMocks();
  videoAggregate.mockResolvedValue({ _sum: { fileSize: null } });
  imageAggregate.mockResolvedValue({ _sum: { fileSize: null }, _count: 0 });
  videoCount.mockResolvedValue(0);
});

/** The `where` passed to each video.count call, in call order. */
function countWheres(): any[] {
  return videoCount.mock.calls.map((c: any[]) => c[0]?.where);
}

describe('computeUsage', () => {
  it('sums video and image bytes into one billable total', async () => {
    videoAggregate.mockResolvedValue({ _sum: { fileSize: BigInt(10 * GB) } });
    imageAggregate.mockResolvedValue({ _sum: { fileSize: BigInt(2 * GB) }, _count: 40 });
    videoCount.mockResolvedValue(100);

    const usage = await computeUsage('u1');

    expect(usage.videoBytes).toBe(10 * GB);
    expect(usage.imageBytes).toBe(2 * GB);
    expect(usage.storageBytes).toBe(12 * GB);
    expect(usage.imageCount).toBe(40);
  });

  it('excludes videos whose source retention removed', async () => {
    await computeUsage('u1');

    // The byte sum must be scoped to sources still present, otherwise the
    // retention feature would show no saving at all.
    expect(videoAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', sourceDeletedAt: null } }),
    );
  });

  it('counts every video but only sources still stored', async () => {
    const wheres = (await computeUsage('u1'), countWheres());

    // Total library, sources present, AI-completed — in that order.
    expect(wheres[0]).toEqual({ userId: 'u1' });
    expect(wheres[1]).toEqual({ userId: 'u1', sourceDeletedAt: null });
    expect(wheres[2]).toEqual({ userId: 'u1', aiStatus: 'COMPLETED' });
  });

  it('treats a missing fileSize as zero rather than NaN', async () => {
    videoAggregate.mockResolvedValue({ _sum: { fileSize: null } });
    imageAggregate.mockResolvedValue({ _sum: { fileSize: null }, _count: 0 });
    videoCount.mockResolvedValue(3);

    const usage = await computeUsage('u1');

    expect(usage.storageBytes).toBe(0);
    expect(usage.videoBytes).toBe(0);
  });

  it('averages bytes per video over sources still stored', async () => {
    videoAggregate.mockResolvedValue({ _sum: { fileSize: BigInt(1000 * MB) } });
    // 20 videos in the library, but only 10 still hold a source.
    videoCount.mockResolvedValueOnce(20).mockResolvedValueOnce(10).mockResolvedValueOnce(20);

    const usage = await computeUsage('u1');

    // 1000 MB over the 10 with sources, not the 20 in the library.
    expect(usage.bytesPerVideo).toBe(100 * MB);
  });

  it('returns a null average for an empty library instead of dividing by zero', async () => {
    const usage = await computeUsage('u1');

    expect(usage.videosWithSource).toBe(0);
    expect(usage.bytesPerVideo).toBeNull();
    expect(Number.isNaN(usage.bytesPerVideo as unknown as number)).toBe(false);
  });
});

describe('withPlan', () => {
  const base = {
    storageBytes: 0,
    videoBytes: 0,
    imageBytes: 0,
    videoCount: 0,
    videosWithSource: 0,
    videosProcessed: 0,
    imageCount: 0,
    bytesPerVideo: null,
  };

  it('reports headroom when under both caps', () => {
    const r = withPlan({ ...base, storageBytes: 30 * GB, videoCount: 150 }, 'CREATOR');

    expect(r.overLimit).toBe(false);
    expect(r.storageRatio).toBeCloseTo(0.5, 5);
    expect(r.videoRatio).toBeCloseTo(0.5, 5);
  });

  it('flags the byte cap independently of the video cap', () => {
    // Heavy 4K files: well under the video count, well over the bytes.
    const r = withPlan({ ...base, storageBytes: 80 * GB, videoCount: 100 }, 'CREATOR');

    expect(r.overStorage).toBe(true);
    expect(r.overVideos).toBe(false);
    expect(r.overLimit).toBe(true);
  });

  it('flags the video cap independently of the byte cap', () => {
    // Many tiny clips: barely any storage, far too many videos.
    const r = withPlan({ ...base, storageBytes: 1 * GB, videoCount: 400 }, 'CREATOR');

    expect(r.overVideos).toBe(true);
    expect(r.overStorage).toBe(false);
    expect(r.overLimit).toBe(true);
  });

  it('treats exactly at the cap as within it', () => {
    const limits = PLAN_LIMITS.PRO;
    const r = withPlan(
      { ...base, storageBytes: limits.storageBytes, videoCount: limits.videos },
      'PRO',
    );

    expect(r.overLimit).toBe(false);
  });
});

describe('assumptionDrift', () => {
  it('returns 1 when videos match the size the plans assumed', () => {
    expect(assumptionDrift({ bytesPerVideo: ASSUMED_BYTES_PER_VIDEO } as never)).toBeCloseTo(1, 5);
  });

  it('returns above 1 when real videos are heavier than assumed', () => {
    const drift = assumptionDrift({ bytesPerVideo: ASSUMED_BYTES_PER_VIDEO * 2 } as never);
    expect(drift).toBeCloseTo(2, 5);
  });

  it('returns null when there is nothing to measure', () => {
    expect(assumptionDrift({ bytesPerVideo: null } as never)).toBeNull();
  });
});
