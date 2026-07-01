import { type PrismaClient } from '@postpilot/db';
import { z } from 'zod';

import { EMBEDDING_MODEL, getOpenAI } from '../config';
import { findSimilarByEmbedding } from '../vectors';

/**
 * "Past posts as inspiration" — few-shot style reference for the vision
 * prompt, pulled from two sources:
 *
 *   1. The creator's OWN connected platforms (TikTok/Instagram/YouTube bio +
 *      real past captions) — the most authentic signal of their established
 *      voice, cached on PlatformConnection by @postpilot/connectors'
 *      profile-service.ts (connect time + periodic refresh, never fetched
 *      live here). Preferred whenever available.
 *   2. This app's own library, via the pgvector embeddings the pipeline
 *      already computes for every video (see steps/embeddings.ts) — used to
 *      top up when a platform has too few (or no) cached posts, e.g. right
 *      after connecting, or for a creator who's brand new everywhere.
 *
 * Never throws: a failure anywhere here should degrade toward fewer/no
 * examples rather than fail the pipeline, mirroring the transcription step.
 */

export interface StyleExample {
  title: string;
  caption: string;
  hashtags: string[];
  category: string;
}

export interface CreatorContext {
  /** Best available bio across the creator's connected platforms, if any. */
  bio: string | null;
  examples: StyleExample[];
}

const MAX_EXAMPLES = 3;
const MIN_SIMILARITY = 0.3;
const MAX_CAPTION_CHARS = 300;
const MAX_TRANSCRIPT_QUERY_CHARS = 4000;

const recentPostSchema = z.object({
  caption: z.string().optional().default(''),
  hashtags: z.array(z.string()).optional().default([]),
});
const recentPostsArraySchema = z.array(recentPostSchema);

/**
 * Read the cached profile snapshots (bio + recent posts) off the creator's
 * PlatformConnection rows. Pure DB read — no platform API calls happen here,
 * that's profile-service.ts's job, kept out of this package's dependency
 * graph on purpose (ai-pipeline doesn't need OAuth/token logic, just the
 * cached columns via the shared @postpilot/db client).
 */
async function getPlatformContext(
  prisma: PrismaClient,
  userId: string,
): Promise<{ bio: string | null; examples: StyleExample[] }> {
  let connections: Array<{ profileBio: string | null; profileRecentPosts: unknown }> = [];
  try {
    connections = await prisma.platformConnection.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { profileBio: true, profileRecentPosts: true },
    });
  } catch {
    return { bio: null, examples: [] };
  }

  const bios = connections.map((c) => c.profileBio?.trim()).filter((b): b is string => Boolean(b));
  // Prefer the longest bio — usually the most descriptive of niche/voice.
  const bio = bios.length > 0 ? (bios.sort((a, b) => b.length - a.length)[0] ?? null) : null;

  const examples: StyleExample[] = [];
  for (const conn of connections) {
    if (!conn.profileRecentPosts) continue;
    const parsed = recentPostsArraySchema.safeParse(conn.profileRecentPosts);
    if (!parsed.success) continue;
    for (const post of parsed.data) {
      if (!post.caption && post.hashtags.length === 0) continue;
      examples.push({
        title: '',
        caption: post.caption.slice(0, MAX_CAPTION_CHARS),
        hashtags: post.hashtags,
        category: '',
      });
    }
  }

  return { bio, examples: examples.slice(0, MAX_EXAMPLES) };
}

/** Library (in-app) examples: topical similarity via embeddings, then recency. */
async function getLibraryExamples(
  prisma: PrismaClient,
  params: { userId: string; videoId: string; transcript: string | null; limit: number },
): Promise<StyleExample[]> {
  const { userId, videoId, transcript, limit } = params;
  if (limit <= 0) return [];

  let matchedIds: string[] = [];

  if (transcript && transcript.trim().length > 20) {
    try {
      const res = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: transcript.slice(0, MAX_TRANSCRIPT_QUERY_CHARS),
      });
      const queryEmbedding = res.data[0]?.embedding;
      if (queryEmbedding) {
        const similar = await findSimilarByEmbedding(prisma, {
          userId,
          excludeVideoId: videoId,
          embedding: queryEmbedding,
          limit,
          minSimilarity: MIN_SIMILARITY,
        });
        matchedIds = similar.map((s) => s.id);
      }
    } catch {
      // Non-fatal: fall through to the recency fallback below.
    }
  }

  if (matchedIds.length < limit) {
    try {
      const recent = await prisma.video.findMany({
        where: {
          userId,
          id: { notIn: [videoId, ...matchedIds] },
          aiStatus: 'COMPLETED',
          isDuplicate: false,
          title: { not: null },
        },
        select: { id: true },
        orderBy: { aiProcessedAt: 'desc' },
        take: limit - matchedIds.length,
      });
      matchedIds = [...matchedIds, ...recent.map((r) => r.id)];
    } catch {
      // Non-fatal: proceed with whatever similarity matches we already have.
    }
  }

  if (matchedIds.length === 0) return [];

  const videos = await prisma.video.findMany({
    where: { id: { in: matchedIds } },
    select: {
      id: true,
      title: true,
      caption: true,
      hashtags: true,
      category: { select: { name: true } },
    },
  });
  const byId = new Map(videos.map((v) => [v.id, v]));

  return matchedIds
    .map((id) => byId.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v && (v.title || v.caption)))
    .map((v) => ({
      title: v.title ?? '',
      caption: (v.caption ?? '').slice(0, MAX_CAPTION_CHARS),
      hashtags: v.hashtags ?? [],
      category: v.category?.name ?? '',
    }));
}

/**
 * Assemble the creator's style context for one video: bio + up to
 * MAX_EXAMPLES past-post exemplars, platform posts first, topped up from the
 * in-app library.
 */
export async function getCreatorContext(
  prisma: PrismaClient,
  params: { userId: string; videoId: string; transcript: string | null },
): Promise<CreatorContext> {
  const { userId, videoId, transcript } = params;

  const platform = await getPlatformContext(prisma, userId);

  const remaining = MAX_EXAMPLES - platform.examples.length;
  const library = await getLibraryExamples(prisma, {
    userId,
    videoId,
    transcript,
    limit: remaining,
  });

  return { bio: platform.bio, examples: [...platform.examples, ...library] };
}
