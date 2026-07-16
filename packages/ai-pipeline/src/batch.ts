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
 * How many times the worker may move a single row into RUNNING before we give
 * up and mark it FAILED. Without this cap, a "poison-pill" item that reliably
 * kills the run mid-pipeline (e.g. an OOM on an oversized video) is left in
 * RUNNING, reclaimed once it goes stale, and retried forever — every run
 * crashes on the same item. aiAttempts is incremented up front by
 * processVideo/processImage, so it counts even OOM-killed attempts. Overridable
 * via env.
 */
const MAX_AI_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS ?? 3);

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
  const scope = params?.userId ? { userId: params.userId } : {};

  // A stranded RUNNING row (killed before it could set COMPLETED/FAILED) is only
  // eligible to be reclaimed while it's stale — i.e. no longer plausibly still
  // in flight.
  const stranded = {
    OR: [
      { aiStartedAt: { lt: staleBefore } },
      { aiStartedAt: null },
    ],
  };

  // Retire poison pills first: rows that have burned through MAX_AI_ATTEMPTS and
  // are stranded in RUNNING get marked FAILED so the reclaim below never picks
  // them up again (and the UI shows an error badge instead of a stuck spinner).
  // Runs before the claim so an exhausted item frees its slot this cycle. status
  // is added inline (not hoisted) so Prisma infers the MediaStatus enum instead
  // of widening the string literals.
  const retire = {
    ...scope,
    aiStatus: 'RUNNING' as const,
    aiAttempts: { gte: MAX_AI_ATTEMPTS },
    ...stranded,
  };
  await prisma.video.updateMany({
    where: { status: { in: ['READY', 'PROCESSING'] }, ...retire },
    data: { aiStatus: 'FAILED' },
  });
  await prisma.image.updateMany({
    where: { status: { in: ['READY', 'PROCESSING'] }, ...retire },
    data: { aiStatus: 'FAILED' },
  });

  // Same claim predicate for videos and images: still PENDING, or stranded in
  // RUNNING past the stale window — but only while under the attempt cap, so a
  // repeatedly-crashing item drops out instead of looping.
  const aiClaim = {
    OR: [
      { aiStatus: 'PENDING' as const },
      { aiStatus: 'RUNNING' as const, aiAttempts: { lt: MAX_AI_ATTEMPTS }, ...stranded },
    ],
  };

  const pending = await prisma.video.findMany({
    where: {
      status: { in: ['READY', 'PROCESSING'] },
      ...scope,
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
        ...scope,
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
