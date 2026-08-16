import Stripe from 'stripe';

import type { PlanId } from '@postpilot/types';

/**
 * Stripe configuration.
 *
 * Required env:
 *   STRIPE_SECRET_KEY          sk_test_… / sk_live_…
 *   STRIPE_WEBHOOK_SECRET      whsec_… (from `stripe listen` or the dashboard)
 *   STRIPE_PRICE_CREATOR_MONTHLY / _ANNUAL
 *   STRIPE_PRICE_PRO_MONTHLY     / _ANNUAL
 * Optional:
 *   STRIPE_API_VERSION         pin a different API version
 *
 * Run `npm run billing:setup` from the repo root to create the products and
 * prices in your own Stripe account and print the four price ids.
 */

export type BillingPeriod = 'monthly' | 'annual';
/** Plans that are actually sold. FREE has no price and never hits Stripe. */
export type PaidPlanId = Exclude<PlanId, 'FREE'>;

export const PAID_PLAN_IDS: PaidPlanId[] = ['CREATOR', 'PRO'];

/** Env var holding the price id for each paid plan/period combination. */
const PRICE_ENV: Record<PaidPlanId, Record<BillingPeriod, string>> = {
  CREATOR: {
    monthly: 'STRIPE_PRICE_CREATOR_MONTHLY',
    annual: 'STRIPE_PRICE_CREATOR_ANNUAL',
  },
  PRO: {
    monthly: 'STRIPE_PRICE_PRO_MONTHLY',
    annual: 'STRIPE_PRICE_PRO_ANNUAL',
  },
};

/** True when there's enough configuration to talk to Stripe at all. */
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

/** Lazily-constructed, reused Stripe client. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Billing is not configured: missing STRIPE_SECRET_KEY.');
  }
  if (!client) {
    client = new Stripe(key, {
      ...(process.env.STRIPE_API_VERSION
        ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion }
        : {}),
      // Surfaces PostPilot in Stripe's request logs, which is what you search
      // when reconciling a charge against an account.
      appInfo: { name: 'PostPilot' },
    });
  }
  return client;
}

/** The configured Stripe price id for a plan + period. Throws when unset. */
export function priceIdFor(plan: PaidPlanId, period: BillingPeriod): string {
  const envName = PRICE_ENV[plan][period];
  const value = process.env[envName];
  if (!value) {
    throw new Error(
      `Billing is not configured: missing ${envName}. ` +
        'Run `npm run billing:setup` from the repo root to create prices.',
    );
  }
  return value;
}

/**
 * Reverse lookup: which plan and period a Stripe price id corresponds to.
 *
 * This is how a webhook turns a subscription into a plan. Returns null for a
 * price this deployment doesn't know about — an old price, or one from another
 * environment — so the caller can log and ignore rather than mis-assign a plan.
 */
export function planForPriceId(
  priceId: string | null | undefined,
): { plan: PaidPlanId; period: BillingPeriod } | null {
  if (!priceId) return null;
  for (const plan of PAID_PLAN_IDS) {
    for (const period of ['monthly', 'annual'] as const) {
      if (process.env[PRICE_ENV[plan][period]] === priceId) return { plan, period };
    }
  }
  return null;
}

/**
 * Absolute base URL that Stripe returns the user to.
 *
 * This has to match the origin they are actually browsing, not just some
 * configured value: the session cookie is scoped to that origin, so returning
 * to a different one lands them logged out. That is easy to hit in development,
 * where the app is reachable both on localhost and through an ngrok tunnel.
 *
 * Resolution order, and why:
 *   1. NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL — an explicit deployment URL wins.
 *      Host headers are caller-controlled, so in production the configured
 *      value is the authoritative one and is never overridden by a request.
 *   2. The origin of the request that asked for the session — what makes the
 *      ngrok and localhost cases both work without reconfiguring anything.
 *   3. localhost, as a last resort.
 */
export function appBaseUrl(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  const url = configured || requestOrigin || 'http://localhost:3000';
  return url.replace(/\/$/, '');
}

/**
 * Best-effort origin of an incoming request.
 *
 * `origin` is set by browsers on the fetch that carries a tRPC mutation and is
 * the most reliable. Behind a tunnel or proxy the forwarded headers carry the
 * public host while `host` is the internal one, so they are preferred over it.
 * Returns null when nothing usable is present (a non-HTTP caller, say), leaving
 * the configured fallback in charge.
 */
export function originFromHeaders(headers?: Headers | null): string | null {
  if (!headers) return null;

  const origin = headers.get('origin');
  if (origin && /^https?:\/\//.test(origin)) return origin;

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return null;

  // ngrok and most proxies terminate TLS, so the scheme has to come from the
  // forwarded header — deriving it from the socket would say http for an https
  // page and break the cookie on the way back.
  const proto =
    headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto.split(',')[0]!.trim()}://${host.split(',')[0]!.trim()}`;
}
