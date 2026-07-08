'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, RefreshCw, Unplug } from 'lucide-react';

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
 * Display a username as an @-handle without doubling the prefix — some
 * platforms (e.g. YouTube's customUrl) already include a leading "@".
 */
function formatHandle(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
      </div>

      {connected ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Connected {PLATFORM_LABELS[connected.toUpperCase() as Platform] ?? connected}.
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {ERROR_MESSAGES[error] ?? 'Something went wrong connecting that account.'}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Platforms</CardTitle>
          <CardDescription>
            Connect the accounts PostPilot will publish to. Each platform refreshes its own access
            automatically — we&apos;ll only ask you to reconnect if a connection genuinely breaks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            overview?.map((entry) => (
              <PlatformRow
                key={entry.platform}
                entry={entry}
                onDisconnect={(connectionId) => disconnect.mutate({ connectionId })}
                disconnecting={
                  disconnect.isPending &&
                  disconnect.variables?.connectionId === entry.connection?.id
                }
              />
            ))
          )}
        </CardContent>
      </Card>
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

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-4">
      <div className="flex min-w-0 items-center gap-3">
        {conn && (conn.username || conn.displayName) ? (
          <ConnectionAvatar
            avatarUrl={conn.avatarUrl}
            name={conn.username ?? conn.displayName ?? '?'}
          />
        ) : null}
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-none">{label}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={status} />
            {conn?.username || conn?.displayName ? (
              <span className="text-foreground truncate text-sm font-medium">
                {conn.username ? formatHandle(conn.username) : conn.displayName}
              </span>
            ) : null}
            {conn?.username && conn?.displayName && conn.displayName !== conn.username ? (
              <span className="text-muted-foreground truncate text-xs">{conn.displayName}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!entry.configured ? (
          <span className="text-muted-foreground text-xs">Not available</span>
        ) : status === 'NEEDS_RECONNECT' ? (
          <>
            <Button asChild size="sm">
              <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
                <RefreshCw className="mr-1 h-4 w-4" />
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
          <Button asChild size="sm">
            <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
              <PlatformGlyph platform={entry.platform} className="mr-1.5 h-4 w-4" />
              Continue with {CONNECT_BRAND[entry.platform] ?? label}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
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
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Unplug className="mr-1 h-4 w-4" />
      )}
      Disconnect
    </Button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: 'Connected', className: 'bg-emerald-100 text-emerald-800' },
    NEEDS_RECONNECT: { label: 'Reconnect needed', className: 'bg-red-100 text-red-800' },
    PAUSED: { label: 'Paused', className: 'bg-amber-100 text-amber-800' },
    DISCONNECTED: { label: 'Disconnected', className: 'bg-slate-100 text-slate-700' },
    NONE: { label: 'Not connected', className: 'bg-slate-100 text-slate-700' },
    UNAVAILABLE: { label: 'Unavailable', className: 'bg-slate-100 text-slate-500' },
  };
  const s = map[status] ?? map.NONE!;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
      {status === 'ACTIVE' ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
    </span>
  );
}

/**
 * Connected-account avatar: the real platform profile picture when available,
 * falling back to a letter tile if it's missing or fails to load.
 */
function ConnectionAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase"
    >
      {name.charAt(0)}
    </div>
  );
}

/**
 * Platform glyphs for the connect buttons. All three inherit the button's text
 * color (currentColor) so they stay legible on the colored button. Marks are
 * kept undistorted per each platform's brand guidelines.
 */
function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  switch (platform) {
    case 'INSTAGRAM':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="20" height="20" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'TIKTOK':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'YOUTUBE':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="5.5" width="20" height="13" rx="4" />
          <path d="M9.8 9.2 15.6 12 9.8 14.8z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
