import { describe, it, expect } from 'vitest';

import { appendPosition, positionBetween, normalizedPositions } from './positions';
import { POSITION_STEP } from './config';

describe('appendPosition', () => {
  it('starts at POSITION_STEP when the list is empty', () => {
    expect(appendPosition(null)).toBe(POSITION_STEP);
    expect(appendPosition(undefined)).toBe(POSITION_STEP);
  });

  it('appends one step past the current maximum', () => {
    expect(appendPosition(1000)).toBe(1000 + POSITION_STEP);
  });
});

describe('positionBetween', () => {
  it('returns POSITION_STEP for the very first item', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });

  it('appends a step when moving to the end (after is null)', () => {
    expect(positionBetween(2000, null)).toBe(2000 + POSITION_STEP);
  });

  it('halves the successor when moving to the start (before is null)', () => {
    expect(positionBetween(null, 1000)).toBe(500);
  });

  it('returns the midpoint between two neighbours', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });

  it('keeps producing a value strictly between tight neighbours', () => {
    const mid = positionBetween(1000, 1001);
    expect(mid).toBeGreaterThan(1000);
    expect(mid).toBeLessThan(1001);
  });
});

describe('normalizedPositions', () => {
  it('maps an ordered id list to evenly spaced integer steps', () => {
    const map = normalizedPositions(['a', 'b', 'c']);
    expect(map.get('a')).toBe(POSITION_STEP);
    expect(map.get('b')).toBe(2 * POSITION_STEP);
    expect(map.get('c')).toBe(3 * POSITION_STEP);
  });

  it('returns an empty map for an empty list', () => {
    expect(normalizedPositions([]).size).toBe(0);
  });

  it('produces strictly increasing positions in input order', () => {
    const ids = ['x', 'y', 'z', 'w'];
    const map = normalizedPositions(ids);
    const values = ids.map((id) => map.get(id)!);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });
});
