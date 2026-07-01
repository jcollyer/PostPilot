import { schedules } from '@trigger.dev/sdk';
import { processPending } from '@postpilot/ai-pipeline';

/**
 * Every 5 minutes: drain PENDING videos through the AI pipeline (transcribe,
 * metadata, embeddings, pHash, dedupe). ffmpeg is provided by the ffmpeg build
 * extension. For instant processing you can also trigger this from the upload
 * flow instead of waiting for the cron.
 */
export const aiProcess = schedules.task({
  id: 'ai-process',
  cron: '*/5 * * * *',
  // Cap well below the global 3600s. processPending drains a small batch
  // sequentially; if one video wedges (a hung ffmpeg/OpenAI call), this bounds
  // the damage to ~10 min instead of holding the run for a full hour. The next
  // cron reclaims anything left stranded in RUNNING (see processPending).
  maxDuration: 600,
  run: async () => {
    const results = await processPending();
    return { processed: results.length, failed: results.filter((r) => !r.ok).length };
  },
});
