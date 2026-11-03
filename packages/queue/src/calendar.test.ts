import { describe, it, expect } from 'vitest';

import { getCalendar } from './calendar';

/**
 * A tiny in-memory stand-in for the slice of PrismaClient that `getCalendar`
 * touches: the queue row and one publish-task query joined to its queue item's
 * media. Like the scheduler tests' fake, only the query shapes the function
 * actually uses are implemented.
 */
type Row = Record<string, any>;

function makePrisma(seed: { queue: Row; queueItems: Row[]; publishTasks: Row[] }) {
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
    queue: {
      findUnique: async ({ where }: any) => (seed.queue.id === where.id ? seed.queue : null),
    },
    publishTask: {
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
