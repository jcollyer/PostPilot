import { task } from '@trigger.dev/sdk';
import { dispatchPending } from '@postpilot/notifications';

/**
 * On-demand drain of pending notifications, fired by `createNotification` the
 * moment an alert is written.
 *
 * Replaces the delivery latency the old every-2-minutes cron bought us. That
 * cron touched the database 720 times a day, so the Neon compute never got the
 * 5 consecutive idle minutes it needs to suspend. Callers pass a shared
 * idempotency key + 5s delay, so a burst of alerts collapses into one run.
 */
export const notifyDispatchNow = task({
  id: 'notify-dispatch-now',
  maxDuration: 300,
  run: async () => dispatchPending(),
});
