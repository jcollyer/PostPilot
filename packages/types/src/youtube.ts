/**
 * YouTube-specific publishing options shared by the web/mobile clients, the API
 * validation layer, and the publish adapter.
 *
 * These map onto fields of the YouTube Data API `videos.insert` request:
 *   - categoryId            → snippet.categoryId
 *   - containsSyntheticMedia → status.containsSyntheticMedia
 *   - license               → status.license
 */

/**
 * Assignable YouTube video categories. This is the stable subset that
 * `videos.insert` accepts for uploads (categories like "Trailers" or "Shows"
 * are returned by the API but are not assignable). If you later need
 * region-accurate categories, fetch them from `videoCategories.list`.
 */
export const YOUTUBE_CATEGORIES = [
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '10', name: 'Music' },
  { id: '15', name: 'Pets & Animals' },
  { id: '17', name: 'Sports' },
  { id: '19', name: 'Travel & Events' },
  { id: '20', name: 'Gaming' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '24', name: 'Entertainment' },
  { id: '25', name: 'News & Politics' },
  { id: '26', name: 'Howto & Style' },
  { id: '27', name: 'Education' },
  { id: '28', name: 'Science & Technology' },
  { id: '29', name: 'Nonprofits & Activism' },
] as const;

/** Just the id tuple, for zod enum validation. */
export const YOUTUBE_CATEGORY_IDS = [
  '1',
  '2',
  '10',
  '15',
  '17',
  '19',
  '20',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
] as const;

export type YouTubeCategoryId = (typeof YOUTUBE_CATEGORY_IDS)[number];

/** Default when the user hasn't chosen one: People & Blogs. */
export const DEFAULT_YOUTUBE_CATEGORY_ID: YouTubeCategoryId = '22';

/** `status.license` values accepted by videos.insert. */
export const YOUTUBE_LICENSES = ['youtube', 'creativeCommon'] as const;
export type YouTubeLicense = (typeof YOUTUBE_LICENSES)[number];

export const DEFAULT_YOUTUBE_LICENSE: YouTubeLicense = 'youtube';

export const YOUTUBE_LICENSE_LABELS: Record<YouTubeLicense, string> = {
  youtube: 'Standard YouTube License',
  creativeCommon: 'Creative Commons — Attribution',
};
