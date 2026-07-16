import { z } from 'zod';

import { mediaStatusSchema, platformSchema } from './domain';

/**
 * Shared validation for the Media Library. The web/mobile clients and the API
 * validate against these same rules.
 *
 * Upload model: video bytes never pass through the app server. The client asks
 * the server to `initUpload` (which records a Video row and starts a multipart
 * upload), PUTs each part straight to storage using the presigned URLs, then
 * calls `completeUpload` with the part etags so the server can finalize.
 */

// Video files we accept. Keep this in sync with any client-side `accept` attr.
export const ACCEPTED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const ACCEPTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 10 GB — generous headroom over the platforms' own limits. */
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;
/** 15 MB cap for optional cover images. */
export const MAX_COVER_BYTES = 15 * 1024 * 1024;
/**
 * 30 MB cap for uploaded photos. Generous for camera originals; note Instagram's
 * publish API is stricter (~8 MB per image), so oversized photos may need
 * downscaling before they publish — surfaced at publish time, not upload.
 */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/** Max slides in a single carousel (Instagram's own limit is 10). */
export const MAX_CAROUSEL_ITEMS = 10;

/**
 * Ceiling above which the AI metadata pipeline skips a video rather than risk
 * OOM-ing the worker on frame extraction. This is *not* an upload limit — a
 * bigger video still uploads and can be posted; it just won't get
 * auto-generated metadata. The worker enforces these (env-overridable via
 * AI_MAX_VIDEO_BYTES / AI_MAX_VIDEO_DURATION_SEC); the client uses them only to
 * warn at upload time, so they're the shared default source of truth. Keep well
 * below MAX_VIDEO_BYTES (the hard upload cap).
 */
export const AI_METADATA_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
/** 60 minutes — frame/transcript work scales with length. */
export const AI_METADATA_MAX_VIDEO_DURATION_SEC = 60 * 60;

/**
 * Whether a video is too large/long for auto-generated metadata, with a short
 * human-readable reason. `sizeBytes`/`durationSec` may be undefined when not yet
 * known (e.g. duration before the client has probed the file) — an unknown
 * field is simply not checked. Returns null when the video is within limits.
 */
export function videoExceedsAiLimit(input: {
  sizeBytes?: number | null;
  durationSec?: number | null;
}): string | null {
  if (input.sizeBytes != null && input.sizeBytes > AI_METADATA_MAX_VIDEO_BYTES) {
    return 'Over 2 GB, so it will upload and can be posted, but won’t get auto-generated metadata.';
  }
  if (input.durationSec != null && input.durationSec > AI_METADATA_MAX_VIDEO_DURATION_SEC) {
    return 'Longer than 60 min, so it will upload and can be posted, but won’t get auto-generated metadata.';
  }
  return null;
}

export const videoMimeSchema = z.enum(ACCEPTED_VIDEO_MIME_TYPES);
export const imageMimeSchema = z.enum(ACCEPTED_IMAGE_MIME_TYPES);

/** Create a labelled batch (an "upload session") that videos can belong to. */
export const createUploadSessionSchema = z.object({
  label: z.string().trim().max(120).optional(),
});
export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;

/** Start an upload: server creates the Video row + multipart upload. */
export const initUploadSchema = z.object({
  filename: z.string().trim().min(1).max(400),
  contentType: videoMimeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_VIDEO_BYTES, 'That video is larger than the 10 GB limit'),
  uploadSessionId: z.string().min(1).optional(),
  // Folder the upload should land in (null/omitted = the root).
  folderId: z.string().min(1).nullish(),
  // Optional client-provided probe metadata (best effort; AI pipeline confirms).
  durationSec: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

export const uploadedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
});
export type UploadedPart = z.infer<typeof uploadedPartSchema>;

/** Finalize a multipart upload after every part has been PUT to storage. */
export const completeUploadSchema = z.object({
  videoId: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z.array(uploadedPartSchema).min(1),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

/** Abandon an in-flight upload (client cancelled / failed). */
export const abortUploadSchema = z.object({
  videoId: z.string().min(1),
  uploadId: z.string().min(1),
});
export type AbortUploadInput = z.infer<typeof abortUploadSchema>;

/** Ask for a presigned PUT to upload an optional cover image. */
export const initCoverUploadSchema = z.object({
  videoId: z.string().min(1),
  contentType: imageMimeSchema,
  fileSize: z.number().int().positive().max(MAX_COVER_BYTES, 'Cover image is too large'),
});
export type InitCoverUploadInput = z.infer<typeof initCoverUploadSchema>;

/** Record that the cover image finished uploading. */
export const confirmCoverUploadSchema = z.object({
  videoId: z.string().min(1),
});
export type ConfirmCoverUploadInput = z.infer<typeof confirmCoverUploadSchema>;

/** Edit base (platform-agnostic) metadata on a video. */
export const updateVideoMetadataSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().trim().max(150).nullish(),
  caption: z.string().trim().max(5000).nullish(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
  categoryId: z.string().min(1).nullish(),
});
export type UpdateVideoMetadataInput = z.infer<typeof updateVideoMetadataSchema>;

/** List / search / filter the library, with cursor pagination. */
export const listVideosSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: mediaStatusSchema.optional(),
  categoryId: z.string().min(1).optional(),
  uploadSessionId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});
export type ListVideosInput = z.infer<typeof listVideosSchema>;

export const videoIdSchema = z.object({ videoId: z.string().min(1) });
export type VideoIdInput = z.infer<typeof videoIdSchema>;

/** Bulk operations over a set of videos (delete, recategorize, etc.). */
export const videoIdsSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(1000),
});
export type VideoIdsInput = z.infer<typeof videoIdsSchema>;

/** Assign (or clear) a category for many videos at once. */
export const setCategoryManySchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(1000),
  categoryId: z.string().min(1).nullable(),
});
export type SetCategoryManyInput = z.infer<typeof setCategoryManySchema>;

// ---------------------------------------------------------------------------
// AI pipeline (Chunk 5)
// ---------------------------------------------------------------------------

/**
 * Queue videos for (re)processing by the AI worker. Scope is one of: a single
 * video, a whole upload session, or — if neither is given — all of the user's
 * videos. `onlyFailed` re-runs just the ones that previously failed.
 */
export const regenerateMetadataSchema = z.object({
  videoId: z.string().min(1).optional(),
  videoIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  uploadSessionId: z.string().min(1).optional(),
  onlyFailed: z.boolean().optional().default(false),
});
export type RegenerateMetadataInput = z.infer<typeof regenerateMetadataSchema>;

/**
 * Stop AI generation before it starts. Same scope shape as
 * `regenerateMetadataSchema` (single video / many / a session / everything),
 * but only ever touches videos still PENDING — one already RUNNING is left to
 * finish since the worker can't be safely interrupted mid-video.
 */
export const stopMetadataGenerationSchema = z.object({
  videoId: z.string().min(1).optional(),
  videoIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  uploadSessionId: z.string().min(1).optional(),
});
export type StopMetadataGenerationInput = z.infer<typeof stopMetadataGenerationSchema>;

/**
 * Clear stopped (CANCELED) videos. Same scope shape as the schemas above, but
 * only ever touches videos currently CANCELED, moving them to SKIPPED so they
 * drop out of the AI-metadata summary while staying in the library.
 */
export const clearStoppedMetadataSchema = z.object({
  videoId: z.string().min(1).optional(),
  videoIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  uploadSessionId: z.string().min(1).optional(),
});
export type ClearStoppedMetadataInput = z.infer<typeof clearStoppedMetadataSchema>;

/** Override the AI-selected thumbnail with one of the candidate frames. */
export const selectThumbnailSchema = z.object({
  videoId: z.string().min(1),
  thumbnailId: z.string().min(1),
});
export type SelectThumbnailInput = z.infer<typeof selectThumbnailSchema>;

/**
 * Set which platforms a video should be published to. An empty array means
 * "all connected platforms" (the default cross-post behavior).
 */
export const setTargetPlatformsSchema = z.object({
  videoId: z.string().min(1),
  platforms: z.array(platformSchema).max(3),
});
export type SetTargetPlatformsInput = z.infer<typeof setTargetPlatformsSchema>;

/** Set target platforms for many videos at once (bulk action on /media). */
export const setTargetPlatformsManySchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(1000),
  platforms: z.array(platformSchema).max(3),
});
export type SetTargetPlatformsManyInput = z.infer<typeof setTargetPlatformsManySchema>;

/** Edit a per-platform caption variant (marks it user-edited so AI won't clobber it). */
export const setPlatformMetaSchema = z.object({
  videoId: z.string().min(1),
  platform: platformSchema,
  title: z.string().trim().max(150).nullish(),
  caption: z.string().trim().max(5000).nullish(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
});
export type SetPlatformMetaInput = z.infer<typeof setPlatformMetaSchema>;

/** Optional scope for the AI-status summary counts. */
export const aiSummarySchema = z.object({
  uploadSessionId: z.string().min(1).optional(),
});
export type AiSummaryInput = z.infer<typeof aiSummarySchema>;

// ---------------------------------------------------------------------------
// Images & carousels (Instagram-only)
// ---------------------------------------------------------------------------

/**
 * The kind of a media-library item as returned by `media.list`. Videos and
 * images live in separate tables but share the grid; `mediaType` discriminates
 * them client-side. A `CAROUSEL` is an image that owns ordered child slides.
 */
export const mediaTypeSchema = z.enum(['VIDEO', 'IMAGE', 'CAROUSEL']);
export type MediaType = z.infer<typeof mediaTypeSchema>;

/**
 * Start a photo upload. Unlike videos (multipart), photos are small enough for
 * a single presigned PUT — the server creates the Image row and returns one URL.
 */
export const initImageUploadSchema = z.object({
  filename: z.string().trim().min(1).max(400),
  contentType: imageMimeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, 'That photo is larger than the 30 MB limit'),
  uploadSessionId: z.string().min(1).optional(),
  folderId: z.string().min(1).nullish(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type InitImageUploadInput = z.infer<typeof initImageUploadSchema>;

/** Record that a photo finished uploading (single-PUT, so no parts/etags). */
export const completeImageUploadSchema = z.object({
  imageId: z.string().min(1),
});
export type CompleteImageUploadInput = z.infer<typeof completeImageUploadSchema>;

/** Edit base metadata on a photo (Instagram-only, so no per-platform variants). */
export const updateImageMetadataSchema = z.object({
  imageId: z.string().min(1),
  title: z.string().trim().max(150).nullish(),
  caption: z.string().trim().max(2200).nullish(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
  categoryId: z.string().min(1).nullish(),
});
export type UpdateImageMetadataInput = z.infer<typeof updateImageMetadataSchema>;

export const imageIdSchema = z.object({ imageId: z.string().min(1) });
export type ImageIdInput = z.infer<typeof imageIdSchema>;

/** Bulk operations over a set of images (delete, recategorize, etc.). */
export const imageIdsSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(1000),
});
export type ImageIdsInput = z.infer<typeof imageIdsSchema>;

/**
 * Turn a photo into a carousel (or replace its slide list). The parent image is
 * always slide 1; `childImageIds` are the additional slides, in order, and must
 * all be the caller's own images. An empty list turns a carousel back into a
 * single photo. The parent may not appear in its own child list.
 */
export const setCarouselItemsSchema = z.object({
  imageId: z.string().min(1),
  // Up to MAX_CAROUSEL_ITEMS - 1 extra slides (slide 1 is the parent's own file).
  childImageIds: z.array(z.string().min(1)).max(MAX_CAROUSEL_ITEMS - 1),
});
export type SetCarouselItemsInput = z.infer<typeof setCarouselItemsSchema>;

/** List a folder's images for the carousel builder's picker (no cursor needed). */
export const listImagesInFolderSchema = z.object({
  folderId: z.string().min(1).nullish(),
  search: z.string().trim().max(200).optional(),
});
export type ListImagesInFolderInput = z.infer<typeof listImagesInFolderSchema>;
