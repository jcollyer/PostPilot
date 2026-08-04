import { type NotificationType, type Platform, type PrismaClient } from '@postpilot/db';
import { tasks } from '@trigger.dev/sdk';

/**
 * Kick the dispatcher for a freshly created notification instead of waiting for
 * a cron to discover it.
 *
 * The `notify-dispatch` cron used to run every 2 minutes, which (like the old
 * publish cron) meant the Neon compute never got the 5 idle minutes it needs to
 * scale to zero. Dispatching on write keeps delivery effectively immediate while
 * letting the database sleep when nothing is happening.
 *
 * Best-effort: the cron sweep at :00/:30 remains the reliable floor, so a
 * missing TRIGGER_SECRET_KEY or a trigger error must never fail the write that
 * produced the notification.
 */
async function kickDispatch() {
  try {
    await tasks.trigger(
      'notify-dispatch-now',
      {},
      {
        // A burst of alerts (e.g. several platforms failing at once) collapses
        // into a single dispatch run rather than one per notification.
        idempotencyKey: ['notify-dispatch-now'],
        idempotencyKeyTTL: '30s',
        delay: '5s',
      },
    );
  } catch {
    // Swallow — the notify-dispatch sweep will deliver this.
  }
}

/**
 * Create a notification, deduplicated on `dedupeKey` while one is still PENDING
 * (so a burst of identical events yields a single alert). The dispatcher then
 * fans it out to the channels and also throttles repeats over time.
 */
export async function createNotification(
  prisma: PrismaClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    platform?: Platform;
    relatedVideoId?: string;
    relatedConnectionId?: string;
    dedupeKey: string;
  },
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { userId: params.userId, dedupeKey: params.dedupeKey, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      platform: params.platform ?? null,
      relatedVideoId: params.relatedVideoId ?? null,
      relatedConnectionId: params.relatedConnectionId ?? null,
      dedupeKey: params.dedupeKey,
    },
  });
  await kickDispatch();
  return true;
}
