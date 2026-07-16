/**
 * Guardrails that keep the AI pipeline from even attempting media that would
 * reliably kill the worker. Frame extraction holds decoded frames in memory for
 * the vision step, so an oversized or very long video can OOM the run before it
 * ever produces metadata. Rather than crash, download-and-crash, or loop, we
 * detect these up front and fail them with a clear, operator-visible reason.
 *
 * All limits are env-overridable so they can be tuned per deployment (e.g.
 * raised after bumping the Trigger.dev machine preset) without a code change.
 */

import {
  AI_METADATA_MAX_VIDEO_BYTES,
  AI_METADATA_MAX_VIDEO_DURATION_SEC,
} from '@postpilot/types';

/**
 * Max source file size (bytes) we'll pull down and process for a video.
 * Defaults to the shared @postpilot/types constant (which the client uses to
 * warn at upload time) so the two never drift; override per-deployment via env.
 */
export const MAX_VIDEO_BYTES = Number(process.env.AI_MAX_VIDEO_BYTES ?? AI_METADATA_MAX_VIDEO_BYTES);
/** Max video duration (seconds) — frame count scales with length. */
export const MAX_VIDEO_DURATION_SEC = Number(
  process.env.AI_MAX_VIDEO_DURATION_SEC ?? AI_METADATA_MAX_VIDEO_DURATION_SEC,
);
/** Max source file size (bytes) for an image. */
export const MAX_IMAGE_BYTES = Number(process.env.AI_MAX_IMAGE_BYTES ?? 100 * 1024 ** 2);
/** Max decoded resolution (pixels = width × height) for an image. */
export const MAX_IMAGE_PIXELS = Number(process.env.AI_MAX_IMAGE_PIXELS ?? 60 * 1_000_000);

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)}MB`;
  return `${n}B`;
}

/**
 * Returns a human-readable reason the video is too big to process, or null if
 * it's within limits. `fileSize`/`durationSec` may be null (not yet known) —
 * a null field is simply not checked, so callers can run this both before
 * download (stored values) and again after probing (measured values).
 */
export function checkVideoLimits(input: {
  fileSize?: bigint | number | null;
  durationSec?: number | null;
}): string | null {
  const bytes = input.fileSize == null ? null : Number(input.fileSize);
  if (bytes != null && bytes > MAX_VIDEO_BYTES) {
    return `source is ${fmtBytes(bytes)}, over the ${fmtBytes(MAX_VIDEO_BYTES)} AI-processing limit`;
  }
  if (input.durationSec != null && input.durationSec > MAX_VIDEO_DURATION_SEC) {
    return `duration is ${Math.round(input.durationSec)}s, over the ${MAX_VIDEO_DURATION_SEC}s AI-processing limit`;
  }
  return null;
}

/** Image equivalent of checkVideoLimits: size + decoded pixel count. */
export function checkImageLimits(input: {
  fileSize?: bigint | number | null;
  width?: number | null;
  height?: number | null;
}): string | null {
  const bytes = input.fileSize == null ? null : Number(input.fileSize);
  if (bytes != null && bytes > MAX_IMAGE_BYTES) {
    return `source is ${fmtBytes(bytes)}, over the ${fmtBytes(MAX_IMAGE_BYTES)} AI-processing limit`;
  }
  if (input.width != null && input.height != null) {
    const pixels = input.width * input.height;
    if (pixels > MAX_IMAGE_PIXELS) {
      return `resolution is ${input.width}×${input.height} (${(pixels / 1_000_000).toFixed(0)}MP), over the ${(MAX_IMAGE_PIXELS / 1_000_000).toFixed(0)}MP AI-processing limit`;
    }
  }
  return null;
}
