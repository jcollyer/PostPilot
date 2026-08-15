import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The retention sweep deletes user media, so the conditions guarding it matter
 * more than the deletion itself. These cover the ones that would quietly lose a
 * creator's work if they were wrong: the opt-in, the retention window, and —
 * the subtle one — that a video posted to one platform but still queued for
 * another keeps its source until every platform is finished with it.
 *
 * Also pinned here: storage is deleted before the row is stamped, so a failed
 * delete leaves the video to be retried rather than marking it gone.
 */

const deleteObject = vi.fn(async (_key: string) => undefined);
const findMany = vi.fn();
const update = vi.fn(async (_args: unknown) => ({}));

vi.mock('@postpilot/db', () => ({
  PublishStatus: {
    PENDING: 'PENDING',
    SCHEDULED: 'SCHEDULED',
    UPLOADING: 'UPLOADING',
    PROCESSING: 'PROCESSING',
    PUBLISHED: 'PUBLISHED',
    FAILED: 'FAILED',
    HELD: 'HELD',
    SKIPPED: 'SKIPPED',
  },
  prisma: {
    video: {
      findMany: (args: unknown) => findMany(args),
      update: (args: unknown) => update(args),
    },
  },
}));

vi.mock('@postpilot/storage', () => ({
  isStorageConfigured: () => true,
  deleteObject: (key: string) => deleteObject(key),
}));

const { sweepPublishedSources } = await import('./retention');

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  update.mockResolvedValue({});
  deleteObject.mockResolvedValue(undefined);
});

/** The `where` the sweep built on its most recent query. */
function lastWhere(): any {
  return findMany.mock.calls.at(-1)?.[0]?.where;
}

describe('sweepPublishedSources', () => {
  it('only considers videos whose owner opted in', async () => {
    await sweepPublishedSources();
    expect(lastWhere().user).toEqual({ deleteSourceAfterPublish: true });
  });

  it('only considers videos published before the retention cutoff', async () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    await sweepPublishedSources({ now });

    // 30 days back from `now`.
    expect(lastWhere().postedAt).toEqual({
      not: null,
      lte: new Date('2026-07-16T00:00:00.000Z'),
    });
  });

  it('skips videos that still have publish work outstanding', async () => {
    await sweepPublishedSources();

    // Only PUBLISHED and SKIPPED count as done — a video posted to TikTok but
    // still scheduled for YouTube must keep its source.
    expect(lastWhere().queueItems).toEqual({
      none: { publishTasks: { some: { status: { notIn: ['PUBLISHED', 'SKIPPED'] } } } },
    });
  });

  it('never reconsiders a video whose source is already gone', async () => {
    await sweepPublishedSources();
    expect(lastWhere().sourceDeletedAt).toBeNull();
  });

  it('deletes the source object and stamps the row', async () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    findMany.mockResolvedValue([{ id: 'v1', storageKey: 'u1/v1/source.mp4' }]);

    const result = await sweepPublishedSources({ now });

    expect(deleteObject).toHaveBeenCalledWith('u1/v1/source.mp4');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { sourceDeletedAt: now },
    });
    expect(result).toMatchObject({ candidates: 1, deleted: 1, failed: 0 });
  });

  it('deletes only the source key, never the whole video prefix', async () => {
    findMany.mockResolvedValue([{ id: 'v1', storageKey: 'u1/v1/source.mp4' }]);
    await sweepPublishedSources();

    // Thumbnails and the cover live under the same prefix and must survive so
    // the Media Library still renders the entry.
    for (const [key] of deleteObject.mock.calls) {
      expect(key).toBe('u1/v1/source.mp4');
    }
  });

  it('leaves the row unstamped when the storage delete fails', async () => {
    findMany.mockResolvedValue([{ id: 'v1', storageKey: 'u1/v1/source.mp4' }]);
    deleteObject.mockRejectedValue(new Error('network'));

    const result = await sweepPublishedSources();

    // Nothing stamped means the next sweep retries it, rather than recording a
    // file as deleted while it is still billing.
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 0, failed: 1 });
  });

  it('stamps a video with no storage key without calling storage', async () => {
    findMany.mockResolvedValue([{ id: 'v1', storageKey: '' }]);

    const result = await sweepPublishedSources();

    expect(deleteObject).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v1' } }));
    expect(result).toMatchObject({ deleted: 1 });
  });

  it('reports when more candidates remain than the limit allows', async () => {
    findMany.mockResolvedValue([
      { id: 'v1', storageKey: 'k1' },
      { id: 'v2', storageKey: 'k2' },
      { id: 'v3', storageKey: 'k3' },
    ]);

    const result = await sweepPublishedSources({ limit: 2 });

    // Takes limit + 1 to detect the overflow, then only processes `limit`.
    expect(findMany.mock.calls.at(-1)?.[0]?.take).toBe(3);
    expect(result).toMatchObject({ candidates: 2, deleted: 2, more: true });
    expect(deleteObject).toHaveBeenCalledTimes(2);
  });
});

describe('sweepPublishedSources without storage configured', () => {
  it('does nothing rather than scanning', async () => {
    vi.resetModules();
    vi.doMock('@postpilot/storage', () => ({
      isStorageConfigured: () => false,
      deleteObject,
    }));

    const { sweepPublishedSources: sweep } = await import('./retention');
    const result = await sweep();

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ candidates: 0, deleted: 0 });
  });
});
