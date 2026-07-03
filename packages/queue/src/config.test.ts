import { describe, it, expect } from 'vitest';

import { HORIZON_DAYS, MAX_SLOTS, POSITION_STEP } from './config';

describe('queue config', () => {
  it('exposes sane numeric defaults', () => {
    for (const v of [HORIZON_DAYS, MAX_SLOTS, POSITION_STEP]) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('leaves head-room between appended positions', () => {
    // POSITION_STEP must be > 1 so positionBetween can always find an integer-ish
    // midpoint when inserting between two adjacent items.
    expect(POSITION_STEP).toBeGreaterThan(1);
  });
});
