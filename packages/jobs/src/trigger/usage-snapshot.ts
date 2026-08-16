import { schedules } from '@trigger.dev/sdk';
import { snapshotAllUsers, sweepAbandonedUploads } from '@postpilot/usage';

/**
 * Daily: record each user's storage and AI usage for the day.
 *
 * Runs at 03:40 UTC — after the 03:10 retention sweep — so the numbers reflect
 * the library once removed sources are gone, rather than double-counting files
 * that were deleted minutes later.
 */
export const usageSnapshot = schedules.task({
  id: 'usage-snapshot',
  cron: '40 3 * * *',
  run: async () => {
    // Clear abandoned uploads first so the snapshot records real usage rather
    // than quota held by rows that will never finish.
    const reclaimed = await sweepAbandonedUploads();
    const snapshot = await snapshotAllUsers();
    return { reclaimed, snapshot };
  },
});
