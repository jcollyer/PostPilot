import { refreshDueProfiles } from '../profile-service';

/**
 * Cron entrypoint for the creator-profile snapshot cache (bio + recent
 * posts, used as AI style context).
 *
 * Run on a schedule (e.g. daily — profile "vibe" changes far more slowly
 * than access tokens, so this doesn't need refresh-due-connections' hourly
 * cadence):
 *   npm --workspace=@postpilot/connectors run refresh:profiles
 *
 * Same plain-script-for-now pattern as refresh-due-connections.ts; wrap in a
 * durable Trigger.dev cron task in the background-jobs chunk without
 * changing the underlying logic.
 */
async function main() {
  const startedAt = Date.now();
  const results = await refreshDueProfiles();
  const refreshed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(
    `[profiles] checked ${results.length} due connection(s): ${refreshed} refreshed, ${failed.length} failed in ${Date.now() - startedAt}ms`,
  );
  for (const f of failed) {
    console.warn(`[profiles] ${f.platform} ${f.id}: fetch failed or unsupported`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[profiles] fatal error', err);
    process.exit(1);
  });
