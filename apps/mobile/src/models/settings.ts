import { formatBytes } from '@postpilot/types';

import { connectionLabel, fmtLongDate, PLATFORM_LABEL } from '../lib/dashboard-format';
import type { RouterOutputs } from '../lib/trpc';

/**
 * Settings screen model: the grouped list's rows, derived from `user.me`,
 * `connections.overview`, `billing.status` and the app's version and build.
 * The screen only maps this to views.
 *
 * Each query is optional: a section whose data is missing comes back null and
 * the screen says so in its place, so Sign out never waits on the API.
 *
 * The app reads and links out; it never changes connections or the plan.
 * Rows that need a hand (broken or unconnected platforms) open web
 * Connections, and the plan has no purchase or portal action at all.
 */

/** Where Home and the Queue item sheet send a creator to fix a connection. */
export const CONNECTIONS_HREF = '/settings?focus=connections';

export type SettingsMe = NonNullable<RouterOutputs['user']['me']>;
export type SettingsConnections = RouterOutputs['connections']['overview'];
export type SettingsBilling = RouterOutputs['billing']['status'];

export interface SettingsInput {
  me: SettingsMe | null | undefined;
  connections: SettingsConnections | undefined;
  billing: SettingsBilling | undefined;
  app: AppVersion;
  /** `EXPO_PUBLIC_API_URL`; the web app shares its origin. */
  apiUrl: string;
}

export interface AppVersion {
  version: string | null;
  build: string | null;
}

export interface SettingsConnectionRow {
  platform: SettingsConnections[number]['platform'];
  name: string;
  status: string;
  tone: 'ok' | 'warn' | 'critical' | 'muted';
  /** Web Connections, when this row needs a hand there; null when it's fine as is. */
  webUrl: string | null;
}

export interface SettingsUsage {
  key: 'videos' | 'storage';
  label: string;
  /** "12 of 300", "1.5 GB of 60 GB". */
  copy: string;
  /** How full the bar is drawn, 0–1; over the limit still draws full. */
  ratio: number;
  /** `warn` from 90% of a limit, `critical` past it. */
  tone: 'normal' | 'warn' | 'critical';
}

export interface SettingsPlan {
  name: string;
  /** "Renews on Nov 3, 2026" or "Cancels on …"; null without a running subscription. */
  period: string | null;
  usage: SettingsUsage[];
  /** Why uploads are paused, when a limit is passed. */
  note: string | null;
}

export interface SettingsLink {
  key: 'privacy' | 'terms' | 'web';
  label: string;
  url: string;
}

export interface SettingsModel {
  account: { name: string; email: string } | null;
  connections: SettingsConnectionRow[] | null;
  manageConnectionsUrl: string;
  plan: SettingsPlan | null;
  about: { version: string; links: SettingsLink[] };
}

export function buildSettingsModel(input: SettingsInput): SettingsModel {
  const origin = webOrigin(input.apiUrl);
  const connectionsUrl = `${origin}/settings/connections`;
  const { me } = input;

  return {
    account: me ? { name: me.name?.trim() || 'Not set', email: me.email } : null,
    connections: input.connections ? connectionRows(input.connections, connectionsUrl) : null,
    manageConnectionsUrl: connectionsUrl,
    plan: input.billing ? plan(input.billing) : null,
    about: {
      version: versionString(input.app),
      links: [
        { key: 'privacy', label: 'Privacy', url: `${origin}/privacy` },
        { key: 'terms', label: 'Terms', url: `${origin}/terms` },
        { key: 'web', label: 'Open PostPilot on the web', url: `${origin}/home` },
      ],
    },
  };
}

// --- Connections -----------------------------------------------------------

function connectionRows(
  connections: SettingsConnections,
  connectionsUrl: string,
): SettingsConnectionRow[] {
  // Platforms this deployment can't connect to aren't the creator's to fix.
  return connections
    .filter((c) => c.configured)
    .map((c) => {
      // Wording and tone both come from `connectionLabel`, so a status reads
      // and colours the same here as everywhere else in the app.
      const { text, tone } = connectionLabel(c.configured, c.connection?.status);
      return {
        platform: c.platform,
        name: PLATFORM_LABEL[c.platform] ?? c.platform,
        status: text,
        tone,
        // Broken (critical) and unconnected (muted) rows go to the web to fix;
        // active and paused ones are fine where they are.
        webUrl: tone === 'critical' || tone === 'muted' ? connectionsUrl : null,
      };
    });
}

// --- Plan ------------------------------------------------------------------

function plan(billing: SettingsBilling): SettingsPlan {
  const { limits, usage } = billing;
  // A lapsed subscription keeps its last period end, but renews nothing.
  const end = billing.hasSubscription ? billing.currentPeriodEnd : null;
  return {
    name: limits.name,
    period: end
      ? `${billing.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on ${fmtLongDate(end)}`
      : null,
    usage: [
      {
        key: 'videos',
        label: 'Videos',
        copy: `${usage.videoCount.toLocaleString()} of ${limits.videos.toLocaleString()}`,
        ...meter(usage.videoRatio, usage.overVideos),
      },
      {
        key: 'storage',
        label: 'Storage',
        copy: `${formatBytes(usage.storageBytes)} of ${formatBytes(limits.storageBytes)}`,
        ...meter(usage.storageRatio, usage.overStorage),
      },
    ],
    note: usage.overLimit
      ? `You’re over your ${limits.name} limits, so new uploads are paused. Nothing has been removed and your queue keeps publishing.`
      : null,
  };
}

const NEAR_LIMIT = 0.9;

function meter(ratio: number, over: boolean): Pick<SettingsUsage, 'ratio' | 'tone'> {
  return {
    ratio: Math.min(Math.max(ratio, 0), 1),
    tone: over ? 'critical' : ratio >= NEAR_LIMIT ? 'warn' : 'normal',
  };
}

// --- About -----------------------------------------------------------------

/** "1.0.0 (12)", or just the version when there's no build number. */
export function versionString({ version, build }: AppVersion): string {
  if (!version) return 'Unknown';
  return build ? `${version} (${build})` : version;
}

/**
 * Scheme, host and port of a URL. Parsed by hand: React Native's `URL`
 * doesn't implement `origin`.
 */
export function webOrigin(url: string): string {
  return url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i)?.[0] ?? url.replace(/\/+$/, '');
}
