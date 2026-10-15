import { fmtDateTime } from '../lib/dashboard-format';
import type { RouterOutputs } from '../lib/trpc';
import {
  connectedPlatforms,
  mediaStatus,
  mediaTitle,
  postsTo,
  type LibraryConnections,
  type LibraryMediaRow,
  type Platform,
} from './library';
import { platformName } from './queue';

/**
 * Library item detail model: one media item as its detail screen shows it,
 * derived from `media.get` (a video) or `media.getImage` (a photo or carousel)
 * plus `connections.overview` and `now`. Everything is read-only.
 *
 * - A video plays inline from its CDN url, with its thumbnail as the poster.
 *   It has nothing to play while processing, after a failed upload, or once
 *   the retention sweep removed its file after posting.
 * - A photo or carousel is a pager of slides, its own file first.
 * - Status, title and target platforms follow the Library row's own rules, so
 *   the row and its detail never disagree.
 * - Each platform it was posted to gets a row, with a View post link when the
 *   platform returned one.
 */

export type LibraryVideoDetail = RouterOutputs['media']['get'];
export type LibraryImageDetail = RouterOutputs['media']['getImage'];
export type LibraryItemData = LibraryVideoDetail | LibraryImageDetail;

export interface LibraryItemSlide {
  key: string;
  uri: string;
  /** What VoiceOver reads for the page, e.g. "Slide 2 of 5". */
  label: string;
}

/** `aspectRatio` is width / height for the media frame, kept within 9:16 to 1.91:1. */
export type LibraryItemPreview =
  | {
      kind: 'video';
      aspectRatio: number;
      /** What to play; null when there is nothing playable. */
      uri: string | null;
      posterUrl: string | null;
      /** Why nothing plays, when `uri` is null. */
      unavailable: string | null;
    }
  | { kind: 'slides'; aspectRatio: number; slides: LibraryItemSlide[] };

export interface LibraryItemPost {
  key: string;
  platform: Platform;
  name: string;
  /** "Posted Mon, Oct 12, 9:00 AM". */
  posted: string;
  postUrl: string | null;
}

export interface LibraryItemDetail {
  id: string;
  title: string;
  preview: LibraryItemPreview;
  status: LibraryMediaRow['status'];
  postsTo: { platforms: Platform[]; label: string };
  category: string | null;
  caption: string | null;
  /** "#morning #routine", or null when there are none. */
  hashtags: string | null;
  posts: LibraryItemPost[];
}

const PLATFORM_ORDER: Platform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'];

export function buildLibraryItemDetail(
  item: LibraryItemData,
  connections: LibraryConnections,
  now: Date,
): LibraryItemDetail {
  const platforms = postsTo(item, connectedPlatforms(connections));
  return {
    id: item.id,
    title: mediaTitle(item),
    preview: item.mediaType === 'VIDEO' ? videoPreview(item) : slidesPreview(item),
    status: mediaStatus(item, now),
    postsTo: {
      platforms,
      label:
        platforms.length > 0 ? platforms.map(platformName).join(', ') : 'All connected platforms',
    },
    category: item.category?.name ?? null,
    caption: item.caption?.trim() || null,
    hashtags:
      item.hashtags.length > 0
        ? item.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')
        : null,
    posts: [...item.postedPosts]
      .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform))
      .map((post) => ({
        key: post.platform,
        platform: post.platform,
        name: platformName(post.platform),
        posted: `Posted ${fmtDateTime(post.postedAt)}`,
        postUrl: post.postUrl,
      })),
  };
}

// --- Preview ---------------------------------------------------------------

function videoPreview(video: LibraryVideoDetail): LibraryItemPreview {
  const unavailable = unplayable(video);
  return {
    kind: 'video',
    aspectRatio: aspectRatio(video.width, video.height, 9 / 16),
    uri: unavailable ? null : video.cdnUrl,
    posterUrl: video.thumbnailUrl,
    unavailable,
  };
}

/** Why a video has nothing to play, or null when it plays. */
function unplayable(video: LibraryVideoDetail): string | null {
  if (video.status === 'FAILED') return 'The upload failed, so there’s nothing to play.';
  if (video.status !== 'READY') return 'Plays once processing finishes.';
  if (video.sourceDeletedAt) return 'The video file was removed after posting.';
  if (!video.cdnUrl) return 'There’s nothing to play yet.';
  return null;
}

function slidesPreview(image: LibraryImageDetail): LibraryItemPreview {
  const files = [
    { key: image.id, uri: image.cdnUrl },
    ...image.carouselChildren.map((child) => ({ key: child.id, uri: child.cdnUrl })),
  ].filter((file): file is { key: string; uri: string } => Boolean(file.uri));
  return {
    kind: 'slides',
    aspectRatio: aspectRatio(image.width, image.height, 4 / 5),
    slides: files.map((file, i) => ({
      ...file,
      label: image.mediaType === 'CAROUSEL' ? `Slide ${i + 1} of ${files.length}` : 'Photo',
    })),
  };
}

/** width / height, kept between a 9:16 phone video and a 1.91:1 landscape photo. */
function aspectRatio(width: number | null, height: number | null, fallback: number): number {
  if (!width || !height) return fallback;
  return Math.min(Math.max(width / height, 9 / 16), 1.91);
}
