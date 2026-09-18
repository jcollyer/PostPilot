'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { BillingPeriod } from '@postpilot/billing';
import { formatBytes, PLAN_LIMITS, type PlanId } from '@postpilot/types';

/**
 * Grid layout by card count, written out in full so Tailwind generates each
 * class. A lone card stays card-sized, centred under the switch, rather than
 * stretching across the whole container.
 */
const COLUMNS: Record<number, string> = {
  1: 'mx-auto w-full sm:max-w-xs',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

/**
 * The monthly/annual switch and a card per plan — shared by the first-run plan
 * gate and the upgrade section in Settings, so both offer plans the same way.
 *
 * Owns only the period. What choosing a plan does (Checkout, or recording Free)
 * is the caller's, via `onChoose`. Renders two siblings rather than a wrapper,
 * so the caller's own layout spaces them.
 */
export function PlanOptions({
  plans,
  pending,
  canBuy,
  onChoose,
}: {
  /** Plans to offer, in display order. */
  plans: readonly PlanId[];
  /** The plan whose choice is in flight: it shows a spinner and every card locks. */
  pending: PlanId | null;
  /** Whether paid plans can be bought in this deployment. Free always can. */
  canBuy: boolean;
  onChoose: (plan: PlanId, period: BillingPeriod) => void;
}) {
  const [annual, setAnnual] = useState(false);

  return (
    <>
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

      <div className={`grid gap-3 ${COLUMNS[plans.length] ?? ''}`}>
        {plans.map((id) => {
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
                {/* Free fills the period slot with the reassurance instead of
                    leaving it blank. The plan gate can't be dismissed, so the
                    way through it has to be obvious at the point where the "do
                    I have to pay?" question forms — the price. Matters most for
                    platform app reviewers, who arrive without context and
                    cannot be told to look for the Free card. */}
                <span className="text-muted-foreground text-xs">
                  {free ? 'No card required' : annual ? '/yr' : '/mo'}
                </span>
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
                onClick={() => onChoose(id, annual ? 'annual' : 'monthly')}
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
    </>
  );
}
