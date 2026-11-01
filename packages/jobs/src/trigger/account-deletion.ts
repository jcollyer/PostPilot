import { schedules } from '@trigger.dev/sdk';
import { sweepAccountDeletions } from '@postpilot/accounts';

/**
 * Daily: email accounts a week out from their purge, and purge the ones whose
 * grace period has ended (see @postpilot/accounts' deletion module).
 *
 * Runs at 03:10 UTC alongside the retention sweep so the database wakes once
 * for the night's housekeeping rather than once per job. A purge that fails is
 * left scheduled and retried the next night.
 */
export const accountDeletionSweep = schedules.task({
  id: 'account-deletion-sweep',
  cron: '10 3 * * *',
  run: async () => sweepAccountDeletions(),
});
