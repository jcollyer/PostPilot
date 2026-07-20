import { describe, it, expect } from 'vitest';

import {
  platformSchema,
  timeOfDaySchema,
  scheduleRuleSchema,
  PLATFORM_LABELS,
  parsePostedPosts,
} from './domain';

describe('platformSchema', () => {
  it('accepts the three supported platforms', () => {
    for (const p of ['TIKTOK', 'INSTAGRAM', 'YOUTUBE']) {
      expect(platformSchema.safeParse(p).success).toBe(true);
    }
  });

  it('rejects unknown platforms', () => {
    expect(platformSchema.safeParse('FACEBOOK').success).toBe(false);
  });

  it('has a human label for every platform value', () => {
    for (const p of platformSchema.options) {
      expect(PLATFORM_LABELS[p]).toBeTruthy();
    }
  });
});

describe('timeOfDaySchema', () => {
  it('accepts valid 24-hour times', () => {
    for (const t of ['00:00', '09:00', '17:30', '23:59']) {
      expect(timeOfDaySchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects out-of-range or malformed times', () => {
    for (const t of ['24:00', '09:60', '9:00', '0900', 'noon']) {
      expect(timeOfDaySchema.safeParse(t).success).toBe(false);
    }
  });
});

describe('scheduleRuleSchema', () => {
  it('applies defaults for timezone, platforms and isActive', () => {
    const parsed = scheduleRuleSchema.parse({
      daysOfWeek: [1, 3, 5],
      times: ['09:00'],
    });
    expect(parsed.timezone).toBe('UTC');
    expect(parsed.platforms).toEqual([]);
    expect(parsed.isActive).toBe(true);
  });

  it('requires at least one day and one time', () => {
    expect(scheduleRuleSchema.safeParse({ daysOfWeek: [], times: ['09:00'] }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ daysOfWeek: [1], times: [] }).success).toBe(false);
  });

  it('rejects weekday numbers outside 0..6', () => {
    expect(scheduleRuleSchema.safeParse({ daysOfWeek: [7], times: ['09:00'] }).success).toBe(false);
  });
});

describe('parsePostedPosts', () => {
  it('returns [] for non-array / nullish input', () => {
    expect(parsePostedPosts(null)).toEqual([]);
    expect(parsePostedPosts(undefined)).toEqual([]);
    expect(parsePostedPosts({})).toEqual([]);
    expect(parsePostedPosts('nope')).toEqual([]);
  });

  it('keeps valid entries and drops malformed ones', () => {
    const parsed = parsePostedPosts([
      { platform: 'INSTAGRAM', postedAt: '2026-07-20T10:00:00.000Z', postUrl: 'https://ig/p/1' },
      { platform: 'TIKTOK', postedAt: '2026-07-21T10:00:00.000Z', postUrl: null },
      { platform: 'NOT_A_PLATFORM', postedAt: 'x', postUrl: null }, // dropped: bad platform
      { platform: 'YOUTUBE' }, // dropped: missing fields
    ]);
    expect(parsed).toEqual([
      { platform: 'INSTAGRAM', postedAt: '2026-07-20T10:00:00.000Z', postUrl: 'https://ig/p/1' },
      { platform: 'TIKTOK', postedAt: '2026-07-21T10:00:00.000Z', postUrl: null },
    ]);
  });
});
