import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appBaseUrl, originFromHeaders } from './config';

/**
 * Getting the return origin wrong logs the user out at the end of Checkout:
 * the session cookie belongs to the origin they were browsing, so coming back
 * to a different one looks exactly like being signed out. It happens whenever
 * the app is reachable at more than one URL — a tunnel alongside localhost
 * being the everyday case.
 */

const saved = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.BETTER_AUTH_URL };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.BETTER_AUTH_URL;
});

afterEach(() => {
  if (saved.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = saved.app;
  if (saved.auth === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = saved.auth;
});

const h = (init: Record<string, string>) => new Headers(init);

describe('originFromHeaders', () => {
  it('prefers the origin header the browser sends', () => {
    expect(
      originFromHeaders(h({ origin: 'https://tunnel.example.dev', host: 'localhost:3000' })),
    ).toBe('https://tunnel.example.dev');
  });

  it('reconstructs a tunnelled origin from forwarded headers', () => {
    // The regression: the tunnel forwards to localhost, so `host` is the
    // internal one and only the forwarded headers know the public URL.
    expect(
      originFromHeaders(
        h({
          host: 'localhost:3000',
          'x-forwarded-host': 'jointly-topical-leech.ngrok-free.app',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://jointly-topical-leech.ngrok-free.app');
  });

  it('keeps https for a proxied host with no forwarded scheme', () => {
    // Deriving http here would break the cookie coming back from Stripe.
    expect(originFromHeaders(h({ host: 'app.example.com' }))).toBe('https://app.example.com');
  });

  it('uses http for localhost, which has no TLS in development', () => {
    expect(originFromHeaders(h({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('takes the first value when a proxy chain appends others', () => {
    expect(
      originFromHeaders(
        h({ 'x-forwarded-host': 'a.example.com, b.internal', 'x-forwarded-proto': 'https, http' }),
      ),
    ).toBe('https://a.example.com');
  });

  it('ignores a non-http origin such as a native app scheme', () => {
    expect(originFromHeaders(h({ origin: 'capacitor://localhost' }))).toBeNull();
  });

  it('returns null with nothing usable', () => {
    expect(originFromHeaders(h({}))).toBeNull();
    expect(originFromHeaders(undefined)).toBeNull();
    expect(originFromHeaders(null)).toBeNull();
  });
});

describe('appBaseUrl', () => {
  it('uses the request origin when nothing is configured', () => {
    expect(appBaseUrl('https://tunnel.example.dev')).toBe('https://tunnel.example.dev');
  });

  it('lets configuration win over the request', () => {
    // Host headers are caller-controlled, so a deployment URL must not be
    // overridable by whatever a request claims.
    process.env.NEXT_PUBLIC_APP_URL = 'https://post-pilot.app';
    expect(appBaseUrl('https://attacker.example')).toBe('https://post-pilot.app');
  });

  it('accepts BETTER_AUTH_URL as the configured value', () => {
    process.env.BETTER_AUTH_URL = 'https://staging.post-pilot.app';
    expect(appBaseUrl('https://tunnel.example.dev')).toBe('https://staging.post-pilot.app');
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(appBaseUrl('https://tunnel.example.dev/')).toBe('https://tunnel.example.dev');
    process.env.NEXT_PUBLIC_APP_URL = 'https://post-pilot.app/';
    expect(appBaseUrl()).toBe('https://post-pilot.app');
  });

  it('falls back to localhost when there is nothing at all', () => {
    expect(appBaseUrl()).toBe('http://localhost:3000');
    expect(appBaseUrl(null)).toBe('http://localhost:3000');
  });
});
