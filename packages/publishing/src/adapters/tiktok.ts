import { Platform } from '@postpilot/db';

import { TIKTOK_API_BASE, TIKTOK_DEFAULT_PRIVACY, type TikTokPrivacy } from '../config';
import { fetchJson, PublishError } from '../http';
import {
  captionWithHashtags,
  type PublishAdapter,
  type PollInput,
  type PublishInput,
} from '../types';

/**
 * TikTok Content Posting API — Direct Post via PULL_FROM_URL (TikTok fetches the
 * file from our R2 CDN URL; the URL prefix must be verified in the TikTok dev
 * portal). Flow: creator_info → video/init → poll status/fetch.
 *
 * Unaudited apps may only post SELF_ONLY; we pick a privacy level that's
 * actually allowed for this creator, preferring the configured default.
 */

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

interface TikTokEnvelope<T> {
  data: T;
  error?: { code?: string; message?: string };
}

/**
 * Map a TikTok error code onto a classified PublishError. Shared by the 200
 * error-envelope path (`assertOk`) and the non-2xx path (`classifyTikTokError`)
 * so a given code is always treated the same regardless of HTTP status — TikTok
 * returns the same `{error:{code}}` envelope on 200 and on 4xx.
 */
function tiktokErrorFor(code: string, message: string): PublishError {
  // A genuinely bad/expired token — reconnecting re-issues a valid one. This is
  // the ONLY code that should mark the connection NEEDS_RECONNECT.
  if (code === 'access_token_invalid') {
    return new PublishError(message, { needsReconnect: true, platform: Platform.TIKTOK });
  }
  // Valid token, but the app/account can't publish. Reconnecting won't help
  // while the app is sandbox/unaudited, so DON'T flip the connection (that
  // caused a connect→publish→disconnect loop). Fail terminally with an
  // actionable message and leave the connection intact.
  if (code === 'scope_not_authorized') {
    return new PublishError(
      `${message} — this TikTok connection doesn't have the video-publishing permission. ` +
        `Reconnect and approve "Post to TikTok"; if the TikTok app is still in sandbox/unaudited, ` +
        `publishing stays blocked until it passes TikTok's audit.`,
      { rejected: true, platform: Platform.TIKTOK },
    );
  }
  if (code === 'unaudited_client_can_only_post_to_private_accounts') {
    return new PublishError(
      `${message} — an unaudited TikTok app can only post to a TikTok account set to private. ` +
        `Set this TikTok account to Private (Settings → Privacy → Private account) to test, ` +
        `or get the app audited to post to public accounts.`,
      { rejected: true, platform: Platform.TIKTOK },
    );
  }
  if (code === 'rate_limit_exceeded' || code === 'internal_error') {
    return new PublishError(message, { recoverable: true, platform: Platform.TIKTOK });
  }
  return new PublishError(message, { rejected: true, platform: Platform.TIKTOK });
}

/** TikTok returns 200 with an error envelope; classify it. */
function assertOk(env: { error?: { code?: string; message?: string } }, context: string) {
  const code = env.error?.code;
  if (!code || code === 'ok') return;
  throw tiktokErrorFor(code, `${context}: ${code} ${env.error?.message ?? ''}`);
}

/**
 * Classify a non-2xx TikTok response by its error envelope. Returned to
 * `fetchJson` so, e.g., a 403 `unaudited_client_can_only_post_to_private_accounts`
 * is treated as a terminal rejection rather than a dead-auth "reconnect".
 * Falls back (null) to the default status-based classification when the body
 * has no recognizable TikTok error code.
 */
function classifyTikTokError(context: string, status: number, body: string): PublishError | null {
  try {
    const code = (JSON.parse(body) as { error?: { code?: string; message?: string } }).error?.code;
    if (!code || code === 'ok') return null;
    return tiktokErrorFor(code, `${context}: HTTP ${status} ${code}`);
  } catch {
    return null;
  }
}

function pickPrivacy(options: string[] | undefined): TikTokPrivacy {
  const opts = options ?? [];
  if (opts.includes(TIKTOK_DEFAULT_PRIVACY)) return TIKTOK_DEFAULT_PRIVACY;
  if (opts.includes('SELF_ONLY')) return 'SELF_ONLY';
  return (opts[0] as TikTokPrivacy) ?? 'SELF_ONLY';
}

/** Shape of the fields we surface from TikTok's `creator_info` endpoint. */
export interface TikTokCreatorInfo {
  creatorNickname: string | null;
  creatorUsername: string | null;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
  /** Derived: TikTok will accept a new post right now (has at least one privacy option). */
  canPost: boolean;
}

/**
 * Query the latest creator info for a connected TikTok account. API Clients
 * must call this when rendering the "Post to TikTok" page so the privacy
 * options, disabled interactions, and posting eligibility are always current.
 */
export async function fetchTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetchJson<
    TikTokEnvelope<{
      creator_nickname?: string;
      creator_username?: string;
      creator_avatar_url?: string;
      privacy_level_options?: string[];
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
    }>
  >(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    context: 'tiktok creator_info',
    platform: Platform.TIKTOK,
    classifyError: (status, body) => classifyTikTokError('tiktok creator_info', status, body),
  });
  assertOk(res, 'tiktok creator_info');
  const d = res.data;
  const privacyLevelOptions = d.privacy_level_options ?? [];
  return {
    creatorNickname: d.creator_nickname ?? null,
    creatorUsername: d.creator_username ?? null,
    creatorAvatarUrl: d.creator_avatar_url ?? null,
    privacyLevelOptions,
    commentDisabled: d.comment_disabled ?? false,
    duetDisabled: d.duet_disabled ?? false,
    stitchDisabled: d.stitch_disabled ?? false,
    maxVideoPostDurationSec: d.max_video_post_duration_sec ?? null,
    canPost: privacyLevelOptions.length > 0,
  };
}

export const tiktokPublishAdapter: PublishAdapter = {
  platform: Platform.TIKTOK,

  async publish(input: PublishInput) {
    // 1. Query the latest creator info for the allowed privacy levels +
    //    interaction settings (the creator may have changed these in-app).
    const creator = await fetchTikTokCreatorInfo(input.accessToken);
    const opts = input.tiktok;

    // 1B: if creator_info says this account can't accept a new post right now
    // (e.g. the daily posting cap is reached — TikTok returns no privacy
    // options), stop the current attempt instead of forcing the post through.
    // Recoverable → the runner backs off and retries later, and surfaces a
    // "try again later" failure notification if it never clears.
    if (!creator.canPost) {
      throw new PublishError(
        'tiktok creator_info: account cannot accept a new post right now (try again later)',
        { recoverable: true, platform: Platform.TIKTOK },
      );
    }

    // 1C: the video must not exceed the creator's max allowed post duration.
    // This is terminal (a too-long file won't pass on retry), so reject it with
    // a clear message rather than burning retries.
    const maxDuration = creator.maxVideoPostDurationSec;
    if (maxDuration != null && input.durationSec != null && input.durationSec > maxDuration) {
      throw new PublishError(
        `tiktok: video is ${Math.round(input.durationSec)}s but this account allows at most ${maxDuration}s`,
        { rejected: true, platform: Platform.TIKTOK },
      );
    }

    // Honor the creator's chosen privacy if it's still an allowed option;
    // otherwise fall back to the safest configured default.
    const chosen = opts?.privacy;
    const privacy =
      chosen && creator.privacyLevelOptions.includes(chosen)
        ? (chosen as TikTokPrivacy)
        : pickPrivacy(creator.privacyLevelOptions);

    // Interactions default OFF; only enable when the user opted in AND TikTok
    // hasn't disabled that interaction for this creator.
    const disableComment = !(opts?.allowComment && !creator.commentDisabled);
    const disableDuet = !(opts?.allowDuet && !creator.duetDisabled);
    const disableStitch = !(opts?.allowStitch && !creator.stitchDisabled);

    // Commercial content disclosure → TikTok's brand toggles.
    const commercial = opts?.commercialDisclosure ?? false;
    const brandOrganicToggle = commercial && (opts?.brandOrganic ?? false);
    const brandedContentToggle = commercial && (opts?.brandedContent ?? false);

    // 2. Initialize the direct post, pulling the file from our CDN URL.
    const init = await fetchJson<TikTokEnvelope<{ publish_id?: string }>>(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: authHeaders(input.accessToken),
        context: 'tiktok video/init',
        platform: Platform.TIKTOK,
        classifyError: (status, body) => classifyTikTokError('tiktok video/init', status, body),
        body: JSON.stringify({
          post_info: {
            title: captionWithHashtags(input.caption || input.title, input.hashtags).slice(0, 2200),
            privacy_level: privacy,
            disable_comment: disableComment,
            disable_duet: disableDuet,
            disable_stitch: disableStitch,
            brand_organic_toggle: brandOrganicToggle,
            brand_content_toggle: brandedContentToggle,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl },
        }),
      },
    );
    assertOk(init, 'tiktok video/init');
    const publishId = init.data.publish_id;
    if (!publishId) {
      throw new PublishError('tiktok video/init: no publish_id returned', {
        rejected: true,
        platform: Platform.TIKTOK,
      });
    }
    return { state: 'PROCESSING' as const, externalContainerId: publishId };
  },

  async poll({ accessToken, containerId }: PollInput) {
    const res = await fetchJson<
      TikTokEnvelope<{
        status?: string;
        fail_reason?: string;
        publicaly_available_post_id?: string[];
      }>
    >(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      context: 'tiktok status/fetch',
      platform: Platform.TIKTOK,
      classifyError: (s, body) => classifyTikTokError('tiktok status/fetch', s, body),
      body: JSON.stringify({ publish_id: containerId }),
    });
    assertOk(res, 'tiktok status/fetch');

    const status = res.data.status;
    if (status === 'PUBLISH_COMPLETE') {
      const postId = res.data.publicaly_available_post_id?.[0] ?? null;
      return { state: 'PUBLISHED' as const, platformPostId: postId };
    }
    if (status === 'FAILED') {
      return { state: 'FAILED' as const, error: res.data.fail_reason ?? 'TikTok reported FAILED' };
    }
    return { state: 'PROCESSING' as const };
  },
};
