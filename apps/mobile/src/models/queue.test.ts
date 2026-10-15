import { describe, expect, it } from 'vitest';

import { buildQueueModel, queueSections, type QueueData, type QueueSchedules } from './queue';

const HOUR = 3_600_000;
// Fixture dates sit at midday UTC, so formatted dates hold in any zone from UTC-11 to UTC+11 (CI runs in UTC).
const NOW = new Date('2026-10-14T12:00:00Z');
const hoursFromNow = (n: number) => new Date(NOW.getTime() + n * HOUR);

type Item = QueueData['items'][number];
type Task = Item['tasks'][number];
type Schedule = QueueSchedules[number];

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `task_${Math.random().toString(36).slice(2)}`,
    platform: 'TIKTOK',
    status: 'SCHEDULED',
    scheduledAt: hoursFromNow(24),
    publishedAt: null,
    postUrl: null,
    lastError: null,
    needsConnection: false,
    ...overrides,
  };
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    position: 1,
    status: 'PENDING',
    scheduledAt: null,
    postsTo: ['TIKTOK', 'INSTAGRAM'],
    media: {
      mediaType: 'VIDEO',
      id: `video_${id}`,
      title: `Video ${id}`,
      originalFilename: `${id}.mp4`,
      durationSec: 30,
      thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
      category: null,
      isDuplicate: false,
      targetPlatforms: [],
    },
    tasks: [],
    ...overrides,
  };
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: `sched_${Math.random().toString(36).slice(2)}`,
    queueId: 'queue_1',
    name: null,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
    times: ['09:00', '18:00'],
    platforms: ['TIKTOK'],
    isActive: true,
    createdAt: hoursFromNow(-100),
    updatedAt: hoursFromNow(-100),
    ...overrides,
  };
}

function queue(items: Item[], status: QueueData['status'] = 'ACTIVE'): QueueData {
  return { status, pausedAt: status === 'PAUSED' ? hoursFromNow(-1) : null, items };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** How a slot reads on a row, in the device's locale ("Thu, Oct 15, 12:00 PM"). */
const slot = (d: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

describe('buildQueueModel — sections', () => {
  it('puts an item with a FAILED or HELD task only in Needs attention', () => {
    const failed = item('failed', {
      status: 'SCHEDULED',
      scheduledAt: hoursFromNow(2),
      tasks: [task({ status: 'FAILED', lastError: 'Token expired' })],
    });
    const held = item('held', {
      status: 'HELD',
      tasks: [task({ platform: 'INSTAGRAM', status: 'HELD', needsConnection: true })],
    });
    // Posted to TikTok, but Instagram failed: still needs a hand, not "Published".
    const partly = item('partly', {
      status: 'COMPLETED',
      tasks: [
        task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-3) }),
        task({ platform: 'INSTAGRAM', status: 'FAILED', lastError: 'Media rejected' }),
      ],
    });
    const fine = item('fine');

    const model = buildQueueModel(queue([failed, held, partly, fine]), [schedule()], NOW);

    expect(ids(model.needsAttention)).toEqual(['failed', 'held', 'partly']);
    expect(ids(model.upNext)).toEqual(['fine']);
    expect(model.published.rows).toEqual([]);
    expect(model.skipped.count).toBe(0);
  });

  it('leaves a skipped item in Skipped even when it kept a failed task', () => {
    const skipped = item('skipped', {
      status: 'SKIPPED',
      tasks: [task({ status: 'FAILED', lastError: 'Token expired' })],
    });

    const model = buildQueueModel(queue([skipped]), [schedule()], NOW);

    expect(model.needsAttention).toEqual([]);
    expect(model.skipped.count).toBe(1);
  });

  it('keeps Up next in queue order and leaves out skipped and completed items', () => {
    const items = [
      item('a', { status: 'SCHEDULED', scheduledAt: hoursFromNow(3) }),
      item('done', {
        status: 'COMPLETED',
        tasks: [task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-1) })],
      }),
      item('b', { status: 'PUBLISHING', scheduledAt: hoursFromNow(-0.1) }),
      item('gone', { status: 'SKIPPED' }),
      item('c'),
    ];

    const model = buildQueueModel(queue(items), [schedule()], NOW);

    expect(ids(model.upNext)).toEqual(['a', 'b', 'c']);
  });

  it('lists Published newest first, capped at 5 with a show-more flag', () => {
    const published = [3, 1, 7, 2, 6, 4, 5].map((hoursAgo) =>
      item(`p${hoursAgo}`, {
        status: 'COMPLETED',
        tasks: [
          task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-hoursAgo - 1) }),
          // The latest publish across platforms decides the order.
          task({ platform: 'INSTAGRAM', status: 'PUBLISHED', publishedAt: hoursFromNow(-hoursAgo) }),
        ],
      }),
    );

    const model = buildQueueModel(queue(published), [schedule()], NOW);

    expect(ids(model.published.rows)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(ids(model.published.more)).toEqual(['p6', 'p7']);
    expect(model.published.hasMore).toBe(true);
  });

  it('has no show-more flag with 5 or fewer published items', () => {
    const published = [1, 2].map((hoursAgo) =>
      item(`p${hoursAgo}`, {
        status: 'COMPLETED',
        tasks: [task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-hoursAgo) })],
      }),
    );

    const model = buildQueueModel(queue(published), [schedule()], NOW);

    expect(model.published.hasMore).toBe(false);
    expect(model.published.more).toEqual([]);
  });

  it('counts skipped items and keeps their rows for the disclosure', () => {
    const items = [item('s1', { status: 'SKIPPED' }), item('live'), item('s2', { status: 'SKIPPED' })];

    const model = buildQueueModel(queue(items), [schedule()], NOW);

    expect(model.skipped.count).toBe(2);
    expect(model.skipped.label).toBe('Skipped (2)');
    expect(ids(model.skipped.rows)).toEqual(['s1', 's2']);
  });
});

describe('buildQueueModel — rows', () => {
  it('shows the scheduled time and platforms on a slotted Up next row', () => {
    const slotted = item('a', {
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-10-15T12:00:00Z'),
      postsTo: ['TIKTOK', 'YOUTUBE'],
    });

    const [row] = buildQueueModel(queue([slotted]), [schedule()], NOW).upNext;

    expect(row).toEqual({
      id: 'a',
      title: 'Video a',
      thumbnailUrl: 'https://cdn.example.com/a.jpg',
      meta: slot(new Date('2026-10-15T12:00:00Z')),
      tone: 'muted',
      platforms: ['TIKTOK', 'YOUTUBE'],
    });
  });

  it('numbers an unslotted Up next row by its place in Up next', () => {
    const items = [
      item('slotted', { status: 'SCHEDULED', scheduledAt: hoursFromNow(3) }),
      item('failed', { tasks: [task({ status: 'FAILED' })] }),
      item('waiting'),
    ];

    const model = buildQueueModel(queue(items), [schedule()], NOW);

    expect(model.upNext[1]).toMatchObject({ id: 'waiting', meta: '#2 · Waiting' });
  });

  it('says an item is publishing only while a task is uploading or processing', () => {
    const uploading = item('a', {
      status: 'PUBLISHING',
      scheduledAt: hoursFromNow(-0.1),
      tasks: [task({ status: 'UPLOADING', scheduledAt: hoursFromNow(-0.1) })],
    });

    const [row] = buildQueueModel(queue([uploading]), [schedule()], NOW).upNext;

    expect(row.meta).toBe('Publishing now');
  });

  it('shows a partly posted item’s next unposted slot, not its past one', () => {
    const next = new Date('2026-10-25T12:00:00Z');
    const partly = item('a', {
      status: 'PUBLISHING',
      scheduledAt: hoursFromNow(-48),
      tasks: [
        task({ platform: 'INSTAGRAM', status: 'PUBLISHED', scheduledAt: hoursFromNow(-48), publishedAt: hoursFromNow(-48) }),
        task({ platform: 'TIKTOK', status: 'SCHEDULED', scheduledAt: next }),
      ],
    });

    const [row] = buildQueueModel(queue([partly]), [schedule()], NOW).upNext;

    expect(row.meta).toBe(
      slot(next),
    );
  });

  it('shows a partly posted item with no slot left as waiting', () => {
    const partly = item('a', {
      status: 'PUBLISHING',
      scheduledAt: hoursFromNow(-48),
      tasks: [task({ platform: 'INSTAGRAM', status: 'PUBLISHED', publishedAt: hoursFromNow(-48) })],
    });

    const [row] = buildQueueModel(queue([partly]), [schedule()], NOW).upNext;

    expect(row.meta).toBe('#1 · Waiting');
  });

  it('reads "<Platform> failed · <short error>" in critical on a Needs attention row', () => {
    const failed = item('a', {
      tasks: [
        task({
          platform: 'INSTAGRAM',
          status: 'FAILED',
          lastError:
            'The access token has expired and must be refreshed before posting again.\nstack: …',
        }),
      ],
    });

    const [row] = buildQueueModel(queue([failed]), [schedule()], NOW).needsAttention;

    expect(row.tone).toBe('critical');
    expect(row.meta).toBe('Instagram failed · The access token has expired and must be refreshed…');
  });

  it('names a held task as needing reconnection and counts further problems', () => {
    const held = item('a', {
      tasks: [
        task({ platform: 'TIKTOK', status: 'HELD', needsConnection: true }),
        task({ platform: 'YOUTUBE', status: 'FAILED', lastError: 'Quota exceeded' }),
      ],
    });

    const [row] = buildQueueModel(queue([held]), [schedule()], NOW).needsAttention;

    expect(row.meta).toBe('TikTok on hold · needs reconnecting · +1 more');
  });

  it('reads just "<Platform> failed" when there is no error message', () => {
    const failed = item('a', { tasks: [task({ platform: 'YOUTUBE', status: 'FAILED' })] });

    const [row] = buildQueueModel(queue([failed]), [schedule()], NOW).needsAttention;

    expect(row.meta).toBe('YouTube Shorts failed');
  });

  it('falls back to the filename, then "Untitled", for the title', () => {
    const named = item('a');
    const filenameOnly = item('b', {
      media: { ...named.media, title: null, originalFilename: 'b.mp4' },
    });
    const nothing = item('c', {
      media: { ...named.media, title: null, originalFilename: null },
    });

    const model = buildQueueModel(queue([named, filenameOnly, nothing]), [schedule()], NOW);

    expect(model.upNext.map((r) => r.title)).toEqual(['Video a', 'b.mp4', 'Untitled']);
  });

  it('shows when a published item went out and where', () => {
    const done = item('a', {
      status: 'COMPLETED',
      postsTo: ['TIKTOK', 'INSTAGRAM'],
      tasks: [
        task({ status: 'PUBLISHED', publishedAt: new Date('2026-10-13T12:00:00Z') }),
        task({ platform: 'INSTAGRAM', status: 'SKIPPED' }),
      ],
    });

    const [row] = buildQueueModel(queue([done]), [schedule()], NOW).published.rows;

    expect(row.meta).toBe(
      `Posted ${slot(new Date('2026-10-13T12:00:00Z'))}`,
    );
    expect(row.platforms).toEqual(['TIKTOK']);
  });
});

describe('buildQueueModel — status line', () => {
  it('says Running with the count in rotation', () => {
    const items = [item('a'), item('b'), item('c', { status: 'SKIPPED' })];

    const { status } = buildQueueModel(queue(items), [schedule()], NOW);

    expect(status).toEqual({
      paused: false,
      tone: 'ok',
      label: 'Running',
      detail: '2 in rotation',
      copy: 'Running · 2 in rotation',
    });
  });

  it('says Paused in warning tone with the count waiting', () => {
    const { status } = buildQueueModel(queue([item('a')], 'PAUSED'), [schedule()], NOW);

    expect(status).toEqual({
      paused: true,
      tone: 'warn',
      label: 'Paused',
      detail: '1 waiting · nothing posts until you resume',
      copy: 'Paused · 1 waiting · nothing posts until you resume',
    });
  });

  it('does not count items that need attention as in rotation', () => {
    const items = [item('a'), item('b', { tasks: [task({ status: 'FAILED' })] })];

    const { status } = buildQueueModel(queue(items), [schedule()], NOW);

    expect(status.detail).toBe('1 in rotation');
  });
});

describe('buildQueueModel — schedule summary', () => {
  const summary = (schedules: Schedule[]) =>
    buildQueueModel(queue([]), schedules, NOW).schedule;

  it('summarises one weekday schedule', () => {
    expect(summary([schedule()])).toBe('Posts 2×/day · Mon–Fri · 9a, 6p');
  });

  it('keeps minutes when a time is off the hour, and handles noon and midnight', () => {
    expect(summary([schedule({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], times: ['00:00', '12:30', '17:45'] })])).toBe(
      'Posts 3×/day · Every day · 12a, 12:30p, 5:45p',
    );
  });

  it('lists scattered days rather than a range', () => {
    expect(summary([schedule({ daysOfWeek: [5, 1, 3], times: ['09:00'] })])).toBe(
      'Posts 1×/day · Mon, Wed, Fri · 9a',
    );
  });

  it('treats Saturday and Sunday as one weekend run', () => {
    expect(summary([schedule({ daysOfWeek: [0, 6], times: ['10:00'] })])).toBe(
      'Posts 1×/day · Sat, Sun · 10a',
    );
  });

  it('merges active schedules that share their days, sorting times', () => {
    expect(
      summary([
        schedule({ times: ['18:00'], platforms: ['TIKTOK'] }),
        schedule({ times: ['09:00', '18:00'], platforms: ['INSTAGRAM'] }),
      ]),
    ).toBe('Posts 2×/day · Mon–Fri · 9a, 6p');
  });

  it('joins schedules on different days and ignores inactive ones', () => {
    expect(
      summary([
        schedule({ daysOfWeek: [1, 2, 3, 4, 5], times: ['09:00'] }),
        schedule({ daysOfWeek: [0, 6], times: ['11:00'] }),
        schedule({ daysOfWeek: [3], times: ['20:00'], isActive: false }),
      ]),
    ).toBe('Posts 1×/day · Mon–Fri · 9a; 1×/day · Sat, Sun · 11a');
  });

  it('says there is no schedule when none is active', () => {
    expect(summary([])).toBe('No posting schedule · add one on the web');
    expect(summary([schedule({ isActive: false })])).toBe('No posting schedule · add one on the web');
  });
});

describe('queueSections', () => {
  const closed = { showAllPublished: false, skippedOpen: false };
  const published = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      item(`p${i}`, {
        status: 'COMPLETED',
        tasks: [task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-i - 1) })],
      }),
    );
  const keys = (sections: { key: string }[]) => sections.map((s) => s.key);

  it('shows only Up next, with its empty state, for an empty queue', () => {
    const sections = queueSections(buildQueueModel(queue([]), [schedule()], NOW), closed);

    expect(keys(sections)).toEqual(['upNext']);
    expect(sections[0].footer).toBe('empty');
  });

  it('orders Needs attention, Up next, Published, Skipped when each has items', () => {
    const items = [
      item('a', { tasks: [task({ status: 'FAILED' })] }),
      item('b'),
      ...published(1),
      item('s', { status: 'SKIPPED' }),
    ];

    const sections = queueSections(buildQueueModel(queue(items), [schedule()], NOW), closed);

    expect(keys(sections)).toEqual(['attention', 'upNext', 'published', 'skipped']);
    expect(sections[1].footer).toBeNull();
  });

  it('expands Published past the cap and offers to collapse it again', () => {
    const model = buildQueueModel(queue(published(7)), [schedule()], NOW);

    const [collapsed] = queueSections(model, closed).filter((s) => s.key === 'published');
    const [expanded] = queueSections(model, { ...closed, showAllPublished: true }).filter(
      (s) => s.key === 'published',
    );

    expect(collapsed.data).toHaveLength(5);
    expect(collapsed.footer).toBe('show-more');
    expect(expanded.data).toHaveLength(7);
    expect(expanded.footer).toBe('show-fewer');
  });

  it('lists skipped rows only while the disclosure is open', () => {
    const model = buildQueueModel(queue([item('s', { status: 'SKIPPED' })]), [schedule()], NOW);

    const shut = queueSections(model, closed).find((s) => s.key === 'skipped');
    const open = queueSections(model, { ...closed, skippedOpen: true }).find((s) => s.key === 'skipped');

    expect(shut?.data).toEqual([]);
    expect(ids(open?.data ?? [])).toEqual(['s']);
  });
});
