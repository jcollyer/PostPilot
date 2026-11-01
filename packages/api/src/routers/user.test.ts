import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `user.deleteAccount` reaches outside the database: it cancels Stripe and
 * empties the user's storage prefix before deleting rows. These pin that order,
 * because a failure after the row delete strands media in R2 and leaves a
 * subscription charging an account that no longer exists.
 */

const calls: string[] = [];

const cancelAllSubscriptions = vi.fn();
const deletePrefix = vi.fn();
let billingConfigured = true;
let storageConfigured = true;

vi.mock('@postpilot/billing', () => ({
  isBillingConfigured: () => billingConfigured,
  cancelAllSubscriptions: (customerId: string) => cancelAllSubscriptions(customerId),
}));

vi.mock('@postpilot/storage', () => ({
  isStorageConfigured: () => storageConfigured,
  userPrefix: (userId: string) => `users/${userId}`,
  deletePrefix: (prefix: string) => deletePrefix(prefix),
}));

const { userRouter } = await import('./user');
const { createCallerFactory } = await import('../trpc');

const findUnique = vi.fn();
const deleteUser = vi.fn();

const prisma = {
  user: { findUnique, delete: deleteUser },
};

function deleteAccount(confirmEmail = 'me@example.com') {
  const caller = createCallerFactory(userRouter)({
    session: { user: { id: 'user_1' } },
    headers: undefined,
    prisma: prisma as any,
  });
  return caller.deleteAccount({ confirmEmail });
}

beforeEach(() => {
  calls.length = 0;
  billingConfigured = true;
  storageConfigured = true;

  findUnique
    .mockReset()
    .mockResolvedValue({ id: 'user_1', email: 'me@example.com', stripeCustomerId: 'cus_1' });
  cancelAllSubscriptions.mockReset().mockImplementation(async () => {
    calls.push('stripe');
    return 1;
  });
  deletePrefix.mockReset().mockImplementation(async () => {
    calls.push('storage');
  });
  deleteUser.mockReset().mockImplementation(async () => {
    calls.push('rows');
  });
});

describe('user.deleteAccount', () => {
  it('cancels Stripe, then empties storage, then deletes the rows', async () => {
    await expect(deleteAccount()).resolves.toEqual({ success: true });

    expect(calls).toEqual(['stripe', 'storage', 'rows']);
    expect(cancelAllSubscriptions).toHaveBeenCalledWith('cus_1');
    expect(deletePrefix).toHaveBeenCalledWith('users/user_1');
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'user_1' } });
  });

  it('skips Stripe for a user who was never a customer', async () => {
    findUnique.mockResolvedValue({ id: 'user_1', email: 'me@example.com', stripeCustomerId: null });

    await deleteAccount();

    expect(cancelAllSubscriptions).not.toHaveBeenCalled();
    expect(calls).toEqual(['storage', 'rows']);
  });

  it('keeps the account when Stripe fails, so the user can retry', async () => {
    cancelAllSubscriptions.mockRejectedValue(new Error('stripe down'));

    await expect(deleteAccount()).rejects.toThrow(/couldn't cancel your subscription/);
    expect(deletePrefix).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the account when storage fails, so nothing is orphaned in R2', async () => {
    deletePrefix.mockRejectedValue(new Error('r2 down'));

    await expect(deleteAccount()).rejects.toThrow(/couldn't remove your media/);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('still deletes the rows where billing and storage are not configured', async () => {
    billingConfigured = false;
    storageConfigured = false;

    await deleteAccount();

    expect(calls).toEqual(['rows']);
  });

  it('touches nothing when the typed email does not match', async () => {
    await expect(deleteAccount('someone@else.com')).rejects.toThrow(/doesn't match/);
    expect(calls).toEqual([]);
  });
});
