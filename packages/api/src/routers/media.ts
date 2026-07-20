import { TRPCError } from '@trpc/server';
import { tasks } from '@trigger.dev/sdk';
import { Platform, Prisma, type PrismaClient } from '@postpilot/db';
import {
  abortUploadSchema,
  aiSummarySchema,
  clearStoppedMetadataSchema,
  completeImageUploadSchema,
  completeUploadSchema,
  confirmCoverUploadSchema,
  createUploadSessionSchema,
  DEFAULT_TIKTOK_OPTIONS,
  evaluateTikTokRequirements,
  imageIdSchema,
  initCoverUploadSchema,
  initImageUploadSchema,
  initUploadSchema,
  listImagesInFolderSchema,
  listVideosSchema,
  parsePostedPosts,
  regenerateMetadataSchema,
  selectThumbnailSchema,
  setCarouselItemsSchema,
  setCategoryManySchema,
  setFolderManySchema,
  setPlatformMetaSchema,
  updateImageMetadataSchema,
  setTargetPlatformsManySchema,
  setTargetPlatformsSchema,
  setTiktokMetaSchema,
  setTiktokPrivacyManySchema,
  stopMetadataGenerationSchema,
  type TikTokPostOptions,
  type TikTokPrivacyLevel,
  updateVideoMetadataSchema,
  videoIdSchema,
  videoIdsSchema,
} from '@postpilot/types';
import {
  abortMultipart,
  completeMultipart,
  coverKey,
  createMultipartUpload,
  deletePrefix,
  extensionFor,
  extensionForMime,
  imagePrefix,
  imageSourceKey,
  isStorageConfigured,
  planMultipart,
  presignPut,
  presignUploadParts,
  publicUrlForKey,
  sourceKey,
  videoPrefix,
} from '@postpilot/storage';
import { ensureQueue, recomputeSchedule } from '@postpilot/queue';

import { protectedProcedure, router } from '../trpc';

/**
 * Re-materialize the caller's queue plan after a change that can affect which
 * platforms a queued video publishes to. Best-effort: a recompute failure must
 * not fail the underlying metadata write.
 */
async function recomputeUserQueue(prisma: PrismaClient, userId: string) {
  try {
    const queue = await ensureQueue(prisma, userId);
    await recomputeSchedule(prisma, queue.id);
  } catch {
    // Swallow — the cron reschedule will reconcile on its next run.
  }
}

/**
 * Kick the AI worker to drain this user's freshly-uploaded videos now, instead
 * of waiting up to 5 minutes for the `ai-process` cron. Strictly best-effort:
 * the cron is the reliable floor, so a missing TRIGGER_SECRET_KEY (e.g. local
 * dev) or any trigger error must never fail the upload.
 *
 * A burst upload calls this once per file; the idempotency key + short delay
 * consolidate them into a single per-user drain rather than one run per file.
 */
async function kickAiProcessing(userId: string) {
  try {
    await tasks.trigger(
      'ai-process-user',
      { userId },
      {
        // Collapse a rapid burst (many files finishing close together) into one
        // run; a new run is allowed once the window passes.
        idempotencyKey: ['ai-process-user', userId],
        idempotencyKeyTTL: '20s',
        // Give sibling uploads in the same batch a moment to flip to READY so
        // the single drain sees as many of them as possible.
        delay: '3s',
      },
    );
  } catch {
    // Swallow — the cron will pick these up on its next run.
  }
}

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

export const VIDEO_INCLUDE = {
  category: true,
  selectedThumbnail: true,
  // Only the TikTok row is needed to compute the "requires user input" gate.
  platformMeta: { where: { platform: Platform.TIKTOK } },
  // Used to flag whether the video is already part of the user's queue.
  _count: { select: { queueItems: true } },
} as const;
export type VideoRecord = Prisma.VideoGetPayload<{ include: typeof VIDEO_INCLUDE }>;

type PlatformMetaRecord = Prisma.VideoPlatformMetaGetPayload<true>;

/** Whether the caller has a usable (ACTIVE) TikTok connection right now. */
export async function hasActiveTikTok(prisma: PrismaClient, userId: string): Promise<boolean> {
  const conn = await prisma.platformConnection.findFirst({
    where: { userId, platform: Platform.TIKTOK, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(conn);
}

/** Map a stored TikTok platform-meta row (or none) to the shared options shape. */
function tiktokOptionsFromMeta(meta: PlatformMetaRecord | undefined): TikTokPostOptions {
  if (!meta) return { ...DEFAULT_TIKTOK_OPTIONS };
  return {
    privacy: (meta.tiktokPrivacy as TikTokPrivacyLevel | null) ?? null,
    allowComment: meta.tiktokAllowComment,
    allowDuet: meta.tiktokAllowDuet,
    allowStitch: meta.tiktokAllowStitch,
    commercialDisclosure: meta.tiktokCommercial,
    brandOrganic: meta.tiktokBrandOrganic,
    brandedContent: meta.tiktokBrandedContent,
  };
}

/**
 * Whether TikTok is connected but this video's stored TikTok options don't yet
 * satisfy the publishing rules (e.g. no privacy chosen). This is independent of
 * whether the video currently targets TikTok, so the client can react instantly
 * when the user toggles the TikTok target on/off without waiting for a refetch.
 */
function tiktokOptionsIncomplete(v: VideoRecord, tiktokConnected: boolean): boolean {
  if (!tiktokConnected) return false;
  const opts = tiktokOptionsFromMeta(v.platformMeta.find((m) => m.platform === Platform.TIKTOK));
  return evaluateTikTokRequirements(opts).length > 0;
}

/**
 * A video "requires user input" when it actually posts to TikTok and its TikTok
 * options are incomplete. If the video doesn't target TikTok, none of TikTok's
 * requirements apply, so it never needs input on TikTok's behalf.
 */
function tiktokNeedsInput(v: VideoRecord, tiktokConnected: boolean): boolean {
  // Empty targetPlatforms is the "all connected" default, which includes TikTok.
  const targetsTikTok =
    v.targetPlatforms.length === 0 || v.targetPlatforms.includes(Platform.TIKTOK);
  return targetsTikTok && tiktokOptionsIncomplete(v, tiktokConnected);
}

/** Map a Video row to a safe client DTO (BigInt → number, never exposes keys we don't need). */
export function toVideoDto(v: VideoRecord, tiktokConnected = false) {
  return {
    // Discriminates video vs image/carousel rows in the merged library grid.
    mediaType: 'VIDEO' as const,
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
    // What the grid shows: a user cover wins, else the AI-selected thumbnail.
    thumbnailUrl: v.coverImageUrl ?? v.selectedThumbnail?.url ?? null,
    title: v.title,
    caption: v.caption,
    hashtags: v.hashtags,
    // Platforms this video posts to. Empty = all connected (the default).
    targetPlatforms: v.targetPlatforms,
    categoryId: v.categoryId,
    category: v.category
      ? { id: v.category.id, name: v.category.name, color: v.category.color }
      : null,
    // Folder the video lives in (null = the root).
    folderId: v.folderId,
    uploadSessionId: v.uploadSessionId,
    isDuplicate: v.isDuplicate,
    // First time this video was successfully published anywhere (null = never
    // posted) + the latest post per platform, for the "Posted" badge and links.
    postedAt: v.postedAt,
    postedPosts: parsePostedPosts(v.postedPosts),
    // True when this video already has a slot in the user's queue.
    inQueue: v._count.queueItems > 0,
    // True when the user must supply TikTok details before this can be queued
    // (i.e. it targets TikTok and its options are incomplete).
    tiktokNeedsInput: tiktokNeedsInput(v, tiktokConnected),
    // True when TikTok's options are incomplete regardless of whether this video
    // currently targets TikTok. Lets the client show/hide the "needs input"
    // affordances instantly as the TikTok target chip is toggled.
    tiktokOptionsIncomplete: tiktokOptionsIncomplete(v, tiktokConnected),
    // True when this video discloses branded content for TikTok — drives the
    // consent declaration wording shown before queueing (Branded Content Policy).
    tiktokBranded: (() => {
      const o = tiktokOptionsFromMeta(v.platformMeta.find((m) => m.platform === Platform.TIKTOK));
      return o.commercialDisclosure && o.brandedContent;
    })(),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Images & carousels (Instagram-only). Images live in their own table but share
// the library grid with videos; a `mediaType` discriminator on each DTO lets the
// client tell them apart. A carousel is an Image that owns ordered CarouselItem
// child slides (its own file is slide 1).
// ---------------------------------------------------------------------------

/** Photos are Instagram-only for now; there is no per-platform fan-out. */
const IMAGE_TARGET_PLATFORMS: Platform[] = [Platform.INSTAGRAM];

export const IMAGE_INCLUDE = {
  category: true,
  _count: { select: { queueItems: true } },
  // Ordered child slides (empty for a plain photo). Includes each child's file
  // so the grid/preview can render the stacked carousel visual without a second
  // round-trip.
  carouselItems: {
    orderBy: { position: 'asc' },
    include: {
      child: {
        select: { id: true, cdnUrl: true, status: true, width: true, height: true },
      },
    },
  },
} as const;
export type ImageRecord = Prisma.ImageGetPayload<{ include: typeof IMAGE_INCLUDE }>;

/** Load an image the caller owns, or throw NOT_FOUND. */
async function ownedImage(prisma: PrismaClient, userId: string, imageId: string) {
  const image = await prisma.image.findFirst({ where: { id: imageId, userId } });
  if (!image) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found.' });
  return image;
}

/** Map an Image row to a client DTO, discriminated from videos by `mediaType`. */
export function toImageDto(img: ImageRecord) {
  const childSlides = img.carouselItems.map((ci) => ({
    id: ci.child.id,
    cdnUrl: ci.child.cdnUrl,
  }));
  const isCarousel = childSlides.length > 0;
  return {
    mediaType: (isCarousel ? 'CAROUSEL' : 'IMAGE') as 'CAROUSEL' | 'IMAGE',
    id: img.id,
    status: img.status,
    aiStatus: img.aiStatus,
    cdnUrl: img.cdnUrl,
    originalFilename: img.originalFilename,
    mimeType: img.mimeType,
    fileSize: img.fileSize !== null && img.fileSize !== undefined ? Number(img.fileSize) : null,
    width: img.width,
    height: img.height,
    // The image is its own thumbnail; a carousel shows its slide-1 (own) file.
    thumbnailUrl: img.cdnUrl,
    title: img.title,
    caption: img.caption,
    hashtags: img.hashtags,
    // Instagram-only — surfaced so the shared card can reuse platform badges.
    targetPlatforms: IMAGE_TARGET_PLATFORMS,
    categoryId: img.categoryId,
    category: img.category
      ? { id: img.category.id, name: img.category.name, color: img.category.color }
      : null,
    folderId: img.folderId,
    uploadSessionId: img.uploadSessionId,
    isDuplicate: img.isDuplicate,
    // Publish history — same shape as videos (see toVideoDto).
    postedAt: img.postedAt,
    postedPosts: parsePostedPosts(img.postedPosts),
    inQueue: img._count.queueItems > 0,
    // Carousel shape: total slide count (1 for a plain photo) + the child file
    // urls, in order, for the stacked-preview visual and the builder.
    slideCount: 1 + childSlides.length,
    carouselChildren: childSlides,
    createdAt: img.createdAt,
    updatedAt: img.updatedAt,
  };
}

export type MediaItemDto = ReturnType<typeof toVideoDto> | ReturnType<typeof toImageDto>;

/**
 * Opaque cursor for the merged video+image library grid. Both tables order by
 * (createdAt desc, id desc); the cursor encodes the last item's sort key so the
 * next page fetches strictly "older" rows from each table.
 */
function encodeMediaCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(`${item.createdAt.toISOString()}|${item.id}`).toString('base64url');
}
export function decodeMediaCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * A "fetch everything strictly older than the cursor" predicate for either the
 * Video or Image table, matching the (createdAt desc, id desc) ordering.
 */
export function olderThanCursor(cursor: { createdAt: Date; id: string } | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Merge already-fetched video and image DTOs (each fetched with `limit + 1`
 * using `olderThanCursor`) into a single page ordered by (createdAt desc,
 * id desc), returning the page plus the next cursor.
 */
export function mergeMediaPage(
  videos: (MediaItemDto & { createdAt: Date })[],
  images: (MediaItemDto & { createdAt: Date })[],
  limit: number,
): { items: MediaItemDto[]; nextCursor: string | undefined } {
  const merged = [...videos, ...images].sort((a, b) => {
    const t = b.createdAt.getTime() - a.createdAt.getTime();
    return t !== 0 ? t : b.id.localeCompare(a.id);
  });
  const hasMore = merged.length > limit;
  const page = merged.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: hasMore && last ? encodeMediaCursor(last) : undefined,
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

    // Validate the target folder belongs to the caller (null = root).
    if (input.folderId) {
      const folder = await ctx.prisma.folder.findFirst({
        where: { id: input.folderId, userId: ctx.userId },
        select: { id: true },
      });
      if (!folder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
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
        hashtags: [],
        targetPlatforms: [],
        uploadSessionId: input.uploadSessionId ?? null,
        folderId: input.folderId ?? null,
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
        include: VIDEO_INCLUDE,
      });

      if (video.uploadSessionId) {
        await ctx.prisma.uploadSession.update({
          where: { id: video.uploadSessionId },
          data: { videoCount: { increment: 1 } },
        });
      }

      // Start AI processing right away instead of waiting for the 5-min cron.
      await kickAiProcessing(ctx.userId);

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
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No cover upload in progress.',
        });
      }
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { coverImageUrl: publicUrlForKey(video.coverImageKey) },
        include: VIDEO_INCLUDE,
      });
      return toVideoDto(updated);
    }),

  // -------------------------------------------------------------------------
  // Photo upload (single presigned PUT — photos are small, no multipart) +
  // carousel building. Images are Instagram-only.
  // -------------------------------------------------------------------------

  /**
   * Start a photo upload. Records an Image row in UPLOADING state and returns a
   * single presigned PUT URL; the client uploads the file directly, then calls
   * `completeImageUpload`.
   */
  initImageUpload: protectedProcedure
    .input(initImageUploadSchema)
    .mutation(async ({ ctx, input }) => {
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
      if (input.folderId) {
        const folder = await ctx.prisma.folder.findFirst({
          where: { id: input.folderId, userId: ctx.userId },
          select: { id: true },
        });
        if (!folder) throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
      }

      const ext = extensionFor(input.filename) || extensionForMime(input.contentType) || '.jpg';

      const image = await ctx.prisma.image.create({
        data: {
          userId: ctx.userId,
          status: 'UPLOADING',
          storageKey: '', // set below, once we know the id
          originalFilename: input.filename,
          mimeType: input.contentType,
          fileSize: BigInt(input.fileSize),
          width: input.width ?? null,
          height: input.height ?? null,
          hashtags: [],
          uploadSessionId: input.uploadSessionId ?? null,
          folderId: input.folderId ?? null,
        },
      });

      const key = imageSourceKey(ctx.userId, image.id, ext);
      try {
        const { url } = await presignPut({ key, contentType: input.contentType });
        await ctx.prisma.image.update({ where: { id: image.id }, data: { storageKey: key } });
        return { imageId: image.id, key, url };
      } catch (err) {
        await ctx.prisma.image.delete({ where: { id: image.id } }).catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not start the upload. Please try again.',
          cause: err,
        });
      }
    }),

  /** Finalize a photo upload: mark READY and hand it to the AI pipeline. */
  completeImageUpload: protectedProcedure
    .input(completeImageUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const image = await ownedImage(ctx.prisma, ctx.userId, input.imageId);

      const updated = await ctx.prisma.image.update({
        where: { id: image.id },
        data: { status: 'READY', cdnUrl: publicUrlForKey(image.storageKey) },
        include: IMAGE_INCLUDE,
      });

      if (image.uploadSessionId) {
        await ctx.prisma.uploadSession
          .update({
            where: { id: image.uploadSessionId },
            data: { videoCount: { increment: 1 } },
          })
          .catch(() => {});
      }

      await kickAiProcessing(ctx.userId);
      return toImageDto(updated);
    }),

  /** Full detail for one image (Instagram-only, so no per-platform variants). */
  getImage: protectedProcedure.input(imageIdSchema).query(async ({ ctx, input }) => {
    const image = await ctx.prisma.image.findFirst({
      where: { id: input.imageId, userId: ctx.userId },
      include: IMAGE_INCLUDE,
    });
    if (!image) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found.' });
    return toImageDto(image);
  }),

  /** Edit an image's base metadata. */
  updateImageMetadata: protectedProcedure
    .input(updateImageMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedImage(ctx.prisma, ctx.userId, input.imageId);

      if (input.categoryId) {
        const category = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        });
        if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      const data: Prisma.ImageUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.hashtags !== undefined) data.hashtags = input.hashtags;
      if (input.categoryId !== undefined) {
        data.category = input.categoryId
          ? { connect: { id: input.categoryId } }
          : { disconnect: true };
      }

      const updated = await ctx.prisma.image.update({
        where: { id: input.imageId },
        data,
        include: IMAGE_INCLUDE,
      });
      return toImageDto(updated);
    }),

  /** Permanently delete an image and its storage objects. */
  removeImage: protectedProcedure.input(imageIdSchema).mutation(async ({ ctx, input }) => {
    const image = await ownedImage(ctx.prisma, ctx.userId, input.imageId);
    if (isStorageConfigured()) {
      await deletePrefix(imagePrefix(ctx.userId, image.id)).catch(() => {});
    }
    if (image.uploadSessionId) {
      await ctx.prisma.uploadSession
        .update({
          where: { id: image.uploadSessionId },
          data: { videoCount: { decrement: 1 } },
        })
        .catch(() => {});
    }
    // CarouselItem rows referencing this image (as parent OR child) cascade away.
    await ctx.prisma.image.delete({ where: { id: image.id } });
    return { success: true as const };
  }),

  /** Move many images into a folder (null = the root). */
  moveImagesMany: protectedProcedure.input(setFolderManySchema).mutation(async ({ ctx, input }) => {
    if (input.folderId) {
      const folder = await ctx.prisma.folder.findFirst({
        where: { id: input.folderId, userId: ctx.userId },
        select: { id: true },
      });
      if (!folder) throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
    }
    const { count } = await ctx.prisma.image.updateMany({
      where: { id: { in: input.videoIds }, userId: ctx.userId },
      data: { folderId: input.folderId },
    });
    return { updated: count };
  }),

  /** List a folder's ready images — feeds the carousel builder's right panel. */
  listImagesInFolder: protectedProcedure
    .input(listImagesInFolderSchema)
    .query(async ({ ctx, input }) => {
      const where: Prisma.ImageWhereInput = {
        userId: ctx.userId,
        folderId: input.folderId ?? null,
        status: 'READY',
      };
      if (input.search) {
        const q = input.search;
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { originalFilename: { contains: q, mode: 'insensitive' } },
        ];
      }
      const rows = await ctx.prisma.image.findMany({
        where,
        include: IMAGE_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
      return rows.map(toImageDto);
    }),

  /**
   * Turn a photo into a carousel (or update / clear its slides). The parent is
   * always slide 1; `childImageIds` are the ordered extra slides and must all be
   * the caller's own images (and not the parent itself). An empty list turns a
   * carousel back into a plain photo. Replaces the whole slide list atomically.
   */
  setCarouselItems: protectedProcedure
    .input(setCarouselItemsSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedImage(ctx.prisma, ctx.userId, input.imageId);

      // De-dupe, drop the parent if it snuck into its own child list, preserve order.
      const childIds = [...new Set(input.childImageIds)].filter((id) => id !== input.imageId);

      if (childIds.length > 0) {
        const owned = await ctx.prisma.image.findMany({
          where: { id: { in: childIds }, userId: ctx.userId },
          select: { id: true },
        });
        if (owned.length !== childIds.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'One or more selected photos could not be found.',
          });
        }
      }

      await ctx.prisma.$transaction([
        ctx.prisma.carouselItem.deleteMany({ where: { parentImageId: input.imageId } }),
        ...childIds.map((childImageId, i) =>
          ctx.prisma.carouselItem.create({
            data: { parentImageId: input.imageId, childImageId, position: i },
          }),
        ),
      ]);

      const updated = await ctx.prisma.image.findUniqueOrThrow({
        where: { id: input.imageId },
        include: IMAGE_INCLUDE,
      });
      return toImageDto(updated);
    }),

  // -------------------------------------------------------------------------
  // Browse / edit / delete
  // -------------------------------------------------------------------------

  /**
   * Search + filter the library (videos AND images) with cursor pagination.
   * Both tables are ordered by (createdAt desc, id desc) and merged into one
   * page; the cursor is an opaque composite key (see encode/decodeMediaCursor).
   */
  list: protectedProcedure.input(listVideosSchema).query(async ({ ctx, input }) => {
    const cursor = input.cursor ? decodeMediaCursor(input.cursor) : null;
    // The cursor predicate and the search predicate both use OR, so combine them
    // with AND rather than assigning `where.OR` twice (which would clobber one).
    const older = olderThanCursor(cursor);
    const q = input.search;
    const videoSearch: Prisma.VideoWhereInput | null = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { caption: { contains: q, mode: 'insensitive' } },
            { originalFilename: { contains: q, mode: 'insensitive' } },
            { transcript: { contains: q, mode: 'insensitive' } },
            { hashtags: { has: q } },
          ],
        }
      : null;
    const imageSearch: Prisma.ImageWhereInput | null = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { caption: { contains: q, mode: 'insensitive' } },
            { originalFilename: { contains: q, mode: 'insensitive' } },
            { hashtags: { has: q } },
          ],
        }
      : null;

    const common = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.uploadSessionId ? { uploadSessionId: input.uploadSessionId } : {}),
    };
    const videoWhere: Prisma.VideoWhereInput = {
      userId: ctx.userId,
      ...common,
      AND: [older, ...(videoSearch ? [videoSearch] : [])],
    };
    const imageWhere: Prisma.ImageWhereInput = {
      userId: ctx.userId,
      ...common,
      AND: [older, ...(imageSearch ? [imageSearch] : [])],
    };

    const [videoRows, imageRows, tiktokConnected] = await Promise.all([
      ctx.prisma.video.findMany({
        where: videoWhere,
        include: VIDEO_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      }),
      ctx.prisma.image.findMany({
        where: imageWhere,
        include: IMAGE_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      }),
      hasActiveTikTok(ctx.prisma, ctx.userId),
    ]);

    return mergeMediaPage(
      videoRows.map((r) => ({ ...toVideoDto(r, tiktokConnected), createdAt: r.createdAt })),
      imageRows.map((r) => ({ ...toImageDto(r), createdAt: r.createdAt })),
      input.limit,
    );
  }),

  /** Full detail for one video, including per-platform metadata + thumbnails. */
  get: protectedProcedure.input(videoIdSchema).query(async ({ ctx, input }) => {
    const video = await ctx.prisma.video.findFirst({
      where: { id: input.videoId, userId: ctx.userId },
      include: {
        category: true,
        selectedThumbnail: true,
        platformMeta: true,
        thumbnailCandidates: { orderBy: [{ score: 'desc' }, { frameTimeSec: 'asc' }] },
        _count: { select: { queueItems: true } },
      },
    });
    if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
    const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
    const tiktokMeta = video.platformMeta.find((m) => m.platform === Platform.TIKTOK);
    return {
      ...toVideoDto(video, tiktokConnected),
      transcript: video.transcript,
      selectedThumbnailId: video.selectedThumbnailId,
      // Whether TikTok is connected at all (drives whether the editor enforces
      // TikTok requirements) and the current stored TikTok options.
      tiktokConnected,
      tiktok: tiktokOptionsFromMeta(tiktokMeta),
      platformMeta: video.platformMeta.map((m) => ({
        platform: m.platform,
        title: m.title,
        caption: m.caption,
        hashtags: m.hashtags,
        aiGenerated: m.aiGenerated,
        edited: m.edited,
        madeForKids: m.youtubeMadeForKids,
        categoryId: m.youtubeCategoryId,
        containsSyntheticMedia: m.youtubeContainsSyntheticMedia,
        license: m.youtubeLicense,
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
        include: VIDEO_INCLUDE,
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

  /** Bulk-delete videos (and their storage objects) the user owns. */
  removeMany: protectedProcedure.input(videoIdsSchema).mutation(async ({ ctx, input }) => {
    const videos = await ctx.prisma.video.findMany({
      where: { id: { in: input.videoIds }, userId: ctx.userId },
      select: { id: true, uploadSessionId: true },
    });
    if (videos.length === 0) return { deleted: 0 };

    if (isStorageConfigured()) {
      await Promise.all(
        videos.map((v) => deletePrefix(videoPrefix(ctx.userId, v.id)).catch(() => {})),
      );
    }

    // Keep each upload session's videoCount in sync.
    const sessionDecrements = new Map<string, number>();
    for (const v of videos) {
      if (v.uploadSessionId) {
        sessionDecrements.set(
          v.uploadSessionId,
          (sessionDecrements.get(v.uploadSessionId) ?? 0) + 1,
        );
      }
    }
    await Promise.all(
      [...sessionDecrements].map(([id, count]) =>
        ctx.prisma.uploadSession
          .update({ where: { id }, data: { videoCount: { decrement: count } } })
          .catch(() => {}),
      ),
    );

    const { count } = await ctx.prisma.video.deleteMany({
      where: { id: { in: videos.map((v) => v.id) }, userId: ctx.userId },
    });
    return { deleted: count };
  }),

  /** Assign (or clear) a category for many videos the user owns at once. */
  setCategoryMany: protectedProcedure
    .input(setCategoryManySchema)
    .mutation(async ({ ctx, input }) => {
      if (input.categoryId) {
        const category = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        });
        if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      const { count } = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds }, userId: ctx.userId },
        data: { categoryId: input.categoryId },
      });
      return { updated: count };
    }),

  /**
   * Move many videos into a folder (null = the root). This is how the library
   * relocates items between folders. Validates folder ownership first.
   */
  moveMany: protectedProcedure.input(setFolderManySchema).mutation(async ({ ctx, input }) => {
    if (input.folderId) {
      const folder = await ctx.prisma.folder.findFirst({
        where: { id: input.folderId, userId: ctx.userId },
        select: { id: true },
      });
      if (!folder) throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
    }

    const { count } = await ctx.prisma.video.updateMany({
      where: { id: { in: input.videoIds }, userId: ctx.userId },
      data: { folderId: input.folderId },
    });
    return { updated: count };
  }),

  // -------------------------------------------------------------------------
  // AI pipeline (heavy work runs in the worker — these just read state and
  // enqueue; they never call ffmpeg / OpenAI in the request handler)
  // -------------------------------------------------------------------------

  /** Counts by AI status (optionally scoped to one upload session). */
  aiSummary: protectedProcedure.input(aiSummarySchema).query(async ({ ctx, input }) => {
    // Only count media the AI worker can actually drain. processPending claims
    // rows with status READY/PROCESSING, so a PENDING video still stuck in
    // UPLOADING (upload never finalized) or FAILED is not queued work — counting
    // it inflated "queued" forever with rows the worker correctly skips.
    const where: Prisma.VideoWhereInput = {
      userId: ctx.userId,
      status: { in: ['READY', 'PROCESSING'] },
    };
    if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;
    const grouped = await ctx.prisma.video.groupBy({
      by: ['aiStatus'],
      where,
      _count: { _all: true },
    });
    const counts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0, CANCELED: 0, SKIPPED: 0 };
    for (const g of grouped) counts[g.aiStatus] = g._count._all;
    return {
      ...counts,
      total:
        counts.PENDING +
        counts.RUNNING +
        counts.COMPLETED +
        counts.FAILED +
        counts.CANCELED +
        counts.SKIPPED,
    };
  }),

  /**
   * Queue videos for the AI worker by setting their `aiStatus` back to PENDING.
   * The worker (`npm run ai:process`) drains PENDING rows. Returns how many were
   * queued. RUNNING videos are left alone so we don't interrupt in-flight work.
   */
  regenerateMetadata: protectedProcedure
    .input(regenerateMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      const where: Prisma.VideoWhereInput = {
        userId: ctx.userId,
        status: { in: ['READY', 'PROCESSING'] },
        aiStatus: input.onlyFailed ? 'FAILED' : { not: 'RUNNING' },
      };
      if (input.videoId) where.id = input.videoId;
      if (input.videoIds) where.id = { in: input.videoIds };
      if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;

      const { count } = await ctx.prisma.video.updateMany({
        where,
        // Reset aiAttempts so a manual re-queue gets a fresh retry budget — a
        // video the worker retired to FAILED after MAX_AI_ATTEMPTS can be tried
        // again (e.g. after bumping the machine size or fixing the source).
        data: { aiStatus: 'PENDING', aiAttempts: 0 },
      });
      return { queued: count };
    }),

  /**
   * Stop generation before it starts. Only videos still PENDING are affected —
   * one already RUNNING is mid-pipeline (ffmpeg/OpenAI calls in flight) and
   * can't be safely interrupted here, so it's left to finish on its own.
   */
  stopMetadataGeneration: protectedProcedure
    .input(stopMetadataGenerationSchema)
    .mutation(async ({ ctx, input }) => {
      const where: Prisma.VideoWhereInput = {
        userId: ctx.userId,
        aiStatus: 'PENDING',
      };
      if (input.videoId) where.id = input.videoId;
      if (input.videoIds) where.id = { in: input.videoIds };
      if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;

      const { count } = await ctx.prisma.video.updateMany({
        where,
        data: { aiStatus: 'CANCELED' },
      });
      return { canceled: count };
    }),

  /**
   * Clear stopped videos. Only videos currently CANCELED are affected — they
   * move to SKIPPED, staying in the library but dropping out of the AI-metadata
   * summary. Returns how many were cleared.
   */
  clearStoppedMetadata: protectedProcedure
    .input(clearStoppedMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      const where: Prisma.VideoWhereInput = {
        userId: ctx.userId,
        aiStatus: 'CANCELED',
      };
      if (input.videoId) where.id = input.videoId;
      if (input.videoIds) where.id = { in: input.videoIds };
      if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;

      const { count } = await ctx.prisma.video.updateMany({
        where,
        data: { aiStatus: 'SKIPPED' },
      });
      return { cleared: count };
    }),

  /** Override the AI-chosen thumbnail with a specific candidate frame. */
  selectThumbnail: protectedProcedure
    .input(selectThumbnailSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const thumb = await ctx.prisma.thumbnailCandidate.findFirst({
        where: { id: input.thumbnailId, videoId: input.videoId },
        select: { id: true },
      });
      if (!thumb) throw new TRPCError({ code: 'NOT_FOUND', message: 'Thumbnail not found.' });

      const updated = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { selectedThumbnailId: thumb.id },
        include: VIDEO_INCLUDE,
      });
      return toVideoDto(updated);
    }),

  /** Edit one platform's caption variant; marks it edited so AI won't overwrite. */
  setPlatformMeta: protectedProcedure
    .input(setPlatformMetaSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const data = {
        title: input.title ?? null,
        caption: input.caption ?? null,
        hashtags: input.hashtags ?? [],
        edited: true,
        // YouTube-only fields; each is only written when the client sends it
        // (i.e. from the YouTube tab). Omitted → column left unchanged.
        ...(input.madeForKids !== undefined ? { youtubeMadeForKids: input.madeForKids } : {}),
        ...(input.categoryId !== undefined ? { youtubeCategoryId: input.categoryId } : {}),
        ...(input.containsSyntheticMedia !== undefined
          ? { youtubeContainsSyntheticMedia: input.containsSyntheticMedia }
          : {}),
        ...(input.license !== undefined ? { youtubeLicense: input.license } : {}),
      };
      await ctx.prisma.videoPlatformMeta.upsert({
        where: { videoId_platform: { videoId: input.videoId, platform: input.platform } },
        create: { videoId: input.videoId, platform: input.platform, aiGenerated: false, ...data },
        update: data,
      });
      return { success: true as const };
    }),

  /**
   * Set which platforms this video publishes to. An empty array restores the
   * default ("all connected platforms"). Deduplicated server-side. Does not
   * re-materialize the schedule here — the queue recomputes when the item is
   * added/moved; videos already queued pick up the change on the next recompute.
   */
  setTargetPlatforms: protectedProcedure
    .input(setTargetPlatformsSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const platforms = [...new Set(input.platforms)];
      await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { targetPlatforms: platforms },
      });
      await recomputeUserQueue(ctx.prisma, ctx.userId);
      return { success: true as const, targetPlatforms: platforms };
    }),

  /** Bulk version of setTargetPlatforms for the multi-select toolbar. */
  setTargetPlatformsMany: protectedProcedure
    .input(setTargetPlatformsManySchema)
    .mutation(async ({ ctx, input }) => {
      const platforms = [...new Set(input.platforms)];
      const { count } = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds }, userId: ctx.userId },
        data: { targetPlatforms: platforms },
      });
      await recomputeUserQueue(ctx.prisma, ctx.userId);
      return { updated: count };
    }),

  /**
   * Save the TikTok Direct Post options (privacy, interaction abilities,
   * commercial disclosure) on the video's TikTok platform-meta row. Returns the
   * recomputed gate so the client can immediately reflect whether the video is
   * still blocked from the queue.
   */
  setTiktokMeta: protectedProcedure.input(setTiktokMetaSchema).mutation(async ({ ctx, input }) => {
    await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

    // Enforce the "branded content can't be private" rule server-side too.
    const reasons = evaluateTikTokRequirements({
      privacy: input.privacy,
      allowComment: input.allowComment,
      allowDuet: input.allowDuet,
      allowStitch: input.allowStitch,
      commercialDisclosure: input.commercialDisclosure,
      brandOrganic: input.brandOrganic,
      brandedContent: input.brandedContent,
    });

    const data = {
      tiktokPrivacy: input.privacy,
      tiktokAllowComment: input.allowComment,
      tiktokAllowDuet: input.allowDuet,
      tiktokAllowStitch: input.allowStitch,
      tiktokCommercial: input.commercialDisclosure,
      tiktokBrandOrganic: input.brandOrganic,
      tiktokBrandedContent: input.brandedContent,
      edited: true,
    };
    await ctx.prisma.videoPlatformMeta.upsert({
      where: { videoId_platform: { videoId: input.videoId, platform: Platform.TIKTOK } },
      // `hashtags` is a non-nullable array with no DB default, so it must be
      // set when creating the row (only the update path leaves captions/tags
      // untouched).
      create: {
        videoId: input.videoId,
        platform: Platform.TIKTOK,
        aiGenerated: false,
        hashtags: [],
        ...data,
      },
      update: data,
    });
    return { success: true as const, blockingReasons: reasons };
  }),

  /**
   * Bulk version of the privacy picker for the multi-select footer: set the
   * TikTok "who can view" level on many owned videos at once. Only privacy is
   * touched — the interaction toggles keep their existing (or default) values —
   * because privacy is the single field that gates a batch out of the queue.
   */
  setTiktokPrivacyMany: protectedProcedure
    .input(setTiktokPrivacyManySchema)
    .mutation(async ({ ctx, input }) => {
      // Scope to videos the user actually owns before touching platform-meta.
      const owned = await ctx.prisma.video.findMany({
        where: { id: { in: input.videoIds }, userId: ctx.userId },
        select: { id: true },
      });

      // Upsert per video: existing TikTok rows only get the new privacy; missing
      // rows are created with privacy set and the interaction toggles left at
      // their DB defaults (all false).
      await ctx.prisma.$transaction(
        owned.map((v) =>
          ctx.prisma.videoPlatformMeta.upsert({
            where: { videoId_platform: { videoId: v.id, platform: Platform.TIKTOK } },
            create: {
              videoId: v.id,
              platform: Platform.TIKTOK,
              aiGenerated: false,
              hashtags: [],
              tiktokPrivacy: input.privacy,
              edited: true,
            },
            update: { tiktokPrivacy: input.privacy, edited: true },
          }),
        ),
      );
      return { updated: owned.length };
    }),

  /** Videos flagged as (near-)duplicates, with their matches — for a dupe review view. */
  duplicates: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.video.findMany({
      where: { userId: ctx.userId, isDuplicate: true },
      include: VIDEO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
    return rows.map((r) => toVideoDto(r, tiktokConnected));
  }),
});
