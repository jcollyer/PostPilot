import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The inactivity purge deletes a creator's media without them asking, so these
 * pin the promises the policy makes: only free, quiet accounts with something
 * left to remove; two warnings, each actually delivered, before anything goes;
 * files deleted before rows say so; and one account's failure never stopping
 * the rest.
 */

const calls: string[] = [];

const sendEmail = vi.fn();
const deleteObject = vi.fn();

let emailConfigured = true;
let storageConfigured = true;

vi.mock('@postpilot/billing', () => ({ appBaseUrl: () => 'https://app.test' }));

vi.mock('@postpilot/notifications', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (params: unknown) => sendEmail(params),
}));

vi.mock('@postpilot/storage', () => ({
  isStorageConfigured: () => storageConfigured,
  deleteObject: (key: string) => deleteObject(key),
}));

vi.mock('@postpilot/db', () => ({ prisma: {}, Plan: { FREE: 'FREE' } }));

const { mediaRemovalDate, sweepInactiveFreeAccounts } = await import('./inactivity');

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-02T03:10:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const USER = {
  id: 'user_1',
  email: 'me@example.com',
  name: 'Jo Creator',
  timezone: 'UTC',
  lastActiveAt: daysAgo(150),
  inactivityWarningSentAt: null as Date | null,
  inactivityFinalWarningSentAt: null as Date | null,
};

const prisma = {
  user: { findMany: vi.fn(), updateMany: vi.fn() },
  video: { findMany: vi.fn(), updateMany: vi.fn() },
  image: { findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
};

const client = prisma as any;

/** First findMany is the first-warning query, second the final, third the purge. */
function scan(warn: unknown[], finalWarn: unknown[], due: unknown[]) {
  prisma.user.findMany
    .mockResolvedValueOnce(warn)
    .mockResolvedValueOnce(finalWarn)
    .mockResolvedValueOnce(due);
}

const whereOf = (call: number) => prisma.user.findMany.mock.calls[call]![0].where;

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  emailConfigured = true;
  storageConfigured = true;

  prisma.user.findMany.mockResolvedValue([]);
  prisma.user.updateMany.mockImplementation(async (args) => {
    calls.push('user.stamp');
    return { count: 1, args };
  });
  prisma.video.findMany.mockResolvedValue([
    { id: 'vid_1', storageKey: 'users/user_1/videos/vid_1/source.mp4' },
  ]);
  prisma.image.findMany.mockResolvedValue([
    { id: 'img_1', storageKey: 'users/user_1/images/img_1/source.jpg' },
  ]);
  prisma.video.updateMany.mockImplementation(async (args) => {
    calls.push('video.stamp');
    return args;
  });
  prisma.image.updateMany.mockImplementation(async (args) => {
    calls.push('image.stamp');
    return args;
  });
  prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
    calls.push('transaction');
    return Promise.all(ops);
  });

  sendEmail.mockImplementation(async () => calls.push('email'));
  deleteObject.mockImplementation(async (key: string) => calls.push(`delete:${key}`));
});

describe('eligibility', () => {
  it('only considers free accounts, not being deleted, with media still stored', async () => {
    await sweepInactiveFreeAccounts({ client, now: NOW });

    for (const call of [0, 1, 2]) {
      expect(whereOf(call)).toMatchObject({
        plan: 'FREE',
        deletionScheduledFor: null,
        OR: [
          { videos: { some: { sourceDeletedAt: null } } },
          { images: { some: { sourceDeletedAt: null } } },
        ],
      });
    }
  });

  it('warns at 150 days, warns again at 173, and purges at 180', async () => {
    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(whereOf(0)).toMatchObject({
      lastActiveAt: { lte: daysAgo(150) },
      inactivityWarningSentAt: null,
    });
    expect(whereOf(1)).toMatchObject({
      lastActiveAt: { lte: daysAgo(173) },
      inactivityFinalWarningSentAt: null,
    });
    expect(whereOf(2).lastActiveAt).toEqual({ lte: daysAgo(180) });
  });
});

describe('warning windows', () => {
  it('sends a final warning only once the first has had its 23 days, give or take the sweep', async () => {
    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(whereOf(1).inactivityWarningSentAt).toEqual({
      lte: new Date(NOW.getTime() - 23 * DAY + 12 * HOUR),
    });
  });

  it('purges only once both warnings are out and have run their notice', async () => {
    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(whereOf(2)).toMatchObject({
      inactivityWarningSentAt: { lte: new Date(NOW.getTime() - 30 * DAY + 12 * HOUR) },
      inactivityFinalWarningSentAt: { lte: new Date(NOW.getTime() - 7 * DAY + 12 * HOUR) },
    });
  });

  it('dates the removal 180 days after the last activity when warnings go out on time', () => {
    const lastActiveAt = new Date('2026-06-01T15:00:00Z');
    const firstSent = new Date(lastActiveAt.getTime() + 150 * DAY + 12 * HOUR);
    const finalSent = new Date(lastActiveAt.getTime() + 173 * DAY + 12 * HOUR);
    const end = new Date(lastActiveAt.getTime() + 180 * DAY);

    expect(mediaRemovalDate(lastActiveAt, firstSent, null)).toEqual(end);
    expect(mediaRemovalDate(lastActiveAt, firstSent, finalSent)).toEqual(end);
  });

  it('pushes the removal out when a warning went out late, keeping the promised notice', () => {
    // Email was down for weeks: the first warning only got out on day 175.
    const lastActiveAt = new Date('2026-01-01T00:00:00Z');
    const lateFirst = new Date(lastActiveAt.getTime() + 175 * DAY);

    expect(mediaRemovalDate(lastActiveAt, lateFirst, null)).toEqual(
      new Date(lateFirst.getTime() + 30 * DAY - 12 * HOUR),
    );
  });

  it('states the removal date in the creator’s timezone', async () => {
    scan(
      [
        {
          ...USER,
          timezone: 'America/Los_Angeles',
          lastActiveAt: new Date('2026-06-05T12:00:00Z'),
        },
      ],
      [],
      [],
    );

    await sweepInactiveFreeAccounts({ client, now: NOW });

    // 180 days after June 5 is December 2.
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'me@example.com',
        subject: 'Your PostPilot media will be deleted on December 2, 2026',
        text: expect.stringContaining('https://app.test/signin'),
      }),
    );
  });
});

describe('stamping', () => {
  it('stamps the first warning once sent, guarded against activity since it was loaded', async () => {
    scan([USER], [], []);

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result).toEqual({ warned: 1, finalWarned: 0, purged: 0, failed: 0 });
    expect(calls).toEqual(['email', 'user.stamp']);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', lastActiveAt: USER.lastActiveAt },
      data: { inactivityWarningSentAt: NOW },
    });
  });

  it('stamps the final warning once sent', async () => {
    const warned = { ...USER, lastActiveAt: daysAgo(173), inactivityWarningSentAt: daysAgo(23) };
    scan([], [warned], []);

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result.finalWarned).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/^Last reminder/) }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', lastActiveAt: warned.lastActiveAt },
      data: { inactivityFinalWarningSentAt: NOW },
    });
  });

  it('leaves a warning unstamped when the send fails, so tomorrow retries', async () => {
    scan([USER], [{ ...USER, inactivityWarningSentAt: daysAgo(23) }], []);
    sendEmail.mockRejectedValue(new Error('resend 403'));

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result).toEqual({ warned: 0, finalWarned: 0, purged: 0, failed: 0 });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('leaves a warning unstamped when email is not configured', async () => {
    scan([USER], [], []);
    emailConfigured = false;

    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not count a warning whose account became active mid-sweep', async () => {
    scan([USER], [], []);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result.warned).toBe(0);
  });
});

describe('purge', () => {
  const due = [{ id: 'user_1' }];

  it('deletes every stored file before stamping the rows', async () => {
    scan([], [], due);

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result).toEqual({ warned: 0, finalWarned: 0, purged: 1, failed: 0 });
    expect(calls).toEqual([
      'delete:users/user_1/videos/vid_1/source.mp4',
      'delete:users/user_1/images/img_1/source.jpg',
      'video.stamp',
      'image.stamp',
      'transaction',
    ]);
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['vid_1'] } },
      data: { sourceDeletedAt: NOW },
    });
    expect(prisma.image.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['img_1'] } },
      data: { sourceDeletedAt: NOW },
    });
  });

  it('removes only sources, keeping the account and every row', async () => {
    scan([], [], due);

    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(prisma.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1', sourceDeletedAt: null } }),
    );
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(client.user.delete).toBeUndefined();
  });

  it('stamps a row with no storage key without trying to delete anything', async () => {
    scan([], [], due);
    prisma.video.findMany.mockResolvedValue([{ id: 'vid_blank', storageKey: '' }]);
    prisma.image.findMany.mockResolvedValue([]);

    await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['vid_blank'] } },
      data: { sourceDeletedAt: NOW },
    });
  });

  it('stamps nothing when storage fails, and carries on with the next account', async () => {
    scan([], [], [{ id: 'user_1' }, { id: 'user_2' }]);
    deleteObject.mockRejectedValueOnce(new Error('r2 down'));

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result).toEqual({ warned: 0, finalWarned: 0, purged: 1, failed: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.video.findMany.mock.calls[1]![0].where.userId).toBe('user_2');
  });

  it('keeps warning but purges nothing when storage is not configured', async () => {
    storageConfigured = false;
    scan([USER], [], due);

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result).toEqual({ warned: 1, finalWarned: 0, purged: 0, failed: 0 });
    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('a failed warning does not stop the purge', async () => {
    scan([USER], [], due);
    sendEmail.mockRejectedValue(new Error('resend 403'));

    const result = await sweepInactiveFreeAccounts({ client, now: NOW });

    expect(result.purged).toBe(1);
  });
});
