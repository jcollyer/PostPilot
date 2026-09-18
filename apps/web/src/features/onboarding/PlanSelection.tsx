'use client';

import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlanOptions } from '@/features/billing/PlanOptions';
import type { BillingPeriod } from '@postpilot/billing';
import { PLAN_IDS, type PlanId } from '@postpilot/types';
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

  function choose(plan: PlanId, period: BillingPeriod) {
    setError(null);
    setPending(plan);
    if (plan === 'FREE') {
      chooseFree.mutate();
      return;
    }
    startCheckout.mutate({ plan, period });
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

        <PlanOptions plans={PLAN_IDS} pending={pending} canBuy={canBuy} onChoose={choose} />

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
