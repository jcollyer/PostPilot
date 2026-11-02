import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `user.deleteAccount` hands the work to @postpilot/accounts once the typed
 * email checks out. What these pin is the API's side of it: the email guard,
 * the error a failed deletion turns into, and the gate that keeps an account
 * scheduled for deletion out of everything except restoring itself.
 */

const requestAccountDeletion = vi.fn();
const restoreAccount = vi.fn();
const recordActivity = vi.fn();

vi.mock('@postpilot/accounts', () => ({
  requestAccountDeletion: (userId: string, opts: unknown) => requestAccountDeletion(userId, opts),
  restoreAccount: (userId: string, opts: unknown) => restoreAccount(userId, opts),
  // Stale after a day, as the real one is.
  isActivityStale: (at: Date | null | undefined) =>
    !at || Date.now() - at.getTime() >= 24 * 60 * 60 * 1000,
  recordActivity: (userId: string, opts: unknown) => recordActivity(userId, opts),
}));

const { userRouter } = await import('./user');
const { createCallerFactory } = await import('../trpc');

const findUnique = vi.fn();
const prisma = { user: { findUnique } };

const SCHEDULED = new Date('2026-12-31T00:00:00Z');

function caller(deletionScheduledFor: Date | null = null, lastActiveAt: Date = new Date()) {
  return createCallerFactory(userRouter)({
    session: { user: { id: 'user_1', deletionScheduledFor, lastActiveAt } },
    headers: undefined,
    prisma: prisma as any,
  });
}

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue({ id: 'user_1', email: 'me@example.com' });
  requestAccountDeletion.mockReset().mockResolvedValue({ scheduledFor: SCHEDULED });
  restoreAccount.mockReset().mockResolvedValue(true);
  recordActivity.mockReset().mockResolvedValue(true);
});

describe('activity', () => {
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  it('records the first authenticated call of the day', async () => {
    findUnique.mockResolvedValue({ id: 'user_1', email: 'me@example.com' });

    await caller(null, lastWeek).me();

    expect(recordActivity).toHaveBeenCalledWith('user_1', { client: prisma });
  });

  it('skips the database when today is already recorded', async () => {
    await caller().me();

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('never fails the request when recording does', async () => {
    recordActivity.mockRejectedValue(new Error('db blip'));

    await expect(caller(null, lastWeek).me()).resolves.toBeDefined();
  });
});

describe('user.deleteAccount', () => {
  it('schedules the deletion and returns the purge date', async () => {
    await expect(caller().deleteAccount({ confirmEmail: 'ME@example.com' })).resolves.toEqual({
      success: true,
      scheduledFor: SCHEDULED,
    });
    expect(requestAccountDeletion).toHaveBeenCalledWith('user_1', { client: prisma });
  });

  it('touches nothing when the typed email does not match', async () => {
    await expect(caller().deleteAccount({ confirmEmail: 'someone@else.com' })).rejects.toThrow(
      /doesn't match/,
    );
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('reports a failed deletion as nothing changed, so the user retries', async () => {
    requestAccountDeletion.mockRejectedValue(new Error('stripe down'));

    await expect(caller().deleteAccount({ confirmEmail: 'me@example.com' })).rejects.toThrow(
      /Nothing was changed/,
    );
  });
});

describe('an account scheduled for deletion', () => {
  it('is refused by ordinary procedures', async () => {
    await expect(caller(SCHEDULED).me()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'ACCOUNT_PENDING_DELETION',
    });
    await expect(
      caller(SCHEDULED).deleteAccount({ confirmEmail: 'me@example.com' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('can read its deletion status', async () => {
    findUnique.mockResolvedValue({ email: 'me@example.com', deletionScheduledFor: SCHEDULED });

    await expect(caller(SCHEDULED).deletionStatus()).resolves.toEqual({
      email: 'me@example.com',
      scheduledFor: SCHEDULED,
    });
  });

  it('can restore itself', async () => {
    await expect(caller(SCHEDULED).restoreAccount()).resolves.toEqual({ restored: true });
    expect(restoreAccount).toHaveBeenCalledWith('user_1', { client: prisma });
  });

  it('still needs to be signed in to restore', async () => {
    const signedOut = createCallerFactory(userRouter)({
      session: null,
      headers: undefined,
      prisma: prisma as any,
    });
    await expect(signedOut.restoreAccount()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
