import { type PrismaClient, Platform } from '@postpilot/db';
import { tasks } from '@trigger.dev/sdk';

import { planSlots } from './planner';
import { generateSlots, type ScheduleRule } from './slots';

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

/**
 * Every platform an item ultimately wants a task for, independent of any one
 * slot: its explicit targets, or all currently-connected platforms when left on
 * the default. Assignment works this set down as it hands the item slots.
 *
 * Explicit targets are kept even when the platform isn't connected, so one the
 * user deliberately picked still materializes as a HELD task rather than
 * vanishing. A default-target item means exactly "wherever I'm connected", so it
 * never invents a task for a platform the user never chose — which is also what
 * the `postsTo` indicator in the queue UI already promises.
 */
function wantedPlatforms(connectedPlatforms: Platform[], videoTargets: Platform[]): Platform[] {
  return videoTargets.length > 0 ? videoTargets : connectedPlatforms;
}

/** An image/carousel targets Instagram only; a video uses its own targets. */
function targetsOf(item: {
  imageId: string | null;
  video: { targetPlatforms: Platform[] } | null;
}): Platform[] {
  return item.imageId ? IMAGE_TARGET_PLATFORMS : (item.video?.targetPlatforms ?? []);
}

/**
 * Recompute the schedule for a queue. Idempotent: clears future SCHEDULED tasks
 * (leaving in-flight/published/held-by-publishing ones alone), then writes the
 * plan from `planSlots`: each slot, in time order, goes to the earliest-positioned
 * item that still needs a task for one of that slot's platforms. A task whose
 * platform has no ACTIVE connection is created HELD so the UI can flag it.
 *
 * An item can span several slots — one per schedule scope it needs. That is what
 * makes a video targeting all three platforms take TikTok + YouTube from a
 * TikTok/YouTube schedule and Instagram from a separate Instagram schedule.
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

  // Needed below by the stranded check, which runs even for a paused queue.
  const connected = await activeConnections(prisma, queue.userId);
  const connectedPlatforms = [...connected.keys()];

  // Settle items stranded mid-rollup. An item's status is rolled up only when
  // one of its tasks is processed, so an item left PUBLISHING whose last
  // non-terminal task was cleared by a recompute never gets a second look: it
  // sits in the active queue indefinitely, showing a green "posted" chip that
  // never moves to Completed. Finish the rollup here, where the plan is being
  // rebuilt anyway. Items with no tasks at all are left alone — there is nothing
  // to conclude from an empty set.
  const maybeStranded = await prisma.queueItem.findMany({
    where: { queueId, status: 'PUBLISHING' },
    select: {
      id: true,
      imageId: true,
      video: { select: { targetPlatforms: true } },
      publishTasks: { select: { status: true, platform: true } },
    },
  });
  const isTerminal = (s: string) => s === 'PUBLISHED' || s === 'FAILED' || s === 'SKIPPED';
  const strandedIds = maybeStranded
    .filter((i) => {
      if (i.publishTasks.length === 0) return false;
      if (!i.publishTasks.every((t) => isTerminal(t.status))) return false;
      // Not stranded, just unfinished: a platform this item targets has no task
      // at all and is still waiting for a slot. Completing it here would drop it
      // out of the queue having posted to only some of its platforms.
      const covered = new Set(i.publishTasks.map((t) => t.platform));
      return wantedPlatforms(connectedPlatforms, targetsOf(i)).every((p) => covered.has(p));
    })
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

  const slots = generateSlots(schedules as ScheduleRule[], now);

  // PENDING items need a whole plan. PUBLISHING items are partly done — they've
  // posted to some platforms and still need a slot for the rest, which is a
  // normal state now that platforms are materialized slot by slot rather than
  // all at once. Both take part in assignment; only their starting remainder
  // differs, so a partly-published item can still pick up its missing platforms.
  const items = await prisma.queueItem.findMany({
    where: { queueId, status: { in: ['PENDING', 'PUBLISHING'] }, ...settled },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      status: true,
      imageId: true,
      video: { select: { targetPlatforms: true } },
      publishTasks: { select: { platform: true } },
    },
  });

  // What each item still needs: its wanted platforms minus any whose task
  // survived the clear above (PUBLISHED, PROCESSING, or an in-flight upload).
  // Those are already spoken for — that is what keeps a partly-published item
  // from being handed a second task for a platform it has already posted to.
  const plan = planSlots(
    items.map((item) => {
      const done = new Set(item.publishTasks.map((t) => t.platform));
      const needs = wantedPlatforms(connectedPlatforms, targetsOf(item)).filter(
        (p) => !done.has(p),
      );
      return { id: item.id, needs };
    }),
    slots,
    connectedPlatforms,
  );

  const statusOf = new Map(items.map((i) => [i.id, i.status]));
  let scheduledItems = 0;
  let tasks = 0;

  // Items already given a slot this pass, so a second slot adds tasks without
  // re-stamping the item's headline time.
  const started = new Set<string>();

  for (const { slot, itemId, platforms } of plan) {
    // The item's own scheduledAt is the earliest time any of its tasks goes out.
    // The plan is in slot time order, so that's this first assignment; later
    // slots add tasks without moving it. A partly-published item keeps both its
    // PUBLISHING status and the time it first went out — it is catching up on a
    // missing platform, not being scheduled afresh.
    if (!started.has(itemId)) {
      started.add(itemId);
      if (statusOf.get(itemId) === 'PENDING') {
        await prisma.queueItem.update({
          where: { id: itemId },
          data: { status: 'SCHEDULED', scheduledAt: slot.at },
        });
      }
      scheduledItems++;
    }

    for (const platform of platforms) {
      const connectionId = connected.get(platform) ?? null;
      const created = await prisma.publishTask.create({
        data: {
          queueItemId: itemId,
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
