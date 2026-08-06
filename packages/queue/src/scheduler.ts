import { type PrismaClient, Platform } from '@postpilot/db';
import { tasks } from '@trigger.dev/sdk';

import { generateSlots, type ScheduleRule, type Slot } from './slots';

/**
 * Arm the `publish-task` run for the moment this task is actually due, so we
 * don't need a minute-by-minute cron discovering it. Neon scales its compute to
 * zero after 5 minutes idle; a polling cron never let that happen, which is what
 * made the CU-hour bill run away. Delayed triggers give the same publish
 * latency with an idle database in between.
 *
 * Strictly best-effort: a missing TRIGGER_SECRET_KEY (local dev) or a transient
 * trigger error must never fail queue scheduling. The `publish-due` sweep at
 * :00/:30 is the reliable floor.
 */
const ARM_HORIZON_MS = 90 * 60_000;

async function armPublish(taskId: string, at: Date) {
  // Only arm what's due soon. `recomputeSchedule` clears and recreates future
  // SCHEDULED tasks, and the queue-reschedule cron runs hourly — so arming a
  // slot days out just leaves a delayed run pointed at a row that no longer
  // exists, and every one of those strays wakes the Neon compute for a minimum
  // 5-minute idle window to discover it has nothing to do. A 90-minute horizon
  // overlaps the hourly reschedule comfortably: anything further out gets armed
  // by a later pass, and the :00/:30 sweep backstops either way.
  if (at.getTime() - Date.now() > ARM_HORIZON_MS) return;

  try {
    await tasks.trigger(
      'publish-task',
      { taskId },
      {
        delay: at,
        // Rescheduling a queue can re-derive the same slot; collapse repeats.
        idempotencyKey: ['publish-task', taskId, String(at.getTime())],
        idempotencyKeyTTL: '24h',
      },
    );
  } catch {
    // Swallow — the publish-due sweep will pick this up.
  }
}

/** Images/carousels are Instagram-only, so they carry an explicit IG target. */
const IMAGE_TARGET_PLATFORMS: Platform[] = [Platform.INSTAGRAM];

/** Ensure the user has a Queue row (1:1) and return it. */
export async function ensureQueue(prisma: PrismaClient, userId: string) {
  return prisma.queue.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** ACTIVE connection id per platform (first wins if somehow duplicated). */
async function activeConnections(
  prisma: PrismaClient,
  userId: string,
): Promise<Map<Platform, string>> {
  const conns = await prisma.platformConnection.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, platform: true },
  });
  const map = new Map<Platform, string>();
  for (const c of conns) if (!map.has(c.platform)) map.set(c.platform, c.id);
  return map;
}

/** Resolve a slot's target platforms: explicit list, else all connected. */
function resolvePlatforms(slot: Slot, connected: Platform[]): Platform[] {
  return slot.platforms.length > 0 ? slot.platforms : connected;
}

/**
 * The platforms a queue item should actually publish to in a given slot.
 *
 * Combines two scopes:
 *   - the slot's scope (its schedule's `platforms`, or all connected when empty)
 *   - the video's own `targetPlatforms` (empty = "all connected", the default)
 *
 * When the video names explicit targets we honor exactly those (intersected
 * with the slot's scope if the slot is platform-specific), so a platform the
 * user picked but hasn't connected still yields a HELD task and stays visible
 * rather than being silently dropped. When the video leaves it default, we fall
 * back to the slot's resolved scope — i.e. the previous cross-post behavior.
 */
function platformsForItem(
  slot: Slot,
  connectedPlatforms: Platform[],
  videoTargets: Platform[],
): Platform[] {
  if (videoTargets.length === 0) {
    return resolvePlatforms(slot, connectedPlatforms);
  }
  // Slot scoped to specific platforms: keep only targets the slot allows.
  if (slot.platforms.length > 0) {
    return videoTargets.filter((p) => slot.platforms.includes(p));
  }
  // Slot covers "all": the video's explicit choice wins outright.
  return videoTargets;
}

/**
 * Recompute the schedule for a queue. Idempotent: clears future SCHEDULED tasks
 * (leaving in-flight/published/held-by-publishing ones alone), then walks the
 * queue in position order, assigning each PENDING item to the next usable slot
 * and creating one PublishTask per target platform (cross-post). A task whose
 * platform has no ACTIVE connection is created HELD so the UI can flag it.
 *
 * No-ops (just clears) when the queue is PAUSED or has no active schedules.
 * Pure DB work — safe to call from a request handler or the cron worker.
 */
export async function recomputeSchedule(
  prisma: PrismaClient,
  queueId: string,
): Promise<{ scheduledItems: number; tasks: number }> {
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) return { scheduledItems: 0, tasks: 0 };

  const now = new Date();

  // Work the runner already owns, which this recompute must not disturb:
  //
  //   - UPLOADING: claimed and actively pushing to the platform right now.
  //   - past-due SCHEDULED: either about to be claimed, or waiting out a retry
  //     backoff (`handleError` releases the claim back to SCHEDULED).
  //
  // Deleting either destroys the only record of an upload that may already have
  // reached the platform — the item drops back to PENDING, gets re-slotted, and
  // publishes a duplicate. So the recompute leaves these items entirely alone:
  // tasks not dropped, status not reset, not re-slotted below. The runner owns
  // them until they reach a terminal state, and the publish-due sweep picks up
  // any whose run was lost.
  const inFlight = await prisma.publishTask.findMany({
    where: {
      queueItem: { queueId },
      OR: [{ status: 'UPLOADING' }, { status: 'SCHEDULED', scheduledAt: { lte: now } }],
    },
    select: { queueItemId: true },
    distinct: ['queueItemId'],
  });
  const inFlightItemIds = inFlight.map((t) => t.queueItemId);
  const settled = inFlightItemIds.length > 0 ? { id: { notIn: inFlightItemIds } } : {};

  // 1. Clear the future plan so this recompute is authoritative.
  //
  // SCHEDULED/HELD tasks that haven't been reached yet are the not-yet-run plan
  // — safe to drop and rebuild from scratch.
  await prisma.publishTask.deleteMany({
    where: { status: { in: ['SCHEDULED', 'HELD'] }, queueItem: { queueId, ...settled } },
  });
  // Also drop FAILED tasks, but ONLY for items still in rotation (PENDING or
  // SCHEDULED — i.e. the ones re-materialized below). Without this, a FAILED
  // task (e.g. a rejected TikTok publish) survives the rebuild while its item —
  // kept non-terminal by a sibling task on another platform — is reset to
  // PENDING and given a *second* task for the same platform. That left two
  // chips per platform on one item (a red FAILED chip alongside a fresh gray
  // one). Deleting the stale FAILED task lets the fresh one re-attempt cleanly.
  //
  // Deliberately scoped: PROCESSING (in-flight) and PUBLISHED (history) tasks
  // are never touched, and neither are tasks on COMPLETED/SKIPPED/CANCELED
  // items, so genuine failure history on finished items is preserved.
  await prisma.publishTask.deleteMany({
    where: {
      status: 'FAILED',
      queueItem: { queueId, status: { in: ['PENDING', 'SCHEDULED'] }, ...settled },
    },
  });
  await prisma.queueItem.updateMany({
    where: { queueId, status: 'SCHEDULED', ...settled },
    data: { status: 'PENDING', scheduledAt: null },
  });

  // Settle items stranded mid-rollup. An item's status is rolled up only when
  // one of its tasks is processed, so an item left PUBLISHING whose last
  // non-terminal task was cleared by a recompute never gets a second look: it
  // sits in the active queue indefinitely, showing a green "posted" chip that
  // never moves to Completed. Finish the rollup here, where the plan is being
  // rebuilt anyway. Items with no tasks at all are left alone — there is nothing
  // to conclude from an empty set.
  const maybeStranded = await prisma.queueItem.findMany({
    where: { queueId, status: 'PUBLISHING' },
    select: { id: true, publishTasks: { select: { status: true } } },
  });
  const isTerminal = (s: string) => s === 'PUBLISHED' || s === 'FAILED' || s === 'SKIPPED';
  const strandedIds = maybeStranded
    .filter((i) => i.publishTasks.length > 0 && i.publishTasks.every((t) => isTerminal(t.status)))
    .map((i) => i.id);
  if (strandedIds.length > 0) {
    await prisma.queueItem.updateMany({
      where: { id: { in: strandedIds } },
      data: { status: 'COMPLETED' },
    });
  }

  if (queue.status === 'PAUSED') return { scheduledItems: 0, tasks: 0 };

  const schedules = await prisma.schedule.findMany({
    where: { queueId, isActive: true },
    select: { id: true, timezone: true, daysOfWeek: true, times: true, platforms: true },
  });
  if (schedules.length === 0) return { scheduledItems: 0, tasks: 0 };

  const connected = await activeConnections(prisma, queue.userId);
  const connectedPlatforms = [...connected.keys()];

  const slots = generateSlots(schedules as ScheduleRule[], now).filter(
    (s) => resolvePlatforms(s, connectedPlatforms).length > 0,
  );
  if (slots.length === 0) return { scheduledItems: 0, tasks: 0 };

  const items = await prisma.queueItem.findMany({
    where: { queueId, status: 'PENDING' },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      imageId: true,
      video: { select: { targetPlatforms: true } },
    },
  });

  // An image/carousel item targets Instagram only; a video uses its own
  // targetPlatforms (empty = "all connected").
  const targetsOf = (item: (typeof items)[number]): Platform[] =>
    item.imageId ? IMAGE_TARGET_PLATFORMS : (item.video?.targetPlatforms ?? []);

  let scheduledItems = 0;
  let tasks = 0;

  // Greedy assignment: walk slots in time order and give each to the
  // earliest-positioned not-yet-scheduled item that can publish to ≥1 platform
  // in that slot. This keeps queue order in the common case (one all-platforms
  // schedule -> every item is compatible, so it degrades to 1:1 by index) while
  // letting a platform-scoped item skip a slot it can't use rather than burning
  // it on a no-op.
  const used = new Set<string>();

  for (const slot of slots) {
    let chosen: { id: string; platforms: Platform[] } | null = null;
    for (const item of items) {
      if (used.has(item.id)) continue;
      const platforms = platformsForItem(slot, connectedPlatforms, targetsOf(item));
      if (platforms.length === 0) continue;
      chosen = { id: item.id, platforms };
      break;
    }
    if (!chosen) continue;

    used.add(chosen.id);
    await prisma.queueItem.update({
      where: { id: chosen.id },
      data: { status: 'SCHEDULED', scheduledAt: slot.at },
    });
    scheduledItems++;

    for (const platform of chosen.platforms) {
      const connectionId = connected.get(platform) ?? null;
      const created = await prisma.publishTask.create({
        data: {
          queueItemId: chosen.id,
          platform,
          connectionId,
          status: connectionId ? 'SCHEDULED' : 'HELD',
          scheduledAt: slot.at,
        },
        select: { id: true },
      });
      // HELD tasks have no connection to publish through, so there's nothing to
      // arm — they're resolved by a reconnect, which reschedules the queue.
      if (connectionId) await armPublish(created.id, slot.at);
      tasks++;
    }

    if (used.size >= items.length) break;
  }

  return { scheduledItems, tasks };
}

/** Recompute the publish plan for every ACTIVE queue (cron entrypoint). */
export async function rescheduleAllActiveQueues(
  client: PrismaClient,
): Promise<{ queues: number; scheduledItems: number; tasks: number }> {
  const queues = await client.queue.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  let scheduledItems = 0;
  let tasks = 0;
  for (const q of queues) {
    const r = await recomputeSchedule(client, q.id);
    scheduledItems += r.scheduledItems;
    tasks += r.tasks;
  }
  return { queues: queues.length, scheduledItems, tasks };
}

export interface UpcomingPost {
  taskId: string;
  queueItemId: string;
  /** The queued media id — a video id or an image/carousel id. */
  mediaId: string;
  mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
  title: string | null;
  thumbnailUrl: string | null;
  platform: Platform;
  scheduledAt: Date;
  status: string;
  needsConnection: boolean;
}

/** Upcoming scheduled (and held) posts for a queue, soonest first. */
export async function getUpcoming(
  prisma: PrismaClient,
  queueId: string,
  opts?: { limit?: number },
): Promise<UpcomingPost[]> {
  const tasks = await prisma.publishTask.findMany({
    where: {
      queueItem: { queueId },
      status: { in: ['SCHEDULED', 'HELD'] },
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
    take: opts?.limit ?? 50,
    select: {
      id: true,
      status: true,
      platform: true,
      scheduledAt: true,
      connectionId: true,
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
              _count: { select: { carouselItems: true } },
            },
          },
        },
      },
    },
  });

  return tasks.map((t) => {
    const { video, image, videoId, imageId } = t.queueItem;
    const isImage = Boolean(imageId);
    return {
      taskId: t.id,
      queueItemId: t.queueItemId,
      mediaId: (imageId ?? videoId)!,
      mediaType: isImage
        ? ((image && image._count.carouselItems > 0 ? 'CAROUSEL' : 'IMAGE') as 'CAROUSEL' | 'IMAGE')
        : ('VIDEO' as const),
      title: isImage ? (image?.title ?? null) : (video?.title ?? null),
      thumbnailUrl: isImage
        ? (image?.cdnUrl ?? null)
        : (video?.coverImageUrl ?? video?.selectedThumbnail?.url ?? null),
      platform: t.platform,
      scheduledAt: t.scheduledAt,
      status: t.status,
      needsConnection: t.status === 'HELD' || !t.connectionId,
    };
  });
}
