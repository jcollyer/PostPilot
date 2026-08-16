'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatBytes } from '@postpilot/types';
import { trpc } from '@/lib/trpc/client';

/** Stripe statuses worth surfacing; anything healthy shows nothing. */
const STATUS_NOTE: Record<string, string> = {
  past_due: "Your last payment didn't go through. Update your card to avoid losing access.",
  unpaid: 'Your subscription is unpaid and your plan has been reduced to Free.',
  canceled: 'Your subscription has ended and your plan has been reduced to Free.',
  incomplete: 'Your payment needs finishing before this plan activates.',
};

function UsageBar({ label, used, limit }: { label: string; used: string; limit: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used} <span className="text-muted-foreground">of {limit}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Current plan, what it entitles, and a way into the Stripe Customer Portal.
 *
 * Nothing here changes the plan directly — upgrades, downgrades, card updates
 * and cancellation all happen in the Portal so Stripe can prorate and schedule
 * them, and come back as webhooks.
 */
export function BillingSettings() {
  const { data, isLoading } = trpc.billing.status.useQuery();
  const [error, setError] = useState<string | null>(null);

  const openPortal = trpc.billing.openPortal.useMutation({
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted-foreground text-sm">Couldn&apos;t load your plan.</p>;
  }

  const { limits, usage, plan } = data;
  const note = data.stripeSubscriptionStatus
    ? STATUS_NOTE[data.stripeSubscriptionStatus]
    : undefined;
  const renews = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{limits.name}</p>
          <p className="text-muted-foreground text-sm">
            {limits.monthly === 0
              ? 'No card on file.'
              : renews
                ? `${data.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${renews.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                : 'Active.'}
          </p>
        </div>

        {data.billingConfigured ? (
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              openPortal.mutate();
            }}
            disabled={openPortal.isPending}
          >
            {openPortal.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening…
              </>
            ) : (
              <>
                {plan === 'FREE' ? 'Upgrade' : 'Manage subscription'}
                <ExternalLink className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        ) : null}
      </div>

      {note ? (
        <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
          {note}
        </p>
      ) : null}

      <div className="space-y-3 rounded-md border p-4">
        <UsageBar
          label="Videos"
          used={usage.videoCount.toLocaleString()}
          limit={limits.videos.toLocaleString()}
        />
        <UsageBar
          label="Storage"
          used={formatBytes(usage.storageBytes)}
          limit={formatBytes(limits.storageBytes)}
        />
      </div>

      {usage.overLimit ? (
        <p className="text-muted-foreground text-sm">
          You&apos;re over your {limits.name} limits, so new uploads are paused. Nothing has been
          removed and your queue keeps publishing — upgrade or free up space to upload again.
        </p>
      ) : null}

      {!data.billingConfigured ? (
        <p className="text-muted-foreground text-sm">
          Paid plans aren&apos;t switched on in this environment yet.
        </p>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
