// Crypto + OAuth helpers
export {
  encryptSecret,
  decryptSecret,
  encryptNullable,
  decryptNullable,
  generateState,
  generateCodeVerifier,
  deriveCodeChallenge,
} from './crypto';

// Adapter interface + registry
export {
  getAdapter,
  isPlatformConfigured,
  SUPPORTED_PLATFORMS,
  tiktokAdapter,
  instagramAdapter,
  youtubeAdapter,
} from './adapters';
export type {
  PlatformAdapter,
  OAuthTokens,
  PlatformIdentity,
  AuthorizeOptions,
  ExchangeParams,
  RefreshParams,
  ProfileSnapshot,
  RecentPost,
} from './types';
export { OAuthError } from './types';

// Config helpers
export { getBaseUrl, getRedirectUri, parsePlatform } from './config';

// Connection lifecycle (shared domain logic — reused by web + workers)
export {
  startConnection,
  completeConnection,
  disconnectConnection,
  getFreshAccessToken,
  getConnectionOverview,
  toConnectionDto,
  type ConnectionDto,
  type PendingAuthorization,
  type PlatformOverviewEntry,
} from './connection-service';

// Token refresh
export { refreshConnection, refreshDueConnections, markNeedsReconnect } from './refresh-service';

// Creator-profile snapshot cache (bio + recent posts, used as AI style context)
export {
  refreshProfileSnapshot,
  refreshDueProfiles,
  type ProfileRefreshResult,
} from './profile-service';
