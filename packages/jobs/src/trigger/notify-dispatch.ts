import { schedules } from '@trigger.dev/sdk';
import { dispatchPending } from '@postpilot/notifications';

/**
 * Safety-net sweep for pending notifications (email/push/SMS). The timely path
 * is `notify-dispatch-now`, fired by `createNotification` on write.
 *
 * Was every 2 minutes, which alone kept the Neon compute from ever suspending
 * (it scales to zero only after 5 idle minutes). Aligned to :00/:30 with the
 * other crons so all of them share a single wake window instead of each
 * starting its own.
 */
export const notifyDispatch = schedules.task({
  id: 'notify-dispatch',
  cron: '0,30 * * * *',
  run: async () => dispatchPending(),
});
