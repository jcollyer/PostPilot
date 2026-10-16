import type { LibraryVideoDetail } from './library-item';
import type {
  LibraryConnections,
  LibraryFolder,
  LibraryFolderPage,
  LibraryMedia,
  LibrarySearchPage,
  Platform,
} from './library';

/**
 * Shared `folder.list` / `media.list` / `media.get` / `connections.overview`
 * fixtures for the Library model tests.
 */

const HOUR = 3_600_000;
export const NOW = new Date('2026-10-14T12:00:00Z');
export const hoursAgo = (n: number) => new Date(NOW.getTime() - n * HOUR);

export type Video = Extract<LibraryMedia, { mediaType: 'VIDEO' }>;
export type Image = Exclude<LibraryMedia, { mediaType: 'VIDEO' }>;

export function video(id: string, overrides: Partial<Video> = {}): Video {
  return {
    mediaType: 'VIDEO',
    id,
    status: 'READY',
    aiStatus: 'COMPLETED',
    cdnUrl: `https://cdn.example.com/${id}.mp4`,
    originalFilename: `${id}.mp4`,
    mimeType: 'video/mp4',
    fileSize: 1_000_000,
    durationSec: 45,
    width: 1080,
    height: 1920,
    coverImageUrl: null,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    title: `Video ${id}`,
    caption: null,
    hashtags: [],
    targetPlatforms: [],
    categoryId: null,
    category: null,
    folderId: null,
    uploadSessionId: null,
    isDuplicate: false,
    postedAt: null,
    postedPosts: [],
    sourceDeletedAt: null,
    inQueue: false,
    tiktokNeedsInput: false,
    tiktokOptionsIncomplete: false,
    tiktokBranded: false,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...overrides,
  };
}

/** `media.get` for a video: the list row plus the editor's extra detail. */
export function videoDetail(id: string, overrides: Partial<LibraryVideoDetail> = {}): LibraryVideoDetail {
  return {
    ...video(id),
    transcript: null,
    selectedThumbnailId: null,
    tiktokConnected: false,
    tiktok: {
      privacy: null,
      allowComment: false,
      allowDuet: false,
      allowStitch: false,
      commercialDisclosure: false,
      brandOrganic: false,
      brandedContent: false,
    },
    platformMeta: [],
    thumbnails: [],
    ...overrides,
  };
}

/** A photo, or a carousel when given more than one slide. */
export function image(id: string, slideCount = 1, overrides: Partial<Image> = {}): Image {
  const children = Array.from({ length: slideCount - 1 }, (_, i) => ({
    id: `${id}_slide${i + 2}`,
    cdnUrl: `https://cdn.example.com/${id}_${i + 2}.jpg`,
  }));
  return {
    mediaType: slideCount > 1 ? 'CAROUSEL' : 'IMAGE',
    id,
    status: 'READY',
    aiStatus: 'COMPLETED',
    cdnUrl: `https://cdn.example.com/${id}.jpg`,
    originalFilename: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 200_000,
    width: 1080,
    height: 1350,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    title: `Photo ${id}`,
    caption: null,
    hashtags: [],
    targetPlatforms: ['INSTAGRAM'],
    categoryId: null,
    category: null,
    folderId: null,
    uploadSessionId: null,
    isDuplicate: false,
    postedAt: null,
    postedPosts: [],
    inQueue: false,
    slideCount,
    carouselChildren: children,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...overrides,
  };
}

export function folder(id: string, name: string): LibraryFolder {
  return { id, name, parentId: null, childFolderCount: 0, itemCount: 0 };
}

export function folderPage(
  folders: LibraryFolder[],
  items: LibraryMedia[],
  nextCursor?: string,
): LibraryFolderPage {
  return { folders, media: { items, nextCursor } };
}

export function searchPage(items: LibraryMedia[], nextCursor?: string): LibrarySearchPage {
  return { items, nextCursor };
}

/** The overview for a creator whose `active` platforms are live; the rest are not connected. */
export function connections(active: Platform[]): LibraryConnections {
  const all: Platform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'];
  return all.map((platform) => ({
    platform,
    configured: true,
    connection: active.includes(platform)
      ? {
          id: `conn_${platform}`,
          platform,
          status: 'ACTIVE',
          username: 'creator',
          displayName: 'Creator',
          avatarUrl: null,
          needsReconnectSince: null,
          lastRefreshedAt: null,
          accessTokenExpiresAt: null,
          createdAt: hoursAgo(1000),
        }
      : null,
  }));
}
