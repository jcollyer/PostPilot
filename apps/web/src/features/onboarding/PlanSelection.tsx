'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes, PLAN_IDS, PLAN_LIMITS, type PlanId } from '@postpilot/types';
import { trpc } from '@/lib/trpc/client';

/**
 * First-run plan choice, gated on `planSelectedAt` — the same dismissal-marker
 * pattern as the creator-profile modal, mounted in the authenticated layout so
 * it appears on whichever page the creator lands on.
 *
 * Unlike that modal this one can't be skipped: the whole point is that an
 * account has consciously chosen what it is on. There is always a way through,
 * though — Free is a real choice and needs no payment, so nobody can be trapped
 * here, including when Stripe isn't configured.
 *
 * Choosing a paid plan hands off to Stripe Checkout. The plan itself only
 * changes when the webhook confirms it, so abandoning Checkout leaves the
 * account exactly as it was.
 */
export function PlanSelection() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.billing.status.useQuery();
  const [annual, setAnnual] = useState(false);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseFree = trpc.billing.chooseFree.useMutation({
    onSuccess: () => utils.billing.status.invalidate(),
    onError: (err) => {
      setError(err.message);
      setPending(null);
    },
  });

  const startCheckout = trpc.billing.startCheckout.useMutation({
    // Full navigation, not a router push: the destination is Stripe's domain.
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => {
      setError(err.message);
      setPending(null);
    },
  });

  // Undefined while loading -> stay closed rather than flash open then shut.
  const open = status ? status.needsPlanSelection : false;
  const canBuy = status?.billingConfigured ?? false;

  function choose(plan: PlanId) {
    setError(null);
    setPending(plan);
    if (plan === 'FREE') {
      chooseFree.mutate();
      return;
    }
    startCheckout.mutate({ plan, period: annual ? 'annual' : 'monthly' });
  }

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      {/* The gate has no dismiss: `open` is derived from server state, so the
          shared close button would be a dead control. Hidden via the direct
          child selector (this content has no other top-level buttons) rather
          than by adding a prop to the shared Dialog. */}
      <DialogContent
        className="sm:max-w-2xl [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choose your plan</DialogTitle>
          <DialogDescription>
            Every plan runs the full AI pipeline on every video. They differ by how much you keep in
            your library. You can change this anytime in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="bg-muted inline-flex items-center gap-1 rounded-full p-1"
          >
            {[false, true].map((isAnnual) => (
              <button
                key={String(isAnnual)}
                type="button"
                role="radio"
                aria-checked={annual === isAnnual}
                onClick={() => setAnnual(isAnnual)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  annual === isAnnual
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isAnnual ? 'Annual' : 'Monthly'}
                {isAnnual ? (
                  <span className="bg-primary text-primary-foreground ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
                    2 months free
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const limits = PLAN_LIMITS[id];
            const free = id === 'FREE';
            const amount = annual ? limits.annual : limits.monthly;
            const disabled = (!free && !canBuy) || pending != null;

            return (
              <div
                key={id}
                className={`flex flex-col rounded-lg border p-4 ${
                  id === 'CREATOR' ? 'border-primary bg-primary/5' : 'border-border/60'
                }`}
              >
                <h3 className="text-sm font-semibold">{limits.name}</h3>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tracking-tight">${amount}</span>
                  {free ? null : (
                    <span className="text-muted-foreground text-xs">{annual ? '/yr' : '/mo'}</span>
                  )}
                </p>

                <ul className="text-muted-foreground mt-3 flex-1 space-y-1.5 text-xs">
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    {limits.videos.toLocaleString()} videos
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    {formatBytes(limits.storageBytes)} storage
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    Full AI on every video
                  </li>
                </ul>

                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={id === 'CREATOR' ? 'default' : 'outline'}
                  disabled={disabled}
                  onClick={() => choose(id)}
                >
                  {pending === id ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Starting…
                    </>
                  ) : free ? (
                    'Start free'
                  ) : (
                    `Choose ${limits.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {!canBuy ? (
          <p className="text-muted-foreground text-center text-xs">
            Paid plans aren&apos;t available yet — start free and upgrade from Settings once
            they&apos;re switched on.
          </p>
        ) : null}

        {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
