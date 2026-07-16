import { getConnectionOverview } from '@postpilot/connectors';
import { computeQueueHealth } from '@postpilot/notifications';
import { ensureQueue } from '@postpilot/queue';

import { protectedProcedure, router } from '../trpc';

/** Lead time before the queue empties at which we nudge the user to upload. */
const RECOMMEND_UPLOAD_LEAD_DAYS = 14;

const videoSelect = {
  title: true,
  coverImageUrl: true,
  selectedThumbnail: { select: { url: true } },
} as const;

const imageSelect = {
  title: true,
  cdnUrl: true,
} as const;

/** The media on a queue item is either a video or an image; pick either. */
const queueItemMediaSelect = {
  select: { video: { select: videoSelect }, image: { select: imageSelect } },
} as const;

function mediaTitle(item: {
  video: { title: string | null } | null;
  image: { title: string | null } | null;
}): string | null {
  return item.video?.title ?? item.image?.title ?? null;
}

function mediaThumb(item: {
  video: { coverImageUrl: string | null; selectedThumbnail: { url: string | null } | null } | null;
  image: { cdnUrl: string | null } | null;
}): string | null {
  if (item.video) return item.video.coverImageUrl ?? item.video.selectedThumbnail?.url ?? null;
  return item.image?.cdnUrl ?? null;
}

/**
 * The minimal dashboard the brief calls for — queue remaining, days of content
 * left, next scheduled post, last published, and connected-account health. No
 * analytics, no charts. Shared by the web home page and the mobile monitor.
 */
export const dashboardRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const queue = await ensureQueue(ctx.prisma, ctx.userId);
    const health = await computeQueueHealth(ctx.prisma, queue.id);

    const recommendedUploadBy =
      health.estimatedEmptyDate != null
        ? new Date(health.estimatedEmptyDate.getTime() - RECOMMEND_UPLOAD_LEAD_DAYS * 86_400_000)
        : null;

    const [nextTask, lastTask, readyVideos, connections] = await Promise.all([
      ctx.prisma.publishTask.findFirst({
        where: {
          queueItem: { queueId: queue.id },
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        select: {
          platform: true,
          scheduledAt: true,
          queueItem: queueItemMediaSelect,
        },
      }),
      ctx.prisma.publishTask.findFirst({
        where: { queueItem: { queueId: queue.id }, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: {
          platform: true,
          publishedAt: true,
          platformPostUrl: true,
          queueItem: queueItemMediaSelect,
        },
      }),
      ctx.prisma.video.count({ where: { userId: ctx.userId, status: 'READY' } }),
      getConnectionOverview(ctx.userId),
    ]);

    return {
      queueStatus: queue.status,
      health: {
        remaining: health.remaining,
        postsPerDay: health.postsPerDay,
        daysRemaining: health.daysRemaining,
        estimatedEmptyDate: health.estimatedEmptyDate,
        recommendedUploadBy,
      },
      readyVideos,
      nextPost: nextTask
        ? {
            platform: nextTask.platform,
            scheduledAt: nextTask.scheduledAt,
            title: mediaTitle(nextTask.queueItem),
            thumbnailUrl: mediaThumb(nextTask.queueItem),
          }
        : null,
      lastPublished: lastTask
        ? {
            platform: lastTask.platform,
            publishedAt: lastTask.publishedAt,
            postUrl: lastTask.platformPostUrl,
            title: mediaTitle(lastTask.queueItem),
            thumbnailUrl: mediaThumb(lastTask.queueItem),
          }
        : null,
      connections,
    };
  }),
});
