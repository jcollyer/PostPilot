import { describe, it, expect } from 'vitest';
import type { Platform } from '@postpilot/db';

import { planSlots, type PlanItem } from './planner';
import type { Slot } from './slots';

const ALL: Platform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'];

const slot = (iso: string, platforms: Platform[] = [], scheduleId = 'sch'): Slot => ({
  at: new Date(iso),
  scheduleId,
  platforms,
});

const item = (id: string, needs: Platform[] = ALL): PlanItem => ({ id, needs });

/** The plan as readable `time -> item: platforms` lines, platforms sorted. */
const describePlan = (plan: ReturnType<typeof planSlots>) =>
  plan.map(
    (a) =>
      `${a.slot.at.toISOString().slice(5, 16)} ${a.itemId}: ${[...a.platforms].sort().join(',')}`,
  );

describe('planSlots — platform-scoped schedules', () => {
  it('gives one item Instagram and TikTok/YouTube on different slots', () => {
    // An Instagram-only slot that comes before the all-platform one.
    const slots = [
      slot('2026-01-01T09:00:00Z', ['INSTAGRAM'], 'ig'),
      slot('2026-01-01T12:00:00Z', [], 'all'),
      slot('2026-01-02T12:00:00Z', [], 'all'),
    ];
    const plan = planSlots([item('a'), item('b')], slots, ALL);

    expect(describePlan(plan)).toEqual([
      '01-01T09:00 a: INSTAGRAM',
      '01-01T12:00 a: TIKTOK,YOUTUBE',
      '01-02T12:00 b: INSTAGRAM,TIKTOK,YOUTUBE',
    ]);
  });

  it('lets Instagram fall further behind as items accumulate on a slower schedule', () => {
    // TikTok + YouTube Mon/Tue/Thu/Fri, Instagram Wed/Sat (week of Mon Jan 5).
    const ty: Platform[] = ['TIKTOK', 'YOUTUBE'];
    const ig: Platform[] = ['INSTAGRAM'];
    const slots = [
      slot('2026-01-05T12:00:00Z', ty),
      slot('2026-01-06T12:00:00Z', ty),
      slot('2026-01-07T18:00:00Z', ig),
      slot('2026-01-08T12:00:00Z', ty),
      slot('2026-01-09T12:00:00Z', ty),
      slot('2026-01-10T18:00:00Z', ig),
      slot('2026-01-12T12:00:00Z', ty),
      slot('2026-01-13T12:00:00Z', ty),
      slot('2026-01-14T18:00:00Z', ig),
      slot('2026-01-15T12:00:00Z', ty),
      slot('2026-01-16T12:00:00Z', ty),
      slot('2026-01-17T18:00:00Z', ig),
      slot('2026-01-21T18:00:00Z', ig),
    ];
    const plan = planSlots([item('a'), item('b'), item('c'), item('d')], slots, ALL);

    // Each item's Instagram lags its TikTok/YouTube by 2, 4, 6, then 8 days.
    // Week two's TikTok/YouTube slots, and the Instagram slot after d's, go
    // unused: every item already has what they offer.
    expect(describePlan(plan)).toEqual([
      '01-05T12:00 a: TIKTOK,YOUTUBE',
      '01-06T12:00 b: TIKTOK,YOUTUBE',
      '01-07T18:00 a: INSTAGRAM',
      '01-08T12:00 c: TIKTOK,YOUTUBE',
      '01-09T12:00 d: TIKTOK,YOUTUBE',
      '01-10T18:00 b: INSTAGRAM',
      '01-14T18:00 c: INSTAGRAM',
      '01-17T18:00 d: INSTAGRAM',
    ]);
  });
});
