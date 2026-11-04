import { DateTime } from 'luxon';
import type { Platform, PrismaClient, QueueStatus } from '@postpilot/db';

import { planSlots, type SlotAssignment } from './planner';
import { activeConnections, planItemOf } from './scheduler';
import { generateSlots, type ScheduleRule } from './slots';

/**
 * - `published`: went out (history, placed by `publishedAt`).
 * - `inFlight`: the runner owns it — uploading, processing, or due and not yet
 *   claimed (or waiting out a retry). Fixed.
 * - `scheduled` / `held`: the live plan; held is waiting on a reconnect.
 * - `projected`: past the end of the live plan, what would go out if nothing
 *   changes. An estimate — no task exists for it.
 */
export type CalendarState = 'published' | 'inFlight' | 'scheduled' | 'held' | 'projected';

/**
 * Which state a chip takes when its posts that day differ: in-flight first,
 * since `recomputeSchedule` leaves an item with in-flight work entirely alone
 * (so it can't be moved), then held, which needs the user's attention. A real
 * task outranks a projected one.
 */
const CHIP_PRECEDENCE: CalendarState[] = [
  'inFlight',
  'held',
  'scheduled',
  'projected',
  'published',
];

function stateOf(task: { status: string; scheduledAt: Date }, now: Date): CalendarState {
  if (task.status === 'PUBLISHED') return 'published';
  if (task.status === 'HELD') return 'held';
  if (task.status === 'SCHEDULED' && task.scheduledAt > now) return 'scheduled';
  return 'inFlight';
}

/** One post (a single platform's publish) inside a calendar chip. */
export interface CalendarPost {
  /** The publish task behind it; `null` for a projected post, which has none. */
  taskId: string | null;
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

/** The queue item's media, as a chip shows it. */
const MEDIA_SELECT = {
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
} as const;

interface ItemMedia {
  videoId: string | null;
  imageId: string | null;
  video: {
    title: string | null;
    coverImageUrl: string | null;
    selectedThumbnail: { url: string | null } | null;
  } | null;
  image: {
    title: string | null;
    cdnUrl: string | null;
    sourceDeletedAt: Date | null;
    _count: { carouselItems: number };
  } | null;
}

function mediaOf({ video, image, videoId, imageId }: ItemMedia) {
  const isImage = Boolean(imageId);
  return {
    mediaId: (imageId ?? videoId)!,
    mediaType: isImage
      ? image && image._count.carouselItems > 0
        ? ('CAROUSEL' as const)
        : ('IMAGE' as const)
      : ('VIDEO' as const),
    title: isImage ? (image?.title ?? null) : (video?.title ?? null),
    thumbnailUrl: isImage
      ? image?.sourceDeletedAt
        ? null
        : (image?.cdnUrl ?? null)
      : (video?.coverImageUrl ?? video?.selectedThumbnail?.url ?? null),
  };
}

/** Items `recomputeSchedule` plans (SCHEDULED ones are reset to PENDING and re-planned). */
const IN_ROTATION = ['PENDING', 'SCHEDULED', 'PUBLISHING'] as const;

/**
 * The queue on a month grid: one chip per queue item per viewer-local day,
 * carrying that day's platforms. Past days show what went out from items still
 * in the queue (placed by `publishedAt`); then the materialized plan; then, to
 * the end of the queue, a projection of what would follow.
 *
 * Read-only — the queue stays the only source of truth, and nothing here is
 * written.
 */
export async function getCalendar(
  prisma: PrismaClient,
  queueId: string,
  range: CalendarRange,
  now: Date = new Date(),
): Promise<Calendar> {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    select: { status: true, userId: true },
  });
  if (!queue) throw new Error(`Queue ${queueId} not found`);

  const inRange = { gte: range.from, lt: range.to };
  const [tasks, items] = await Promise.all([
    prisma.publishTask.findMany({
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
        queueItem: { select: MEDIA_SELECT },
      },
    }),
    // Everything still to post, in queue order, for the projection.
    prisma.queueItem.findMany({
      where: { queueId, status: { in: [...IN_ROTATION] } },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        ...MEDIA_SELECT,
        video: { select: { ...MEDIA_SELECT.video.select, targetPlatforms: true } },
        publishTasks: { select: { platform: true, status: true, scheduledAt: true } },
      },
    }),
  ]);

  const chips = new Map<string, CalendarChip>();
  const add = (itemId: string, media: ItemMedia, post: CalendarPost) => {
    const day = DateTime.fromJSDate(post.at, { zone: range.timeZone }).toISODate()!;
    const key = `${itemId}:${day}`;
    let chip = chips.get(key);
    if (!chip) {
      chip = { key, day, itemId, ...mediaOf(media), state: post.state, at: post.at, posts: [] };
      chips.set(key, chip);
    }
    chip.posts.push(post);
    if (post.at < chip.at) chip.at = post.at;
    if (CHIP_PRECEDENCE.indexOf(post.state) < CHIP_PRECEDENCE.indexOf(chip.state)) {
      chip.state = post.state;
    }
  };

  for (const t of tasks) {
    const state = stateOf(t, now);
    add(t.queueItemId, t.queueItem, {
      taskId: t.id,
      platform: t.platform,
      state,
      at: state === 'published' ? t.publishedAt! : t.scheduledAt,
      postUrl: t.platformPostUrl,
    });
  }

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const projected = await projectBeyondPlan(prisma, { id: queueId, ...queue }, items, range, now);
  for (const { slot, itemId, platforms } of projected) {
    for (const platform of platforms) {
      add(itemId, itemsById.get(itemId)!, {
        taskId: null,
        platform,
        state: 'projected',
        at: slot.at,
        postUrl: null,
      });
    }
  }

  return {
    status: queue.status,
    chips: [...chips.values()].sort((a, b) => a.at.getTime() - b.at.getTime()),
  };
}

/**
 * What would go out after the materialized plan, inside `range`: the shared
 * planner run over range-sized slots, writing nothing.
 *
 * It follows `recomputeSchedule`'s rules so the two agree:
 * - It starts where the plan ends: after the latest planned task, or from now
 *   when there is none. A paused queue has no plan, so it always starts now
 *   ("would post if resumed now").
 * - Platforms an item already has a task for are left out, so it continues the
 *   plan rather than repeating it, and it runs dry with the queue.
 * - Items the runner is working on are left alone, as the scheduler leaves
 *   them; their remaining platforms get planned once that work settles.
 */
async function projectBeyondPlan(
  prisma: PrismaClient,
  queue: { id: string; userId: string; status: QueueStatus },
  items: {
    id: string;
    imageId: string | null;
    video: { targetPlatforms: Platform[] } | null;
    publishTasks: { platform: Platform; status: string; scheduledAt: Date }[];
  }[],
  range: CalendarRange,
  now: Date,
): Promise<SlotAssignment[]> {
  // The scheduler's own test for in-flight work: uploading, or due and not yet
  // claimed (or waiting out a retry).
  const settled = items.filter(
    (item) =>
      !item.publishTasks.some(
        (t) => t.status === 'UPLOADING' || (t.status === 'SCHEDULED' && t.scheduledAt <= now),
      ),
  );

  let start = now;
  if (queue.status !== 'PAUSED') {
    for (const item of settled) {
      for (const t of item.publishTasks) {
        if ((t.status === 'SCHEDULED' || t.status === 'HELD') && t.scheduledAt > start) {
          start = t.scheduledAt;
        }
      }
    }
  }
  if (settled.length === 0 || range.to <= start) return [];

  const [schedules, connected] = await Promise.all([
    prisma.schedule.findMany({
      where: { queueId: queue.id, isActive: true },
      select: { id: true, timezone: true, daysOfWeek: true, times: true, platforms: true },
    }),
    activeConnections(prisma, queue.userId),
  ]);
  if (schedules.length === 0) return [];
  const connectedPlatforms = [...connected.keys()];

  // Every slot from the plan's end to the end of the range. The walk has to
  // start at the plan's end even when the range is months later, because what
  // lands in March depends on everything handed out before it. A day of slack
  // covers schedule time zones ahead of the instant `start` falls on.
  const horizonDays = Math.ceil((range.to.getTime() - start.getTime()) / DAY_MS) + 1;
  const slots = generateSlots(schedules as ScheduleRule[], start, {
    horizonDays,
    max: Number.POSITIVE_INFINITY,
  }).filter((s) => s.at < range.to);

  // A FAILED task counts as covered, as it does for the scheduler until its
  // next pass drops it; that pass plans the platform again, near the front.
  const plan = planSlots(
    settled.map((item) => planItemOf(item, connectedPlatforms)),
    slots,
    connectedPlatforms,
  );

  return plan.filter((a) => a.slot.at >= range.from);
}

const DAY_MS = 86_400_000;
