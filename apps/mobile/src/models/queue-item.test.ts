import { describe, expect, it } from 'vitest';

import { buildQueueItemSheet, type QueueItemSheet } from './queue-item';
import { hoursFromNow, item, queue, task } from './queue.fixtures';

const posted = (d: Date) =>
  `Posted ${new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)}`;

const kinds = (sheet: QueueItemSheet | null) => sheet?.actions.map((a) => a.kind);
const labels = (sheet: QueueItemSheet | null) => sheet?.actions.map((a) => a.label);

describe('buildQueueItemSheet — actions by state', () => {
  it('offers Retry per failed or held task, then Skip, for an item that needs attention', () => {
    const failed = task({ id: 't_tt', status: 'FAILED', lastError: 'Token expired' });
    const held = task({ id: 't_ig', platform: 'INSTAGRAM', status: 'HELD' });
    const done = task({ id: 't_yt', platform: 'YOUTUBE', status: 'PUBLISHED', publishedAt: hoursFromNow(-1) });

    const sheet = buildQueueItemSheet(queue([item('a', { tasks: [failed, held, done] })]), 'a');

    expect(sheet?.state).toBe('attention');
    expect(sheet?.actions).toEqual([
      { kind: 'retry', key: 'retry:t_tt', taskId: 't_tt', label: 'Retry TikTok' },
      { kind: 'retry', key: 'retry:t_ig', taskId: 't_ig', label: 'Retry Instagram' },
      { kind: 'skip', key: 'skip', label: 'Skip' },
    ]);
  });

  it('offers Reconnect in Settings instead of Retry when the task needs a connection', () => {
    const held = task({ id: 't_ig', platform: 'INSTAGRAM', status: 'HELD', needsConnection: true });
    const failed = task({ id: 't_tt', status: 'FAILED', lastError: 'Connection removed', needsConnection: true });

    const sheet = buildQueueItemSheet(queue([item('a', { tasks: [failed, held] })]), 'a');

    expect(sheet?.actions).toEqual([
      { kind: 'reconnect', key: 'reconnect:t_tt', label: 'Reconnect TikTok in Settings' },
      { kind: 'reconnect', key: 'reconnect:t_ig', label: 'Reconnect Instagram in Settings' },
      { kind: 'skip', key: 'skip', label: 'Skip' },
    ]);
  });

  it('offers Publish now, with a confirm naming the item and platforms, then Skip, for Up next', () => {
    const upNext = item('a', {
      status: 'SCHEDULED',
      scheduledAt: hoursFromNow(2),
      postsTo: ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'],
    });

    const sheet = buildQueueItemSheet(queue([upNext]), 'a');

    expect(sheet?.state).toBe('upNext');
    expect(sheet?.actions).toEqual([
      {
        kind: 'publishNow',
        key: 'publishNow',
        label: 'Publish now',
        confirm: {
          title: 'Publish “Video a” now?',
          message: 'Posts to TikTok, Instagram and YouTube Shorts right away instead of waiting for its slot.',
          confirmLabel: 'Publish now',
        },
      },
      { kind: 'skip', key: 'skip', label: 'Skip' },
    ]);
  });

  it('names only the platforms a partly posted item has left in the Publish now confirm', () => {
    const partly = item('a', {
      status: 'SCHEDULED',
      postsTo: ['TIKTOK', 'INSTAGRAM'],
      tasks: [
        task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-2) }),
        task({ platform: 'INSTAGRAM', scheduledAt: hoursFromNow(5) }),
      ],
    });

    const [publishNow] = buildQueueItemSheet(queue([partly]), 'a')?.actions ?? [];

    expect(publishNow.kind === 'publishNow' && publishNow.confirm.message).toBe(
      'Posts to Instagram right away instead of waiting for its slot.',
    );
  });

  it('offers no actions for a published item', () => {
    const done = item('a', {
      status: 'COMPLETED',
      tasks: [task({ status: 'PUBLISHED', publishedAt: hoursFromNow(-1), postUrl: 'https://tiktok.com/v/1' })],
    });

    const sheet = buildQueueItemSheet(queue([done]), 'a');

    expect(sheet?.state).toBe('published');
    expect(sheet?.actions).toEqual([]);
  });

  it('offers Restore for a skipped item, even one that kept a failed task', () => {
    const skipped = item('a', {
      status: 'SKIPPED',
      tasks: [task({ status: 'FAILED', lastError: 'Token expired' })],
    });

    const sheet = buildQueueItemSheet(queue([skipped]), 'a');

    expect(sheet?.state).toBe('skipped');
    expect(kinds(sheet)).toEqual(['restore']);
    expect(labels(sheet)).toEqual(['Restore']);
  });
});

describe('buildQueueItemSheet — state label', () => {
  it('names the section the item sits in', () => {
    const items = [
      item('attention', { tasks: [task({ status: 'FAILED' })] }),
      item('upNext'),
      item('published', { status: 'COMPLETED', tasks: [task({ status: 'PUBLISHED' })] }),
      item('skipped', { status: 'SKIPPED' }),
    ];

    const stateLabels = items.map((it) => buildQueueItemSheet(queue(items), it.id)?.stateLabel);

    expect(stateLabels).toEqual(['Needs attention', 'Up next', 'Published', 'Skipped']);
  });
});

describe('buildQueueItemSheet — platforms', () => {
  it('shows each task’s status, its full error and its View post link', () => {
    const longError =
      'Instagram rejected the media: aspect ratio 1:1 is outside the allowed range for Reels.\nRe-export at 9:16.';
    const publishedAt = hoursFromNow(-3);
    const sheet = buildQueueItemSheet(
      queue([
        item('a', {
          status: 'COMPLETED',
          tasks: [
            task({ id: 't1', status: 'PUBLISHED', publishedAt, postUrl: 'https://tiktok.com/v/1' }),
            task({ id: 't2', platform: 'INSTAGRAM', status: 'FAILED', lastError: longError }),
            task({ id: 't3', platform: 'YOUTUBE', status: 'HELD', needsConnection: true }),
          ],
        }),
      ]),
      'a',
    );

    expect(sheet?.platforms).toEqual([
      {
        key: 't1',
        platform: 'TIKTOK',
        name: 'TikTok',
        status: posted(publishedAt),
        tone: 'muted',
        error: null,
        postUrl: 'https://tiktok.com/v/1',
      },
      {
        key: 't2',
        platform: 'INSTAGRAM',
        name: 'Instagram',
        status: 'Failed',
        tone: 'critical',
        error: longError,
        postUrl: null,
      },
      {
        key: 't3',
        platform: 'YOUTUBE',
        name: 'YouTube Shorts',
        status: 'On hold · needs reconnecting',
        tone: 'critical',
        error: null,
        postUrl: null,
      },
    ]);
  });

  it('lists the platforms an Up next item has no task for yet as waiting for a slot', () => {
    const sheet = buildQueueItemSheet(
      queue([
        item('a', {
          postsTo: ['TIKTOK', 'INSTAGRAM'],
          tasks: [task({ platform: 'TIKTOK', status: 'UPLOADING' })],
        }),
      ]),
      'a',
    );

    expect(sheet?.platforms.map((p) => [p.name, p.status])).toEqual([
      ['TikTok', 'Publishing now'],
      ['Instagram', 'Waiting for a slot'],
    ]);
  });

  it('carries the title and thumbnail, falling back to the filename', () => {
    const a = item('a');
    const sheet = buildQueueItemSheet(
      queue([{ ...a, media: { ...a.media, title: null } }]),
      'a',
    );

    expect(sheet?.title).toBe('a.mp4');
    expect(sheet?.thumbnailUrl).toBe('https://cdn.example.com/a.jpg');
  });

  it('is null for an item no longer in the queue', () => {
    expect(buildQueueItemSheet(queue([item('a')]), 'gone')).toBeNull();
  });
});
