import { schedules } from '@trigger.dev/sdk';
import { findDueTaskIds } from '@postpilot/publishing';
import { publishTaskRun } from './publish-task';

/**
 * Safety net only — the real path is `publish-task`, armed at each task's exact
 * `scheduledAt` by the scheduler (see packages/queue/src/scheduler.ts).
 *
 * This used to run `* * * * *`. Neon suspends a compute after 5 minutes idle, so
 * a query every 60 seconds pinned the database on 24/7 and was, by itself,
 * the bulk of the project's CU-hour bill. At :00/:30 it now catches only
 * stragglers: tasks whose delayed run was never armed (a trigger that failed
 * silently) or was lost to a deploy.
 *
 * Note it *arms* `publish-task` rather than publishing inline, so anything it
 * picks up re-arms its own follow-up polls instead of waiting another 30
 * minutes for the next tick.
 */
export const publishDue = schedules.task({
  id: 'publish-due',
  cron: '0,30 * * * *',
  run: async () => {
    const ids = await findDueTaskIds();
    if (ids.length === 0) return { swept: 0 };

    await publishTaskRun.batchTrigger(
      ids.map((taskId) => ({
        payload: { taskId },
        options: {
          // Don't double-fire a task that already has a delayed run pending.
          idempotencyKey: ['publish-sweep', taskId],
          idempotencyKeyTTL: '30m',
        },
      })),
    );
    return { swept: ids.length };
  },
});
