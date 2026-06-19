import { TRPCError } from '@trpc/server';
import { Prisma, type PrismaClient } from '@saas/db';
import {
  abortUploadSchema,
  completeUploadSchema,
  confirmCoverUploadSchema,
  createUploadSessionSchema,
  initCoverUploadSchema,
  initUploadSchema,
  listVideosSchema,
  updateVideoMetadataSchema,
  videoIdSchema,
} from '@saas/types';
import {
  abortMultipart,
  completeMultipart,
  coverKey,
  createMultipartUpload,
  deletePrefix,
  extensionFor,
  extensionForMime,
  isStorageConfigured,
  planMultipart,
  presignPut,
  presignUploadParts,
  publicUrlForKey,
  sourceKey,
  videoPrefix,
} from '@saas/storage';

import { protectedProcedure, router } from '../trpc';

/** Guard storage-backed procedures with a clear error when R2 isn't set up. */
function assertStorageConfigured() {
  if (!isStorageConfigured()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Media storage is not configured yet. Add the R2_* environment variables.',
    });
  }
}

/** Load a video the caller owns, or throw NOT_FOUND. */
async function ownedVideo(prisma: PrismaClient, userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
  return video;
}

type VideoRecord = Prisma.VideoGetPayload<{ include: { category: true } }>;

/** Map a Video row to a safe client DTO (BigInt → number, never exposes keys we don't need). */
function toVideoDto(v: VideoRecord) {
  return {
    id: v.id,
    status: v.status,
    aiStatus: v.aiStatus,
    cdnUrl: v.cdnUrl,
    originalFilename: v.originalFilename,
    mimeType: v.mimeType,
    fileSize: v.fileSize !== null && v.fileSize !== undefined ? Number(v.fileSize) : null,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    coverImageUrl: v.coverImageUrl,
    title: v.title,
    caption: v.caption,
    hashtags: v.hashtags,
    categoryId: v.categoryId,
    category: v.category
      ? { id: v.category.id, name: v.category.name, color: v.category.color }
      : null,
    uploadSessionId: v.uploadSessionId,
    isDuplicate: v.isDuplicate,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export const mediaRouter = router({
  // -------------------------------------------------------------------------
  // Upload sessions + filter helpers
  // -------------------------------------------------------------------------

  /** Create a labelled batch that this afternoon's uploads belong to. */
  createUploadSession: protectedProcedure
    .input(createUploadSessionSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.uploadSession.create({
        data: { userId: ctx.userId, label: input.label ?? null },
      }),
    ),

  /** Recent upload sessions (for the library filter). */
  listUploadSessions: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.uploadSession.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, label: true, videoCount: true, createdAt: true },
    }),
  ),

  /** Categories the user has (AI-created or manual) for filtering. */
  listCategories: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.category.findMany({
      where: { userId: ctx.userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ),

  // -------------------------------------------------------------------------
  // Direct-to-storage upload (video bytes never touch the app server)
  // -------------------------------------------------------------------------

  /**
   * Start an upload. Records a Video row in UPLOADING state, opens a multipart
   * upload in R2, and returns presigned PUT URLs — one per part. The client
   * uploads each part directly to storage, then calls `completeUpload`.
   */
  initUpload: protectedProcedure.input(initUploadSchema).mutation(async ({ ctx, input }) => {
    assertStorageConfigured();

    if (input.uploadSessionId) {
      const session = await ctx.prisma.uploadSession.findFirst({
        where: { id: input.uploadSessionId, userId: ctx.userId },
        select: { id: true },
      });
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload session not found.' });
      }
    }

    const ext = extensionFor(input.filename) || extensionForMime(input.contentType);

    // Create the row first so we have a stable id to build the storage key from.
    const video = await ctx.prisma.video.create({
      data: {
        userId: ctx.userId,
        status: 'UPLOADING',
        storageKey: '', // set below, once we know the id
        originalFilename: input.filename,
        mimeType: input.contentType,
        fileSize: BigInt(input.fileSize),
        durationSec: input.durationSec ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        uploadSessionId: input.uploadSessionId ?? null,
      },
    });

    const key = sourceKey(ctx.userId, video.id, ext);

    try {
      const { uploadId } = await createMultipartUpload({ key, contentType: input.contentType });
      const { partSize, partCount } = planMultipart(input.fileSize);
      const parts = await presignUploadParts({ key, uploadId, partCount });

      await ctx.prisma.video.update({ where: { id: video.id }, data: { storageKey: key } });

      return { videoId: video.id, uploadId, key, partSize, partCount, parts };
    } catch (err) {
      // Roll back the placeholder row so a failed start doesn't leave junk.
      await ctx.prisma.video.delete({ where: { id: video.id } }).catch(() => {});
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not start the upload. Please try again.',
        cause: err,
      });
    }
  }),

  /** Finalize a multipart upload and mark the video ready for the AI pipeline. */
  completeUpload: protectedProcedure
    .input(completeUploadSchema)
    .mutation(async ({ ctx, input }) => {
      assertStorageConfigured();
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

      try {
        await completeMultipart({
          key: video.storageKey,
          uploadId: input.uploadId,
          parts: input.parts,
        });
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not finalize the upload. Please try again.',
          cause: err,
        });
      }

      // READY = uploaded and available; the AI pipeline (Chunk 5) picks up rows
      // whose aiStatus is still PENDING and enriches them.
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { status: 'READY', cdnUrl: publicUrlForKey(video.storageKey) },
        include: { category: true },
      });

      if (video.uploadSessionId) {
        await ctx.prisma.uploadSession.update({
          where: { id: video.uploadSessionId },
          data: { videoCount: { increment: 1 } },
        });
      }

      return toVideoDto(updated);
    }),

  /** Abandon an in-flight upload: abort the multipart upload and drop the row. */
  abortUpload: protectedProcedure.input(abortUploadSchema).mutation(async ({ ctx, input }) => {
    const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
    if (isStorageConfigured() && video.storageKey) {
      await abortMultipart({ key: video.storageKey, uploadId: input.uploadId }).catch(() => {});
    }
    await ctx.prisma.video.delete({ where: { id: video.id } });
    return { success: true as const };
  }),

  // -------------------------------------------------------------------------
  // Optional cover image
  // -------------------------------------------------------------------------

  /** Presign a single PUT for a cover image; client uploads then confirms. */
  initCoverUpload: protectedProcedure
    .input(initCoverUploadSchema)
    .mutation(async ({ ctx, input }) => {
      assertStorageConfigured();
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const ext = extensionForMime(input.contentType) || '.jpg';
      const key = coverKey(ctx.userId, video.id, ext);
      const { url } = await presignPut({ key, contentType: input.contentType });
      // Stash the pending key now; `confirmCoverUpload` flips it to a public URL.
      await ctx.prisma.video.update({ where: { id: video.id }, data: { coverImageKey: key } });
      return { url, key };
    }),

  /** Record that the cover finished uploading (sets the public URL). */
  confirmCoverUpload: protectedProcedure
    .input(confirmCoverUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      if (!video.coverImageKey) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No cover upload in progress.' });
      }
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { coverImageUrl: publicUrlForKey(video.coverImageKey) },
        include: { category: true },
      });
      return toVideoDto(updated);
    }),

  // -------------------------------------------------------------------------
  // Browse / edit / delete
  // -------------------------------------------------------------------------

  /** Search + filter the library with cursor pagination. */
  list: protectedProcedure.input(listVideosSchema).query(async ({ ctx, input }) => {
    const where: Prisma.VideoWhereInput = { userId: ctx.userId };
    if (input.status) where.status = input.status;
    if (input.categoryId) where.categoryId = input.categoryId;
    if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;
    if (input.search) {
      const q = input.search;
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { caption: { contains: q, mode: 'insensitive' } },
        { originalFilename: { contains: q, mode: 'insensitive' } },
        { transcript: { contains: q, mode: 'insensitive' } },
        { hashtags: { has: q } },
      ];
    }

    const rows = await ctx.prisma.video.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (rows.length > input.limit) {
      nextCursor = rows.pop()!.id;
    }

    return { items: rows.map(toVideoDto), nextCursor };
  }),

  /** Full detail for one video, including per-platform metadata + thumbnails. */
  get: protectedProcedure.input(videoIdSchema).query(async ({ ctx, input }) => {
    const video = await ctx.prisma.video.findFirst({
      where: { id: input.videoId, userId: ctx.userId },
      include: {
        category: true,
        platformMeta: true,
        thumbnailCandidates: { orderBy: { score: 'desc' } },
      },
    });
    if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
    return {
      ...toVideoDto(video),
      transcript: video.transcript,
      selectedThumbnailId: video.selectedThumbnailId,
      platformMeta: video.platformMeta.map((m) => ({
        platform: m.platform,
        title: m.title,
        caption: m.caption,
        hashtags: m.hashtags,
        aiGenerated: m.aiGenerated,
        edited: m.edited,
      })),
      thumbnails: video.thumbnailCandidates.map((t) => ({
        id: t.id,
        url: t.url,
        frameTimeSec: t.frameTimeSec,
        score: t.score,
      })),
    };
  }),

  /** Edit base (platform-agnostic) metadata. */
  updateMetadata: protectedProcedure
    .input(updateVideoMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

      if (input.categoryId) {
        const category = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        });
        if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      const data: Prisma.VideoUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.hashtags !== undefined) data.hashtags = input.hashtags;
      if (input.categoryId !== undefined) {
        data.category = input.categoryId
          ? { connect: { id: input.categoryId } }
          : { disconnect: true };
      }

      const updated = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data,
        include: { category: true },
      });
      return toVideoDto(updated);
    }),

  /** Permanently delete a video and every object under its storage prefix. */
  remove: protectedProcedure.input(videoIdSchema).mutation(async ({ ctx, input }) => {
    const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

    if (isStorageConfigured()) {
      await deletePrefix(videoPrefix(ctx.userId, video.id)).catch(() => {});
    }
    if (video.uploadSessionId) {
      await ctx.prisma.uploadSession
        .update({
          where: { id: video.uploadSessionId },
          data: { videoCount: { decrement: 1 } },
        })
        .catch(() => {});
    }
    await ctx.prisma.video.delete({ where: { id: video.id } });
    return { success: true as const };
  }),
});
