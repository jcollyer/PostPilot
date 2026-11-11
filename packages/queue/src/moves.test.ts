import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Nothing in these tests is due within the arming window, but never reach out.
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }));

import { moveItem, moveToSlot } from './moves';
import { getUpcoming, recomputeSchedule } from './scheduler';

/**
 * An in-memory stand-in for the slice of PrismaClient that a move touches:
 * reading the queue, writing the new position, and the `recomputeSchedule` it
 * runs — plus `getUpcoming`, through which the tests read the plan back. Like
 * the scheduler tests' fake, only the query shapes actually used exist.
 */
type Row = Record<string, any>;

function makePrisma(seed: {
  queue: Row;
  queueItems: Row[];
  schedules: Row[];
  connections: Row[];
  publishTasks?: Row[];
}) {
  const db = {
    queue: [{ userId: 'u1', ...seed.queue } as Row],
    queueItem: seed.queueItems.map((r) => ({ ...r })),
    schedule: seed.schedules.map((r) => ({ ...r })),
    platformConnection: seed.connections.map((r) => ({ ...r })),
    publishTask: (seed.publishTasks ?? []).map((r) => ({ ...r })),
  };
  let taskSeq = db.publishTask.length;

  const statusMatches = (value: string, want: any) =>
    want == null || (want.in ?? [want]).includes(value);

  const taskMatches = (t: Row, where: Row): boolean => {
    if (where.OR && !where.OR.some((w: Row) => taskMatches(t, w))) return false;
    if (!statusMatches(t.status, where.status)) return false;
    const s = where.scheduledAt;
    if (s?.lte && !(t.scheduledAt && t.scheduledAt <= s.lte)) return false;
    if (s?.gte && !(t.scheduledAt && t.scheduledAt >= s.gte)) return false;
    if (where.queueItem) {
      const item = db.queueItem.find((i) => i.id === t.queueItemId);
      if (!item) return false;
      if (where.queueItem.queueId && item.queueId !== where.queueItem.queueId) return false;
      if (!statusMatches(item.status, where.queueItem.status)) return false;
      if (where.queueItem.id?.notIn?.includes(item.id)) return false;
    }
    return true;
  };

  const itemMatches = (i: Row, where: Row): boolean => {
    if (where.queueId && i.queueId !== where.queueId) return false;
    if (!statusMatches(i.status, where.status)) return false;
    if (where.id?.notIn?.includes(i.id)) return false;
    if (where.id?.in && !where.id.in.includes(i.id)) return false;
    return true;
  };

  /** A row with only the selected fields; `publishTasks` joined. */
  const projectItem = (r: Row, select: Row | undefined): Row => {
    const tasks = db.publishTask.filter((t) => t.queueItemId === r.id);
    if (!select) return { ...r };
    const out: Row = {};
    for (const key of Object.keys(select)) {
      if (key === 'publishTasks') {
        const fields = select.publishTasks.select;
        out.publishTasks = tasks.map((t) =>
          fields ? Object.fromEntries(Object.keys(fields).map((k) => [k, t[k]])) : { ...t },
        );
      } else {
        out[key] = r[key] ?? null;
      }
    }
    return out;
  };

  return {
    _db: db,
    queue: {
      findUnique: async ({ where }: any) => db.queue.find((q) => q.id === where.id) ?? null,
    },
    queueItem: {
      findMany: async ({ where, select }: any) =>
        db.queueItem
          .filter((i) => itemMatches(i, where))
          .sort((a, b) => a.position - b.position)
          .map((r) => projectItem(r, select)),
      update: async ({ where, data }: any) => {
        const it = db.queueItem.find((i) => i.id === where.id)!;
        Object.assign(it, data);
        return it;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.queueItem.filter((i) => itemMatches(i, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    publishTask: {
      findMany: async ({ where, distinct, orderBy, take }: any) => {
        let rows = db.publishTask.filter((t) => taskMatches(t, where));
        if (distinct) {
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            const key = distinct.map((k: string) => r[k]).join(' ');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        if (orderBy?.scheduledAt) {
          rows = [...rows].sort((a, b) => a.scheduledAt - b.scheduledAt);
        }
        if (take) rows = rows.slice(0, take);
        return rows.map((t) => ({
          ...t,
          queueItem: db.queueItem.find((i) => i.id === t.queueItemId),
        }));
      },
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
    schedule: {
      findMany: async ({ where }: any) =>
        db.schedule.filter((s) => s.queueId === where.queueId && (!where.isActive || s.isActive)),
    },
    platformConnection: {
      findMany: async ({ where }: any) =>
        db.platformConnection
          .filter((c) => c.userId === where.userId && (!where.status || c.status === where.status))
          .map((c) => ({ id: c.id, platform: c.platform })),
    },
  } as any;
}

const at = (iso: string) => new Date(iso);
// A Tuesday, after the day's 09:00 slot.
const NOW = at('2026-11-10T12:00:00Z');

/** A video in rotation; `targetPlatforms: []` means "all connected". */
const item = (id: string, position: number, extra: Row = {}) => ({
  id,
  queueId: 'q1',
  position,
  status: 'PENDING',
  videoId: `v_${id}`,
  imageId: null,
  video: { title: id, targetPlatforms: [] },
  ...extra,
});

const schedule = (extra: Row = {}) => ({
  id: 'sch_daily',
  queueId: 'q1',
  isActive: true,
  timezone: 'UTC',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  times: ['09:00'],
  platforms: [],
  ...extra,
});

const connections = (...platforms: string[]) =>
  platforms.map((platform) => ({ id: `c_${platform}`, userId: 'u1', platform, status: 'ACTIVE' }));

/** Five videos, one a day on TikTok from the 11th: a, b, c, d, e. */
async function dailyQueue(ids = ['a', 'b', 'c', 'd', 'e']) {
  const prisma = makePrisma({
    queue: { id: 'q1', status: 'ACTIVE' },
    queueItems: ids.map((id, n) => item(id, (n + 1) * 1000)),
    schedules: [schedule()],
    connections: connections('TIKTOK'),
  });
  await recomputeSchedule(prisma, 'q1');
  return prisma;
}

/** The live plan as `[day, itemId, platform]`, soonest first. */
async function plan(prisma: any) {
  return (await getUpcoming(prisma, 'q1', { limit: 200 })).map((p) => [
    p.scheduledAt.toISOString().slice(0, 16),
    p.queueItemId,
    p.platform,
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('moveToSlot', () => {
  it('moving earlier takes the slot and shifts its holder, and everything after, one along', async () => {
    const prisma = await dailyQueue();

    // d (the 14th) onto b's slot on the 12th.
    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'd',
      slotAt: at('2026-11-12T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect(await plan(prisma)).toEqual([
      ['2026-11-11T09:00', 'a', 'TIKTOK'],
      ['2026-11-12T09:00', 'd', 'TIKTOK'],
      ['2026-11-13T09:00', 'b', 'TIKTOK'],
      ['2026-11-14T09:00', 'c', 'TIKTOK'],
      ['2026-11-15T09:00', 'e', 'TIKTOK'],
    ]);
    expect(res).toEqual({
      previousAfterItemId: 'c',
      landedAt: at('2026-11-12T09:00:00Z'),
      projected: false,
      shifted: 2,
      shiftedItemIds: ['b', 'c'],
      movedToEnd: false,
    });
  });

  it('moving later takes the slot and the holder, and everything before it, moves one along', async () => {
    const prisma = await dailyQueue();

    // b (the 12th) onto d's slot on the 14th.
    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'b',
      slotAt: at('2026-11-14T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect(await plan(prisma)).toEqual([
      ['2026-11-11T09:00', 'a', 'TIKTOK'],
      ['2026-11-12T09:00', 'c', 'TIKTOK'],
      ['2026-11-13T09:00', 'd', 'TIKTOK'],
      ['2026-11-14T09:00', 'b', 'TIKTOK'],
      ['2026-11-15T09:00', 'e', 'TIKTOK'],
    ]);
    expect(res).toEqual({
      previousAfterItemId: 'a',
      landedAt: at('2026-11-14T09:00:00Z'),
      projected: false,
      shifted: 2,
      shiftedItemIds: ['c', 'd'],
      movedToEnd: false,
    });
  });

  it('moves a held post, which waits on a reconnect, like any other', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        item('a', 1000),
        // Bound for Instagram, which isn't connected: its post is held.
        item('b', 2000, { video: { title: 'b', targetPlatforms: ['INSTAGRAM'] } }),
        item('c', 3000),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK'),
    });
    await recomputeSchedule(prisma, 'q1');

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'b',
      slotAt: at('2026-11-11T09:00:00Z'),
      platforms: ['INSTAGRAM'],
    });

    expect(
      (await getUpcoming(prisma, 'q1')).map((p) => [p.queueItemId, p.platform, p.status]),
    ).toEqual([
      ['b', 'INSTAGRAM', 'HELD'],
      ['a', 'TIKTOK', 'SCHEDULED'],
      ['c', 'TIKTOK', 'SCHEDULED'],
    ]);
    expect(res).toMatchObject({ landedAt: at('2026-11-11T09:00:00Z'), shiftedItemIds: ['a'] });
  });

  it('undoes with moveItem and the anchor it returned', async () => {
    const prisma = await dailyQueue();
    const original = await plan(prisma);

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'd',
      slotAt: at('2026-11-11T09:00:00Z'),
      platforms: ['TIKTOK'],
    });
    expect(res.previousAfterItemId).toBe('c');
    await moveItem(prisma, 'q1', { itemId: 'd', afterItemId: res.previousAfterItemId });

    expect(await plan(prisma)).toEqual(original);
  });

  it('undoes a move of the first item back to the front', async () => {
    const prisma = await dailyQueue();
    const original = await plan(prisma);

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'a',
      slotAt: at('2026-11-13T09:00:00Z'),
      platforms: ['TIKTOK'],
    });
    expect(res.previousAfterItemId).toBeNull();
    await moveItem(prisma, 'q1', { itemId: 'a', afterItemId: null });

    expect(await plan(prisma)).toEqual(original);
  });

  it('sends the item to the end of the queue from a slot past it, and says where it landed', async () => {
    const prisma = await dailyQueue();

    // The queue runs out on the 15th; the 20th has no holder.
    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'b',
      slotAt: at('2026-11-20T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect((await plan(prisma)).map(([, id]) => id)).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(res).toEqual({
      previousAfterItemId: 'a',
      landedAt: at('2026-11-15T09:00:00Z'),
      projected: false,
      shifted: 3,
      shiftedItemIds: ['c', 'd', 'e'],
      movedToEnd: true,
    });
  });

  it('moves onto a projected slot past the live plan the same way', async () => {
    // 30 videos, one a day from the 11th: the live plan ends on Dec 1 (21
    // days), and i25 is projected for Dec 5.
    const prisma = await dailyQueue(Array.from({ length: 30 }, (_, n) => `i${n + 1}`));

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'i3',
      slotAt: at('2026-12-05T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect(res.landedAt).toEqual(at('2026-12-05T09:00:00Z'));
    expect(res.projected).toBe(true);
    // i4 .. i25 each move a day earlier.
    expect(res.shifted).toBe(22);
    expect(res.shiftedItemIds[0]).toBe('i4');
    expect(res.shiftedItemIds.at(-1)).toBe('i25');
    // i3 has left the live plan; i4 takes its slot on the 13th.
    const live = await plan(prisma);
    expect(live.find(([, id]) => id === 'i3')).toBeUndefined();
    expect(live[2]).toEqual(['2026-11-13T09:00', 'i4', 'TIKTOK']);
  });

  it('moves earlier between projected slots, and says the landing is projected', async () => {
    // i25 is projected for Dec 5, i28 for Dec 8.
    const prisma = await dailyQueue(Array.from({ length: 30 }, (_, n) => `i${n + 1}`));
    const live = await plan(prisma);

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'i28',
      slotAt: at('2026-12-05T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect(res).toEqual({
      previousAfterItemId: 'i27',
      landedAt: at('2026-12-05T09:00:00Z'),
      projected: true,
      movedToEnd: false,
      // i25 .. i27 each move a day later.
      shifted: 3,
      shiftedItemIds: ['i25', 'i26', 'i27'],
    });
    // Nothing in the live plan moved.
    expect(await plan(prisma)).toEqual(live);
  });

  it("places the dragged platforms on the slot and re-flows the video's others", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [item('a', 1000), item('b', 2000), item('c', 3000)],
      schedules: [
        schedule({ id: 'sch_tt', platforms: ['TIKTOK'] }),
        // Fridays at 18:00: the 13th, 20th, 27th.
        schedule({ id: 'sch_ig', platforms: ['INSTAGRAM'], daysOfWeek: [5], times: ['18:00'] }),
      ],
      connections: connections('TIKTOK', 'INSTAGRAM'),
    });
    await recomputeSchedule(prisma, 'q1');

    // c's Instagram post (the 27th) onto a's Instagram slot on the 13th.
    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'c',
      slotAt: at('2026-11-13T18:00:00Z'),
      platforms: ['INSTAGRAM'],
    });

    expect(await plan(prisma)).toEqual([
      ['2026-11-11T09:00', 'c', 'TIKTOK'],
      ['2026-11-12T09:00', 'a', 'TIKTOK'],
      ['2026-11-13T09:00', 'b', 'TIKTOK'],
      ['2026-11-13T18:00', 'c', 'INSTAGRAM'],
      ['2026-11-20T18:00', 'a', 'INSTAGRAM'],
      ['2026-11-27T18:00', 'b', 'INSTAGRAM'],
    ]);
    expect(res).toMatchObject({ landedAt: at('2026-11-13T18:00:00Z'), shifted: 2 });
  });
});

describe('moveToSlot — a paused queue', () => {
  /** The queue's order, front first. */
  const order = async (prisma: any) =>
    (await prisma.queueItem.findMany({ where: { queueId: 'q1' }, select: { id: true } })).map(
      (i: Row) => i.id,
    );

  it('rearranges against the projection from now, and stays paused', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'PAUSED' },
      queueItems: ['a', 'b', 'c', 'd', 'e'].map((id, n) => item(id, (n + 1) * 1000)),
      schedules: [schedule()],
      connections: connections('TIKTOK'),
    });
    await recomputeSchedule(prisma, 'q1');

    // Resumed now, a would go on the 11th, b the 12th, ... d the 14th.
    // d onto b's slot on the 12th.
    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'd',
      slotAt: at('2026-11-12T09:00:00Z'),
      platforms: ['TIKTOK'],
    });

    expect(res).toEqual({
      previousAfterItemId: 'c',
      landedAt: at('2026-11-12T09:00:00Z'),
      projected: true,
      movedToEnd: false,
      shifted: 2,
      shiftedItemIds: ['b', 'c'],
    });
    expect(await order(prisma)).toEqual(['a', 'd', 'b', 'c', 'e']);
    // Still paused: nothing is scheduled.
    expect(prisma._db.queue[0].status).toBe('PAUSED');
    expect(await plan(prisma)).toEqual([]);
  });

  it('moves later, and to the end, the same way', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'PAUSED' },
      queueItems: ['a', 'b', 'c'].map((id, n) => item(id, (n + 1) * 1000)),
      schedules: [schedule()],
      connections: connections('TIKTOK'),
    });

    // a onto c's slot on the 13th.
    await expect(
      moveToSlot(prisma, 'q1', {
        itemId: 'a',
        slotAt: at('2026-11-13T09:00:00Z'),
        platforms: ['TIKTOK'],
      }),
    ).resolves.toMatchObject({ projected: true, previousAfterItemId: null, shifted: 2 });
    expect(await order(prisma)).toEqual(['b', 'c', 'a']);

    // b onto the 20th, past the end of the queue.
    await expect(
      moveToSlot(prisma, 'q1', {
        itemId: 'b',
        slotAt: at('2026-11-20T09:00:00Z'),
        platforms: ['TIKTOK'],
      }),
    ).resolves.toMatchObject({
      projected: true,
      movedToEnd: true,
      landedAt: at('2026-11-13T09:00:00Z'),
    });
    expect(await order(prisma)).toEqual(['c', 'a', 'b']);
  });
});

describe('moveToSlot — a slot it partly holds already', () => {
  it('goes by the other holder, rather than jumping to the front', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        // Long published, still ahead of it in the queue.
        item('old', 1000, { status: 'COMPLETED' }),
        item('c', 2000),
        item('b', 3000, { video: { title: 'b', targetPlatforms: ['TIKTOK'] } }),
      ],
      schedules: [
        // An extra TikTok slot this evening (a Tuesday) takes c's TikTok...
        schedule({ id: 'sch_tue', platforms: ['TIKTOK'], daysOfWeek: [2], times: ['18:00'] }),
        schedule({ id: 'sch_tt', platforms: ['TIKTOK'] }),
        schedule({ id: 'sch_ig', platforms: ['INSTAGRAM'] }),
      ],
      connections: connections('TIKTOK', 'INSTAGRAM'),
    });
    await recomputeSchedule(prisma, 'q1');
    // ...so at 09:00 on the 11th, b holds TikTok and c holds Instagram.
    expect(await plan(prisma)).toEqual([
      ['2026-11-10T18:00', 'c', 'TIKTOK'],
      ['2026-11-11T09:00', 'b', 'TIKTOK'],
      ['2026-11-11T09:00', 'c', 'INSTAGRAM'],
    ]);

    const res = await moveToSlot(prisma, 'q1', {
      itemId: 'c',
      slotAt: at('2026-11-11T09:00:00Z'),
      platforms: ['TIKTOK', 'INSTAGRAM'],
    });

    expect(await plan(prisma)).toEqual([
      ['2026-11-10T18:00', 'b', 'TIKTOK'],
      ['2026-11-11T09:00', 'c', 'TIKTOK'],
      ['2026-11-11T09:00', 'c', 'INSTAGRAM'],
    ]);
    expect(res).toMatchObject({
      previousAfterItemId: 'old',
      landedAt: at('2026-11-11T09:00:00Z'),
      shiftedItemIds: ['b'],
    });
  });
});

describe('moveToSlot — what stays put', () => {
  const drop = (prisma: any, itemId: string, iso: string, platforms = ['TIKTOK']) =>
    moveToSlot(prisma, 'q1', { itemId, slotAt: at(iso), platforms: platforms as any });

  it('rejects a slot that has gone by', async () => {
    const prisma = await dailyQueue();
    await expect(drop(prisma, 'c', '2026-11-10T09:00:00Z')).rejects.toMatchObject({
      code: 'PAST_SLOT',
    });
  });

  it("rejects a time no slot posts at, and a slot that doesn't post to the dragged platforms", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [item('a', 1000), item('b', 2000)],
      schedules: [schedule({ platforms: ['TIKTOK'] })],
      connections: connections('TIKTOK', 'INSTAGRAM'),
    });
    await recomputeSchedule(prisma, 'q1');

    await expect(drop(prisma, 'b', '2026-11-11T10:00:00Z')).rejects.toMatchObject({
      code: 'NO_SLOT',
    });
    await expect(drop(prisma, 'b', '2026-11-11T09:00:00Z', ['INSTAGRAM'])).rejects.toMatchObject({
      code: 'NO_SLOT',
    });
  });

  it('rejects published and in-flight items, and a platform already posted', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        item('done', 1000, { status: 'COMPLETED' }),
        // Uploading to TikTok right now.
        item('busy', 2000, { status: 'PUBLISHING' }),
        // On TikTok already; Instagram still to come.
        item('half', 3000, { status: 'PUBLISHING' }),
        item('a', 4000),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK', 'INSTAGRAM'),
      publishTasks: [
        {
          id: 'p1',
          queueItemId: 'done',
          platform: 'TIKTOK',
          status: 'PUBLISHED',
          scheduledAt: at('2026-11-09T09:00:00Z'),
        },
        {
          id: 'u1',
          queueItemId: 'busy',
          platform: 'TIKTOK',
          status: 'UPLOADING',
          scheduledAt: at('2026-11-10T11:55:00Z'),
        },
        {
          id: 'p2',
          queueItemId: 'half',
          platform: 'TIKTOK',
          status: 'PUBLISHED',
          scheduledAt: at('2026-11-09T09:00:00Z'),
        },
      ],
    });
    await recomputeSchedule(prisma, 'q1');
    const before = await plan(prisma);

    for (const [id, platforms] of [
      ['done', ['TIKTOK']],
      ['busy', ['TIKTOK']],
      ['half', ['TIKTOK']],
    ] as const) {
      await expect(drop(prisma, id, '2026-11-13T09:00:00Z', [...platforms])).rejects.toMatchObject({
        code: 'NOT_MOVABLE',
      });
    }
    expect(await plan(prisma)).toEqual(before);

    // Its Instagram post is still waiting, so that one moves: from the 11th
    // (busy is left alone, so half leads) to a's slot on the 12th.
    await expect(
      drop(prisma, 'half', '2026-11-12T09:00:00Z', ['INSTAGRAM']),
    ).resolves.toMatchObject({ landedAt: at('2026-11-12T09:00:00Z'), shiftedItemIds: ['a'] });
  });

  it('rejects an item from another queue', async () => {
    const prisma = await dailyQueue();
    await expect(drop(prisma, 'nope', '2026-11-12T09:00:00Z')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
