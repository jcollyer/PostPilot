import { task } from '@trigger.dev/sdk';
import { processTask } from '@postpilot/publishing';

/**
 * Publish (or poll) a single task, fired at its exact `scheduledAt` rather than
 * discovered by a polling cron.
 *
 * Why this exists: the old design leaned entirely on a `* * * * *` cron. Neon
 * suspends a compute after 5 minutes of inactivity, so a query every 60 seconds
 * meant the database never once scaled to zero — ~0.57 CU billed 24/7 for a
 * workload that is idle almost all of the time. Scheduling the work for the
 * moment it's actually due keeps publish latency at zero while letting the
 * compute sleep in between.
 *
 * Self-re-arming: a publish that comes back `processing` (the platform is still
 * transcoding) or `retry` (recoverable error, backed off) reports its
 * `nextAttemptAt`, and we re-trigger at that timestamp. `publish-due` remains as
 * a 30-minute safety net for anything that slips through — a run that was never
 * armed, or one lost to a deploy.
 */
export const publishTaskRun = task({
  id: 'publish-task',
  // Uploads stream rather than buffer, so memory no longer scales with file
  // size — but the default preset is only 0.5 GB, and running a media upload
  // that close to the limit is how this failed before: the process is killed
  // outright, with no exception to catch and nothing recorded on the task.
  // Headroom here is far cheaper than an orphaned upload on the channel.
  machine: 'small-2x',
  // A single publish: upload/commit against one platform API. Bounded well below
  // the global 3600s so a hung platform call can't hold a run for an hour.
  //
  // Must stay under CLAIM_LEASE_MS (15m) in @postpilot/publishing: the lease is
  // what lets a killed run's task be picked up again, so it has to outlive the
  // longest run that could still be working.
  maxDuration: 600,
  run: async (payload: { taskId: string }) => {
    const result = await processTask(payload.taskId);

    // Terminal outcomes (published / failed / held / skipped) need no follow-up.
    if (result.outcome !== 'processing' && result.outcome !== 'retry') {
      return { taskId: payload.taskId, outcome: result.outcome, detail: result.detail };
    }

    // Re-arm at the exact moment the runner asked for. Fall back to a short
    // delay if nextAttemptAt is missing or already in the past.
    const at = result.nextAttemptAt ?? null;
    const delay = at && at.getTime() > Date.now() ? at : new Date(Date.now() + 30_000);

    await publishTaskRun.trigger(
      { taskId: payload.taskId },
      {
        delay,
        // If something else already armed this same follow-up (e.g. a concurrent
        // safety-net cron pass), collapse to one run rather than two.
        idempotencyKey: ['publish-task', payload.taskId, String(delay.getTime())],
        idempotencyKeyTTL: '1h',
      },
    );

    return {
      taskId: payload.taskId,
      outcome: result.outcome,
      detail: result.detail,
      requeuedFor: delay.toISOString(),
    };
  },
});
