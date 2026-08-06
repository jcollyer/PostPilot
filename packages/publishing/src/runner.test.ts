import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The claim is what stands between two concurrent runs and two copies of the
 * same video on the platform. A 6:30 slot is armed as a delayed run *and* swept
 * by the :00/:30 `publish-due` cron, so both fired on the same minute every day;
 * with nothing claiming the row, each ran the upload to completion.
 *
 * These exercise the contract the runner depends on: publish exactly once per
 * claim won, never when the claim is lost, and never leave a task wedged in
 * UPLOADING when the attempt didn't stick.
 */

const publish = vi.fn();
const poll = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();

let task: Record<string, any>;

vi.mock('@postpilot/db', () => ({
  Platform: { TIKTOK: 'TIKTOK', INSTAGRAM: 'INSTAGRAM', YOUTUBE: 'YOUTUBE' },
  Prisma: {},
  prisma: {
    publishTask: {
      findUnique: async () => task,
      findMany: async () => [{ status: 'PUBLISHED' }],
      updateMany: (args: any) => updateMany(args),
      update: (args: any) => update(args),
    },
    queueItem: { findUnique: async () => null, update: async () => ({}) },
    notification: { findFirst: async () => null, create: async () => ({}) },
    video: { findUnique: async () => null, update: async () => ({}) },
    image: { findUnique: async () => null, update: async () => ({}) },
  },
}));

vi.mock('@postpilot/connectors', () => ({
  getFreshAccessToken: async () => 'token',
  markNeedsReconnect: async () => undefined,
}));

vi.mock('@postpilot/storage', () => ({ getObjectBuffer: async () => Buffer.from('') }));

vi.mock('./adapters', () => ({
  getPublishAdapter: () => ({ platform: 'YOUTUBE', publish, poll }),
}));

const { processTask } = await import('./runner');

/** A YouTube task sitting at SCHEDULED with its slot already reached. */
function scheduledTask() {
  return {
    id: 'task_1',
    status: 'SCHEDULED',
    platform: 'YOUTUBE',
    connectionId: 'conn_1',
    attemptCount: 0,
    externalContainerId: null,
    platformPostId: null,
    platformPostUrl: null,
    queueItemId: 'item_1',
    connection: { id: 'conn_1', status: 'ACTIVE', externalAccountId: 'acct', userId: 'u1' },
    queueItem: {
      videoId: 'vid_1',
      imageId: null,
      image: null,
      video: {
        cdnUrl: 'https://cdn.test/v.mp4',
        storageKey: 'k',
        mimeType: 'video/mp4',
        fileSize: 10,
        durationSec: 15,
        title: 'T',
        caption: 'C',
        hashtags: [],
        platformMeta: [],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  task = scheduledTask();
  update.mockResolvedValue({});
  publish.mockResolvedValue({ state: 'PUBLISHED', platformPostId: 'yt_1' });
});

describe('processTask — claiming', () => {
  it('publishes when it wins the claim', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const result = await processTask('task_1');

    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('published');
  });

  it('does not publish when another run already holds the claim', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await processTask('task_1');

    // The whole point: the losing run must not touch the platform.
    expect(publish).not.toHaveBeenCalled();
    expect(result.outcome).toBe('skipped');
  });

  it('claims only from SCHEDULED or an expired UPLOADING lease', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await processTask('task_1');

    const where = updateMany.mock.calls[0]![0].where;
    expect(where.id).toBe('task_1');
    expect(where.OR).toEqual([
      { status: 'SCHEDULED' },
      { status: 'UPLOADING', nextAttemptAt: { lte: expect.any(Date) } },
    ]);
    // The claim doubles as a lease, so a killed run can be recovered from.
    expect(updateMany.mock.calls[0]![0].data.status).toBe('UPLOADING');
    expect(updateMany.mock.calls[0]![0].data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('releases the claim back to SCHEDULED when an attempt is retried', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    publish.mockRejectedValue(new Error('network blip'));

    const result = await processTask('task_1');

    expect(result.outcome).toBe('retry');
    // Left at UPLOADING it would show a spinner forever and the next attempt
    // would have to wait out the lease instead of the backoff.
    const retryWrite = update.mock.calls.at(-1)![0];
    expect(retryWrite.data.status).toBe('SCHEDULED');
    expect(retryWrite.data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('polls a PROCESSING task without re-claiming it', async () => {
    task = { ...scheduledTask(), status: 'PROCESSING', externalContainerId: 'c1' };
    poll.mockResolvedValue({ state: 'PROCESSING' });

    const result = await processTask('task_1');

    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('processing');
  });
});
