import { schedules } from '@trigger.dev/sdk';
import { refreshDueProfiles } from '@postpilot/connectors';

/**
 * Daily: re-cache creator profile snapshots (bio + recent posts, used as AI
 * style context) and re-mirror account avatars.
 *
 * Daily rather than refresh-connections' hourly cadence: profile "vibe" data
 * changes far more slowly than access tokens. Offset from the other daily cron
 * (queue-health at 12:00) so they don't contend.
 */
export const refreshProfiles = schedules.task({
  id: 'refresh-profiles',
  cron: '30 3 * * *',
  run: async () => {
    const results = await refreshDueProfiles();
    return { checked: results.length, failed: results.filter((r) => !r.ok).length };
  },
});
