import { Platform } from '@postpilot/db';

import { buildUrl, expiresAt, formBody, requestJson } from '../http';
import { extractHashtags, stripHashtags } from '../text';
import {
  OAuthError,
  type AuthorizationRequest,
  type AuthorizeOptions,
  type ExchangeParams,
  type OAuthTokens,
  type PlatformAdapter,
  type PlatformIdentity,
  type ProfileSnapshot,
  type RecentPost,
  type RefreshParams,
} from '../types';

// Instagram API with Instagram Login (Business login) — matches the
// IG_CLIENT_ID / IG_CLIENT_SECRET / IG_REDIRECT_URI env vars.
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const SHORT_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

const DEFAULT_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

function credentials(): { clientId?: string; clientSecret?: string } {
  return {
    clientId: process.env.IG_CLIENT_ID,
    clientSecret: process.env.IG_CLIENT_SECRET,
  };
}

interface ShortTokenResponse {
  access_token: string;
  user_id: number | string;
  permissions?: string[] | string;
}

interface LongTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface IgMeResponse {
  id: string;
  username?: string;
  account_type?: string;
}

interface IgProfileResponse {
  biography?: string;
}

interface IgMediaListResponse {
  data?: Array<{ caption?: string; timestamp?: string }>;
}

const RECENT_POSTS_LIMIT = 10;

async function exchangeForLongLived(
  shortToken: string,
  clientSecret: string,
): Promise<LongTokenResponse> {
  return requestJson<LongTokenResponse>(
    buildUrl(`${GRAPH}/access_token`, {
      grant_type: 'ig_exchange_token',
      client_secret: clientSecret,
      access_token: shortToken,
    }),
    { context: 'Instagram long-lived exchange', platform: Platform.INSTAGRAM },
  );
}

export const instagramAdapter: PlatformAdapter = {
  platform: Platform.INSTAGRAM,
  usesPkce: false,
  // Long-lived tokens last ~60 days; refresh well ahead (5 days).
  refreshLeadMs: 5 * 24 * 60 * 60 * 1000,

  isConfigured() {
    const { clientId, clientSecret } = credentials();
    return Boolean(clientId && clientSecret);
  },

  getAuthorizationUrl({ redirectUri, state, scopes }: AuthorizeOptions): AuthorizationRequest {
    const { clientId } = credentials();
    return {
      url: buildUrl(AUTHORIZE_URL, {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: (scopes ?? DEFAULT_SCOPES).join(','),
        state,
      }),
    };
  },

  async exchangeCode({ code, redirectUri }: ExchangeParams) {
    const { clientId, clientSecret } = credentials();
    // 1) code -> short-lived token
    const short = await requestJson<ShortTokenResponse>(SHORT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
      context: 'Instagram code exchange',
      platform: Platform.INSTAGRAM,
    });

    // 2) short-lived -> long-lived (~60 days)
    const long = await exchangeForLongLived(short.access_token, clientSecret ?? '');

    // 3) identity
    const identity = await this.fetchIdentity(long.access_token);

    const tokens: OAuthTokens = {
      accessToken: long.access_token,
      refreshToken: null, // IG has no separate refresh token; the access token is refreshed in place
      tokenType: long.token_type ?? 'bearer',
      scope: DEFAULT_SCOPES.join(','),
      accessTokenExpiresAt: expiresAt(long.expires_in ?? 60 * 24 * 60 * 60),
    };
    return { tokens, identity };
  },

  async refreshTokens({ accessToken }: RefreshParams): Promise<OAuthTokens> {
    if (!accessToken) {
      throw new OAuthError('Instagram refresh requires the current access token.', {
        recoverable: false,
        platform: Platform.INSTAGRAM,
      });
    }
    const res = await requestJson<LongTokenResponse>(
      buildUrl(`${GRAPH}/refresh_access_token`, {
        grant_type: 'ig_refresh_token',
        access_token: accessToken,
      }),
      { context: 'Instagram refresh', platform: Platform.INSTAGRAM },
    );
    return {
      accessToken: res.access_token,
      refreshToken: null,
      tokenType: res.token_type ?? 'bearer',
      accessTokenExpiresAt: expiresAt(res.expires_in ?? 60 * 24 * 60 * 60),
    };
  },

  async fetchIdentity(accessToken: string): Promise<PlatformIdentity> {
    const me = await requestJson<IgMeResponse>(
      buildUrl(`${GRAPH}/me`, {
        fields: 'id,username,account_type',
        access_token: accessToken,
      }),
      { context: 'Instagram me', platform: Platform.INSTAGRAM },
    );
    if (!me.id) {
      throw new OAuthError('Instagram /me returned no id.', {
        recoverable: false,
        platform: Platform.INSTAGRAM,
      });
    }
    return {
      externalAccountId: me.id,
      username: me.username ?? null,
      displayName: me.username ?? null,
    };
  },

  /**
   * Best-effort bio + last 10 posts, for AI style context. Both fields are
   * covered by the `instagram_business_basic` scope already requested at
   * connect time, so this works for every existing connection — no
   * reconnect needed.
   */
  async fetchProfileSnapshot({
    accessToken,
    externalAccountId,
  }: {
    accessToken: string;
    externalAccountId: string;
  }): Promise<ProfileSnapshot> {
    const profile = await requestJson<IgProfileResponse>(
      buildUrl(`${GRAPH}/${externalAccountId}`, {
        fields: 'biography',
        access_token: accessToken,
      }),
      { context: 'Instagram profile (bio)', platform: Platform.INSTAGRAM },
    ).catch(() => null);

    const media = await requestJson<IgMediaListResponse>(
      buildUrl(`${GRAPH}/${externalAccountId}/media`, {
        fields: 'caption,timestamp',
        limit: String(RECENT_POSTS_LIMIT),
        access_token: accessToken,
      }),
      { context: 'Instagram media list', platform: Platform.INSTAGRAM },
    ).catch(() => null);

    const bio = profile?.biography?.trim() || null;

    const recentPosts: RecentPost[] = (media?.data ?? [])
      .filter((m) => m.caption)
      .slice(0, RECENT_POSTS_LIMIT)
      .map((m) => ({
        caption: stripHashtags(m.caption!),
        hashtags: extractHashtags(m.caption!),
        postedAt: m.timestamp ?? null,
      }));

    return { bio, recentPosts };
  },
};
