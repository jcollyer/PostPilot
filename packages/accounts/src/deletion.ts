import {
  cancelAllSubscriptions,
  isBillingConfigured,
  resumeAfterAccountRestore,
  scheduleCancelForAccountDeletion,
} from '@postpilot/billing';
import { disconnectConnection } from '@postpilot/connectors';
import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';
import { deletePrefix, isStorageConfigured, userPrefix } from '@postpilot/storage';
import { ACCOUNT_DELETION_REMINDER_DAYS, accountDeletionDate } from '@postpilot/types';

import { deletionConfirmationEmail, deletionReminderEmail } from './emails';
import { trySend } from './send';

/**
 * Account deletion as a soft delete with a grace period.
 *
 * Deleting an account does everything a creator would notice at once — signed
 * out everywhere, platforms disconnected (which also revokes our tokens, as the
 * privacy policy promises), queue paused, paid plan set not to renew — but
 * keeps the library for ACCOUNT_DELETION_GRACE_DAYS. Signing in during that
 * window offers a restore. Once it passes, the daily sweep removes the rows and
 * every stored file.
 *
 * Ordering follows one rule throughout: steps that reach outside the database
 * run first and abort on failure, and the database write that records the
 * outcome runs last. A failure part-way leaves the account as it was (bar
 * whatever already succeeded, which a retry repeats harmlessly), never flagged
 * as done with work still outstanding.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Most accounts one sweep will remind or purge, per kind. */
const SWEEP_LIMIT = 100;

const userFields = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  stripeCustomerId: true,
  deletionScheduledFor: true,
} as const;

export interface DeletionRequestResult {
  scheduledFor: Date;
}

/**
 * Deactivate an account and schedule its purge. Idempotent: deleting an
 * account that is already scheduled returns the existing date.
 */
export async function requestAccountDeletion(
  userId: string,
  options: { client?: PrismaClient; now?: Date } = {},
): Promise<DeletionRequestResult> {
  const prisma = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: userFields });
  if (!user) throw new Error(`No user ${userId}.`);
  if (user.deletionScheduledFor) return { scheduledFor: user.deletionScheduledFor };

  // 1. Stripe. A failure here aborts: better to leave the account untouched
  //    than deactivated and still renewing.
  if (user.stripeCustomerId) {
    if (isBillingConfigured()) {
      await scheduleCancelForAccountDeletion(user.stripeCustomerId);
    } else {
      console.warn(`[accounts] billing is not configured — not canceling for userId=${userId}`);
    }
  }

  // 2. Platforms. Revokes our tokens where the platform supports it and drops
  //    the connection, which also stops publishing: the publisher holds any
  //    task whose connection is gone. Restoring means reconnecting.
  const connections = await prisma.platformConnection.findMany({
    where: { userId },
    select: { id: true },
  });
  for (const connection of connections) {
    await disconnectConnection({ userId, connectionId: connection.id });
  }

  // 3. Record it, and deactivate everything that lives in the database. The
  //    queue comes back paused on restore so nothing overdue posts in a burst;
  //    pending alerts are suppressed so a deleted account gets no queue mail.
  const scheduledFor = accountDeletionDate(now);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        deletionReminderSentAt: null,
      },
    }),
    prisma.queue.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'PAUSED', pausedAt: now },
    }),
    prisma.notification.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'SUPPRESSED' },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);

  console.log(`[accounts] deletion scheduled: userId=${userId} for=${scheduledFor.toISOString()}`);

  await trySend(user.email, deletionConfirmationEmail(user, scheduledFor), 'deletion confirmation');

  return { scheduledFor };
}

/**
 * Cancel a scheduled deletion. The queue stays paused and platforms stay
 * disconnected — the creator reconnects and resumes when they're ready.
 * Returns false when there was nothing to restore.
 */
export async function restoreAccount(
  userId: string,
  options: { client?: PrismaClient } = {},
): Promise<boolean> {
  const prisma = options.client ?? defaultPrisma;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: userFields });
  if (!user?.deletionScheduledFor) return false;

  // Best effort: a Stripe outage shouldn't keep someone out of their own
  // account. If it fails the plan still shows as ending in Settings, where the
  // Customer Portal can resume it.
  if (user.stripeCustomerId && isBillingConfigured()) {
    try {
      await resumeAfterAccountRestore(user.stripeCustomerId);
    } catch (err) {
      console.error(`[accounts] failed to resume subscription for userId=${userId}:`, err);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: null, deletionScheduledFor: null, deletionReminderSentAt: null },
  });

  console.log(`[accounts] deletion canceled: userId=${userId}`);
  return true;
}

/**
 * Remove an account for good: any subscription still running, every stored
 * file, then the rows (every User relation cascades). Throws on failure so the
 * account is left for the next sweep rather than half-removed.
 */
async function purgeAccount(
  prisma: PrismaClient,
  user: { id: string; stripeCustomerId: string | null },
): Promise<void> {
  if (user.stripeCustomerId && isBillingConfigured()) {
    // A subscription normally ran out well within the grace period; an annual
    // one may not have, and nobody is left to bill.
    await cancelAllSubscriptions(user.stripeCustomerId);
  }
  if (isStorageConfigured()) {
    await deletePrefix(userPrefix(user.id));
  }
  await prisma.user.delete({ where: { id: user.id } });
}

export interface AccountDeletionSweepResult {
  /** "Last chance" emails sent. */
  reminded: number;
  /** Accounts removed for good. */
  purged: number;
  /** Purges that threw; retried by the next sweep. */
  failed: number;
}

/**
 * Daily: send the reminder to accounts within ACCOUNT_DELETION_REMINDER_DAYS of
 * their purge, and purge the ones whose date has passed.
 */
export async function sweepAccountDeletions(
  options: { client?: PrismaClient; now?: Date } = {},
): Promise<AccountDeletionSweepResult> {
  const prisma = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();
  const result: AccountDeletionSweepResult = { reminded: 0, purged: 0, failed: 0 };

  const remind = await prisma.user.findMany({
    where: {
      deletionScheduledFor: {
        gt: now,
        lte: new Date(now.getTime() + ACCOUNT_DELETION_REMINDER_DAYS * DAY_MS),
      },
      deletionReminderSentAt: null,
    },
    select: userFields,
    take: SWEEP_LIMIT,
  });

  for (const user of remind) {
    // Stamped only once sent, so a failed send is retried tomorrow.
    const sent = await trySend(
      user.email,
      deletionReminderEmail(user, user.deletionScheduledFor!),
      'deletion reminder',
    );
    if (!sent) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { deletionReminderSentAt: now },
    });
    result.reminded++;
  }

  const due = await prisma.user.findMany({
    where: { deletionScheduledFor: { lte: now } },
    select: { id: true, stripeCustomerId: true },
    orderBy: { deletionScheduledFor: 'asc' },
    take: SWEEP_LIMIT,
  });

  for (const user of due) {
    try {
      await purgeAccount(prisma, user);
      result.purged++;
      console.log(`[accounts] account purged: userId=${user.id}`);
    } catch (err) {
      result.failed++;
      console.error(
        `[accounts] failed to purge userId=${user.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}
