import { PublishStatus, prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';
import { deleteObject, isStorageConfigured } from '@postpilot/storage';
import { SOURCE_RETENTION_DAYS } from '@postpilot/types';

/**
 * Opt-in source retention.
 *
 * The AI pipeline bills once per video at upload; storage bills every month for
 * as long as the file is held. Left alone a library only grows, so a creator's
 * storage cost tracks everything they have ever uploaded rather than what they
 * still have queued. This sweep bounds that: once a video has been published
 * and settled for SOURCE_RETENTION_DAYS, its source file is removed.
 *
 * What survives: the Video row, its metadata, thumbnail candidates, cover image
 * and post history. Only the source object is deleted — never the whole
 * per-video prefix — so the Media Library still renders the entry with its
 * thumbnail and links to the live posts. `storageKey` is left pointing at the
 * now-absent object as a record of what was stored; `sourceDeletedAt` is the
 * flag every other code path checks.
 *
 * This deletes user media, so it is opt-in per user
 * (`User.deleteSourceAfterPublish`) and never runs for anyone who hasn't turned
 * it on.
 */

/**
 * Publish states that mean a video is finished with a platform. Anything else —
 * pending, scheduled, uploading, processing, held, failed — counts as work
 * still outstanding and pins the source file.
 *
 * Deliberately expressed as "done" rather than "outstanding": a status added to
 * the enum later blocks deletion until someone decides otherwise, which is the
 * safe direction to be wrong in. FAILED blocks on purpose — a failed post is
 * exactly when a creator is most likely to retry, and retrying needs the source.
 */
const DONE_STATUSES: PublishStatus[] = [PublishStatus.PUBLISHED, PublishStatus.SKIPPED];

/** Default ceiling on how many sources one sweep will remove. */
const DEFAULT_LIMIT = 500;

export interface RetentionSweepResult {
  /** Videos that matched every condition and were attempted. */
  candidates: number;
  /** Sources successfully removed from storage. */
  deleted: number;
  /** Storage deletes that threw; left for the next sweep to retry. */
  failed: number;
  /** True when more candidates were waiting than the limit allowed. */
  more: boolean;
}

export interface RetentionSweepOptions {
  client?: PrismaClient;
  /** Overridable for tests; defaults to now. */
  now?: Date;
  /** Max sources to remove in one run. */
  limit?: number;
}

/**
 * Remove source files for videos that opted-in creators published more than
 * SOURCE_RETENTION_DAYS ago and have no publish work outstanding.
 *
 * Storage is deleted before the row is stamped. If the delete throws, nothing
 * is stamped and the video is retried on the next sweep. If the stamp fails
 * after a successful delete, the next sweep re-deletes a key that is already
 * gone — S3/R2 treat that as success — and stamps then. Both orderings are
 * safe; the reverse (stamp first) would strand a live file as unreachable.
 */
export async function sweepPublishedSources(
  options: RetentionSweepOptions = {},
): Promise<RetentionSweepResult> {
  const client = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();
  const limit = options.limit ?? DEFAULT_LIMIT;

  const empty: RetentionSweepResult = { candidates: 0, deleted: 0, failed: 0, more: false };

  if (!isStorageConfigured()) {
    console.warn('[retention] storage is not configured — skipping sweep');
    return empty;
  }

  const cutoff = new Date(now.getTime() - SOURCE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Take one extra row so we can report whether the backlog outran the limit
  // without running a second count query.
  const candidates = await client.video.findMany({
    where: {
      sourceDeletedAt: null,
      postedAt: { not: null, lte: cutoff },
      user: { deleteSourceAfterPublish: true },
      // No queue item for this video has a publish task still in flight. A
      // video posted to TikTok but still scheduled for YouTube keeps its
      // source until every platform is done with it.
      queueItems: {
        none: { publishTasks: { some: { status: { notIn: DONE_STATUSES } } } },
      },
    },
    select: { id: true, storageKey: true },
    orderBy: { postedAt: 'asc' },
    take: limit + 1,
  });

  const more = candidates.length > limit;
  const batch = more ? candidates.slice(0, limit) : candidates;
  if (batch.length === 0) return empty;

  let deleted = 0;
  let failed = 0;

  for (const video of batch) {
    // A blank key means the upload never completed; there is nothing to remove,
    // but the row still gets stamped so it stops being rescanned every night.
    if (video.storageKey) {
      try {
        await deleteObject(video.storageKey);
      } catch (err) {
        failed++;
        console.warn(
          `[retention] failed to delete source for video ${video.id}:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }
    }

    try {
      await client.video.update({
        where: { id: video.id },
        data: { sourceDeletedAt: now },
      });
      deleted++;
    } catch (err) {
      // Storage is already gone. Leaving the row unstamped is recoverable: the
      // next sweep re-deletes the absent key (a no-op) and stamps it then.
      failed++;
      console.warn(
        `[retention] deleted source for video ${video.id} but failed to stamp it:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[retention] swept ${batch.length} candidate(s): ${deleted} removed, ${failed} failed${
      more ? ' (more remaining)' : ''
    }`,
  );

  return { candidates: batch.length, deleted, failed, more };
}
