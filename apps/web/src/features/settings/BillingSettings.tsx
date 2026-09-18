'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PlanOptions } from '@/features/billing/PlanOptions';
import type { BillingPeriod } from '@postpilot/billing';
import { formatBytes, PLAN_IDS, type PlanId } from '@postpilot/types';
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
 * Current plan, what it entitles, and the way to change it.
 *
 * Subscribers change plan in the Stripe Customer Portal, where Stripe prorates
 * and schedules it. Everyone else — Free, a lapsed subscription, a grandfathered
 * plan — is offered the plans above theirs through Checkout, because the Portal
 * can only change a subscription that exists, never start one. Nothing here
 * changes the plan directly: it moves when the webhook confirms it.
 */
export function BillingSettings() {
  // Set when Stripe has just sent the user back from a completed Checkout.
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = trpc.billing.status.useQuery(undefined, {
    // The purchase is applied by webhook, which can land a few seconds after
    // Stripe redirects back here. Poll until it has, rather than show someone
    // who just paid their old plan and the buttons to buy it again.
    refetchInterval: (query) =>
      returnedFromCheckout && !query.state.data?.hasSubscription ? 2_000 : false,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('checkout') !== 'success') return;
    setReturnedFromCheckout(true);
    // One-shot: drop the flag so a reload doesn't start waiting all over again.
    url.searchParams.delete('checkout');
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    if (!returnedFromCheckout) return;
    // Stop waiting after half a minute; the webhook still applies the plan
    // whenever it does land.
    const timer = setTimeout(() => setReturnedFromCheckout(false), 30_000);
    return () => clearTimeout(timer);
  }, [returnedFromCheckout]);

  const openPortal = trpc.billing.openPortal.useMutation({
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => setError(err.message),
  });

  const startCheckout = trpc.billing.startCheckout.useMutation({
    // Full navigation, not a router push: the destination is Stripe's domain.
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => {
      setError(err.message);
      setPending(null);
    },
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
  const confirming = returnedFromCheckout && !data.hasSubscription;

  // What Checkout can sell them: the paid plans above the one they're on.
  // Subscribers get none of these; they switch plans in the Portal.
  const upgrades =
    data.billingConfigured && !data.hasSubscription
      ? PLAN_IDS.slice(PLAN_IDS.indexOf(plan) + 1)
      : [];

  // A past subscriber still has invoices in the Portal, even with nothing left to manage.
  const portalLabel = data.hasSubscription
    ? 'Manage subscription'
    : data.stripeSubscriptionStatus
      ? 'Billing history'
      : null;

  function choose(target: PlanId, period: BillingPeriod) {
    // Never offered here, since nothing sits below Free; this narrows the type.
    if (target === 'FREE') return;
    setError(null);
    setPending(target);
    startCheckout.mutate({ plan: target, period });
  }

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

        {data.billingConfigured && portalLabel ? (
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
                {portalLabel}
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

      {confirming ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment with Stripe…
        </p>
      ) : upgrades.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Upgrade</h3>
          <PlanOptions plans={upgrades} pending={pending} canBuy onChoose={choose} />
        </div>
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
