import type { Platform, PrismaClient } from '@postpilot/db';

import { freshPlanItems, heldSlots, IN_ROTATION, planToEnd, type FreshPlan } from './fresh-plan';
import type { PlanItem } from './planner';
import { positionBetween } from './positions';
import { activeConnections, recomputeSchedule } from './scheduler';
import type { ScheduleRule } from './slots';

export type QueueMoveErrorCode =
  /** The item (or the anchor it should follow) isn't in this queue. */
  | 'NOT_FOUND'
  /** The slot has already gone by. */
  | 'PAST_SLOT'
  /** No slot at that time posts to those platforms. */
  | 'NO_SLOT'
  /** Published, or the runner is working on it: it stays where it is. */
  | 'NOT_MOVABLE';

/** A move the queue refused, with a message fit to show the user. */
export class QueueMoveError extends Error {
  constructor(
    readonly code: QueueMoveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QueueMoveError';
  }
}

/**
 * Reorder: place `itemId` right after `afterItemId` (null = the front), then
 * re-plan. Positions are floats, so only the moved row is written.
 */
export async function moveItem(
  prisma: PrismaClient,
  queueId: string,
  { itemId, afterItemId }: { itemId: string; afterItemId: string | null },
): Promise<void> {
  const items = await prisma.queueItem.findMany({
    where: { queueId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });
  if (!items.some((i) => i.id === itemId)) {
    throw new QueueMoveError('NOT_FOUND', 'Queue item not found.');
  }
  const others = items.filter((i) => i.id !== itemId);

  let position: number;
  if (afterItemId === null) {
    position = positionBetween(null, others[0]?.position ?? null);
  } else {
    const idx = others.findIndex((i) => i.id === afterItemId);
    if (idx < 0) throw new QueueMoveError('NOT_FOUND', 'Anchor item not found.');
    position = positionBetween(others[idx]!.position, others[idx + 1]?.position ?? null);
  }

  await prisma.queueItem.update({ where: { id: itemId }, data: { position } });
  await recomputeSchedule(prisma, queueId);
}

export interface MoveToSlotResult {
  /** The item it sat behind before the move (null = the front): `moveItem` with it undoes the move. */
  previousAfterItemId: string | null;
  /**
   * When the dragged platforms now go out — the slot dropped on, or for a drop
   * past the end of the queue, wherever the end now falls. `null` if no
   * schedule reaches them.
   */
  landedAt: Date | null;
  /** The slot was past the end of the queue, so the item went to the end instead. */
  movedToEnd: boolean;
  /** How many other items' posts moved because of it. */
  shifted: number;
  shiftedItemIds: string[];
}

/**
 * Move an item so the given platforms go out in the slot at `slotAt` — the
 * calendar's drop. Still just a reorder: resolved against the queue as it
 * stands now, it finds the item X holding that slot for those platforms.
 * Moving earlier puts the item before X, moving later puts it after X (so X
 * moves one slot along either way), and a slot past the end of the queue sends
 * it to the end. Then it writes the position and re-plans, as `moveItem` does.
 */
export async function moveToSlot(
  prisma: PrismaClient,
  queueId: string,
  { itemId, slotAt, platforms }: { itemId: string; slotAt: Date; platforms: Platform[] },
  now: Date = new Date(),
): Promise<MoveToSlotResult> {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    select: { userId: true },
  });
  if (!queue) throw new QueueMoveError('NOT_FOUND', 'Queue not found.');

  const [all, schedules, connected] = await Promise.all([
    prisma.queueItem.findMany({
      where: { queueId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        status: true,
        imageId: true,
        video: { select: { targetPlatforms: true } },
        publishTasks: { select: { platform: true, status: true, scheduledAt: true } },
      },
    }),
    prisma.schedule.findMany({
      where: { queueId, isActive: true },
      select: { id: true, timezone: true, daysOfWeek: true, times: true, platforms: true },
    }) as Promise<ScheduleRule[]>,
    activeConnections(prisma, queue.userId),
  ]);
  const connectedPlatforms = [...connected.keys()];

  const index = all.findIndex((i) => i.id === itemId);
  if (index < 0) throw new QueueMoveError('NOT_FOUND', 'Queue item not found.');
  const previousAfterItemId = all[index - 1]?.id ?? null;

  if (slotAt <= now) throw new QueueMoveError('PAST_SLOT', 'That slot has already gone by.');

  const rotation = all.filter((i) => (IN_ROTATION as readonly string[]).includes(i.status));
  const items = freshPlanItems(rotation, connectedPlatforms, now);
  // Published, being published, or out of rotation: a fresh plan has nothing
  // left of it to place on those platforms.
  const needs = items.find((i) => i.id === itemId)?.needs ?? [];
  if (!platforms.every((p) => needs.includes(p))) {
    throw new QueueMoveError(
      'NOT_MOVABLE',
      "That post has gone out or is going out now, so it can't be moved.",
    );
  }

  const before = planToEnd(items, schedules, connectedPlatforms, now, slotAt);
  const slot = heldSlots(before, items, connectedPlatforms).find(
    (s) => s.at.getTime() === slotAt.getTime(),
  );
  const holders = platforms.map((p) => slot?.holders.get(p));
  if (holders.some((h) => h === undefined)) {
    throw new QueueMoveError('NO_SLOT', 'None of your schedules posts there for that platform.');
  }

  // The target: the earliest in the queue of the other items holding it for
  // those platforms. None at all means the queue runs out before it: go to the
  // end. Held only by the item itself, it's already there.
  const order = all.map((i) => i.id);
  const others = order.filter((id) => id !== itemId);
  const target = holders
    .filter((h): h is string => h != null && h !== itemId)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  if (target === undefined && holders.includes(itemId)) {
    return {
      previousAfterItemId,
      landedAt: slotAt,
      movedToEnd: false,
      shifted: 0,
      shiftedItemIds: [],
    };
  }

  let afterItemId: string | null;
  if (target === undefined) {
    afterItemId = others.at(-1) ?? null;
  } else if (order.indexOf(target) > index) {
    afterItemId = target;
  } else {
    afterItemId = others[others.indexOf(target) - 1] ?? null;
  }

  await moveItem(prisma, queueId, { itemId, afterItemId });

  const reordered =
    afterItemId === null
      ? [itemId, ...others]
      : others.flatMap((id) => (id === afterItemId ? [id, itemId] : [id]));
  const rank = new Map(reordered.map((id, n) => [id, n]));
  const after = planToEnd(
    [...items].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!),
    schedules,
    connectedPlatforms,
    now,
    slotAt,
  );

  const landing = after.plan.find(
    (a) => a.itemId === itemId && a.platforms.some((p) => platforms.includes(p)),
  );
  const shiftedItemIds = itemsShifted(before, after, items, itemId);
  return {
    previousAfterItemId,
    landedAt: landing?.slot.at ?? null,
    movedToEnd: target === undefined,
    shifted: shiftedItemIds.length,
    shiftedItemIds,
  };
}

/** Other items whose posts land somewhere else in `after` than in `before`, in queue order. */
function itemsShifted(
  before: FreshPlan,
  after: FreshPlan,
  items: PlanItem[],
  movedId: string,
): string[] {
  const postsOf = ({ plan }: FreshPlan) => {
    const posts = new Map<string, string[]>();
    for (const { slot, itemId, platforms } of plan) {
      const list = posts.get(itemId) ?? [];
      for (const p of platforms) list.push(`${p}@${slot.at.getTime()}`);
      posts.set(itemId, list);
    }
    return posts;
  };
  const was = postsOf(before);
  const is = postsOf(after);
  const same = (a: string[] = [], b: string[] = []) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return items.map((i) => i.id).filter((id) => id !== movedId && !same(was.get(id), is.get(id)));
}
