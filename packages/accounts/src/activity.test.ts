import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Activity is written on hot paths — every API request checks it — so these
 * pin both halves of the bargain: at most one write a day, and every write
 * resets the inactivity clock, warnings included.
 */

vi.mock('@postpilot/db', () => ({ prisma: {} }));

const { isActivityStale, recordActivity } = await import('./activity');

const NOW = new Date('2026-11-02T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const prisma = { user: { updateMany: vi.fn() } };
const client = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('isActivityStale', () => {
  it('skips the write when activity was already recorded today', () => {
    expect(isActivityStale(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(false);
  });

  it('writes once a day has passed', () => {
    expect(isActivityStale(new Date(NOW.getTime() - 24 * HOUR), NOW)).toBe(true);
  });

  it('accepts the serialized date a session carries', () => {
    expect(isActivityStale(new Date(NOW.getTime() - HOUR).toISOString(), NOW)).toBe(false);
  });

  it('treats an unknown time as stale, leaving the conditional write to decide', () => {
    expect(isActivityStale(undefined, NOW)).toBe(true);
    expect(isActivityStale(null, NOW)).toBe(true);
    expect(isActivityStale('not a date', NOW)).toBe(true);
  });
});

describe('recordActivity', () => {
  it('resets the clock and clears both warnings, only if not already written today', async () => {
    expect(await recordActivity('user_1', { client, now: NOW })).toBe(true);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', lastActiveAt: { lte: new Date(NOW.getTime() - 24 * HOUR) } },
      data: {
        lastActiveAt: NOW,
        inactivityWarningSentAt: null,
        inactivityFinalWarningSentAt: null,
      },
    });
  });

  it('reports no write when today’s activity is already recorded', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    expect(await recordActivity('user_1', { client, now: NOW })).toBe(false);
  });
});
