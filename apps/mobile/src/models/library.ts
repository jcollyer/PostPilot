import type { RouterOutputs } from '../lib/trpc';
import { platformName } from './queue';

/**
 * Library screen model: one level of the creator's media library, derived from
 * `folder.list` pages (browsing) or `media.list` pages (searching) plus
 * `connections.overview` and `now`. The screen only maps this to components.
 *
 * Browsing shows the level's folders, sorted by name, then its media; a search
 * is a flat list of media across every folder. Media is videos, photos and
 * carousels in one list, newest first.
 *
 * Row status, first match wins: Upload failed > Processing… > Needs TikTok
 * details > In queue > Posted Xd ago > Ready.
 */

export type LibraryFolderPage = RouterOutputs['folder']['list'];
export type LibrarySearchPage = RouterOutputs['media']['list'];
export type LibraryConnections = RouterOutputs['connections']['overview'];
export type LibraryFolder = LibraryFolderPage['folders'][number];
export type LibraryMedia = LibrarySearchPage['items'][number];
export type Platform = LibraryConnections[number]['platform'];

export type LibrarySource =
  | { kind: 'folder'; pages: LibraryFolderPage[] }
  | { kind: 'search'; query: string; pages: LibrarySearchPage[] };

export interface LibraryFolderRow {
  kind: 'folder';
  id: string;
  name: string;
}

/** `neutral` is a settled item; `muted` is one still in flight. */
export type LibraryStatusTone = 'critical' | 'warn' | 'muted' | 'neutral';

export interface LibraryMediaRow {
  kind: 'media';
  id: string;
  /** Picks the detail's procedure: `media.get` for a video, else `media.getImage`. */
  mediaType: LibraryMedia['mediaType'];
  title: string;
  thumbnailUrl: string | null;
  status: { label: string; tone: LibraryStatusTone };
  /** Platform glyphs to show; a default (empty) target means every connected platform. */
  platforms: Platform[];
  /** "0:45" for a video, "3 slides" for a carousel, nothing for a photo. */
  length: { kind: 'duration' | 'slides'; label: string } | null;
  /** The whole row as VoiceOver reads it. */
  accessibilityLabel: string;
}

export interface LibraryModel {
  folders: LibraryFolderRow[];
  media: LibraryMediaRow[];
  /** The sentence to show when the level or search has nothing in it. */
  empty: string | null;
}

export const EMPTY_LIBRARY = 'Upload from PostPilot on the web';

export function buildLibraryModel(
  source: LibrarySource,
  connections: LibraryConnections,
  now: Date,
): LibraryModel {
  const connected = connectedPlatforms(connections);
  // Folders come whole on the first page only; later pages carry media alone.
  const folders =
    source.kind === 'folder'
      ? [...(source.pages[0]?.folders ?? [])]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((f) => ({ kind: 'folder' as const, id: f.id, name: f.name }))
      : [];
  const items: LibraryMedia[] =
    source.kind === 'folder'
      ? source.pages.flatMap((p) => p.media.items)
      : source.pages.flatMap((p) => p.items);
  const media = [...items].sort(newestFirst).map((m) => mediaRow(m, connected, now));

  const empty =
    folders.length > 0 || media.length > 0
      ? null
      : source.kind === 'search'
        ? `Nothing matches “${source.query}”.`
        : EMPTY_LIBRARY;

  return { folders, media, empty };
}

/** One inset-grouped list to draw, in order. */
export type LibrarySection =
  | { key: 'folders'; data: LibraryFolderRow[]; gapAbove: false }
  | { key: 'media'; data: LibraryMediaRow[]; gapAbove: boolean };

/**
 * Folders, then media, as two groups; each shows only when it has rows, and
 * media keeps a section gap from the folders above it.
 */
export function librarySections(model: LibraryModel): LibrarySection[] {
  const sections: LibrarySection[] = [];
  if (model.folders.length > 0) {
    sections.push({ key: 'folders', data: model.folders, gapAbove: false });
  }
  if (model.media.length > 0) {
    sections.push({ key: 'media', data: model.media, gapAbove: model.folders.length > 0 });
  }
  return sections;
}

/** The query a search bar's text stands for; null means browse instead. */
export function searchQuery(text: string): string | null {
  const q = text.trim();
  return q.length > 0 ? q : null;
}

// --- Rows ------------------------------------------------------------------

function mediaRow(item: LibraryMedia, connected: Platform[], now: Date): LibraryMediaRow {
  const title = mediaTitle(item);
  const status = mediaStatus(item, now);
  const platforms = postsTo(item, connected);
  const length = mediaLength(item);
  return {
    kind: 'media',
    id: item.id,
    mediaType: item.mediaType,
    title,
    thumbnailUrl: item.thumbnailUrl,
    status,
    platforms,
    length,
    accessibilityLabel: [
      title,
      status.label,
      length?.label,
      platforms.length > 0 && `Posts to ${platforms.map(platformName).join(', ')}`,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

/** The title, falling back to the filename. */
export function mediaTitle(item: LibraryMedia): string {
  return item.title?.trim() || item.originalFilename || 'Untitled';
}

/** The status ladder above, for one item. */
export function mediaStatus(item: LibraryMedia, now: Date): LibraryMediaRow['status'] {
  if (item.status === 'FAILED') return { label: 'Upload failed', tone: 'critical' };
  if (item.status === 'UPLOADING' || item.status === 'PROCESSING') {
    return { label: 'Processing…', tone: 'muted' };
  }
  if (item.mediaType === 'VIDEO' && item.tiktokNeedsInput) {
    return { label: 'Needs TikTok details', tone: 'warn' };
  }
  if (item.inQueue) return { label: 'In queue', tone: 'neutral' };
  if (item.postedAt) {
    return { label: `Posted ${ago(new Date(item.postedAt), now)}`, tone: 'neutral' };
  }
  return { label: 'Ready', tone: 'neutral' };
}

function mediaLength(item: LibraryMedia): LibraryMediaRow['length'] {
  if (item.mediaType === 'VIDEO') {
    return item.durationSec != null
      ? { kind: 'duration', label: duration(item.durationSec) }
      : null;
  }
  if (item.mediaType === 'CAROUSEL') return { kind: 'slides', label: `${item.slideCount} slides` };
  return null;
}

/** Where an item posts: its target, or every connected platform for a default (empty) one. */
export function postsTo(item: LibraryMedia, connected: Platform[]): Platform[] {
  return item.targetPlatforms.length > 0 ? item.targetPlatforms : connected;
}

/** Platforms with a live connection: what a default target posts to. */
export function connectedPlatforms(connections: LibraryConnections): Platform[] {
  return connections.filter((c) => c.connection?.status === 'ACTIVE').map((c) => c.platform);
}

/** Newest first, ties broken by id, matching the API's own merge order. */
function newestFirst(a: LibraryMedia, b: LibraryMedia): number {
  const t = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return t !== 0 ? t : b.id.localeCompare(a.id);
}

// --- Formatting ------------------------------------------------------------

/** "0:45", "12:03", "1:02:03". */
function duration(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", as the web app's notifications read. */
function ago(then: Date, now: Date): string {
  const m = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
