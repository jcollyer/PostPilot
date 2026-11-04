import { DateTime } from 'luxon';
import type { Platform, PrismaClient, QueueStatus } from '@postpilot/db';

import {
  freshPlanItems,
  heldSlots,
  IN_ROTATION,
  isInFlight,
  planUntil,
  type ItemState,
} from './fresh-plan';
import type { SlotAssignment } from './planner';
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
  /**
   * `moveToSlot` would take it: a post still waiting (scheduled, held or
   * projected) on an item the runner isn't working on. An item mid-upload is
   * left alone by the scheduler, so none of its chips move until that settles.
   */
  movable: boolean;
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

/**
 * A future slot time in range, and per platform it posts to, the item holding
 * it — what a drop there displaces. Read from the plan as a fresh recompute
 * would write it, so it agrees with `moveToSlot`.
 */
export interface CalendarSlot {
  at: Date;
  /** The viewer-local day, `YYYY-MM-DD`. */
  day: string;
  /** Platform -> holder item id; `null` once the queue has run out for it. */
  holders: Partial<Record<Platform, string | null>>;
  /**
   * Past the live plan (or the queue is paused): nothing would be written for
   * it yet, so its posts are an estimate.
   */
  projected: boolean;
}

export interface Calendar {
  /** The queue's own status, so a paused queue can say so. */
  status: QueueStatus;
  /** Soonest first. */
  chips: CalendarChip[];
  /** Soonest first; only slots still to come. */
  slots: CalendarSlot[];
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
        status: true,
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
      chip = {
        key,
        day,
        itemId,
        ...mediaOf(media),
        state: post.state,
        movable: false,
        at: post.at,
        posts: [],
      };
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

  const [schedules, connected] = await Promise.all([
    prisma.schedule.findMany({
      where: { queueId, isActive: true },
      select: { id: true, timezone: true, daysOfWeek: true, times: true, platforms: true },
    }) as Promise<ScheduleRule[]>,
    activeConnections(prisma, queue.userId),
  ]);
  const connectedPlatforms = [...connected.keys()];

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const projected = projectBeyondPlan(
    queue.status,
    items,
    schedules,
    connectedPlatforms,
    range,
    now,
  );
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

  const settled = new Set(items.filter((i) => !isInFlight(i, now)).map((i) => i.id));
  for (const chip of chips.values()) {
    chip.movable =
      (chip.state === 'scheduled' || chip.state === 'held' || chip.state === 'projected') &&
      settled.has(chip.itemId);
  }

  return {
    status: queue.status,
    chips: [...chips.values()].sort((a, b) => a.at.getTime() - b.at.getTime()),
    slots: slotsInRange(queue.status, items, schedules, connectedPlatforms, range, now),
  };
}

/** The future slots in `range` and who holds each, per platform. */
function slotsInRange(
  status: QueueStatus,
  items: ItemState[],
  schedules: ScheduleRule[],
  connectedPlatforms: Platform[],
  range: CalendarRange,
  now: Date,
): CalendarSlot[] {
  if (range.to <= now) return [];
  const planItems = freshPlanItems(items, connectedPlatforms, now);
  const fresh = planUntil(planItems, schedules, connectedPlatforms, now, range.to);
  // The slots `recomputeSchedule` materializes: its own horizon and cap.
  const live = new Set(
    status === 'PAUSED' ? [] : generateSlots(schedules, now).map((s) => s.at.getTime()),
  );
  return heldSlots(fresh, planItems, connectedPlatforms)
    .filter((s) => s.at >= range.from)
    .map((s) => ({
      at: s.at,
      day: DateTime.fromJSDate(s.at, { zone: range.timeZone }).toISODate()!,
      holders: Object.fromEntries(s.holders),
      projected: !live.has(s.at.getTime()),
    }));
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
function projectBeyondPlan(
  status: QueueStatus,
  items: ItemState[],
  schedules: ScheduleRule[],
  connectedPlatforms: Platform[],
  range: CalendarRange,
  now: Date,
): SlotAssignment[] {
  const settled = items.filter((item) => !isInFlight(item, now));

  let start = now;
  if (status !== 'PAUSED') {
    for (const item of settled) {
      for (const t of item.publishTasks) {
        if ((t.status === 'SCHEDULED' || t.status === 'HELD') && t.scheduledAt > start) {
          start = t.scheduledAt;
        }
      }
    }
  }
  if (settled.length === 0 || range.to <= start || schedules.length === 0) return [];

  // Every slot from the plan's end to the end of the range. The walk has to
  // start at the plan's end even when the range is months later, because what
  // lands in March depends on everything handed out before it.
  //
  // A FAILED task counts as covered, as it does for the scheduler until its
  // next pass drops it; that pass plans the platform again, near the front.
  const { plan } = planUntil(
    settled.map((item) => planItemOf(item, connectedPlatforms)),
    schedules,
    connectedPlatforms,
    start,
    range.to,
  );

  return plan.filter((a) => a.slot.at >= range.from);
}
