import { join } from 'node:path';

import { prisma } from '@postpilot/db';
import { downloadToFile } from '@postpilot/storage';

import { describeOpenAIError, isAiConfigured } from './config';
import { checkVideoLimits } from './limits';
import { extractGray9x8, probeMedia } from './ffmpeg';
import { dHashFromGray9x8 } from './phash';
import { extractThumbnails } from './steps/frames';
import { transcribeVideo } from './steps/transcribe';
import { generateMetadata, type CreatorProfileContext } from './steps/metadata';
import { getCreatorContext } from './steps/style-examples';
import { embedVideo } from './steps/embeddings';
import { detectDuplicates } from './steps/duplicates';
import { persistMetadata } from './steps/persist';
import { withTempDir } from './workdir';

export interface ProcessResult {
  videoId: string;
  ok: boolean;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * Run the full AI pipeline for one video. Ordered steps, each isolated so a
 * later failure doesn't lose earlier work:
 *   probe → frames → transcribe → creator context + profile →
 *   metadata (vision) → persist → embeddings → pHash → duplicate detection.
 *
 * Sets aiStatus RUNNING up front and COMPLETED/FAILED at the end. Designed to
 * be wrapped by a durable Trigger.dev task later without changing this logic.
 */
/**
 * Resolve a video's folder chain into a readable path, root → leaf
 * (e.g. ["Travel", "Japan 2024", "Tokyo"]). Returns [] for root-level videos
 * (folderId === null). Walks up parentId with a small depth cap so a corrupt
 * self-referential cycle can never loop forever.
 */
async function resolveFolderPath(folderId: string | null): Promise<string[]> {
  const names: string[] = [];
  let currentId = folderId;
  const MAX_DEPTH = 20;
  for (let i = 0; i < MAX_DEPTH && currentId; i++) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { name: true, parentId: true },
    });
    if (!folder) break;
    names.push(folder.name);
    currentId = folder.parentId;
  }
  return names.reverse();
}

export async function processVideo(videoId: string): Promise<ProcessResult> {
  // Missing config is a hard, operator-visible failure — not a silent skip.
  // Leaving the row PENDING makes the UI spin forever (the cron just re-skips
  // it every 5 min); marking FAILED surfaces the error badge and lets the user
  // re-queue via "Generate Metadata" once the key is set in the worker env.
  if (!isAiConfigured()) {
    await prisma.video
      .update({ where: { id: videoId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId, ok: false, error: 'OPENAI_API_KEY is not set' };
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return { videoId, ok: false, error: 'video not found' };
  if (!video.storageKey) return { videoId, ok: false, error: 'video has no storage key' };

  // Cheap pre-download guard: if what we already know (upload file size, any
  // stored duration) is over the limits, fail now — before pulling a multi-GB
  // file down and OOMing the worker. Marking FAILED (not leaving it PENDING)
  // keeps the cron from re-picking it every 5 min and surfaces the reason.
  const preReason = checkVideoLimits({
    fileSize: video.fileSize,
    durationSec: video.durationSec,
  });
  if (preReason) {
    await prisma.video
      .update({ where: { id: videoId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId, ok: false, error: `skipped oversized video: ${preReason}` };
  }

  // Stamp aiStartedAt so a run killed mid-pipeline (before the catch below can
  // set FAILED) can be detected as stale and reclaimed by processPending. Bump
  // aiAttempts in the same write, up front, so the count survives an OOM kill
  // that never reaches the catch — this is what lets processPending eventually
  // retire a poison-pill video instead of reclaiming it forever.
  await prisma.video.update({
    where: { id: videoId },
    data: { aiStatus: 'RUNNING', aiStartedAt: new Date(), aiAttempts: { increment: 1 } },
  });

  try {
    const result = await withTempDir(async (dir) => {
      const localPath = join(dir, 'source');
      await downloadToFile(video.storageKey, localPath);

      // 1. Probe + backfill media properties we don't already have.
      const info = await probeMedia(localPath);
      await prisma.video.update({
        where: { id: videoId },
        data: {
          durationSec: video.durationSec ?? info.durationSec,
          width: video.width ?? info.width,
          height: video.height ?? info.height,
          status: video.status === 'UPLOADING' ? 'READY' : video.status,
        },
      });

      // Re-check limits now that ffprobe has given us the real duration (the
      // upload often has no stored durationSec). Bail before extractThumbnails —
      // the memory-heavy step — so a too-long video fails cleanly instead of
      // OOMing here. Thrown → caught below → marked FAILED with this reason.
      const probeReason = checkVideoLimits({ durationSec: info.durationSec });
      if (probeReason) throw new Error(`skipped oversized video: ${probeReason}`);

      // 2. Candidate thumbnails (kept in memory for the vision step).
      const frames = await extractThumbnails(prisma, {
        userId: video.userId,
        videoId,
        localPath,
        info,
      });

      // 3. Transcription (null when there's no audio). Non-fatal: a failure
      //    shouldn't sink the whole video — we fall back to frames-only.
      //    A transcript already stored on the row (from a previous run — e.g.
      //    a "Generate Metadata" re-queue, or a retry after a later step
      //    failed) is reused as-is: the audio hasn't changed, so re-paying
      //    the per-minute transcription cost would buy nothing.
      let transcript: string | null = video.transcript?.trim() || null;
      if (!transcript) {
        try {
          transcript = await transcribeVideo({ localPath, info, tmpDir: dir });
          if (transcript) {
            await prisma.video.update({ where: { id: videoId }, data: { transcript } });
          }
        } catch (err) {
          console.warn(
            `[ai] transcription failed for ${videoId} (continuing): ${describeOpenAIError(err)}`,
          );
        }
      }

      // 4. Creator context — bio + past posts, preferring the creator's own
      //    connected platforms (cached by @postpilot/connectors) and topping
      //    up with in-app library examples (via pgvector similarity on the
      //    transcript, falling back to recent videos). Non-fatal: worst case
      //    is generating with no bio/examples, same as before this existed.
      let creatorContext: Awaited<ReturnType<typeof getCreatorContext>> = {
        bio: null,
        examples: [],
      };
      try {
        creatorContext = await getCreatorContext(prisma, {
          userId: video.userId,
          videoId,
          transcript,
        });
      } catch (err) {
        console.warn(
          `[ai] creator context failed for ${videoId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      // 4b. Creator profile — explicit niche/tone/audience/banned-words/emoji
      //     instructions from the CreatorProfile onboarding form + settings
      //     card. Non-fatal and simply absent (null) for creators who never
      //     filled it in, same as before this existed.
      let creatorProfile: CreatorProfileContext | null = null;
      try {
        creatorProfile = await prisma.creatorProfile.findUnique({
          where: { userId: video.userId },
          select: {
            niche: true,
            tone: true,
            audience: true,
            bannedWords: true,
            exampleCaption: true,
            emojiPreference: true,
          },
        });
      } catch (err) {
        console.warn(
          `[ai] creator profile lookup failed for ${videoId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      // 4c. Folder path — walk the folder tree from this video's folder up to
      //     the root so the model sees how the creator filed it (root > … >
      //     leaf). Folder names often encode who/what/where/why/when, a strong
      //     topical hint. Non-fatal: an empty path (root-level video or lookup
      //     failure) simply omits the block, same as before this existed.
      let folderPath: string[] = [];
      try {
        folderPath = await resolveFolderPath(video.folderId);
      } catch (err) {
        console.warn(
          `[ai] folder path lookup failed for ${videoId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      // 5. Vision metadata + 6. persist (base, per-platform, category, thumb).
      let metadata;
      try {
        metadata = await generateMetadata({
          frames: frames.map((f) => f.buffer),
          transcript,
          durationSec: info.durationSec,
          creatorBio: creatorContext.bio,
          styleExamples: creatorContext.examples,
          creatorProfile,
          folderPath,
        });
      } catch (err) {
        throw new Error(`vision metadata (OpenAI) failed: ${describeOpenAIError(err)}`);
      }
      const selectedThumbnailId = frames[metadata.bestFrameIndex]?.id ?? frames[0]?.id ?? null;
      await persistMetadata(prisma, {
        userId: video.userId,
        videoId,
        metadata,
        selectedThumbnailId,
      });

      // 7. Embedding (powers dedupe + smart ordering).
      let embedding: number[] | null = null;
      try {
        embedding = await embedVideo(prisma, {
          videoId,
          title: metadata.title,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          category: metadata.category,
          transcript,
        });
      } catch (err) {
        console.warn(`[ai] embedding failed for ${videoId}: ${describeOpenAIError(err)}`);
      }

      // 8. pHash from the middle frame.
      let pHash: string | null = null;
      try {
        const mid = info.durationSec ? info.durationSec / 2 : 0;
        const gray = await extractGray9x8(localPath, mid);
        pHash = dHashFromGray9x8(gray);
        await prisma.video.update({ where: { id: videoId }, data: { pHash } });
      } catch (err) {
        console.warn(`[ai] pHash failed for ${videoId}:`, err);
      }

      // 9. Duplicate detection across the user's library.
      const dupes = await detectDuplicates(prisma, {
        userId: video.userId,
        videoId,
        pHash,
        embedding,
      });

      return { isDuplicate: dupes.isDuplicate };
    });

    await prisma.video.update({
      where: { id: videoId },
      data: { aiStatus: 'COMPLETED', aiProcessedAt: new Date() },
    });
    return { videoId, ok: true, isDuplicate: result.isDuplicate };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.video
      .update({ where: { id: videoId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId, ok: false, error: message };
  }
}
