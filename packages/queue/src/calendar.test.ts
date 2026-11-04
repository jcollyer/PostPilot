import { describe, it, expect } from 'vitest';

import { getCalendar } from './calendar';

/**
 * A tiny in-memory stand-in for the slice of PrismaClient that `getCalendar`
 * touches: the queue row and one publish-task query joined to its queue item's
 * media. Like the scheduler tests' fake, only the query shapes the function
 * actually uses are implemented.
 */
type Row = Record<string, any>;

function makePrisma(seed: {
  queue: Row;
  queueItems: Row[];
  publishTasks: Row[];
  schedules?: Row[];
  connections?: Row[];
}) {
  /** Every write the read attempted; a calendar read must leave this empty. */
  const writes: string[] = [];
  const write = (name: string) => async () => {
    writes.push(name);
    throw new Error(`calendar read wrote: ${name}`);
  };
  const writeMethods = (model: string) =>
    Object.fromEntries(
      ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].map(
        (m) => [m, write(`${model}.${m}`)],
      ),
    );

  const inRange = (value: Date | null | undefined, range: Row | undefined): boolean => {
    if (!range) return true;
    if (!value) return false;
    if (range.gte && value < range.gte) return false;
    if (range.lt && value >= range.lt) return false;
    return true;
  };

  const taskMatches = (t: Row, where: Row): boolean => {
    if (where.OR && !where.OR.some((w: Row) => taskMatches(t, w))) return false;
    if (where.status) {
      const want = where.status.in ?? [where.status];
      if (!want.includes(t.status)) return false;
    }
    if (!inRange(t.scheduledAt, where.scheduledAt)) return false;
    if (!inRange(t.publishedAt, where.publishedAt)) return false;
    if (where.queueItem?.queueId) {
      const item = seed.queueItems.find((i) => i.id === t.queueItemId);
      if (item?.queueId !== where.queueItem.queueId) return false;
    }
    return true;
  };

  return {
    _writes: writes,
    queue: {
      findUnique: async ({ where }: any) =>
        seed.queue.id === where.id ? { userId: 'u1', ...seed.queue } : null,
    },
    queueItem: {
      ...writeMethods('queueItem'),
      // Items in rotation for the projection, in queue order, with their media
      // and every task they already have.
      findMany: async ({ where }: any) =>
        seed.queueItems
          .filter(
            (i) =>
              i.queueId === where.queueId &&
              (!where.status?.in || where.status.in.includes(i.status)),
          )
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            videoId: null,
            imageId: null,
            video: null,
            image: null,
            ...i,
            publishTasks: seed.publishTasks
              .filter((t) => t.queueItemId === i.id)
              .map((t) => ({ platform: t.platform, status: t.status, scheduledAt: t.scheduledAt })),
          })),
    },
    schedule: {
      findMany: async ({ where }: any) =>
        (seed.schedules ?? []).filter(
          (s) => s.queueId === where.queueId && (!where.isActive || s.isActive),
        ),
    },
    platformConnection: {
      findMany: async ({ where }: any) =>
        (seed.connections ?? [])
          .filter((c) => c.userId === where.userId && (!where.status || c.status === where.status))
          .map((c) => ({ id: c.id, platform: c.platform })),
    },
    publishTask: {
      ...writeMethods('publishTask'),
      // Returns whole rows with their queue item (and its media) joined; the
      // function reads only what it selected.
      findMany: async ({ where }: any) =>
        seed.publishTasks
          .filter((t) => taskMatches(t, where))
          .map((t) => {
            const item = seed.queueItems.find((i) => i.id === t.queueItemId)!;
            return {
              connectionId: null,
              publishedAt: null,
              platformPostUrl: null,
              ...t,
              queueItem: { videoId: null, imageId: null, video: null, image: null, ...item },
            };
          }),
    },
  } as any;
}

const video = (title: string, extra: Row = {}) => ({
  title,
  coverImageUrl: null,
  selectedThumbnail: { url: `https://cdn.test/${title}.jpg` },
  ...extra,
});

const at = (iso: string) => new Date(iso);

// November 2026's grid in UTC: Sun Nov 1 .. Sat Dec 5.
const NOV = { from: at('2026-11-01T00:00:00Z'), to: at('2026-12-06T00:00:00Z'), timeZone: 'UTC' };
// Calendar reads compare against the clock for in-flight; pin it mid-month.
const NOW = at('2026-11-10T12:00:00Z');

describe('getCalendar', () => {
  it("groups an item's posts on one day into a single chip with that day's platforms", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't_tt',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          connectionId: 'c_tt',
          scheduledAt: at('2026-11-12T09:00:00Z'),
        },
        {
          id: 't_yt',
          queueItemId: 'item1',
          platform: 'YOUTUBE',
          status: 'SCHEDULED',
          connectionId: 'c_yt',
          scheduledAt: at('2026-11-12T09:00:00Z'),
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips).toHaveLength(1);
    expect(cal.chips[0]).toMatchObject({
      day: '2026-11-12',
      itemId: 'item1',
      mediaId: 'v1',
      mediaType: 'VIDEO',
      title: 'Empire',
      thumbnailUrl: 'https://cdn.test/Empire.jpg',
      state: 'scheduled',
    });
    expect(cal.chips[0]!.posts.map((p) => p.platform).sort()).toEqual(['TIKTOK', 'YOUTUBE']);
  });

  it('gives a cross-platform item whose platforms post on different days a chip on each day', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't_ig',
          queueItemId: 'item1',
          platform: 'INSTAGRAM',
          status: 'SCHEDULED',
          connectionId: 'c_ig',
          scheduledAt: at('2026-11-14T18:00:00Z'),
        },
        {
          id: 't_tt',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          connectionId: 'c_tt',
          scheduledAt: at('2026-11-12T09:00:00Z'),
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips.map((c) => [c.day, c.posts.map((p) => p.platform)])).toEqual([
      ['2026-11-12', ['TIKTOK']],
      ['2026-11-14', ['INSTAGRAM']],
    ]);
  });

  it('places a published post on the day it went out, with its live URL', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't_yt',
          queueItemId: 'item1',
          platform: 'YOUTUBE',
          status: 'PUBLISHED',
          connectionId: 'c_yt',
          // Slotted late on the 4th, but a retry meant it went out on the 5th.
          scheduledAt: at('2026-11-04T23:00:00Z'),
          publishedAt: at('2026-11-05T01:30:00Z'),
          platformPostUrl: 'https://youtube.com/shorts/abc',
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips).toHaveLength(1);
    expect(cal.chips[0]).toMatchObject({ day: '2026-11-05', state: 'published' });
    expect(cal.chips[0]!.posts).toEqual([
      {
        taskId: 't_yt',
        platform: 'YOUTUBE',
        state: 'published',
        at: at('2026-11-05T01:30:00Z'),
        postUrl: 'https://youtube.com/shorts/abc',
      },
    ]);
  });

  it.each([
    ['UPLOADING', '2026-11-10T11:55:00Z', 'inFlight'],
    ['PROCESSING', '2026-11-10T11:00:00Z', 'inFlight'],
    // Due, but the runner hasn't claimed it yet (or it's waiting out a retry).
    ['SCHEDULED', '2026-11-10T11:00:00Z', 'inFlight'],
    ['SCHEDULED', '2026-11-10T18:00:00Z', 'scheduled'],
    ['HELD', '2026-11-10T18:00:00Z', 'held'],
  ])('maps a %s task due %s to %s', async (status, scheduledAt, state) => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't1',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status,
          scheduledAt: at(scheduledAt),
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips.map((c) => [c.day, c.state, c.posts[0]!.state])).toEqual([
      ['2026-11-10', state, state],
    ]);
  });

  it('leaves failed and skipped posts off the calendar', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't1',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'FAILED',
          scheduledAt: at('2026-11-09T09:00:00Z'),
        },
        {
          id: 't2',
          queueItemId: 'item1',
          platform: 'YOUTUBE',
          status: 'SKIPPED',
          scheduledAt: at('2026-11-09T09:00:00Z'),
        },
      ],
    });

    expect((await getCalendar(prisma, 'q1', NOV, NOW)).chips).toEqual([]);
  });

  it('flags a chip held when any of its platforms that day is held, keeping each post’s own state', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't_tt',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          connectionId: 'c_tt',
          scheduledAt: at('2026-11-12T09:00:00Z'),
        },
        {
          id: 't_ig',
          queueItemId: 'item1',
          platform: 'INSTAGRAM',
          status: 'HELD',
          scheduledAt: at('2026-11-12T09:00:00Z'),
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips).toHaveLength(1);
    expect(cal.chips[0]!.state).toBe('held');
    expect(Object.fromEntries(cal.chips[0]!.posts.map((p) => [p.platform, p.state]))).toEqual({
      TIKTOK: 'scheduled',
      INSTAGRAM: 'held',
    });
  });

  it("returns only posts inside the grid's range", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        { id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Inside') },
        { id: 'item2', queueId: 'q1', videoId: 'v2', video: video('Outside') },
        { id: 'other', queueId: 'q2', videoId: 'v3', video: video('Someone else') },
      ],
      publishTasks: [
        // Before the grid.
        {
          id: 'a',
          queueItemId: 'item2',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          scheduledAt: at('2026-10-31T23:59:00Z'),
        },
        // Slotted inside the grid but published after it ended: placed by publishedAt.
        {
          id: 'b',
          queueItemId: 'item2',
          platform: 'YOUTUBE',
          status: 'PUBLISHED',
          scheduledAt: at('2026-12-05T23:00:00Z'),
          publishedAt: at('2026-12-06T00:10:00Z'),
        },
        // The range end is exclusive.
        {
          id: 'c',
          queueItemId: 'item2',
          platform: 'INSTAGRAM',
          status: 'SCHEDULED',
          scheduledAt: at('2026-12-06T00:00:00Z'),
        },
        // Another queue.
        {
          id: 'd',
          queueItemId: 'other',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          scheduledAt: at('2026-11-20T09:00:00Z'),
        },
        // First and last instants of the grid.
        {
          id: 'e',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'PUBLISHED',
          scheduledAt: at('2026-11-01T00:00:00Z'),
          publishedAt: at('2026-11-01T00:00:00Z'),
        },
        {
          id: 'f',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          scheduledAt: at('2026-12-05T23:59:00Z'),
        },
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips.flatMap((c) => c.posts.map((p) => p.taskId))).toEqual(['e', 'f']);
  });

  it("returns the queue's status, so a paused queue can say so", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'PAUSED' },
      queueItems: [],
      publishTasks: [],
    });

    expect(await getCalendar(prisma, 'q1', NOV, NOW)).toEqual({ status: 'PAUSED', chips: [] });
  });

  it('shows images and carousels as such, with no thumbnail once the photo was removed', async () => {
    const image = (title: string, extra: Row = {}) => ({
      title,
      cdnUrl: `https://cdn.test/${title}.jpg`,
      sourceDeletedAt: null,
      _count: { carouselItems: 0 },
      ...extra,
    });
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        { id: 'img', queueId: 'q1', imageId: 'i1', image: image('Photo') },
        {
          id: 'gone',
          queueId: 'q1',
          imageId: 'i2',
          image: image('Removed', { sourceDeletedAt: at('2026-11-02T00:00:00Z') }),
        },
        {
          id: 'car',
          queueId: 'q1',
          imageId: 'i3',
          image: image('Carousel', { _count: { carouselItems: 3 } }),
        },
      ],
      publishTasks: ['img', 'gone', 'car'].map((id, n) => ({
        id: `t_${id}`,
        queueItemId: id,
        platform: 'INSTAGRAM',
        status: 'SCHEDULED',
        scheduledAt: at(`2026-11-2${n}T09:00:00Z`),
      })),
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips.map((c) => [c.mediaId, c.mediaType, c.title, c.thumbnailUrl])).toEqual([
      ['i1', 'IMAGE', 'Photo', 'https://cdn.test/Photo.jpg'],
      ['i2', 'IMAGE', 'Removed', null],
      ['i3', 'CAROUSEL', 'Carousel', 'https://cdn.test/Carousel.jpg'],
    ]);
  });

  it("buckets posts into the viewer's local day, not the UTC one", async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [{ id: 'item1', queueId: 'q1', videoId: 'v1', video: video('Empire') }],
      publishTasks: [
        {
          id: 't_tt',
          queueItemId: 'item1',
          platform: 'TIKTOK',
          status: 'SCHEDULED',
          connectionId: 'c_tt',
          // 10pm Nov 12 in New York.
          scheduledAt: at('2026-11-13T03:00:00Z'),
        },
      ],
    });

    const cal = await getCalendar(
      prisma,
      'q1',
      {
        from: at('2026-11-01T04:00:00Z'),
        to: at('2026-12-06T05:00:00Z'),
        timeZone: 'America/New_York',
      },
      NOW,
    );

    expect(cal.chips.map((c) => c.day)).toEqual(['2026-11-12']);
  });
});

/** A video item in rotation; `targetPlatforms: []` means "all connected". */
const item = (id: string, position: number, extra: Row = {}) => ({
  id,
  queueId: 'q1',
  position,
  status: 'PENDING',
  videoId: `v_${id}`,
  video: { ...video(id), targetPlatforms: [] },
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
  platforms.map((platform) => ({
    id: `c_${platform}`,
    userId: 'u1',
    platform,
    status: 'ACTIVE',
  }));

const task = (id: string, queueItemId: string, platform: string, iso: string, extra: Row = {}) => ({
  id,
  queueItemId,
  platform,
  status: 'SCHEDULED',
  scheduledAt: at(iso),
  ...extra,
});

/** Chips as `[day, itemId, state, platforms]`, for compact assertions. */
const summary = (chips: { day: string; itemId: string; state: string; posts: Row[] }[]) =>
  chips.map((c) => [c.day, c.itemId, c.state, c.posts.map((p) => p.platform).sort()]);

describe('getCalendar — projection', () => {
  it('continues after the materialized plan and stops when the queue runs out', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        item('a', 1, { status: 'SCHEDULED' }),
        item('b', 2, { status: 'SCHEDULED' }),
        item('c', 3),
        item('d', 4),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK'),
      // The live plan (as if its horizon ended on the 12th).
      publishTasks: [
        task('t_a', 'a', 'TIKTOK', '2026-11-11T09:00:00Z'),
        task('t_b', 'b', 'TIKTOK', '2026-11-12T09:00:00Z'),
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(summary(cal.chips)).toEqual([
      ['2026-11-11', 'a', 'scheduled', ['TIKTOK']],
      ['2026-11-12', 'b', 'scheduled', ['TIKTOK']],
      ['2026-11-13', 'c', 'projected', ['TIKTOK']],
      ['2026-11-14', 'd', 'projected', ['TIKTOK']],
    ]);
    expect(cal.chips[2]!.posts[0]).toMatchObject({
      taskId: null,
      state: 'projected',
      at: at('2026-11-13T09:00:00Z'),
      postUrl: null,
    });
  });

  it('projects only the platforms an item still needs, never one the plan already covers', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        // Cross-posts: TikTok is in the plan, Instagram isn't yet.
        item('a', 1, { status: 'SCHEDULED' }),
        item('b', 2),
      ],
      schedules: [
        schedule({ id: 'sch_tt', platforms: ['TIKTOK'] }),
        // Fridays at 18:00 — the first is the 13th, after the plan ends.
        schedule({ id: 'sch_ig', platforms: ['INSTAGRAM'], daysOfWeek: [5], times: ['18:00'] }),
      ],
      connections: connections('TIKTOK', 'INSTAGRAM'),
      publishTasks: [task('t_a', 'a', 'TIKTOK', '2026-11-12T09:00:00Z')],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(summary(cal.chips)).toEqual([
      ['2026-11-12', 'a', 'scheduled', ['TIKTOK']],
      ['2026-11-13', 'b', 'projected', ['TIKTOK']],
      ['2026-11-13', 'a', 'projected', ['INSTAGRAM']],
      ['2026-11-20', 'b', 'projected', ['INSTAGRAM']],
    ]);
  });

  it('leaves out platforms an item already published to or failed on', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        // Posted to TikTok, failed on Instagram; YouTube is still to come.
        item('a', 1, { status: 'PUBLISHING' }),
        item('b', 2),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK', 'YOUTUBE', 'INSTAGRAM'),
      publishTasks: [
        task('p_a', 'a', 'TIKTOK', '2026-11-09T09:00:00Z', {
          status: 'PUBLISHED',
          publishedAt: at('2026-11-09T09:01:00Z'),
        }),
        task('f_a', 'a', 'INSTAGRAM', '2026-11-09T09:00:00Z', { status: 'FAILED' }),
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(summary(cal.chips)).toEqual([
      ['2026-11-09', 'a', 'published', ['TIKTOK']],
      ['2026-11-11', 'a', 'projected', ['YOUTUBE']],
      ['2026-11-12', 'b', 'projected', ['INSTAGRAM', 'TIKTOK', 'YOUTUBE']],
    ]);
  });

  it('leaves an item the runner is working on out of the projection, as the scheduler does', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [
        // Uploading to TikTok now; the scheduler won't touch it until that settles.
        item('a', 1, { status: 'PUBLISHING' }),
        item('b', 2, { status: 'SCHEDULED' }),
        item('c', 3),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK', 'YOUTUBE'),
      publishTasks: [
        task('u_a', 'a', 'TIKTOK', '2026-11-10T11:55:00Z', { status: 'UPLOADING' }),
        task('t_b', 'b', 'TIKTOK', '2026-11-11T09:00:00Z'),
        task('y_b', 'b', 'YOUTUBE', '2026-11-11T09:00:00Z'),
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(summary(cal.chips)).toEqual([
      ['2026-11-10', 'a', 'inFlight', ['TIKTOK']],
      ['2026-11-11', 'b', 'scheduled', ['TIKTOK', 'YOUTUBE']],
      ['2026-11-12', 'c', 'projected', ['TIKTOK', 'YOUTUBE']],
    ]);
  });

  it('shows a paused queue its history plus the whole future as projected from now', async () => {
    const prisma = makePrisma({
      // Pausing cleared the plan; nothing is scheduled.
      queue: { id: 'q1', status: 'PAUSED' },
      queueItems: [
        item('done', 1, { status: 'COMPLETED' }),
        // Mid-upload when the queue was paused, so its later Instagram task was kept.
        item('busy', 2, { status: 'PUBLISHING' }),
        item('a', 3),
        item('b', 4),
      ],
      schedules: [schedule()],
      connections: connections('TIKTOK'),
      publishTasks: [
        task('p_done', 'done', 'TIKTOK', '2026-11-05T09:00:00Z', {
          status: 'PUBLISHED',
          publishedAt: at('2026-11-05T09:02:00Z'),
        }),
        task('u_busy', 'busy', 'TIKTOK', '2026-11-10T11:55:00Z', { status: 'UPLOADING' }),
        task('ig_busy', 'busy', 'INSTAGRAM', '2026-11-20T09:00:00Z'),
      ],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.status).toBe('PAUSED');
    expect(summary(cal.chips)).toEqual([
      ['2026-11-05', 'done', 'published', ['TIKTOK']],
      ['2026-11-10', 'busy', 'inFlight', ['TIKTOK']],
      // NOW is 12:00 on the 10th, so the 10th's 09:00 slot has gone.
      ['2026-11-11', 'a', 'projected', ['TIKTOK']],
      ['2026-11-12', 'b', 'projected', ['TIKTOK']],
      ['2026-11-20', 'busy', 'scheduled', ['INSTAGRAM']],
    ]);
  });

  it('pages months ahead for a queue that long, returning only that grid', async () => {
    // 150 items, one a day from the 11th: the 113th lands on March 3, 2027 and
    // the last on April 9.
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: Array.from({ length: 150 }, (_, n) => item(`i${n + 1}`, n + 1)),
      schedules: [schedule()],
      connections: connections('TIKTOK'),
      publishTasks: [],
    });

    // March 2027's grid: Sun Feb 28 .. Sat Apr 10.
    const MARCH = {
      from: at('2027-02-28T00:00:00Z'),
      to: at('2027-04-11T00:00:00Z'),
      timeZone: 'UTC',
    };
    const cal = await getCalendar(prisma, 'q1', MARCH, NOW);

    expect(cal.chips[0]).toMatchObject({ day: '2027-02-28', itemId: 'i110', state: 'projected' });
    expect(cal.chips.find((c) => c.day === '2027-03-03')?.itemId).toBe('i113');
    // The queue runs dry on April 9; the 10th is empty.
    expect(cal.chips.at(-1)).toMatchObject({ day: '2027-04-09', itemId: 'i150' });
    expect(cal.chips).toHaveLength(41);
  });

  it('projects nothing without an active schedule', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [item('a', 1)],
      schedules: [schedule({ isActive: false })],
      connections: connections('TIKTOK'),
      publishTasks: [],
    });

    expect((await getCalendar(prisma, 'q1', NOV, NOW)).chips).toEqual([]);
  });

  it('writes nothing', async () => {
    const prisma = makePrisma({
      queue: { id: 'q1', status: 'ACTIVE' },
      queueItems: [item('a', 1, { status: 'SCHEDULED' }), item('b', 2), item('c', 3)],
      schedules: [schedule()],
      connections: connections('TIKTOK'),
      publishTasks: [task('t_a', 'a', 'TIKTOK', '2026-11-11T09:00:00Z')],
    });

    const cal = await getCalendar(prisma, 'q1', NOV, NOW);

    expect(cal.chips.filter((c) => c.state === 'projected')).toHaveLength(2);
    expect(prisma._writes).toEqual([]);
  });
});
