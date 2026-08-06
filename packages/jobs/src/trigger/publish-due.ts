import { schedules } from '@trigger.dev/sdk';
import { findDueTasks } from '@postpilot/publishing';
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
    const due = await findDueTasks();
    if (due.length === 0) return { swept: 0 };

    await publishTaskRun.batchTrigger(
      due.map((t) => ({
        payload: { taskId: t.id },
        options: {
          // Deliberately the *same* key the scheduler arms with
          // (packages/queue/src/scheduler.ts) so a sweep landing on a slot's own
          // minute collapses into that run instead of racing it. A 6:30 slot is
          // exactly a :30 tick, so this collided every single day: two runs, two
          // uploads, two copies of the video on the platform.
          //
          // This only dedupes the common case — a task re-armed for a retry
          // carries a different timestamp, and Trigger.dev keys expire. The
          // atomic claim in `processTask` is what actually guarantees one
          // publish; this just avoids paying for the losing run.
          idempotencyKey: ['publish-task', t.id, String(t.scheduledAt.getTime())],
          idempotencyKeyTTL: '24h',
        },
      })),
    );
    return { swept: due.length };
  },
});
