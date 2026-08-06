import { prisma, type NotificationType, type Platform, type Prisma } from '@postpilot/db';
import { tasks } from '@trigger.dev/sdk';

/**
 * Connection-health alerts.
 *
 * These are the only warning a creator gets that a platform has stopped
 * accepting their posts, so they need to be both deduplicated (a dead connection
 * holds every queued post for that platform at once — that's one problem, not
 * twenty) and prompt.
 */
export interface ConnectionNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  platform?: Platform;
  relatedConnectionId?: string;
  dedupeKey: string;
}

/**
 * Write a PENDING notification unless an identical one is already waiting.
 * Returns whether a row was actually created, so the caller knows whether a
 * delivery nudge is warranted.
 *
 * Takes a client so it can participate in a caller's transaction — flipping a
 * connection to NEEDS_RECONNECT and recording the alert should either both
 * happen or neither.
 */
export async function insertNotification(
  client: Prisma.TransactionClient,
  params: ConnectionNotification,
): Promise<boolean> {
  const existing = await client.notification.findFirst({
    where: { userId: params.userId, dedupeKey: params.dedupeKey, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return false;

  await client.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      platform: params.platform ?? null,
      relatedConnectionId: params.relatedConnectionId ?? null,
      dedupeKey: params.dedupeKey,
    },
  });
  return true;
}

/**
 * Ask the dispatcher to deliver now instead of at its next :00/:30 sweep.
 *
 * Without this a reconnect alert can sit undelivered for half an hour — which is
 * exactly how long it took a real dead connection to go unreported past the post
 * it had already broken. Best-effort by design: the sweep is still the floor, so
 * a failed trigger costs latency, never the alert itself.
 */
export async function dispatchSoon(): Promise<void> {
  try {
    await tasks.trigger(
      'notify-dispatch-now',
      {},
      {
        // Collapse a burst (one alert per connection) into a single delivery run.
        idempotencyKey: ['notify-dispatch-now'],
        idempotencyKeyTTL: '30s',
        delay: '5s',
      },
    );
  } catch {
    // Swallow — the sweep will deliver this.
  }
}

/** `insertNotification` outside a transaction, plus the delivery nudge. */
export async function createNotification(params: ConnectionNotification): Promise<void> {
  const created = await insertNotification(prisma, params);
  if (created) await dispatchSoon();
}
