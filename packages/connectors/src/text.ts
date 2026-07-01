/**
 * Small text helpers for parsing platform post content. None of TikTok,
 * Instagram, or YouTube expose hashtags as a separate field on their read
 * APIs — they're embedded in the caption/title/description text — so profile
 * snapshot fetching splits them out here for a consistent shape everywhere
 * else in the app expects (see ai-pipeline's StyleExample).
 */

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** Lowercase hashtags (no leading '#'), deduped, capped at 30. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(HASHTAG_RE) ?? [];
  return Array.from(new Set(matches.map((h) => h.slice(1).toLowerCase()))).slice(0, 30);
}

/** Caption/title text with hashtags removed and whitespace collapsed. */
export function stripHashtags(text: string): string {
  return text.replace(HASHTAG_RE, '').replace(/\s+/g, ' ').trim();
}
