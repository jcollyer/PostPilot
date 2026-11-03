import type { Platform } from '@postpilot/db';

import type { Slot } from './slots';

export interface PlanItem {
  id: string;
  /**
   * Platforms the item still needs a task for: its wanted platforms minus any
   * already spoken for by a task that survived (published, processing, in
   * flight). An item that names explicit targets keeps them even when they
   * aren't connected, so they still get planned (and land HELD).
   */
  needs: Platform[];
}

/** One slot handed to one item, and the platforms it covers there. */
export interface SlotAssignment {
  slot: Slot;
  itemId: string;
  platforms: Platform[];
}

/**
 * Plan which item each slot goes to. Pure: no database, no clock, so anything
 * that needs to predict the schedule (the calendar's projection and drop
 * resolution, next) can run the same algorithm `recomputeSchedule` writes and
 * never disagree with it.
 *
 * Greedy: walk `slots` in time order and give each to the earliest item in
 * `items` (queue order) that still needs ≥1 of that slot's platforms. This
 * keeps queue order in the common case (one all-platforms schedule -> every
 * item is compatible and fully covered by its first slot, so it degrades to
 * 1:1 by index) while letting a platform-scoped item skip a slot it can't use
 * rather than burning it on a no-op.
 *
 * A slot with explicit platforms covers only those; an empty one covers
 * "all", i.e. whatever the item still needs — including an explicit target
 * that isn't connected. A slot that resolves to nothing (empty, and nothing
 * connected) is skipped.
 */
export function planSlots(
  items: PlanItem[],
  slots: Slot[],
  connectedPlatforms: Platform[],
): SlotAssignment[] {
  // Platforms each item still needs a task for, worked down as slots are handed
  // out. An item is NOT spent on the first slot it fits: doing that silently
  // reduced a cross-post video to whichever schedule reached it first — a video
  // targeting all three platforms that landed in an Instagram-only slot got one
  // Instagram task, published, rolled up to COMPLETED, and left the queue having
  // never reached YouTube or TikTok. Tracking the remainder lets the same item
  // take TikTok + YouTube from one schedule and Instagram from another.
  const remaining = new Map<string, Set<Platform>>();
  for (const item of items) {
    if (item.needs.length > 0) remaining.set(item.id, new Set(item.needs));
  }

  const plan: SlotAssignment[] = [];
  // Items whose platforms are now fully covered, so the walk can stop early.
  let covered = 0;

  for (const slot of slots) {
    if (slot.platforms.length === 0 && connectedPlatforms.length === 0) continue;
    if (covered >= remaining.size) break;

    for (const item of items) {
      const need = remaining.get(item.id);
      if (!need || need.size === 0) continue;
      const platforms =
        slot.platforms.length > 0 ? [...need].filter((p) => slot.platforms.includes(p)) : [...need];
      if (platforms.length === 0) continue;

      plan.push({ slot, itemId: item.id, platforms });
      for (const p of platforms) need.delete(p);
      if (need.size === 0) covered++;
      break;
    }
  }

  return plan;
}
