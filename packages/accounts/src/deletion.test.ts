import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion reaches Stripe, every connected platform, the database,
 * email and storage. These pin the order those happen in and what a failure at
 * each step leaves behind: never an account flagged as deleted that is still
 * renewing, and never rows removed while their files are still in R2.
 */

const calls: string[] = [];

const scheduleCancelForAccountDeletion = vi.fn();
const resumeAfterAccountRestore = vi.fn();
const cancelAllSubscriptions = vi.fn();
const disconnectConnection = vi.fn();
const sendEmail = vi.fn();
const deletePrefix = vi.fn();

let billingConfigured = true;
let emailConfigured = true;

vi.mock('@postpilot/billing', () => ({
  isBillingConfigured: () => billingConfigured,
  scheduleCancelForAccountDeletion: (id: string) => scheduleCancelForAccountDeletion(id),
  resumeAfterAccountRestore: (id: string) => resumeAfterAccountRestore(id),
  cancelAllSubscriptions: (id: string) => cancelAllSubscriptions(id),
  appBaseUrl: () => 'https://app.test',
}));

vi.mock('@postpilot/connectors', () => ({
  disconnectConnection: (params: unknown) => disconnectConnection(params),
}));

vi.mock('@postpilot/notifications', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (params: unknown) => sendEmail(params),
}));

vi.mock('@postpilot/storage', () => ({
  isStorageConfigured: () => true,
  userPrefix: (id: string) => `users/${id}`,
  deletePrefix: (prefix: string) => deletePrefix(prefix),
}));

vi.mock('@postpilot/db', () => ({ prisma: {} }));

const { requestAccountDeletion, restoreAccount, sweepAccountDeletions } =
  await import('./deletion');

const NOW = new Date('2026-11-01T12:00:00Z');
const PURGE = new Date('2026-12-31T12:00:00Z'); // NOW + 60 days

const USER = {
  id: 'user_1',
  email: 'me@example.com',
  name: 'Jo Creator',
  timezone: 'UTC',
  stripeCustomerId: 'cus_1',
  deletionScheduledFor: null as Date | null,
};

const prisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  platformConnection: { findMany: vi.fn() },
  queue: { updateMany: vi.fn() },
  notification: { updateMany: vi.fn() },
  session: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
};

const client = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  billingConfigured = true;
  emailConfigured = true;

  prisma.user.findUnique.mockResolvedValue({ ...USER });
  prisma.platformConnection.findMany.mockResolvedValue([{ id: 'conn_a' }, { id: 'conn_b' }]);
  prisma.user.update.mockImplementation(async (args) => {
    calls.push('user.update');
    return args;
  });
  prisma.queue.updateMany.mockImplementation(async (args) => args);
  prisma.notification.updateMany.mockImplementation(async (args) => args);
  prisma.session.deleteMany.mockImplementation(async (args) => args);
  prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
    calls.push('transaction');
    return Promise.all(ops);
  });
  prisma.user.delete.mockImplementation(async () => calls.push('user.delete'));

  scheduleCancelForAccountDeletion.mockImplementation(async () => calls.push('stripe.schedule'));
  resumeAfterAccountRestore.mockImplementation(async () => calls.push('stripe.resume'));
  cancelAllSubscriptions.mockImplementation(async () => calls.push('stripe.cancel'));
  disconnectConnection.mockImplementation(async ({ connectionId }) =>
    calls.push(`disconnect:${connectionId}`),
  );
  sendEmail.mockImplementation(async () => calls.push('email'));
  deletePrefix.mockImplementation(async () => calls.push('storage'));
});

describe('requestAccountDeletion', () => {
  it('stops renewal, disconnects platforms, records it, then emails', async () => {
    const result = await requestAccountDeletion('user_1', { client, now: NOW });

    expect(result).toEqual({ scheduledFor: PURGE });
    // The mocked update records itself as the transaction's operations are
    // built; real Prisma operations are lazy and run inside the transaction.
    expect(calls).toEqual([
      'stripe.schedule',
      'disconnect:conn_a',
      'disconnect:conn_b',
      'user.update',
      'transaction',
      'email',
    ]);
    expect(prisma.$transaction.mock.calls[0]![0]).toHaveLength(4);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { deletionRequestedAt: NOW, deletionScheduledFor: PURGE, deletionReminderSentAt: null },
    });
    expect(prisma.queue.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', status: 'ACTIVE' },
      data: { status: 'PAUSED', pausedAt: NOW },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', status: 'PENDING' },
      data: { status: 'SUPPRESSED' },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'me@example.com',
        subject: 'Your PostPilot account is scheduled for deletion',
        text: expect.stringContaining('December 31, 2026'),
      }),
    );
  });

  it('leaves the account untouched when Stripe fails', async () => {
    scheduleCancelForAccountDeletion.mockRejectedValue(new Error('stripe down'));

    await expect(requestAccountDeletion('user_1', { client, now: NOW })).rejects.toThrow();
    expect(disconnectConnection).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not flag the account when disconnecting a platform fails', async () => {
    disconnectConnection.mockRejectedValueOnce(new Error('db blip'));

    await expect(requestAccountDeletion('user_1', { client, now: NOW })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still deletes when the confirmation email cannot be sent', async () => {
    sendEmail.mockRejectedValue(new Error('resend 403'));

    await expect(requestAccountDeletion('user_1', { client, now: NOW })).resolves.toEqual({
      scheduledFor: PURGE,
    });
  });

  it('skips Stripe for someone who was never a customer', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, stripeCustomerId: null });

    await requestAccountDeletion('user_1', { client, now: NOW });
    expect(scheduleCancelForAccountDeletion).not.toHaveBeenCalled();
  });

  it('returns the existing date when the account is already scheduled', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, deletionScheduledFor: PURGE });

    await expect(requestAccountDeletion('user_1', { client, now: NOW })).resolves.toEqual({
      scheduledFor: PURGE,
    });
    expect(calls).toEqual([]);
  });
});

describe('restoreAccount', () => {
  it('resumes the subscription and clears the schedule', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, deletionScheduledFor: PURGE });

    expect(await restoreAccount('user_1', { client })).toBe(true);
    expect(calls).toEqual(['stripe.resume', 'user.update']);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { deletionRequestedAt: null, deletionScheduledFor: null, deletionReminderSentAt: null },
    });
  });

  it('restores even when Stripe is down', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, deletionScheduledFor: PURGE });
    resumeAfterAccountRestore.mockRejectedValue(new Error('stripe down'));

    expect(await restoreAccount('user_1', { client })).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('does nothing for an account that is not scheduled', async () => {
    expect(await restoreAccount('user_1', { client })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('sweepAccountDeletions', () => {
  const dueSoon = { ...USER, deletionScheduledFor: new Date('2026-11-05T00:00:00Z') };

  /** First findMany is the reminder query, second the purge query. */
  function scan(remind: unknown[], due: unknown[]) {
    prisma.user.findMany.mockResolvedValueOnce(remind).mockResolvedValueOnce(due);
  }

  it('reminds accounts inside the window and stamps them once sent', async () => {
    scan([dueSoon], []);

    const result = await sweepAccountDeletions({ client, now: NOW });

    expect(result).toEqual({ reminded: 1, purged: 0, failed: 0 });
    expect(prisma.user.findMany.mock.calls[0]![0].where).toEqual({
      deletionScheduledFor: { gt: NOW, lte: new Date('2026-11-08T12:00:00Z') },
      deletionReminderSentAt: null,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your PostPilot account will be deleted on November 5, 2026',
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { deletionReminderSentAt: NOW },
    });
  });

  it('leaves a reminder unstamped when it could not be sent, so tomorrow retries', async () => {
    scan([dueSoon], []);
    emailConfigured = false;

    const result = await sweepAccountDeletions({ client, now: NOW });

    expect(result.reminded).toBe(0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('purges due accounts: Stripe, then storage, then rows', async () => {
    scan([], [{ id: 'user_1', stripeCustomerId: 'cus_1' }]);

    const result = await sweepAccountDeletions({ client, now: NOW });

    expect(result).toEqual({ reminded: 0, purged: 1, failed: 0 });
    expect(calls).toEqual(['stripe.cancel', 'storage', 'user.delete']);
    expect(deletePrefix).toHaveBeenCalledWith('users/user_1');
  });

  it('keeps the rows when storage fails, and carries on with the next account', async () => {
    scan(
      [],
      [
        { id: 'user_1', stripeCustomerId: null },
        { id: 'user_2', stripeCustomerId: null },
      ],
    );
    deletePrefix.mockRejectedValueOnce(new Error('r2 down'));

    const result = await sweepAccountDeletions({ client, now: NOW });

    expect(result).toEqual({ reminded: 0, purged: 1, failed: 1 });
    expect(prisma.user.delete).toHaveBeenCalledTimes(1);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user_2' } });
  });
});
