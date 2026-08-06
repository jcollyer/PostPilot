import { describe, it, expect, afterEach, vi } from 'vitest';

import { requestJson } from './http';
import { OAuthError } from './types';

/**
 * The case these cover cost a live TikTok connection two days of silent
 * downtime: TikTok's v2 OAuth endpoints answer a dead grant with HTTP 200 and an
 * error envelope, so a bare `res.ok` check read the failure as a successful
 * token response with `access_token` merely absent. That got written back to the
 * connection as ACTIVE with a null token and a null expiry — healthy-looking,
 * unable to publish, and (because the refresh sweep skipped null expiries)
 * unreachable by every later repair pass.
 */
function mockResponse(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(text, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson — error envelopes on a 2xx', () => {
  it('throws on an OAuth2-style error returned with HTTP 200', async () => {
    mockResponse(200, { error: 'invalid_grant', error_description: 'Refresh token is invalid' });

    await expect(
      requestJson('https://example.test/token', { context: 'TikTok token' }),
    ).rejects.toThrow(OAuthError);
  });

  it('classifies a bad grant as unrecoverable so it raises a reconnect alert', async () => {
    mockResponse(200, { error: 'invalid_grant', error_description: 'Refresh token is invalid' });

    const err = (await requestJson('https://example.test/token', {
      context: 'TikTok token',
    }).catch((e) => e)) as OAuthError;
    expect(err.recoverable).toBe(false);
    // The platform's own wording survives into the message the user is shown.
    expect(err.message).toContain('invalid_grant');
    expect(err.message).toContain('Refresh token is invalid');
  });

  it('classifies a rate limit as recoverable so it is retried, not reconnected', async () => {
    mockResponse(200, { error: { code: 'rate_limit_exceeded', message: 'slow down' } });

    const err = (await requestJson('https://example.test/api', {
      context: 'TikTok user.info',
    }).catch((e) => e)) as OAuthError;
    expect(err).toBeInstanceOf(OAuthError);
    expect(err.recoverable).toBe(true);
  });

  it("throws on TikTok's object-shaped error envelope", async () => {
    mockResponse(200, { error: { code: 'access_token_invalid', message: 'token expired' } });

    await expect(
      requestJson('https://example.test/api', { context: 'TikTok user.info' }),
    ).rejects.toThrow(/access_token_invalid/);
  });

  it('treats code "ok" as success — every TikTok API response carries it', async () => {
    mockResponse(200, {
      data: { user: { open_id: 'abc' } },
      error: { code: 'ok', message: '', log_id: '1' },
    });

    const res = await requestJson<{ data: { user: { open_id: string } } }>(
      'https://example.test/api',
      { context: 'TikTok user.info' },
    );
    expect(res.data.user.open_id).toBe('abc');
  });

  it('passes through a clean payload with no error key', async () => {
    mockResponse(200, { access_token: 'tok', expires_in: 86400 });

    const res = await requestJson<{ access_token: string }>('https://example.test/token', {
      context: 'TikTok token',
    });
    expect(res.access_token).toBe('tok');
  });

  it('still classifies real error statuses by status code', async () => {
    mockResponse(503, 'upstream unavailable');

    const err = (await requestJson('https://example.test/token', {
      context: 'TikTok token',
    }).catch((e) => e)) as OAuthError;
    expect(err.recoverable).toBe(true);
    expect(err.status).toBe(503);
  });
});
