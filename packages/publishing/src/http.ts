import { Platform } from '@postpilot/db';

/**
 * Failure raised by publish adapters, classified so the runner knows how to
 * react:
 *   - needsReconnect → auth is dead (401/403/invalid_grant): pause the platform
 *     and ask the user to reconnect (other platforms keep going).
 *   - rejected       → the platform refused the content (bad 4xx/validation):
 *     terminal FAILED, surfaced as "content rejected".
 *   - recoverable    → transient (network, 408/429/5xx): retry with backoff.
 */
export class PublishError extends Error {
  readonly recoverable: boolean;
  readonly needsReconnect: boolean;
  readonly rejected: boolean;
  readonly status?: number;
  readonly platform?: Platform;

  constructor(
    message: string,
    opts: {
      recoverable?: boolean;
      needsReconnect?: boolean;
      rejected?: boolean;
      status?: number;
      platform?: Platform;
    } = {},
  ) {
    super(message);
    this.name = 'PublishError';
    this.needsReconnect = opts.needsReconnect ?? false;
    this.rejected = opts.rejected ?? false;
    this.recoverable = opts.recoverable ?? (!this.needsReconnect && !this.rejected);
    this.status = opts.status;
    this.platform = opts.platform;
  }
}

/** Build a classified PublishError from an HTTP status + body. */
export function errorFromStatus(
  context: string,
  status: number,
  body: string,
  platform?: Platform,
): PublishError {
  const snippet = body.slice(0, 400);
  const msg = `${context}: HTTP ${status} ${snippet}`;
  if (status === 401 || status === 403) {
    return new PublishError(msg, { needsReconnect: true, status, platform });
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new PublishError(msg, { recoverable: true, status, platform });
  }
  // Other 4xx: the request/content was rejected and won't succeed on retry.
  return new PublishError(msg, { rejected: true, status, platform });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array | ReadableStream;
  /**
   * Required by fetch whenever `body` is a stream — without it the request is
   * rejected before a byte is sent. Streaming is how large media is uploaded
   * without holding the whole file in memory.
   */
  duplex?: 'half';
  context: string;
  platform?: Platform;
  /**
   * Optional adapter hook to classify a non-2xx response by the platform's own
   * error body (e.g. TikTok returns a `{error:{code}}` envelope even on 403).
   * Return a PublishError to override the default status-based classification,
   * or null/undefined to fall back to `errorFromStatus`. This prevents, e.g., a
   * content-guideline 403 from being mis-read as a dead-auth "reconnect".
   */
  classifyError?: (status: number, body: string) => PublishError | null;
  /**
   * JSON keys whose values are 64-bit platform ids. Declare them here and type
   * them as `string` in `T`; see `quoteBigIntKeys` for why.
   */
  bigIntKeys?: string[];
}

/**
 * Quote the numeric values of the given JSON keys in a raw response body so
 * `JSON.parse` yields strings.
 *
 * Platform post ids are int64. TikTok's are 19 digits — past
 * `Number.MAX_SAFE_INTEGER` — so parsing them as numbers silently rounds
 * (…970442766 → …970443000) and hands us an `Int` where our id columns want a
 * `String`, which then blows up the Prisma write. Quoting first keeps every
 * digit and the right type.
 *
 * Handles the scalar (`"key": 123`) and array (`"key": [123, 456]`) forms, and
 * leaves values that are already strings alone.
 */
export function quoteBigIntKeys(text: string, keys: string[]): string {
  return keys.reduce(
    (out, key) =>
      out.replace(
        new RegExp(`("${key}"\\s*:\\s*)(\\[[^\\]]*\\]|-?\\d+)`, 'g'),
        (_match, prefix: string, value: string) =>
          // Only bare numbers — one delimited by a bracket, comma, whitespace or
          // the edge of the value — so `["123"]` isn't re-quoted.
          prefix + value.replace(/(^|[[,\s])(-?\d+)(?=[\],\s]|$)/g, '$1"$2"'),
      ),
    text,
  );
}

/** fetch returning the raw Response, normalizing network errors to recoverable. */
export async function rawFetch(url: string, opts: RequestOptions): Promise<Response> {
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      // Buffer extends Uint8Array; both (and string) are valid fetch bodies.
      // Cast to the ambient fetch body type so this compiles under both the
      // Node lib (server packages) and the DOM lib (when this package is pulled
      // into the web app's typecheck), which model `BodyInit` differently.
      body: opts.body as unknown as RequestInit['body'],
      // `duplex` is part of the fetch spec but missing from the ambient
      // RequestInit type, hence the cast.
      ...(opts.duplex ? { duplex: opts.duplex } : {}),
    } as RequestInit);
  } catch (err) {
    throw new PublishError(`${opts.context}: network error ${(err as Error)?.message ?? ''}`, {
      recoverable: true,
      platform: opts.platform,
    });
  }
}

/** fetch + JSON parse, throwing a classified PublishError on non-2xx. */
export async function fetchJson<T>(url: string, opts: RequestOptions): Promise<T> {
  const res = await rawFetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    const classified = opts.classifyError?.(res.status, text);
    throw classified ?? errorFromStatus(opts.context, res.status, text, opts.platform);
  }
  try {
    if (!text) return {} as T;
    return JSON.parse(opts.bigIntKeys ? quoteBigIntKeys(text, opts.bigIntKeys) : text) as T;
  } catch {
    throw new PublishError(`${opts.context}: invalid JSON response`, {
      recoverable: false,
      platform: opts.platform,
    });
  }
}
