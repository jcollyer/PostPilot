import { POSITION_STEP } from './config';

/**
 * Float positions let us reorder/insert without renumbering every row: a new
 * slot just takes a value between its neighbours. Periodic `smartArrange` (or
 * any full reorder) renormalizes back to clean integer steps.
 */

/** Position for appending after the current maximum. */
export function appendPosition(maxPosition: number | null | undefined): number {
  return (maxPosition ?? 0) + POSITION_STEP;
}

/**
 * Position that places an item between `before` and `after`.
 *   - both null  → first item ever (POSITION_STEP)
 *   - after null → moving to the end (before + STEP)
 *   - before null→ moving to the start (after / 2)
 */
export function positionBetween(
  before: number | null | undefined,
  after: number | null | undefined,
): number {
  if (before == null && after == null) return POSITION_STEP;
  if (after == null) return (before as number) + POSITION_STEP;
  if (before == null) return (after as number) / 2;
  return (before + after) / 2;
}

/** Renormalize an ordered id list to evenly spaced integer positions. */
export function normalizedPositions(orderedIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  orderedIds.forEach((id, i) => out.set(id, (i + 1) * POSITION_STEP));
  return out;
}
