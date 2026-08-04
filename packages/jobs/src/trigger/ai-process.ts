import { schedules } from '@trigger.dev/sdk';
import { processPending } from '@postpilot/ai-pipeline';

/**
 * Safety-net drain of PENDING videos through the AI pipeline (transcribe,
 * metadata, embeddings, pHash, dedupe). ffmpeg is provided by the ffmpeg build
 * extension. The timely path is `ai-process-user`, fired from the upload flow in
 * `media.completeUpload` — uploads have never waited on this cron.
 *
 * Was every 5 minutes. That's exactly Neon's scale-to-zero threshold, so the
 * compute was suspending (if at all) only to be woken straight back up. At
 * :00/:30 it shares one wake window with the other crons and reclaims rows
 * stranded by a failed trigger or a deploy.
 */
export const aiProcess = schedules.task({
  id: 'ai-process',
  cron: '0,30 * * * *',
  // ffmpeg frame extraction + in-memory frames for the vision step blow past
  // the default small-1x (0.5 GB) on large/long/high-res videos, which the
  // worker reports as a "Crashed" OOM kill. medium-1x (2 GB) gives real
  // headroom; bump further if a single video still OOMs.
  machine: 'medium-1x',
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
