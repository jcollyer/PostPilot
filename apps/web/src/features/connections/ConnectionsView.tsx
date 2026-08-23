'use client';

import Link from 'next/link';
import { Check, ChevronLeft, Loader2, RefreshCw, Unplug } from 'lucide-react';

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountAvatar, PlatformGlyph, PlatformLogo } from '@/components/PlatformGlyph';
import { trpc } from '@/lib/trpc/client';

interface ConnectionsViewProps {
  connected?: string;
  error?: string;
}

/** Brand names shown on the "Continue with …" connect buttons. */
const CONNECT_BRAND: Partial<Record<Platform, string>> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

/**
 * What a platform needs from the creator before a connection can succeed.
 * Shown only while disconnected, where it saves a failed OAuth round-trip.
 */
const CONNECT_REQUIREMENT: Partial<Record<Platform, string>> = {
  INSTAGRAM: 'Requires a Business or Creator account linked to a Facebook Page.',
};

/**
 * Display a username as an @-handle without doubling the prefix — some
 * platforms (e.g. YouTube's customUrl) already include a leading "@".
 */
function formatHandle(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
}

/** Casing, spacing, dots and the @ prefix are noise when comparing identities. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "That platform isn't configured yet (missing API credentials).",
  unknown_platform: 'Unknown platform.',
  invalid_oauth_response: 'The sign-in response was missing required values. Please try again.',
  invalid_state: 'Your connect session expired. Please try again.',
  state_mismatch: 'Security check failed. Please try connecting again.',
  connect_failed: "We couldn't finish connecting that account. Please try again.",
  access_denied: 'You declined the permission request.',
};

export function ConnectionsView({ connected, error }: ConnectionsViewProps) {
  const utils = trpc.useUtils();
  const { data: overview, isLoading } = trpc.connections.overview.useQuery();

  const disconnect = trpc.connections.disconnect.useMutation({
    onSuccess: () => utils.connections.overview.invalidate(),
  });

  // A broken connection is why most people open this page — an alert sent them
  // here. Float it to the top so the repair is the first thing under the title.
  const entries = [...(overview ?? [])].sort((a, b) => {
    const rank = (e: OverviewEntry) =>
      e.connection?.status === 'NEEDS_RECONNECT' ? 0 : e.configured ? 1 : 2;
    return rank(a) - rank(b);
  });
  const brokenCount = entries.filter((e) => e.connection?.status === 'NEEDS_RECONNECT').length;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/settings"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Settings
      </Link>

      <h1 className="mt-3 text-2xl font-medium tracking-[-0.02em]">Connections</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
        The accounts PostPilot publishes to. Each one refreshes its own access in the background —
        you&apos;ll only see a prompt here if a connection genuinely breaks.
      </p>

      {connected ? (
        <p className="border-border bg-card mt-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
          <span className="bg-primary text-primary-foreground flex h-5 w-5 flex-none items-center justify-center rounded-full">
            <Check className="h-3 w-3" aria-hidden />
          </span>
          {PLATFORM_LABELS[connected.toUpperCase() as Platform] ?? connected} is connected. Anything
          held for it will publish on its next slot.
        </p>
      ) : null}

      {error ? (
        <p className="border-danger-line bg-danger-soft text-danger mt-6 rounded-lg border px-4 py-3 text-sm">
          {ERROR_MESSAGES[error] ?? 'Something went wrong connecting that account.'}
        </p>
      ) : null}

      {brokenCount > 0 ? (
        <p className="text-danger mt-6 text-sm font-medium">
          {brokenCount === 1
            ? 'One account needs reconnecting. Its posts are on hold until you do.'
            : `${brokenCount} accounts need reconnecting. Their posts are on hold until you do.`}
        </p>
      ) : null}

      <ul className="border-border bg-card divide-line mt-4 divide-y overflow-hidden rounded-xl border">
        {isLoading
          ? [0, 1, 2].map((i) => <PlatformRowSkeleton key={i} />)
          : entries.map((entry) => (
              <PlatformRow
                key={entry.platform}
                entry={entry}
                onDisconnect={(connectionId) => disconnect.mutate({ connectionId })}
                disconnecting={
                  disconnect.isPending &&
                  disconnect.variables?.connectionId === entry.connection?.id
                }
              />
            ))}
      </ul>

      <p className="text-muted-foreground mt-6 max-w-prose text-xs leading-relaxed">
        By connecting an account, you agree to that platform&apos;s terms. PostPilot uses YouTube
        API Services; by connecting YouTube you agree to the{' '}
        <a
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline"
        >
          YouTube Terms of Service
        </a>
        , and Google&apos;s handling of your data is described in the{' '}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline"
        >
          Google Privacy Policy
        </a>
        . See also our{' '}
        <Link href="/privacy" className="hover:text-foreground underline">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/terms" className="hover:text-foreground underline">
          Terms
        </Link>
        .
      </p>
    </div>
  );
}

type OverviewEntry = inferRouterOutputs<AppRouter>['connections']['overview'][number];

function PlatformRow({
  entry,
  onDisconnect,
  disconnecting,
}: {
  entry: OverviewEntry;
  onDisconnect: (connectionId: string) => void;
  disconnecting: boolean;
}) {
  const label = PLATFORM_LABELS[entry.platform];
  const conn = entry.connection;
  const status = conn?.status ?? (entry.configured ? 'NONE' : 'UNAVAILABLE');
  const broken = status === 'NEEDS_RECONNECT';
  const handle = conn?.username ? formatHandle(conn.username) : null;
  const requirement = CONNECT_REQUIREMENT[entry.platform];
  // "@aerialjeremy · Aerial Jeremy" says the same thing twice. Show the display
  // name only when it carries information the handle doesn't.
  const showDisplayName =
    Boolean(conn?.displayName) &&
    Boolean(handle) &&
    normalizeName(conn!.displayName!) !== normalizeName(handle!);

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5 ${
        broken ? 'bg-danger-soft' : ''
      }`}
    >
      <PlatformLogo platform={entry.platform} />

      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium leading-tight">{label}</p>

        {handle || conn?.displayName ? (
          <p className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-sm">
            <AccountAvatar
              url={conn?.avatarUrl ?? null}
              name={handle ?? conn?.displayName ?? '?'}
            />
            <span className="truncate">{handle ?? conn?.displayName}</span>
            {showDisplayName ? <span className="truncate">· {conn!.displayName}</span> : null}
          </p>
        ) : null}

        <p
          className={`mt-1 text-sm ${broken ? 'text-danger' : 'text-muted-foreground'} ${
            broken ? 'font-medium' : ''
          }`}
        >
          <StatusLine status={status} requirement={requirement} />
        </p>
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 pl-[3.25rem] sm:ml-auto sm:w-auto sm:pl-0">
        {!entry.configured ? null : broken ? (
          <>
            <Button asChild size="sm">
              <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Reconnect
              </a>
            </Button>
            {conn ? (
              <DisconnectButton
                connectionId={conn.id}
                onDisconnect={onDisconnect}
                disconnecting={disconnecting}
              />
            ) : null}
          </>
        ) : conn ? (
          <DisconnectButton
            connectionId={conn.id}
            onDisconnect={onDisconnect}
            disconnecting={disconnecting}
          />
        ) : (
          // All connect buttons use a light background with the official,
          // unmodified platform brand glyph at >= 20px, per each platform's
          // branding guidelines. Labels use the full platform name (no
          // abbreviations or variants).
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-input text-foreground bg-white hover:bg-neutral-50"
          >
            <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
              {/* Per-platform sizing so the visible marks look balanced:
                  - YouTube fills ~19.92 of its 20-unit viewBox, so h-5 renders it
                    just under the 20px minimum; h-6 (24px) clears 20px with margin.
                  - Instagram's gradient square is inset (~83% of its box), so it
                    reads small at h-5; h-6 brings its visible size up to match.
                  - TikTok fills its box, so h-5 already matches. */}
              <PlatformGlyph
                platform={entry.platform}
                className={`-ml-1 w-auto ${
                  entry.platform === 'INSTAGRAM'
                    ? 'h-7'
                    : entry.platform === 'YOUTUBE'
                      ? 'h-6'
                      : 'h-5'
                }`}
              />
              Continue with {CONNECT_BRAND[entry.platform] ?? label}
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * One line of plain language per state. Healthy connections stay in the muted
 * neutral — in this app a working system is quiet, and only a broken one gets
 * to take colour.
 */
function StatusLine({ status, requirement }: { status: string; requirement?: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-start gap-1.5">
          <Check className="mt-[0.2em] h-3.5 w-3.5 flex-none" aria-hidden />
          Connected — publishing normally.
        </span>
      );
    case 'NEEDS_RECONNECT':
      return <>Connection lost — reconnect to resume.</>;
    case 'PAUSED':
      return <>Paused. Nothing will publish here until it resumes.</>;
    case 'UNAVAILABLE':
      return <>Not available yet.</>;
    default:
      return <>Not connected.{requirement ? ` ${requirement}` : ''}</>;
  }
}

function DisconnectButton({
  connectionId,
  onDisconnect,
  disconnecting,
}: {
  connectionId: string;
  onDisconnect: (connectionId: string) => void;
  disconnecting: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onDisconnect(connectionId)}
      disabled={disconnecting}
    >
      {disconnecting ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Unplug className="h-4 w-4" aria-hidden />
      )}
      {disconnecting ? 'Disconnecting…' : 'Disconnect'}
    </Button>
  );
}

function PlatformRowSkeleton() {
  return (
    <li className="flex items-center gap-4 p-4 sm:p-5">
      <Skeleton className="h-9 w-9 shrink-0 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <Skeleton className="h-9 w-32 shrink-0 rounded-md" />
    </li>
  );
}
