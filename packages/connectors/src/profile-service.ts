import { Prisma, prisma, type PlatformConnection } from '@postpilot/db';

import { getAdapter } from './adapters';
import { decryptSecret } from './crypto';

/**
 * Cached creator-profile snapshots (bio + recent post captions), used as AI
 * style context (see @postpilot/ai-pipeline's style-examples step). Fetched
 * out-of-band here — connect time + a periodic refresh job — rather than
 * live during video processing, so a slow/rate-limited platform API never
 * adds latency to the AI pipeline and a stale/failed fetch never blocks it.
 */

/** How long a cached snapshot is considered fresh before it's re-fetched. */
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Fetch + persist one connection's profile snapshot. Best-effort: a platform
 * without `fetchProfileSnapshot` implemented, a missing/insufficient scope,
 * a revoked token, or a rate limit all just leave the cache as-is (or empty)
 * rather than affecting the connection's ACTIVE/NEEDS_RECONNECT health —
 * this is enrichment for AI quality, not the connection's core job.
 */
export async function refreshProfileSnapshot(conn: PlatformConnection): Promise<boolean> {
  const adapter = getAdapter(conn.platform);
  if (!adapter.fetchProfileSnapshot || !conn.accessToken) return false;

  try {
    const accessToken = decryptSecret(conn.accessToken);
    const snapshot = await adapter.fetchProfileSnapshot({
      accessToken,
      externalAccountId: conn.externalAccountId,
    });
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        profileBio: snapshot.bio,
        profileRecentPosts: snapshot.recentPosts as unknown as Prisma.InputJsonValue,
        profileFetchedAt: new Date(),
      },
    });
    return true;
  } catch {
    // Best-effort: API failure, revoked/insufficient scope, or (before the
    // migration has run) the DB update itself — none of these should abort
    // the caller's batch (see refreshDueProfiles).
    return false;
  }
}

export interface ProfileRefreshResult {
  id: string;
  platform: PlatformConnection['platform'];
  ok: boolean;
}

/**
 * Refresh cached snapshots for ACTIVE connections whose cache is missing or
 * older than the TTL. Mirrors refreshDueConnections' job shape — intended to
 * run on the same kind of schedule (daily/weekly cron), separate from the
 * hourly token-refresh job since profile "vibe" data changes far more slowly
 * than access tokens.
 */
export async function refreshDueProfiles(): Promise<ProfileRefreshResult[]> {
  const cutoff = new Date(Date.now() - PROFILE_TTL_MS);
  const due = await prisma.platformConnection.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ profileFetchedAt: null }, { profileFetchedAt: { lt: cutoff } }],
    },
  });

  const results: ProfileRefreshResult[] = [];
  for (const conn of due) {
    const ok = await refreshProfileSnapshot(conn);
    results.push({ id: conn.id, platform: conn.platform, ok });
  }
  return results;
}
