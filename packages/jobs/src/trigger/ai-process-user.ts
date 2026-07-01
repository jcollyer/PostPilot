import { task } from '@trigger.dev/sdk';
import { processPending } from '@postpilot/ai-pipeline';

/**
 * On-demand drain of a single user's PENDING videos, fired from the upload flow
 * (`media.completeUpload`) so a fresh upload starts processing immediately
 * instead of waiting up to 5 minutes for the `ai-process` cron.
 *
 * The cron remains the reliable floor: if this trigger is never fired (e.g. the
 * web app has no TRIGGER_SECRET_KEY) or only drains part of a large burst, the
 * cron picks up whatever is left. Callers consolidate rapid uploads into one
 * run via an idempotency key + short delay, so a batch upload doesn't spawn a
 * run per file.
 */
export const aiProcessUser = task({
  id: 'ai-process-user',
  // Same bound as the cron: a wedged video can't hold the run for the full
  // global 3600s; the next drain (this or the cron) reclaims stale RUNNING rows.
  maxDuration: 600,
  run: async (payload: { userId: string }) => {
    const results = await processPending({ userId: payload.userId, limit: 25 });
    return { processed: results.length, failed: results.filter((r) => !r.ok).length };
  },
});
