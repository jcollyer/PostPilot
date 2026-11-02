import { schedules } from '@trigger.dev/sdk';
import { sweepInactiveFreeAccounts } from '@postpilot/accounts';

/**
 * Daily: warn free accounts that have gone quiet, and remove the uploaded
 * media of those still inactive once both warnings have run their course (see
 * @postpilot/accounts' inactivity module). The accounts themselves are kept.
 *
 * Runs at 03:10 UTC alongside the account-deletion and retention sweeps so the
 * database wakes once for the night's housekeeping rather than once per job. A
 * warning that fails to send, or a purge that fails part-way, is retried the
 * next night.
 */
export const inactiveMediaSweep = schedules.task({
  id: 'inactive-media-sweep',
  cron: '10 3 * * *',
  run: async () => sweepInactiveFreeAccounts(),
});
