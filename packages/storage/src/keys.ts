/**
 * Object-key layout. Everything is namespaced under the owning user so access
 * is easy to reason about, and each video gets its own prefix that holds the
 * source file, cover, and AI-generated thumbnails together.
 *
 *   users/<userId>/videos/<videoId>/source<ext>
 *   users/<userId>/videos/<videoId>/cover<ext>
 *   users/<userId>/videos/<videoId>/thumbs/<thumbId>.jpg
 */

/** Lowercase file extension including the dot (e.g. ".mp4"), or "" if none. */
export function extensionFor(filename: string | null | undefined): string {
  if (!filename) return '';
  const match = /\.[a-z0-9]+$/i.exec(filename.trim());
  return match ? match[0].toLowerCase() : '';
}

/** Extension guessed from a mime type, used when the filename has none. */
export function extensionForMime(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

export function videoPrefix(userId: string, videoId: string): string {
  return `users/${userId}/videos/${videoId}`;
}

export function sourceKey(userId: string, videoId: string, ext: string): string {
  return `${videoPrefix(userId, videoId)}/source${ext}`;
}

export function coverKey(userId: string, videoId: string, ext: string): string {
  return `${videoPrefix(userId, videoId)}/cover${ext}`;
}

export function thumbnailKey(userId: string, videoId: string, thumbId: string): string {
  return `${videoPrefix(userId, videoId)}/thumbs/${thumbId}.jpg`;
}

/**
 * Photo object keys, laid out like videos but under an `images/` namespace:
 *
 *   users/<userId>/images/<imageId>/source<ext>
 */
export function imagePrefix(userId: string, imageId: string): string {
  return `users/${userId}/images/${imageId}`;
}

export function imageSourceKey(userId: string, imageId: string, ext: string): string {
  return `${imagePrefix(userId, imageId)}/source${ext}`;
}
