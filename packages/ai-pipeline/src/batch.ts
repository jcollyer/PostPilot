import { prisma } from '@postpilot/db';

import { processVideo, type ProcessResult } from './pipeline';
import { processImage } from './pipeline-image';

/**
 * How long a video may sit in RUNNING before we treat it as orphaned by a
 * killed worker run (OOM, maxDuration, deploy restart) and reclaim it. Set
 * comfortably above the worst-case single-video processing time so we never
 * reap a genuinely in-flight run. Overridable via env.
 */
const STALE_RUNNING_MS = Number(process.env.AI_STALE_RUNNING_MS ?? 15 * 60 * 1000);

/**
 * Claim and process videos whose AI metadata is still PENDING, plus any left
 * stranded in RUNNING past STALE_RUNNING_MS (a previous run died before it
 * could set COMPLETED/FAILED). The "Generate Metadata" button sets videos back
 * to PENDING; this worker drains them. Processed sequentially to stay within
 * API rate limits and CPU on the worker, so the batch is capped small enough
 * to finish comfortably inside the task's maxDuration.
 */
export async function processPending(params?: {
  limit?: number;
  userId?: string;
}): Promise<ProcessResult[]> {
  const limit = params?.limit ?? 5;
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

  // Same claim predicate for videos and images: still PENDING, or stranded in
  // RUNNING past the stale window.
  const aiClaim = {
    OR: [
      { aiStatus: 'PENDING' as const },
      { aiStatus: 'RUNNING' as const, aiStartedAt: { lt: staleBefore } },
      { aiStatus: 'RUNNING' as const, aiStartedAt: null },
    ],
  };

  const pending = await prisma.video.findMany({
    where: {
      status: { in: ['READY', 'PROCESSING'] },
      ...(params?.userId ? { userId: params.userId } : {}),
      ...aiClaim,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  const results: ProcessResult[] = [];
  for (const { id } of pending) {
    results.push(await processVideo(id));
  }

  // Drain images with the remaining budget so photos get metadata too.
  const remaining = limit - results.length;
  if (remaining > 0) {
    const pendingImages = await prisma.image.findMany({
      where: {
        status: { in: ['READY', 'PROCESSING'] },
        ...(params?.userId ? { userId: params.userId } : {}),
        ...aiClaim,
      },
      orderBy: { createdAt: 'asc' },
      take: remaining,
      select: { id: true },
    });
    for (const { id } of pendingImages) {
      results.push(await processImage(id));
    }
  }
  return results;
}

/** Process every still-PENDING video and image in a specific upload session. */
export async function processUploadSession(uploadSessionId: string): Promise<ProcessResult[]> {
  const pending = await prisma.video.findMany({
    where: { uploadSessionId, aiStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const results: ProcessResult[] = [];
  for (const { id } of pending) {
    results.push(await processVideo(id));
  }

  const pendingImages = await prisma.image.findMany({
    where: { uploadSessionId, aiStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  for (const { id } of pendingImages) {
    results.push(await processImage(id));
  }
  return results;
}
