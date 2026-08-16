import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';
import { deletePrefix, imagePrefix, isStorageConfigured, videoPrefix } from '@postpilot/storage';

/**
 * Reclaim quota from uploads that never finished.
 *
 * `initUpload` writes the media row — with its declared `fileSize` — before a
 * single byte is transferred, which is what lets the cap be checked up front.
 * The cost is that a closed tab or a dead connection leaves a row stuck in
 * UPLOADING, still counted against the user's storage forever. Without this
 * sweep a creator can quietly lose their whole allowance to abandoned uploads
 * and have no way to get it back.
 *
 * Excluding UPLOADING rows from the cap instead would be simpler and wrong: it
 * would let anyone exceed their plan indefinitely by never calling
 * `completeUpload`.
 *
 * NOTE: this removes rows and any objects already written under their prefix.
 * It cannot cancel the underlying multipart uploads, whose ids are handed to
 * the client and never stored. Set a bucket lifecycle rule to abort incomplete
 * multipart uploads (R2 and S3 both support it) so those parts aren't billed.
 */

/**
 * How long an upload may sit unfinished before it's treated as abandoned.
 * Generous on purpose — a 10 GB file on a slow connection is a long upload, and
 * deleting someone's in-progress work is far worse than carrying a stale row
 * for another day.
 */
export const ABANDONED_UPLOAD_HOURS = Number(process.env.ABANDONED_UPLOAD_HOURS ?? 24);

export interface AbandonedSweepResult {
  videos: number;
  images: number;
  /** Bytes returned to users' allowances. */
  bytesReclaimed: number;
}

export interface AbandonedSweepOptions {
  client?: PrismaClient;
  now?: Date;
  limit?: number;
}

/**
 * Delete media rows stuck in UPLOADING past the cutoff, along with whatever
 * was written under their storage prefix.
 */
export async function sweepAbandonedUploads(
  options: AbandonedSweepOptions = {},
): Promise<AbandonedSweepResult> {
  const prisma = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();
  const limit = options.limit ?? 500;
  const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);

  const result: AbandonedSweepResult = { videos: 0, images: 0, bytesReclaimed: 0 };

  const [videos, images] = await Promise.all([
    prisma.video.findMany({
      where: { status: 'UPLOADING', createdAt: { lt: cutoff } },
      select: { id: true, userId: true, fileSize: true },
      take: limit,
    }),
    prisma.image.findMany({
      where: { status: 'UPLOADING', createdAt: { lt: cutoff } },
      select: { id: true, userId: true, fileSize: true },
      take: limit,
    }),
  ]);

  if (videos.length === 0 && images.length === 0) return result;

  for (const video of videos) {
    try {
      if (isStorageConfigured()) {
        await deletePrefix(videoPrefix(video.userId, video.id)).catch(() => {});
      }
      await prisma.video.delete({ where: { id: video.id } });
      result.videos++;
      result.bytesReclaimed += Number(video.fileSize ?? 0);
    } catch (err) {
      console.warn(
        `[usage] could not clear abandoned video ${video.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  for (const image of images) {
    try {
      if (isStorageConfigured()) {
        await deletePrefix(imagePrefix(image.userId, image.id)).catch(() => {});
      }
      await prisma.image.delete({ where: { id: image.id } });
      result.images++;
      result.bytesReclaimed += Number(image.fileSize ?? 0);
    } catch (err) {
      console.warn(
        `[usage] could not clear abandoned image ${image.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[usage] cleared ${result.videos} abandoned video(s) and ${result.images} image(s), ` +
      `reclaiming ${(result.bytesReclaimed / 1024 ** 3).toFixed(2)} GB`,
  );

  return result;
}
