import { describe, it, expect } from 'vitest';

import { generateSlots, type ScheduleRule } from './slots';

const everyDayAt = (time: string, over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: 'sch_1',
  timezone: 'UTC',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  times: [time],
  platforms: [],
  ...over,
});

describe('generateSlots', () => {
  it('returns an empty array when a schedule has no days or no times', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(generateSlots([everyDayAt('09:00', { daysOfWeek: [] })], from)).toEqual([]);
    expect(generateSlots([everyDayAt('09:00', { times: [] })], from)).toEqual([]);
  });

  it('only emits slots strictly after `from`', () => {
    // from is 2026-01-01 10:00Z; the 09:00 slot that day is in the past.
    const from = new Date('2026-01-01T10:00:00Z');
    const slots = generateSlots([everyDayAt('09:00')], from, { horizonDays: 1 });
    for (const s of slots) {
      expect(s.at.getTime()).toBeGreaterThan(from.getTime());
    }
    // Day 0 is skipped (past), day 1 remains within a 1-day horizon.
    expect(slots).toHaveLength(1);
    expect(slots[0]!.at.toISOString()).toBe('2026-01-02T09:00:00.000Z');
  });

  it('tags each slot with its schedule id and platforms', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const [slot] = generateSlots(
      [everyDayAt('09:00', { id: 'weekday', platforms: ['TIKTOK'] })],
      from,
      { horizonDays: 0 },
    );
    expect(slot!.scheduleId).toBe('weekday');
    expect(slot!.platforms).toEqual(['TIKTOK']);
  });

  it('merges multiple schedules and returns them sorted ascending', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const slots = generateSlots(
      [everyDayAt('17:00', { id: 'pm' }), everyDayAt('09:00', { id: 'am' })],
      from,
      { horizonDays: 0 },
    );
    expect(slots.map((s) => s.at.toISOString())).toEqual([
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T17:00:00.000Z',
    ]);
  });

  it('respects the max cap', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const slots = generateSlots([everyDayAt('09:00')], from, { horizonDays: 30, max: 3 });
    expect(slots).toHaveLength(3);
  });

  it('is timezone-aware: a NY 09:00 slot is 14:00 UTC in January', () => {
    // In NY the day anchor rolls back a calendar day relative to UTC. With a
    // 1-day horizon the Dec-31 slot is in the past and the Jan-1 one survives.
    const from = new Date('2026-01-01T00:00:00Z');
    const slots = generateSlots(
      [everyDayAt('09:00', { timezone: 'America/New_York' })],
      from,
      { horizonDays: 1 },
    );
    // EST is UTC-5 in January: 09:00 ET === 14:00 UTC.
    expect(slots).toHaveLength(1);
    expect(slots[0]!.at.toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });

  it('skips malformed time strings without throwing', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const slots = generateSlots(
      [everyDayAt('09:00', { times: ['bogus', '09:00'] })],
      from,
      { horizonDays: 0 },
    );
    expect(slots).toHaveLength(1);
  });
});
