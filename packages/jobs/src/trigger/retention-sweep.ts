import { schedules } from '@trigger.dev/sdk';
import { sweepPublishedSources } from '@postpilot/publishing';

/**
 * Daily: remove source files for videos that opted-in creators published more
 * than the retention window ago (see User.deleteSourceAfterPublish).
 *
 * Runs at 03:10 UTC — off the hour, and clear of the noon queue-health check —
 * so a large sweep doesn't contend with publishing work. Anything left over
 * because it exceeded the per-run limit is picked up by the next night's run.
 */
export const retentionSweep = schedules.task({
  id: 'retention-sweep',
  cron: '10 3 * * *',
  run: async () => sweepPublishedSources(),
});
