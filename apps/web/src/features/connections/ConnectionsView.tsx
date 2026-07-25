'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, RefreshCw, Unplug } from 'lucide-react';

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlatformCornerBadge, PlatformGlyph } from '@/components/PlatformGlyph';
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

      <p className="text-muted-foreground text-xs leading-relaxed">
        By connecting an account, you agree to that platform&apos;s terms. PostPilot uses YouTube API
        Services; by connecting YouTube you agree to the{' '}
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

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-4">
      <div className="flex min-w-0 items-center gap-3">
        {conn && (conn.username || conn.displayName) ? (
          <div className="relative shrink-0">
            <ConnectionAvatar
              avatarUrl={conn.avatarUrl}
              name={conn.username ?? conn.displayName ?? '?'}
            />
            <PlatformCornerBadge platform={entry.platform} />
          </div>
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

