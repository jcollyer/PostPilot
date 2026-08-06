import type { PlatformConnection } from '@postpilot/db';

import { encryptNullable } from './crypto';
import type { OAuthTokens } from './types';

/**
 * Map adapter `OAuthTokens` (plaintext) to the encrypted PlatformConnection
 * columns. Shared by both the connect and refresh paths so encryption happens
 * in exactly one place.
 */
export function tokenColumns(tokens: OAuthTokens) {
  return {
    accessToken: encryptNullable(tokens.accessToken),
    refreshToken: encryptNullable(tokens.refreshToken ?? null),
    tokenType: tokens.tokenType ?? null,
    scope: tokens.scope ?? null,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
  };
}

/**
 * Whether the access token is within `leadMs` of expiring (or already has).
 *
 * A connection with **no recorded expiry** counts as due, not as fresh. It can
 * only get into that state by something having gone wrong (a refresh that stored
 * a token-less response, a platform that returned no `expires_in`), and treating
 * it as "not due" is self-sealing: an expiry of null can never become due by the
 * passage of time, so the connection would be skipped by every future refresh
 * pass and stay quietly broken until someone tried to publish. Refreshing it
 * either repairs it or raises a reconnect alert — both better than silence.
 */
export function needsRefresh(conn: PlatformConnection, leadMs: number): boolean {
  if (!conn.accessTokenExpiresAt) return true;
  return conn.accessTokenExpiresAt.getTime() - Date.now() <= leadMs;
}
