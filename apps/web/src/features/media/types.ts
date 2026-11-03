import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * A library item as returned by `media.list` / `folder.list` — a discriminated
 * union of videos and images/carousels (`mediaType`). Videos and images live in
 * separate tables but share the grid.
 */
export type MediaItem = RouterOutputs['media']['list']['items'][number];

/** A video item (all the video-specific fields the cards/dialogs use). */
export type VideoDto = Extract<MediaItem, { mediaType: 'VIDEO' }>;

/**
 * Why a video whose source was removed (`sourceDeletedAt` set) can't be played
 * or posted again — the card badge's tooltip and the edit sheet's note in place
 * of the player. Worded for both causes: the retention sweep after posting, and
 * the inactive free account purge, which can remove unposted videos too.
 */
export const SOURCE_REMOVED_HINT =
  'The original video was removed to free up space. Its thumbnail, caption and any post links stay, but it can’t be played or posted again.';

/** The same for a photo, which is its own thumbnail and so leaves nothing to show. */
export const PHOTO_REMOVED_HINT =
  'This photo was removed to free up space. Its caption and any post links stay, but it can’t be viewed or posted again.';

/** A carousel whose own photo survives but one of whose other slides was removed. */
export const SLIDE_REMOVED_HINT =
  'A photo in this carousel was removed to free up space. Take it out of the carousel to post the rest.';

/** Why a photo or carousel can't be posted because of a removed file, or null. */
export function imageRemovedHint(image: {
  sourceDeletedAt: Date | string | null;
  removedSlides: number;
}): string | null {
  if (image.sourceDeletedAt) return PHOTO_REMOVED_HINT;
  if (image.removedSlides > 0) return SLIDE_REMOVED_HINT;
  return null;
}

/** A photo or carousel item (Instagram-only). */
export type ImageDto = Extract<MediaItem, { mediaType: 'IMAGE' | 'CAROUSEL' }>;

/** Full image detail as returned by `media.getImage`. */
export type ImageDetailDto = RouterOutputs['media']['getImage'];

/** A folder as returned by `folder.list` / `folder.children`. */
export type FolderDto = RouterOutputs['folder']['list']['folders'][number];

/** A breadcrumb node (root → current) from `folder.breadcrumbs`. */
export type BreadcrumbDto = RouterOutputs['folder']['breadcrumbs'][number];
