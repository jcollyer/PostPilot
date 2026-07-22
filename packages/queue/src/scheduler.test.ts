import { describe, it, expect, beforeEach } from 'vitest';

import { recomputeSchedule } from './scheduler';

/**
 * A tiny in-memory stand-in for the slice of PrismaClient that
 * `recomputeSchedule` touches. Only the query shapes actually used by the
 * function are implemented — enough to exercise the real control flow (clear
 * the plan, reset items, re-materialize tasks) without a database.
 */
type Row = Record<string, any>;

function makePrisma(seed: {
  queue: Row;
  queueItems: Row[];
  schedules: Row[];
  connections: Row[];
  publishTasks: Row[];
}) {
  const db = {
    queue: [{ ...seed.queue }],
    queueItem: seed.queueItems.map((r) => ({ ...r })),
    schedule: seed.schedules.map((r) => ({ ...r })),
    platformConnection: seed.connections.map((r) => ({ ...r })),
    publishTask: seed.publishTasks.map((r) => ({ ...r })),
  };
  let taskSeq = db.publishTask.length;

  /** Does a task match a `{ status, queueItem: { queueId, status } }` filter? */
  const taskMatches = (t: Row, where: Row): boolean => {
    if (where.status) {
      const want = where.status.in ?? [where.status];
      if (!want.includes(t.status)) return false;
    }
    if (where.queueItem) {
      const item = db.queueItem.find((i) => i.id === t.queueItemId);
      if (!item) return false;
      if (where.queueItem.queueId && item.queueId !== where.queueItem.queueId) return false;
      if (where.queueItem.status) {
        const want = where.queueItem.status.in ?? [where.queueItem.status];
        if (!want.includes(item.status)) return false;
      }
    }
    return true;
  };

  return {
    _db: db,
    queue: {
      findUnique: async ({ where }: any) => db.queue.find((q) => q.id === where.id) ?? null,
    },
    publishTask: {
      deleteMany: async ({ where }: any) => {
        const before = db.publishTask.length;
        db.publishTask = db.publishTask.filter((t) => !taskMatches(t, where));
        return { count: before - db.publishTask.length };
      },
      create: async ({ data }: any) => {
        const row = { id: `task_${++taskSeq}`, ...data };
        db.publishTask.push(row);
        return row;
      },
    },
    queueItem: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const it of db.queueItem) {
          if (where.queueId && it.queueId !== where.queueId) continue;
          if (where.status && it.status !== where.status) continue;
          Object.assign(it, data);
          count++;
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const it = db.queueItem.find((i) => i.id === where.id)!;
        Object.assign(it, data);
        return it;
      },
      findMany: async ({ where, select }: any) => {
        let rows = db.queueItem.filter(
          (i) =>
            (!where.queueId || i.queueId === where.queueId) &&
            (!where.status || i.status === where.status),
        );
        rows = [...rows].sort((a, b) => a.position - b.position);
        // Only `select` shape used: { id, imageId, video: { select: { targetPlatforms } } }.
        if (select) {
          return rows.map((r) => ({
            id: r.id,
            imageId: r.imageId ?? null,
            video: r.video ?? null,
          }));
        }
        return rows;
      },
    },
    schedule: {
      findMany: async ({ where }: any) =>
        db.schedule.filter((s) => (!where.isActive || s.isActive) && s.queueId === where.queueId),
    },
    platformConnection: {
      findMany: async ({ where }: any) =>
        db.platformConnection
          .filter((c) => c.userId === where.userId && (!where.status || c.status === where.status))
          .map((c) => ({ id: c.id, platform: c.platform })),
    },
  } as any;
}

const baseSchedule = {
  id: 'sch_1',
  queueId: 'q1',
  isActive: true,
  timezone: 'UTC',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  times: ['09:00'],
  platforms: [] as string[], // "all connected"
};

describe('recomputeSchedule — stale FAILED task cleanup', () => {
  let seed: Parameters<typeof makePrisma>[0];

  beforeEach(() => {
    seed = {
      queue: { id: 'q1', userId: 'u1', status: 'ACTIVE' },
      queueItems: [
        {
          id: 'item1',
          queueId: 'q1',
          position: 1,
          // Item is still SCHEDULED (a sibling platform kept it non-terminal),
          // so recompute resets it to PENDING and re-materializes it.
          status: 'SCHEDULED',
          imageId: null,
          video: { targetPlatforms: [] }, // all connected
        },
      ],
      schedules: [baseSchedule],
      connections: [
        { id: 'c_tt', userId: 'u1', platform: 'TIKTOK', status: 'ACTIVE' },
        { id: 'c_yt', userId: 'u1', platform: 'YOUTUBE', status: 'ACTIVE' },
      ],
      publishTasks: [
        // The rejected TikTok publish from the prior cycle.
        { id: 'old_tt', queueItemId: 'item1', platform: 'TIKTOK', status: 'FAILED', connectionId: 'c_tt' },
        // The still-pending YouTube task that kept the item non-terminal.
        { id: 'old_yt', queueItemId: 'item1', platform: 'YOUTUBE', status: 'SCHEDULED', connectionId: 'c_yt' },
      ],
    };
  });

  it('does not leave two tasks for the same platform on one item', async () => {
    const prisma = makePrisma(seed);
    await recomputeSchedule(prisma, 'q1');

    const tasks = prisma._db.publishTask.filter((t: Row) => t.queueItemId === 'item1');
    const tiktok = tasks.filter((t: Row) => t.platform === 'TIKTOK');
    const youtube = tasks.filter((t: Row) => t.platform === 'YOUTUBE');

    expect(tiktok).toHaveLength(1);
    expect(youtube).toHaveLength(1);
    // The surviving TikTok task is the freshly-materialized one, not the FAILED
    // leftover.
    expect(tiktok[0]!.status).toBe('SCHEDULED');
    expect(tiktok[0]!.id).not.toBe('old_tt');
  });

  it('preserves FAILED history on COMPLETED items (does not re-materialize them)', async () => {
    seed.queueItems[0]!.status = 'COMPLETED';
    // A COMPLETED item where TikTok failed but YouTube published.
    seed.publishTasks = [
      { id: 'done_tt', queueItemId: 'item1', platform: 'TIKTOK', status: 'FAILED', connectionId: 'c_tt' },
      { id: 'done_yt', queueItemId: 'item1', platform: 'YOUTUBE', status: 'PUBLISHED', connectionId: 'c_yt' },
    ];
    const prisma = makePrisma(seed);
    await recomputeSchedule(prisma, 'q1');

    const tasks = prisma._db.publishTask.filter((t: Row) => t.queueItemId === 'item1');
    // Nothing added, nothing removed — the failure record stays put.
    expect(tasks.map((t: Row) => t.id).sort()).toEqual(['done_tt', 'done_yt']);
  });
});
