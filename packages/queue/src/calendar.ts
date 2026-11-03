import { DateTime } from 'luxon';
import type { Platform, PrismaClient, QueueStatus } from '@postpilot/db';

/**
 * - `published`: went out (history, placed by `publishedAt`).
 * - `inFlight`: the runner owns it — uploading, processing, or due and not yet
 *   claimed (or waiting out a retry). Fixed.
 * - `scheduled` / `held`: the live plan; held is waiting on a reconnect.
 */
export type CalendarState = 'published' | 'inFlight' | 'scheduled' | 'held';

/**
 * Which state a chip takes when its posts that day differ: in-flight first,
 * since `recomputeSchedule` leaves an item with in-flight work entirely alone
 * (so it can't be moved), then held, which needs the user's attention.
 */
const CHIP_PRECEDENCE: CalendarState[] = ['inFlight', 'held', 'scheduled', 'published'];

function stateOf(task: { status: string; scheduledAt: Date }, now: Date): CalendarState {
  if (task.status === 'PUBLISHED') return 'published';
  if (task.status === 'HELD') return 'held';
  if (task.status === 'SCHEDULED' && task.scheduledAt > now) return 'scheduled';
  return 'inFlight';
}

/** One post (a single platform's publish task) inside a calendar chip. */
export interface CalendarPost {
  taskId: string;
  platform: Platform;
  state: CalendarState;
  /** When it went out (published) or is due to (everything else). */
  at: Date;
  /** The live post, once published. */
  postUrl: string | null;
}

/** One queue item's posts on one local day. */
export interface CalendarChip {
  /** `${itemId}:${day}` — stable across refetches, for React keys. */
  key: string;
  /** The viewer-local day, `YYYY-MM-DD`. */
  day: string;
  itemId: string;
  mediaId: string;
  mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
  title: string | null;
  thumbnailUrl: string | null;
  state: CalendarState;
  /** The earliest post's time that day. */
  at: Date;
  posts: CalendarPost[];
}

export interface CalendarRange {
  from: Date;
  /** Exclusive. */
  to: Date;
  /** The viewer's IANA timezone, which decides the local day each post falls on. */
  timeZone: string;
}

export interface Calendar {
  /** The queue's own status, so a paused queue can say so. */
  status: QueueStatus;
  /** Soonest first. */
  chips: CalendarChip[];
}

/**
 * The queue on a month grid: one chip per queue item per viewer-local day,
 * carrying that day's platforms. Past days show what went out from items still
 * in the queue (placed by `publishedAt`); the rest is the materialized plan.
 * Read-only — the queue stays the only source of truth.
 */
export async function getCalendar(
  prisma: PrismaClient,
  queueId: string,
  range: CalendarRange,
  now: Date = new Date(),
): Promise<Calendar> {
  const queue = await prisma.queue.findUnique({ where: { id: queueId }, select: { status: true } });
  if (!queue) throw new Error(`Queue ${queueId} not found`);

  const inRange = { gte: range.from, lt: range.to };
  const tasks = await prisma.publishTask.findMany({
    where: {
      queueItem: { queueId },
      OR: [
        // History: what went out, from items still in the queue, by when it did.
        { status: 'PUBLISHED', publishedAt: inRange },
        // The plan and what the runner is working on, by when it's due.
        {
          status: { in: ['SCHEDULED', 'HELD', 'UPLOADING', 'PROCESSING'] },
          scheduledAt: inRange,
        },
      ],
    },
    select: {
      id: true,
      platform: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      platformPostUrl: true,
      queueItemId: true,
      queueItem: {
        select: {
          videoId: true,
          imageId: true,
          video: {
            select: {
              title: true,
              coverImageUrl: true,
              selectedThumbnail: { select: { url: true } },
            },
          },
          image: {
            select: {
              title: true,
              cdnUrl: true,
              sourceDeletedAt: true,
              _count: { select: { carouselItems: true } },
            },
          },
        },
      },
    },
  });

  const chips = new Map<string, CalendarChip>();
  for (const t of tasks) {
    const state = stateOf(t, now);
    const at = state === 'published' ? t.publishedAt! : t.scheduledAt;
    const day = DateTime.fromJSDate(at, { zone: range.timeZone }).toISODate()!;
    const key = `${t.queueItemId}:${day}`;
    let chip = chips.get(key);
    if (!chip) {
      const { video, image, videoId, imageId } = t.queueItem;
      const isImage = Boolean(imageId);
      chip = {
        key,
        day,
        itemId: t.queueItemId,
        mediaId: (imageId ?? videoId)!,
        mediaType: isImage
          ? image && image._count.carouselItems > 0
            ? 'CAROUSEL'
            : 'IMAGE'
          : 'VIDEO',
        title: isImage ? (image?.title ?? null) : (video?.title ?? null),
        thumbnailUrl: isImage
          ? image?.sourceDeletedAt
            ? null
            : (image?.cdnUrl ?? null)
          : (video?.coverImageUrl ?? video?.selectedThumbnail?.url ?? null),
        state,
        at,
        posts: [],
      };
      chips.set(key, chip);
    }
    chip.posts.push({
      taskId: t.id,
      platform: t.platform,
      state,
      at,
      postUrl: t.platformPostUrl,
    });
    if (at < chip.at) chip.at = at;
    if (CHIP_PRECEDENCE.indexOf(state) < CHIP_PRECEDENCE.indexOf(chip.state)) chip.state = state;
  }

  return {
    status: queue.status,
    chips: [...chips.values()].sort((a, b) => a.at.getTime() - b.at.getTime()),
  };
}
