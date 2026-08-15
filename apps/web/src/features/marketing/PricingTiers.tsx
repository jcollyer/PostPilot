'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

import { formatBytes, PLAN_LIMITS, type PlanId } from '@postpilot/types';

import { Button } from '@/components/ui/button';

/**
 * Pricing tiers with a monthly/annual billing toggle.
 *
 * Tiers are separated by capacity, not by features — every plan runs the full
 * AI pipeline on every upload. That mirrors what actually costs money: AI is a
 * one-time charge per video at upload (~$0.011), while storage recurs monthly
 * for as long as the file is held. A cap on videos + gigabytes bounds both.
 *
 * Annual is priced at ten months, so it reads as "2 months free" while also
 * covering the up-front AI spend of a large first upload batch.
 *
 * Prices and capacity come from PLAN_LIMITS so this page, usage metering and
 * future cap enforcement can never quote different numbers.
 */

type Billing = 'monthly' | 'annual';

interface Tier {
  id: PlanId;
  blurb: string;
  cta: string;
  featured?: boolean;
  /** Copy beyond the capacity lines, which are generated from PLAN_LIMITS. */
  extras: string[];
}

const TIERS: Tier[] = [
  {
    id: 'FREE',
    blurb: 'Enough queue to see it run on its own.',
    cta: 'Start free',
    extras: [
      'Full AI on every video',
      'TikTok, Reels & Shorts',
      'Automatic scheduling & publishing',
    ],
  },
  {
    id: 'CREATOR',
    blurb: 'For solo creators staying consistent.',
    cta: 'Choose Creator',
    featured: true,
    extras: ['Everything in Free', 'Roughly 10 months of daily posting'],
  },
  {
    id: 'PRO',
    blurb: 'For big batches and deep backlogs.',
    cta: 'Choose Pro',
    extras: ['Everything in Creator', 'Extra storage at $3/mo per 100 GB'],
  },
];

/** Capacity lines first, then the tier's own copy. */
function featuresFor(tier: Tier): string[] {
  const limits = PLAN_LIMITS[tier.id];
  const capacity = [
    `${limits.videos.toLocaleString()} videos in your library`,
    `${formatBytes(limits.storageBytes)} storage`,
  ];
  // "Everything in <lower tier>" reads first when present.
  const [inherits, ...rest] = tier.extras;
  return inherits?.startsWith('Everything in')
    ? [inherits, ...capacity, ...rest]
    : [...capacity, ...tier.extras];
}

export function PricingTiers() {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <>
      <div className="mt-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="bg-muted inline-flex items-center gap-1 rounded-full p-1"
        >
          {(['monthly', 'annual'] as const).map((option) => {
            const active = billing === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBilling(option)}
                className={`focus-visible:ring-ring rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option === 'monthly' ? 'Monthly' : 'Annual'}
                {/* Solid badge, not lime text: the brand lime only reads against
                    a dark foreground, never as type on a light ground. */}
                {option === 'annual' ? (
                  <span className="bg-primary text-primary-foreground ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
                    2 months free
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {TIERS.map((t) => {
          const limits = PLAN_LIMITS[t.id];
          const free = limits.monthly === 0;
          const amount = billing === 'monthly' ? limits.monthly : limits.annual;
          const unit = billing === 'monthly' ? '/mo' : '/yr';

          return (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                t.featured
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-border/60 bg-card shadow-sm'
              }`}
            >
              {t.featured ? (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-medium">
                  Most popular
                </span>
              ) : null}

              <h2 className="text-lg font-semibold">{limits.name}</h2>

              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${amount}</span>
                {free ? null : <span className="text-muted-foreground text-sm">{unit}</span>}
              </p>

              {/* Reserve the line on every card so the three prices stay aligned. */}
              <p className="text-muted-foreground mt-1 h-5 text-xs">
                {free || billing === 'monthly'
                  ? null
                  : `Billed yearly — $${(limits.annual / 12).toFixed(2)}/mo`}
              </p>

              <p className="text-muted-foreground mt-2 text-sm">{t.blurb}</p>

              <ul className="mt-6 space-y-3 text-sm">
                {featuresFor(t).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="text-foreground mt-0.5 h-4 w-4 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex-1" />

              <Button asChild className="w-full" variant={t.featured ? 'default' : 'outline'}>
                <Link href="/signin?mode=signup">
                  {t.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}
