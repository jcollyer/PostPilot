import { join } from 'node:path';

import { prisma } from '@postpilot/db';
import { downloadToFile } from '@postpilot/storage';

import { describeOpenAIError, isAiConfigured } from './config';
import { extractFrame, extractGray9x8, probeMedia } from './ffmpeg';
import { dHashFromGray9x8 } from './phash';
import { resolveFolderPath } from './pipeline';
import { embedImage } from './steps/embeddings';
import { generateMetadata, type CreatorProfileContext } from './steps/metadata';
import { ensureCategory } from './steps/persist';
import { getCreatorContext } from './steps/style-examples';
import type { ProcessResult } from './pipeline';
import { withTempDir } from './workdir';

/**
 * Run the AI pipeline for one image (Instagram-only). Simpler than the video
 * pipeline — the photo IS the single frame, so there's no frame sampling, no
 * transcription, and no per-platform metadata (images post only to Instagram):
 *   probe dims → normalize to JPEG → creator context + profile →
 *   vision metadata (base fields only) → persist → embedding → pHash.
 *
 * Carousels are processed as their parent Image (its own file / slide 1); child
 * slides are ordinary images processed on their own. Sets aiStatus RUNNING up
 * front and COMPLETED/FAILED at the end, mirroring processVideo.
 */
export async function processImage(imageId: string): Promise<ProcessResult> {
  if (!isAiConfigured()) {
    await prisma.image
      .update({ where: { id: imageId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId: imageId, ok: false, error: 'OPENAI_API_KEY is not set' };
  }

  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) return { videoId: imageId, ok: false, error: 'image not found' };
  if (!image.storageKey) return { videoId: imageId, ok: false, error: 'image has no storage key' };

  await prisma.image.update({
    where: { id: imageId },
    data: { aiStatus: 'RUNNING', aiStartedAt: new Date() },
  });

  try {
    const result = await withTempDir(async (dir) => {
      const localPath = join(dir, 'source');
      await downloadToFile(image.storageKey, localPath);

      // 1. Probe + backfill dimensions.
      const info = await probeMedia(localPath);
      await prisma.image.update({
        where: { id: imageId },
        data: {
          width: image.width ?? info.width,
          height: image.height ?? info.height,
          status: image.status === 'UPLOADING' ? 'READY' : image.status,
        },
      });

      // 2. Normalize to a single JPEG buffer for the vision model (handles
      //    PNG/WebP sources uniformly). Time 0 of a still image is the image.
      const frame = await extractFrame(localPath, 0);

      // 3. Creator context + profile (non-fatal — same graceful fallbacks as
      //    the video pipeline; images have no transcript).
      let creatorContext: Awaited<ReturnType<typeof getCreatorContext>> = {
        bio: null,
        examples: [],
      };
      try {
        creatorContext = await getCreatorContext(prisma, {
          userId: image.userId,
          // Image ids never collide with video ids, so this simply excludes
          // nothing extra from the video-based style-example lookup.
          videoId: imageId,
          transcript: null,
        });
      } catch (err) {
        console.warn(
          `[ai] creator context failed for image ${imageId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      let creatorProfile: CreatorProfileContext | null = null;
      try {
        creatorProfile = await prisma.creatorProfile.findUnique({
          where: { userId: image.userId },
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
          `[ai] creator profile lookup failed for image ${imageId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      let folderPath: string[] = [];
      try {
        folderPath = await resolveFolderPath(image.folderId);
      } catch (err) {
        console.warn(
          `[ai] folder path lookup failed for image ${imageId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      // 4. Vision metadata over the single frame (no transcript). We keep only
      //    the base fields — images are Instagram-only, so per-platform
      //    variants and thumbnail selection don't apply.
      let metadata;
      try {
        metadata = await generateMetadata({
          frames: [frame],
          transcript: null,
          durationSec: null,
          creatorBio: creatorContext.bio,
          styleExamples: creatorContext.examples,
          creatorProfile,
          folderPath,
        });
      } catch (err) {
        throw new Error(`vision metadata (OpenAI) failed: ${describeOpenAIError(err)}`);
      }

      // 5. Persist base metadata + category on the Image.
      const categoryId = await ensureCategory(prisma, image.userId, metadata.category);
      await prisma.image.update({
        where: { id: imageId },
        data: {
          title: metadata.title || null,
          caption: metadata.caption || null,
          hashtags: metadata.hashtags,
          categoryId,
        },
      });

      // 6. Embedding (smart queue ordering).
      try {
        await embedImage(prisma, {
          imageId,
          title: metadata.title,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          category: metadata.category,
        });
      } catch (err) {
        console.warn(`[ai] embedding failed for image ${imageId}: ${describeOpenAIError(err)}`);
      }

      // 7. pHash from the image itself (mid == 0 for a still).
      try {
        const gray = await extractGray9x8(localPath, 0);
        const pHash = dHashFromGray9x8(gray);
        await prisma.image.update({ where: { id: imageId }, data: { pHash } });
      } catch (err) {
        console.warn(`[ai] pHash failed for image ${imageId}:`, err);
      }

      return {};
    });
    void result;

    await prisma.image.update({
      where: { id: imageId },
      data: { aiStatus: 'COMPLETED', aiProcessedAt: new Date() },
    });
    return { videoId: imageId, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.image
      .update({ where: { id: imageId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId: imageId, ok: false, error: message };
  }
}
