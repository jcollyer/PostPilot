import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The snapshot job is history, not truth, so its job is to be unremarkable:
 * write the same row whatever time it fires, page through every user, and never
 * let one bad account cost the whole night.
 */

const findMany = vi.fn();
const upsert = vi.fn();
const computeUsage = vi.fn();

vi.mock('@postpilot/db', () => ({
  prisma: {
    user: { findMany: (args: unknown) => findMany(args) },
    usageSnapshot: { upsert: (args: unknown) => upsert(args) },
  },
}));

vi.mock('./compute', () => ({ computeUsage: (id: string) => computeUsage(id) }));

const { snapshotAllUsers, utcDay } = await import('./snapshot');

const USAGE = {
  storageBytes: 1024,
  videoBytes: 1000,
  imageBytes: 24,
  videoCount: 3,
  videosWithSource: 2,
  videosProcessed: 3,
  imageCount: 1,
  bytesPerVideo: 500,
};

beforeEach(() => {
  // reset, not clear: a short final page breaks the paging loop early, so a
  // queued `...Once` value can go unconsumed and leak into the next test.
  // clearAllMocks wipes calls but leaves those queues intact.
  vi.resetAllMocks();
  findMany.mockResolvedValue([]);
  upsert.mockResolvedValue({});
  computeUsage.mockResolvedValue(USAGE);
});

describe('utcDay', () => {
  it('normalizes any time to UTC midnight', () => {
    expect(utcDay(new Date('2026-08-15T23:59:59.999Z')).toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
    expect(utcDay(new Date('2026-08-15T00:00:00.000Z')).toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
  });
});

describe('snapshotAllUsers', () => {
  it('upserts one row per user keyed on the day', async () => {
    findMany.mockResolvedValueOnce([{ id: 'u1' }]);

    const result = await snapshotAllUsers({ now: new Date('2026-08-15T03:40:00.000Z') });

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]?.[0] as any;
    expect(args.where).toEqual({
      userId_day: { userId: 'u1', day: new Date('2026-08-15T00:00:00.000Z') },
    });
    // Byte counts are BigInt columns.
    expect(args.create.storageBytes).toBe(BigInt(1024));
    expect(args.create.videoBytes).toBe(BigInt(1000));
    expect(args.update.videoCount).toBe(3);
    expect(result).toMatchObject({ users: 1, written: 1, failed: 0 });
  });

  it('keeps going when one user fails', async () => {
    findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
    computeUsage
      .mockResolvedValueOnce(USAGE)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(USAGE);

    const result = await snapshotAllUsers();

    expect(result).toMatchObject({ users: 3, written: 2, failed: 1 });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('pages through users with a cursor until exhausted', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}` }));
    findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: 'last' }]);

    const result = await snapshotAllUsers();

    // Second page must resume after the last id of the first, not restart.
    const second = findMany.mock.calls[1]?.[0] as any;
    expect(second.cursor).toEqual({ id: 'u99' });
    expect(second.skip).toBe(1);
    expect(result.users).toBe(101);
  });

  it('stops without a second query when the first page is short', async () => {
    findMany.mockResolvedValueOnce([{ id: 'u1' }]);

    await snapshotAllUsers();

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when there are no users', async () => {
    const result = await snapshotAllUsers();

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ users: 0, written: 0, failed: 0 });
  });
});
