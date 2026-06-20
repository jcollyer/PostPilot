import { publishDueTasks } from '../runner';

/**
 * Dev convenience: long-running loop that publishes due tasks + polls in-flight
 * posts on an interval, so you don't re-run `publish:due` by hand.
 *
 *   npm run publish:watch        (Ctrl+C to stop)
 *   PUBLISH_POLL_MS=30000 npm run publish:watch
 *
 * Stand-in for the Trigger.dev cron that runs `publishDueTasks()` in production.
 */
const POLL_MS = Number(process.env.PUBLISH_POLL_MS ?? 30_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[publish:watch] checking for due posts every ${POLL_MS}ms — Ctrl+C to stop.`);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[publish:watch] stopping…');
  });

  while (!stopping) {
    try {
      const results = await publishDueTasks();
      if (results.length > 0) {
        const by = (o: string) => results.filter((r) => r.outcome === o).length;
        console.log(
          `[publish:watch] ${results.length} task(s): ${by('published')} published, ` +
            `${by('processing')} processing, ${by('retry')} retry, ${by('failed')} failed, ${by('held')} held`,
        );
      }
    } catch (err) {
      console.error('[publish:watch] batch error:', err);
    }
    if (!stopping) await sleep(POLL_MS);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[publish:watch] fatal error', err);
  process.exit(1);
});
