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

/** A photo or carousel item (Instagram-only). */
export type ImageDto = Extract<MediaItem, { mediaType: 'IMAGE' | 'CAROUSEL' }>;

/** Full image detail as returned by `media.getImage`. */
export type ImageDetailDto = RouterOutputs['media']['getImage'];

/** A folder as returned by `folder.list` / `folder.children`. */
export type FolderDto = RouterOutputs['folder']['list']['folders'][number];

/** A breadcrumb node (root → current) from `folder.breadcrumbs`. */
export type BreadcrumbDto = RouterOutputs['folder']['breadcrumbs'][number];
