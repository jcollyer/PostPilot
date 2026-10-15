import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `dashboard.overview` is shared by web and mobile, so these pin the additive
 * `failures` summary: which tasks it counts and which one it names.
 */

vi.mock('@postpilot/queue', () => ({
  ensureQueue: async () => ({ id: 'queue_1', status: 'ACTIVE' }),
}));

vi.mock('@postpilot/notifications', () => ({
  computeQueueHealth: async () => ({
    remaining: 4,
    postsPerDay: 1,
    daysRemaining: 4,
    estimatedEmptyDate: null,
  }),
}));

vi.mock('@postpilot/connectors', () => ({
  getConnectionOverview: async () => [],
}));

const { dashboardRouter } = await import('./dashboard');
const { createCallerFactory } = await import('../trpc');

const count = vi.fn();
const findFirst = vi.fn();

const prisma = {
  publishTask: { count, findFirst },
  video: { count: async () => 0 },
};

function overview() {
  const caller = createCallerFactory(dashboardRouter)({
    session: { user: { id: 'user_1' } },
    headers: undefined,
    prisma: prisma as any,
  });
  return caller.overview();
}

/** The `findFirst` call that looks up failed tasks. */
function failedLookup() {
  return findFirst.mock.calls.map(([args]) => args).find((a) => a.where.status === 'FAILED');
}

const FAILED_AT = new Date('2026-10-13T09:00:00Z');

/** FAILED tasks on this user's queue, minus items the user skipped or canceled. */
const FAILED_ON_QUEUE = {
  queueItem: { queueId: 'queue_1', status: { notIn: ['SKIPPED', 'CANCELED'] } },
  status: 'FAILED',
};

beforeEach(() => {
  count.mockReset().mockResolvedValue(0);
  findFirst.mockReset().mockResolvedValue(null);
});

describe('dashboard.overview — failures', () => {
  it('counts only FAILED tasks on this user’s queue, with no time window, ignoring skipped items', async () => {
    count.mockResolvedValue(3);

    const result = await overview();

    expect(result.failures.count).toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: FAILED_ON_QUEUE,
    });
  });

  it('names the most recently failed task, titled from its video', async () => {
    count.mockResolvedValue(2);
    findFirst.mockImplementation(async (args) =>
      args.where.status === 'FAILED'
        ? {
            platform: 'TIKTOK',
            updatedAt: FAILED_AT,
            queueItem: { video: { title: 'Morning routine' }, image: null },
          }
        : null,
    );

    const result = await overview();

    expect(result.failures.latest).toEqual({
      title: 'Morning routine',
      platform: 'TIKTOK',
      failedAt: FAILED_AT,
    });
    expect(failedLookup()).toMatchObject({
      where: FAILED_ON_QUEUE,
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('titles the latest failure from its image when there is no video', async () => {
    count.mockResolvedValue(1);
    findFirst.mockImplementation(async (args) =>
      args.where.status === 'FAILED'
        ? {
            platform: 'INSTAGRAM',
            updatedAt: FAILED_AT,
            queueItem: { video: null, image: { title: 'Beach carousel' } },
          }
        : null,
    );

    const result = await overview();

    expect(result.failures.latest).toMatchObject({
      title: 'Beach carousel',
      platform: 'INSTAGRAM',
    });
  });

  it('has a null latest when nothing has failed', async () => {
    const result = await overview();

    expect(result.failures).toEqual({ count: 0, latest: null });
  });
});
