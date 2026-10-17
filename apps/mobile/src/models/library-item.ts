import {
  DEFAULT_TIKTOK_OPTIONS,
  tiktokConsentSegments,
  type TikTokConsentSegment,
} from '@postpilot/types';

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
 *
 * Its one action is Add to queue (see `queueAction`): offered for Ready items
 * that aren't queued, posted ones included so evergreen content can go round
 * again; disabled with a reason that points to the web otherwise; and "View in
 * Queue" once it's queued.
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
  queue: LibraryQueueAction;
}

/**
 * How adding asks first. A video that posts to TikTok needs TikTok's consent
 * declaration (a sheet, with the policy names as links); anything else is a
 * plain alert.
 */
export type LibraryAddConfirm =
  | {
      kind: 'tiktokConsent';
      /** The declaration, broken into runs so the policy names can be links. */
      segments: TikTokConsentSegment[];
      /** The Branded Content Policy wording, for a video that discloses branded content. */
      branded: boolean;
      notice: string;
      /** "Posts to TikTok and YouTube". */
      postsTo: string;
    }
  | { kind: 'alert'; title: string; message: string };

/** The detail's queue action, first match wins. */
export type LibraryQueueAction =
  | { kind: 'viewInQueue'; label: string }
  | { kind: 'disabled'; label: string; reason: string }
  | { kind: 'add'; label: string; confirm: LibraryAddConfirm };

/** What happened to an add, from `queue.addVideos` / `queue.addImages`'s counts. */
export type LibraryAddOutcome =
  | { kind: 'added' }
  | { kind: 'refused'; title: string; message: string };

export const TIKTOK_PROCESSING_NOTICE =
  'After you publish, it can take a few minutes for TikTok to finish processing your post before it appears on your profile.';

const PLATFORM_ORDER: Platform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'];

export function buildLibraryItemDetail(
  item: LibraryItemData,
  connections: LibraryConnections,
  now: Date,
): LibraryItemDetail {
  const connected = connectedPlatforms(connections);
  const platforms = postsTo(item, connected);
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
    queue: queueAction(item, platforms, connected),
  };
}

// --- Add to queue ----------------------------------------------------------

const ADD = 'Add to queue';

/**
 * Whether the item can be added, and how adding asks first. Already queued →
 * View in Queue. Then the reasons it can't be: upload failed, still
 * processing, missing TikTok details, or its file was removed after posting.
 * Everything else is Ready and can be added, posted or not.
 */
export function queueAction(
  item: LibraryItemData,
  platforms: Platform[],
  connected: Platform[],
): LibraryQueueAction {
  if (item.inQueue) return { kind: 'viewInQueue', label: 'View in Queue' };
  const disabled = (reason: string): LibraryQueueAction => ({
    kind: 'disabled',
    label: ADD,
    reason,
  });
  if (item.status === 'FAILED') {
    return disabled('The upload failed. Upload it again from PostPilot on the web.');
  }
  if (item.status !== 'READY') {
    return disabled('Still processing. Once it’s ready, add it here or on the web.');
  }
  if (item.mediaType === 'VIDEO') {
    if (item.tiktokNeedsInput) {
      return disabled(
        'TikTok needs a few details first, like who can view it. Add them in PostPilot on the web.',
      );
    }
    if (item.sourceDeletedAt) {
      return disabled(
        'The video file was removed after posting, so it can’t post again. Upload it again from PostPilot on the web.',
      );
    }
  }
  return { kind: 'add', label: ADD, confirm: addConfirm(item, platforms, connected) };
}

function addConfirm(
  item: LibraryItemData,
  platforms: Platform[],
  connected: Platform[],
): LibraryAddConfirm {
  const where =
    platforms.length > 0 ? listOf(platforms.map(platformName)) : 'all connected platforms';
  // As on the web: TikTok is only posted to, and so only asks, when it's connected.
  if (item.mediaType === 'VIDEO' && connected.includes('TIKTOK') && platforms.includes('TIKTOK')) {
    const branded = item.tiktokBranded;
    return {
      kind: 'tiktokConsent',
      segments: tiktokConsentSegments({
        ...DEFAULT_TIKTOK_OPTIONS,
        commercialDisclosure: branded,
        brandedContent: branded,
      }),
      branded,
      notice: TIKTOK_PROCESSING_NOTICE,
      postsTo: `Posts to ${where}`,
    };
  }
  return {
    kind: 'alert',
    title: `Post “${mediaTitle(item)}” to ${where}?`,
    message: 'It goes to the end of your queue.',
  };
}

/**
 * Reads an add's counts. The server skips rather than throws: a video that
 * targets TikTok without its details (set on the web after this screen loaded)
 * comes back `blocked`, and one already queued or no longer ready comes back
 * plainly skipped.
 */
export function addToQueueOutcome(res: {
  added: number;
  skipped: number;
  blocked?: number;
}): LibraryAddOutcome {
  if (res.added > 0) return { kind: 'added' };
  if ((res.blocked ?? 0) > 0) {
    return {
      kind: 'refused',
      title: 'TikTok details needed',
      message:
        'TikTok needs a few details before this video can post, like who can view it. Add them in PostPilot on the web, then add it to the queue again.',
    };
  }
  return {
    kind: 'refused',
    title: 'Couldn’t add to queue',
    message: 'It may already be queued or no longer ready. The screen now shows where it stands.',
  };
}

/** "TikTok", "TikTok and Instagram", "TikTok, Instagram and YouTube". */
function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
