import { createHash } from 'node:crypto';

import { type PlatformConnection } from '@postpilot/db';
import {
  connectionAvatarKey,
  extensionForMime,
  getStorageConfig,
  isStorageConfigured,
  publicUrlForKey,
  putObject,
} from '@postpilot/storage';

/**
 * Avatar mirroring.
 *
 * Instagram and TikTok hand back *signed, expiring* profile-picture URLs —
 * `scontent-*.cdninstagram.com/v/...&_nc_ohc=...` and
 * `*.tiktokcdn.com/...&x-expires=...&x-signature=...`. Caching those URL
 * strings in `PlatformConnection.avatarUrl` yields an avatar that 403s within
 * hours or days, so every account badge in the app turns into a broken image.
 * (YouTube's `yt3.ggpht.com` URLs carry no expiry, which is why only the other
 * two rot — and why the bug is easy to miss.)
 *
 * Re-fetching the URL more often doesn't fix it: the URLs expire faster than
 * any sane refresh cadence. So we cache the *bytes* instead — copy the image
 * into R2 under a stable per-connection key and store our own permanent CDN
 * URL. Re-mirroring on each profile refresh keeps a changed profile picture
 * propagating.
 */

/** Give up on a slow avatar host rather than holding up the caller. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Refuse anything larger than a plausible profile picture. Platforms serve
 * these at ~200x200, so this is generous — it exists so a redirect to some
 * unexpectedly huge object can't balloon the worker's memory.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Formats the platforms actually serve, and that browsers render. */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * True when `url` already points at our own mirror, so callers can skip
 * re-downloading an image we're already hosting.
 */
export function isMirroredAvatarUrl(url: string | null | undefined): boolean {
  if (!url || !isStorageConfigured()) return false;
  try {
    return url.startsWith(`${getStorageConfig().publicBaseUrl}/`);
  } catch {
    return false;
  }
}

/** Fetch the avatar bytes, enforcing the type/size/timeout guards above. */
async function downloadAvatar(
  sourceUrl: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const res = await fetch(sourceUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // An expired signed URL lands here as a 403 — nothing to mirror.
  if (!res.ok) return null;

  // Strip any "; charset=..." parameter before matching.
  const contentType =
    (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_MIME.has(contentType)) return null;

  // Trust the declared length when present, but still measure the real body —
  // Content-Length is a hint, not a guarantee.
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) return null;

  const body = Buffer.from(await res.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_AVATAR_BYTES) return null;

  return { body, contentType };
}

/**
 * Copy `sourceUrl` into our own storage and return the permanent URL to store
 * on the connection.
 *
 * Best-effort by design: if storage isn't configured, the download fails, or
 * the upload errors, this returns `sourceUrl` unchanged. That's no worse than
 * the old behaviour (a URL that works for a while, then expires) and it keeps
 * avatar plumbing from ever failing a connect or a profile refresh.
 *
 * The returned URL carries a `?v=<content hash>` so a changed profile picture
 * busts any CDN/browser cache even though the object key is stable. When the
 * hash matches what's already on the connection, the upload is skipped.
 */
export async function mirrorConnectionAvatar(
  conn: Pick<PlatformConnection, 'id' | 'userId' | 'avatarUrl'>,
  sourceUrl: string,
): Promise<string> {
  // Already ours (e.g. a refresh that fell back to the stored value) — the
  // bytes are mirrored, so re-downloading them would be pure busywork.
  if (isMirroredAvatarUrl(sourceUrl)) return sourceUrl;
  if (!isStorageConfigured()) return sourceUrl;

  try {
    const downloaded = await downloadAvatar(sourceUrl);
    if (!downloaded) return sourceUrl;

    const { body, contentType } = downloaded;
    const version = createHash('sha256').update(body).digest('hex').slice(0, 16);
    const key = connectionAvatarKey(conn.userId, conn.id, extensionForMime(contentType));
    const mirroredUrl = `${publicUrlForKey(key)}?v=${version}`;

    // Unchanged picture: the object is already in place under this exact key
    // and hash, so skip the write and keep the URL stable.
    if (conn.avatarUrl === mirroredUrl) return mirroredUrl;

    await putObject({ key, body, contentType });
    return mirroredUrl;
  } catch {
    // Network error, storage outage, bad credentials — fall back to the
    // platform URL rather than dropping the avatar entirely.
    return sourceUrl;
  }
}
