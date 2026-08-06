import { Platform, prisma, type PlatformConnection } from '@postpilot/db';
import { PLATFORM_LABELS } from '@postpilot/types';

import { getAdapter, SUPPORTED_PLATFORMS } from './adapters';
import { decryptNullable } from './crypto';
import { createNotification, dispatchSoon, insertNotification } from './notify';
import { needsRefresh, tokenColumns } from './tokens';
import { OAuthError } from './types';

/**
 * Refresh one connection's tokens.
 *
 * - On success: re-encrypts and stores the new tokens, preserving the existing
 *   refresh token when the platform doesn't rotate it (YouTube) and persisting
 *   the rotated one when it does (TikTok).
 * - On an UNRECOVERABLE failure (revoked, password change, invalid_grant): marks
 *   the connection NEEDS_RECONNECT and queues a deduplicated reconnect alert,
 *   then rethrows.
 * - On a transient failure: rethrows so the caller/cron retries later.
 */
export async function refreshConnection(conn: PlatformConnection): Promise<PlatformConnection> {
  const adapter = getAdapter(conn.platform);
  try {
    const tokens = await adapter.refreshTokens({
      accessToken: decryptNullable(conn.accessToken),
      refreshToken: decryptNullable(conn.refreshToken),
    });
    // Never persist a "success" that carries no token. A platform that answers a
    // failed refresh with 2xx (TikTok does) would otherwise be written straight
    // into the row as ACTIVE with a null access token and a null expiry — a
    // connection that looks healthy, can't publish, and is invisible to the
    // refresh cron forever. `requestJson` should have already thrown; this is the
    // backstop that keeps a bad refresh from ever reaching the database.
    if (!tokens.accessToken) {
      throw new OAuthError(`${conn.platform} refresh returned no access token.`, {
        recoverable: false,
        platform: conn.platform,
      });
    }
    // Keep the current refresh token if the platform returned none.
    const refreshToken = tokens.refreshToken ?? decryptNullable(conn.refreshToken);
    return await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        ...tokenColumns({ ...tokens, refreshToken }),
        status: 'ACTIVE',
        needsReconnectSince: null,
        lastError: null,
        lastRefreshedAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof OAuthError && !err.recoverable) {
      await markNeedsReconnect(conn, err.message);
    }
    throw err;
  }
}

/**
 * Per-platform graceful degradation: pause just this connection and queue a
 * single "Reconnect [Platform]" alert. Impacted publishing is held by the
 * publishing engine (which checks connection status); we never silently drop
 * anything here.
 */
export async function markNeedsReconnect(conn: PlatformConnection, reason: string): Promise<void> {
  const label = PLATFORM_LABELS[conn.platform as Platform];

  const created = await prisma.$transaction(async (tx) => {
    await tx.platformConnection.update({
      where: { id: conn.id },
      data: {
        status: 'NEEDS_RECONNECT',
        needsReconnectSince: conn.needsReconnectSince ?? new Date(),
        lastError: reason.slice(0, 500),
      },
    });

    // Deduplicate: one pending reconnect notification per connection.
    return insertNotification(tx, {
      userId: conn.userId,
      type: 'RECONNECT_REQUIRED',
      platform: conn.platform,
      title: `Reconnect ${label}`,
      body: `Your ${label} connection needs to be reconnected before posting can resume. Your other platforms are unaffected.`,
      dedupeKey: `reconnect:${conn.platform}:${conn.id}`,
      relatedConnectionId: conn.id,
    });
  });

  // Outside the transaction: delivery is best-effort and must never roll back
  // the state change that made the alert true.
  if (created) await dispatchSoon();
}

/**
 * Cron entrypoint: refresh every ACTIVE connection whose access token is within
 * its platform's lead time of expiring. Each platform's tokens have very
 * different lifetimes (TikTok ~24h, YouTube ~1h, Instagram ~60d), so we filter
 * broadly in SQL and then apply each adapter's precise lead time.
 */
export async function refreshDueConnections(): Promise<
  Array<{ id: string; platform: Platform; ok: boolean; error?: string }>
> {
  const maxLeadMs = Math.max(...SUPPORTED_PLATFORMS.map((p) => getAdapter(p).refreshLeadMs));
  const candidates = await prisma.platformConnection.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { accessTokenExpiresAt: { lte: new Date(Date.now() + maxLeadMs) } },
        // Null expiry means the token state is unknown or damaged. This used to
        // read `{ not: null }`, which excluded exactly the rows most in need of
        // attention — a connection whose expiry had been nulled out was dropped
        // from every subsequent pass and could never recover. Pull them in and
        // let `needsRefresh` + the adapter decide.
        { accessTokenExpiresAt: null },
      ],
    },
  });

  const results: Array<{ id: string; platform: Platform; ok: boolean; error?: string }> = [];
  for (const conn of candidates) {
    const adapter = getAdapter(conn.platform);
    if (!needsRefresh(conn, adapter.refreshLeadMs)) continue;
    try {
      await refreshConnection(conn);
      results.push({ id: conn.id, platform: conn.platform, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordRefreshFailure(conn, message);
      results.push({ id: conn.id, platform: conn.platform, ok: false, error: message });
    }
  }
  return results;
}

/**
 * Leave a trace when a refresh fails, and escalate once the failure actually
 * costs the user something.
 *
 * Failures used to be returned to the caller and dropped — the cron logged a
 * count and moved on, so a connection could fail every hour for days with no
 * record on the row and no alert. The distinction that matters isn't
 * transient-vs-permanent, it's whether the access token is still usable: while
 * it is, a failed refresh is invisible to the user and retrying next hour is the
 * right call. Once it has expired, publishing is broken whatever the cause, and
 * staying quiet just means the user finds out from a post that didn't go out.
 *
 * Status is deliberately left ACTIVE (an unrecoverable error already went
 * through `markNeedsReconnect`), so a later successful refresh heals the
 * connection silently and the alert deduplicates away.
 */
async function recordRefreshFailure(conn: PlatformConnection, message: string): Promise<void> {
  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: { lastError: message.slice(0, 500) },
  });

  const expiry = conn.accessTokenExpiresAt;
  const tokenUsable = expiry != null && expiry.getTime() > Date.now();
  if (tokenUsable) return;

  const label = PLATFORM_LABELS[conn.platform as Platform];
  await createNotification({
    userId: conn.userId,
    type: 'RECONNECT_REQUIRED',
    platform: conn.platform,
    title: `Reconnect ${label}`,
    body: `We couldn't refresh your ${label} connection and its access has now expired, so scheduled posts to ${label} are on hold. Reconnect ${label} to resume — your other platforms are unaffected.`,
    dedupeKey: `refresh-failed:${conn.platform}:${conn.id}`,
    relatedConnectionId: conn.id,
  });
}
