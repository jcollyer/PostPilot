import { Plan, prisma as defaultPrisma, type Prisma, type PrismaClient } from '@postpilot/db';
import { deleteObject, isStorageConfigured } from '@postpilot/storage';
import {
  INACTIVE_MEDIA_FINAL_WARNING_DAYS,
  INACTIVE_MEDIA_PURGE_DAYS,
  INACTIVE_MEDIA_WARNING_DAYS,
} from '@postpilot/types';

import { inactivityFinalWarningEmail, inactivityWarningEmail } from './emails';
import { trySend } from './send';

/**
 * Inactive free account media purge.
 *
 * Storage bills every month for every file held, so a free account abandoned
 * with a full library costs money for as long as it sits there. Once a free
 * account has gone INACTIVE_MEDIA_PURGE_DAYS without activity (see ./activity),
 * its uploaded media is removed. The account is kept: sign-in, settings,
 * captions, thumbnails and post history all survive, exactly as a video whose
 * source the retention sweep removed.
 *
 * Two emails come first, at INACTIVE_MEDIA_WARNING_DAYS and
 * INACTIVE_MEDIA_FINAL_WARNING_DAYS, and the purge never runs until both have
 * actually been sent. A warning is stamped only once its send succeeds, so a
 * failed send retries the next night — and the removal date moves out with it,
 * so the creator always gets the full notice the emails promise (see
 * `mediaRemovalDate`). Any activity clears both stamps.
 *
 * Out of scope by design: paid accounts, accounts scheduled for deletion (the
 * deletion sweep owns those), and accounts with nothing left in storage, which
 * are neither warned nor purged.
 *
 * Ordering follows the deletion module's rule: storage deletes first, the
 * database stamps that record them last. A failure part-way leaves the
 * account's rows unstamped and the next sweep repeats the deletes, which R2
 * treats as success for objects already gone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Notice each warning promises: 30 days for the first, 7 for the final. */
const WARNING_NOTICE_MS = (INACTIVE_MEDIA_PURGE_DAYS - INACTIVE_MEDIA_WARNING_DAYS) * DAY_MS;
const FINAL_WARNING_NOTICE_MS =
  (INACTIVE_MEDIA_PURGE_DAYS - INACTIVE_MEDIA_FINAL_WARNING_DAYS) * DAY_MS;

/**
 * Warnings go out from a once-a-night sweep, so the notice they give is
 * measured to within half a day. Without this, a run that starts a few seconds
 * earlier than the night it sent the warning would push the purge a whole day
 * past the date in the email.
 */
const NOTICE_TOLERANCE_MS = 12 * 60 * 60 * 1000;

/** Most accounts one sweep will warn or purge, per kind. */
const SWEEP_LIMIT = 100;

const userFields = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  lastActiveAt: true,
  inactivityWarningSentAt: true,
  inactivityFinalWarningSentAt: true,
} as const;

type InactiveUser = Prisma.UserGetPayload<{ select: typeof userFields }>;

/**
 * When an account's media is removed, given the warnings sent so far: the end
 * of its inactive stretch, pushed back if a warning went out late so that the
 * first still gives 30 days' notice and the final 7. Pass a warning's send time
 * as `now` to get the date that warning should state.
 */
export function mediaRemovalDate(
  lastActiveAt: Date,
  warningSentAt: Date | null,
  finalWarningSentAt: Date | null,
): Date {
  const candidates = [lastActiveAt.getTime() + INACTIVE_MEDIA_PURGE_DAYS * DAY_MS];
  if (warningSentAt) {
    candidates.push(warningSentAt.getTime() + WARNING_NOTICE_MS - NOTICE_TOLERANCE_MS);
  }
  if (finalWarningSentAt) {
    candidates.push(finalWarningSentAt.getTime() + FINAL_WARNING_NOTICE_MS - NOTICE_TOLERANCE_MS);
  }
  return new Date(Math.max(...candidates));
}

/** Free, not being deleted, quiet since `lastActiveBefore`, and still holding files. */
function eligible(lastActiveBefore: Date): Prisma.UserWhereInput {
  return {
    plan: Plan.FREE,
    deletionScheduledFor: null,
    lastActiveAt: { lte: lastActiveBefore },
    OR: [
      { videos: { some: { sourceDeletedAt: null } } },
      { images: { some: { sourceDeletedAt: null } } },
    ],
  };
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

/**
 * Stamp a warning, unless the account became active since it was loaded: the
 * activity write clears the stamps, and stamping after it would carry a warning
 * into the next inactive stretch. Returns whether the stamp landed.
 */
async function stampWarning(
  prisma: PrismaClient,
  user: InactiveUser,
  data: Prisma.UserUpdateManyMutationInput,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, lastActiveAt: user.lastActiveAt },
    data,
  });
  return count > 0;
}

/**
 * Remove every stored source file the account still has, then stamp the rows.
 * Video rows, thumbnails, covers and metadata stay, as with source retention;
 * image rows stay too, with the photo itself gone. Throws on the first storage
 * failure so nothing is stamped as removed while its file is still held.
 */
async function purgeMedia(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<{ videos: number; images: number }> {
  const [videos, images] = await Promise.all([
    prisma.video.findMany({
      where: { userId, sourceDeletedAt: null },
      select: { id: true, storageKey: true },
    }),
    prisma.image.findMany({
      where: { userId, sourceDeletedAt: null },
      select: { id: true, storageKey: true },
    }),
  ]);

  // A blank key means the upload never got as far as storage; there is
  // nothing to remove, but the row is still stamped so it stops counting.
  for (const { storageKey } of [...videos, ...images]) {
    if (storageKey) await deleteObject(storageKey);
  }

  await prisma.$transaction([
    prisma.video.updateMany({
      where: { id: { in: videos.map((v) => v.id) } },
      data: { sourceDeletedAt: now },
    }),
    prisma.image.updateMany({
      where: { id: { in: images.map((i) => i.id) } },
      data: { sourceDeletedAt: now },
    }),
  ]);

  return { videos: videos.length, images: images.length };
}

export interface InactiveMediaSweepResult {
  /** First warnings sent. */
  warned: number;
  /** Final warnings sent. */
  finalWarned: number;
  /** Accounts whose media was removed. */
  purged: number;
  /** Purges that threw; retried by the next sweep. */
  failed: number;
}

/**
 * Daily: send the first and final warnings to inactive free accounts that are
 * due one, and remove the media of those whose notice has run out.
 */
export async function sweepInactiveFreeAccounts(
  options: { client?: PrismaClient; now?: Date } = {},
): Promise<InactiveMediaSweepResult> {
  const prisma = options.client ?? defaultPrisma;
  const now = options.now ?? new Date();
  const result: InactiveMediaSweepResult = { warned: 0, finalWarned: 0, purged: 0, failed: 0 };

  // 1. First warning.
  const warn = await prisma.user.findMany({
    where: {
      ...eligible(ago(now, INACTIVE_MEDIA_WARNING_DAYS * DAY_MS)),
      inactivityWarningSentAt: null,
    },
    select: userFields,
    orderBy: { lastActiveAt: 'asc' },
    take: SWEEP_LIMIT,
  });

  for (const user of warn) {
    const removal = mediaRemovalDate(user.lastActiveAt, now, null);
    // Stamped only once sent, so a failed send is retried tomorrow.
    const sent = await trySend(
      user.email,
      inactivityWarningEmail(user, removal),
      'inactivity warning',
    );
    if (sent && (await stampWarning(prisma, user, { inactivityWarningSentAt: now }))) {
      result.warned++;
    }
  }

  // 2. Final warning: a week before the removal date, which the first warning
  //    may have pushed out. Expressed as cutoffs so the query only returns
  //    accounts that are due: removal - 7 days <= now.
  const finalWarn = await prisma.user.findMany({
    where: {
      ...eligible(ago(now, INACTIVE_MEDIA_FINAL_WARNING_DAYS * DAY_MS)),
      inactivityWarningSentAt: {
        lte: ago(now, WARNING_NOTICE_MS - NOTICE_TOLERANCE_MS - FINAL_WARNING_NOTICE_MS),
      },
      inactivityFinalWarningSentAt: null,
    },
    select: userFields,
    orderBy: { lastActiveAt: 'asc' },
    take: SWEEP_LIMIT,
  });

  for (const user of finalWarn) {
    const removal = mediaRemovalDate(user.lastActiveAt, user.inactivityWarningSentAt, now);
    const sent = await trySend(
      user.email,
      inactivityFinalWarningEmail(user, removal),
      'final inactivity warning',
    );
    if (sent && (await stampWarning(prisma, user, { inactivityFinalWarningSentAt: now }))) {
      result.finalWarned++;
    }
  }

  // 3. Purge, once both warnings are out and the removal date has passed.
  if (!isStorageConfigured()) {
    console.warn('[accounts] storage is not configured — skipping inactive media purge');
    return result;
  }

  const due = await prisma.user.findMany({
    where: {
      ...eligible(ago(now, INACTIVE_MEDIA_PURGE_DAYS * DAY_MS)),
      inactivityWarningSentAt: { lte: ago(now, WARNING_NOTICE_MS - NOTICE_TOLERANCE_MS) },
      inactivityFinalWarningSentAt: {
        lte: ago(now, FINAL_WARNING_NOTICE_MS - NOTICE_TOLERANCE_MS),
      },
    },
    select: { id: true },
    orderBy: { lastActiveAt: 'asc' },
    take: SWEEP_LIMIT,
  });

  for (const user of due) {
    try {
      const removed = await purgeMedia(prisma, user.id, now);
      result.purged++;
      console.log(
        `[accounts] inactive media purged: userId=${user.id} videos=${removed.videos} images=${removed.images}`,
      );
    } catch (err) {
      result.failed++;
      console.error(
        `[accounts] failed to purge inactive media for userId=${user.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}
