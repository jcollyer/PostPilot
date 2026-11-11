import type { Platform, QueueStatus } from '@postpilot/db';

import { planSlots, type PlanItem, type SlotAssignment } from './planner';
import { planItemOf } from './scheduler';
import { generateSlots, type ScheduleRule, type Slot } from './slots';

/**
 * The plan as the next `recomputeSchedule` would write it, carried on past its
 * horizon to the end of the queue: one planner walk from `now`. The calendar's
 * slot holders and `moveToSlot`'s drop resolution both read it, so a drop is
 * always resolved against the queue as it stands, not a stale copy of the plan.
 */

/** Items `recomputeSchedule` plans (SCHEDULED ones are reset to PENDING and re-planned). */
export const IN_ROTATION = ['PENDING', 'SCHEDULED', 'PUBLISHING'] as const;

/** A queue item in rotation, with every task it has. */
export interface ItemState {
  id: string;
  status: string;
  imageId: string | null;
  video: { targetPlatforms: Platform[] } | null;
  publishTasks: { platform: Platform; status: string; scheduledAt: Date }[];
}

/**
 * Is the runner working on it — uploading, or due and not yet claimed (or
 * waiting out a retry)? `recomputeSchedule` leaves such an item entirely alone.
 */
export function isInFlight(item: ItemState, now: Date): boolean {
  return item.publishTasks.some(
    (t) => t.status === 'UPLOADING' || (t.status === 'SCHEDULED' && t.scheduledAt <= now),
  );
}

/**
 * Items (in queue order) as a fresh recompute plans them: in-flight ones left
 * out, and each needing what's left once the recompute's clear has run — it
 * drops SCHEDULED and HELD tasks, and FAILED ones on items not yet publishing.
 */
export function freshPlanItems(
  items: ItemState[],
  connectedPlatforms: Platform[],
  now: Date,
): PlanItem[] {
  return items
    .filter((item) => !isInFlight(item, now))
    .map((item) =>
      planItemOf(
        {
          ...item,
          publishTasks: item.publishTasks.filter(
            (t) =>
              t.status !== 'SCHEDULED' &&
              t.status !== 'HELD' &&
              (t.status !== 'FAILED' || item.status === 'PUBLISHING'),
          ),
        },
        connectedPlatforms,
      ),
    );
}

export interface FreshPlan {
  slots: Slot[];
  plan: SlotAssignment[];
}

/**
 * Every slot from `now` up to (not including) `until`, planned. A day of slack
 * covers schedule time zones ahead of the instant `now` falls on.
 */
export function planUntil(
  items: PlanItem[],
  schedules: ScheduleRule[],
  connectedPlatforms: Platform[],
  now: Date,
  until: Date,
): FreshPlan {
  const horizonDays = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS)) + 1;
  const slots = generateSlots(schedules, now, {
    horizonDays,
    max: Number.POSITIVE_INFINITY,
  }).filter((s) => s.at < until);
  return { slots, plan: planSlots(items, slots, connectedPlatforms) };
}

/**
 * Plan past `atLeast` until every item is covered — the end of the queue — so
 * a move can see everything it shifts. Widened in steps rather than generated
 * years ahead up front; capped, since a platform no schedule posts to is never
 * covered.
 */
export function planToEnd(
  items: PlanItem[],
  schedules: ScheduleRule[],
  connectedPlatforms: Platform[],
  now: Date,
  atLeast: Date,
): FreshPlan {
  const needed = items.reduce((n, i) => n + i.needs.length, 0);
  let days = Math.max(31, Math.ceil((atLeast.getTime() - now.getTime()) / DAY_MS) + 1);
  for (;;) {
    const fresh = planUntil(
      items,
      schedules,
      connectedPlatforms,
      now,
      new Date(now.getTime() + days * DAY_MS),
    );
    const covered = fresh.plan.reduce((n, a) => n + a.platforms.length, 0);
    if (covered >= needed || days >= MAX_PLAN_DAYS) return fresh;
    days = Math.min(days * 2, MAX_PLAN_DAYS);
  }
}

/** One slot time and, per platform it posts to, the item holding it. */
export interface HeldSlot {
  at: Date;
  /** `null` past the end of the queue for that platform. */
  holders: Map<Platform, string | null>;
}

/**
 * The plan by slot time. Schedules that share a time merge into one entry, so
 * each platform there has its own holder. A slot is held by the item the
 * planner gave it to, for every platform the slot posts to — dropping onto it
 * means "go where that item is", even for a platform the holder doesn't need.
 *
 * An all-platforms slot posts to whatever an item needs, so it counts as every
 * platform in play: the connected ones plus any an item still targets.
 */
export function heldSlots(
  { slots, plan }: FreshPlan,
  items: PlanItem[],
  connectedPlatforms: Platform[],
): HeldSlot[] {
  const allPlatforms = [...new Set([...connectedPlatforms, ...items.flatMap((i) => i.needs)])];
  const holderOf = new Map(plan.map((a) => [a.slot, a]));

  const byTime = new Map<number, HeldSlot>();
  for (const slot of slots) {
    const platforms =
      slot.platforms.length > 0
        ? slot.platforms
        : connectedPlatforms.length > 0
          ? allPlatforms
          : [];
    if (platforms.length === 0) continue;
    let held = byTime.get(slot.at.getTime());
    if (!held) {
      held = { at: slot.at, holders: new Map() };
      byTime.set(slot.at.getTime(), held);
    }
    const holder = holderOf.get(slot)?.itemId ?? null;
    for (const p of platforms) {
      // Where two schedules at one time both post to p, the one that is taken wins.
      if (held.holders.get(p) == null) held.holders.set(p, holder);
    }
  }
  return [...byTime.values()];
}

/**
 * The slot times `recomputeSchedule` materializes (its own horizon and cap),
 * so anything else is projected. A paused queue materializes none.
 */
export function liveSlotTimes(
  status: QueueStatus,
  schedules: ScheduleRule[],
  now: Date,
): Set<number> {
  if (status === 'PAUSED') return new Set();
  return new Set(generateSlots(schedules, now).map((s) => s.at.getTime()));
}

export const DAY_MS = 86_400_000;
/** About three years: past this, a projection says nothing useful. */
const MAX_PLAN_DAYS = 1100;
