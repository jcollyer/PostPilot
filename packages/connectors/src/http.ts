import type { Platform } from '@postpilot/db';

import { OAuthError } from './types';

interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  /** Used in error messages. */
  context: string;
  platform?: Platform;
}

/** Envelope error codes that are worth retrying rather than reconnecting for. */
const TRANSIENT_CODES = new Set([
  'rate_limit_exceeded',
  'internal_error',
  'server_error',
  'temporarily_unavailable',
]);

/**
 * Pull an error out of a 2xx body.
 *
 * TikTok's v2 OAuth endpoints answer a dead grant with **HTTP 200** and an error
 * envelope rather than a 4xx, so a bare `res.ok` check reads the failure as a
 * successful token response — `access_token` simply absent. That is how a failed
 * refresh used to be persisted as a healthy connection with a null token.
 *
 * Two envelope shapes exist across the platforms we talk to:
 *   - OAuth2 style: `{ error: "invalid_grant", error_description: "..." }`
 *   - TikTok API style: `{ error: { code, message } }`, where code `"ok"` is
 *     *success* — every TikTok API response carries this envelope.
 */
function envelopeError(json: unknown): { code: string; message: string } | null {
  if (!json || typeof json !== 'object') return null;
  const err = (json as { error?: unknown }).error;

  if (typeof err === 'string') {
    if (!err || err === 'ok') return null;
    const desc = (json as { error_description?: unknown }).error_description;
    return { code: err, message: typeof desc === 'string' ? desc : '' };
  }

  if (err && typeof err === 'object') {
    const rawCode = (err as { code?: unknown }).code;
    const code =
      typeof rawCode === 'string' ? rawCode : typeof rawCode === 'number' ? String(rawCode) : null;
    if (!code || code === 'ok') return null;
    const message = (err as { message?: unknown }).message;
    return { code, message: typeof message === 'string' ? message : '' };
  }

  return null;
}

/**
 * Thin fetch wrapper that normalizes failures into `OAuthError` with a
 * recoverable/unrecoverable classification:
 *   - network failure        -> recoverable (retry later)
 *   - 408 / 429 / 5xx        -> recoverable (transient/rate-limited)
 *   - other 4xx (400/401/403)-> unrecoverable (bad grant/revoked creds)
 *   - 2xx carrying an error envelope -> classified by its code (see above)
 */
export async function requestJson<T>(url: string, opts: RequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
    });
  } catch {
    throw new OAuthError(`${opts.context}: network error`, {
      recoverable: true,
      platform: opts.platform,
    });
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const transient = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new OAuthError(`${opts.context}: HTTP ${res.status} ${text.slice(0, 300)}`, {
      recoverable: transient,
      status: res.status,
      platform: opts.platform,
    });
  }

  // A 2xx can still be a failure (see `envelopeError`). Classify it the same way
  // as a real error status so callers never mistake it for a usable payload.
  const enveloped = envelopeError(json);
  if (enveloped) {
    const detail = enveloped.message ? `${enveloped.code}: ${enveloped.message}` : enveloped.code;
    throw new OAuthError(`${opts.context}: ${detail}`, {
      recoverable: TRANSIENT_CODES.has(enveloped.code),
      status: res.status,
      platform: opts.platform,
    });
  }

  return json as T;
}

export function formBody(params: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, v);
  }
  return body;
}

export function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function expiresAt(seconds: number | undefined | null): Date | null {
  if (!seconds && seconds !== 0) return null;
  return new Date(Date.now() + Number(seconds) * 1000);
}
