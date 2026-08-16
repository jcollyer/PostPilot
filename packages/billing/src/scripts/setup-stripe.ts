/**
 * Create the PostPilot products and prices in your own Stripe account, then
 * print the four price ids to paste into .env.
 *
 * Run it from the repo root, which is where the .env wrapper lives:
 *
 *   npm run billing:setup
 *
 * (The workspace form, `npm run billing:setup --workspace=@postpilot/billing`,
 * skips that wrapper and so never sees STRIPE_SECRET_KEY — same convention as
 * ai:process and publish:due.)
 *
 * Idempotent: products and prices are looked up by a stable lookup key before
 * anything is created, so re-running it prints the same ids rather than
 * creating duplicates. Prices in Stripe are immutable — if you change what a
 * plan costs in PLAN_LIMITS, this creates a *new* price and prints its id;
 * existing subscribers stay on the price they signed up at until they move.
 *
 * Uses whatever STRIPE_SECRET_KEY is in your environment, so it hits test mode
 * with a test key and live mode with a live key. Check which one you're on
 * before running it.
 */

import Stripe from 'stripe';

import { PLAN_LIMITS } from '@postpilot/types';

import { PAID_PLAN_IDS, type BillingPeriod, type PaidPlanId } from '../config';

const ENV_NAME: Record<PaidPlanId, Record<BillingPeriod, string>> = {
  CREATOR: { monthly: 'STRIPE_PRICE_CREATOR_MONTHLY', annual: 'STRIPE_PRICE_CREATOR_ANNUAL' },
  PRO: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', annual: 'STRIPE_PRICE_PRO_ANNUAL' },
};

/** Stable identifiers so re-runs find what a previous run made. */
const productKey = (plan: PaidPlanId) => `postpilot_${plan.toLowerCase()}`;
const priceKey = (plan: PaidPlanId, period: BillingPeriod) =>
  `postpilot_${plan.toLowerCase()}_${period}`;

async function findProduct(stripe: Stripe, plan: PaidPlanId): Promise<Stripe.Product | null> {
  // Products have no lookup_key, so the id is set explicitly and fetched.
  try {
    return await stripe.products.retrieve(productKey(plan));
  } catch {
    return null;
  }
}

async function ensureProduct(stripe: Stripe, plan: PaidPlanId): Promise<Stripe.Product> {
  const existing = await findProduct(stripe, plan);
  if (existing && !existing.deleted) return existing;

  const limits = PLAN_LIMITS[plan];
  const gb = Math.round(limits.storageBytes / 1024 ** 3);

  return stripe.products.create({
    id: productKey(plan),
    name: `PostPilot ${limits.name}`,
    description: `${limits.videos.toLocaleString()} videos and ${gb} GB of storage, with full AI on every upload.`,
    metadata: { plan },
  });
}

async function ensurePrice(
  stripe: Stripe,
  plan: PaidPlanId,
  period: BillingPeriod,
  productId: string,
): Promise<Stripe.Price> {
  const lookupKey = priceKey(plan, period);

  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const existing = found.data[0];
  if (existing?.active) return existing;

  const limits = PLAN_LIMITS[plan];
  const dollars = period === 'monthly' ? limits.monthly : limits.annual;

  return stripe.prices.create({
    product: productId,
    lookup_key: lookupKey,
    unit_amount: dollars * 100,
    currency: 'usd',
    recurring: { interval: period === 'monthly' ? 'month' : 'year' },
    metadata: { plan, period },
  });
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      'STRIPE_SECRET_KEY is not set.\n\n' +
        'If it is already in your root .env, you probably ran this from the workspace.\n' +
        'Run it from the repo root instead, so the .env wrapper applies:\n\n' +
        '  npm run billing:setup\n',
    );
    process.exit(1);
  }

  const mode = key.startsWith('sk_live') ? 'LIVE' : 'test';
  console.log(`Setting up PostPilot products and prices in ${mode} mode…\n`);

  const stripe = new Stripe(key, { appInfo: { name: 'PostPilot setup' } });
  const env: string[] = [];

  for (const plan of PAID_PLAN_IDS) {
    const product = await ensureProduct(stripe, plan);
    console.log(`  ${PLAN_LIMITS[plan].name}: ${product.id}`);

    for (const period of ['monthly', 'annual'] as const) {
      const price = await ensurePrice(stripe, plan, period, product.id);
      const dollars = (price.unit_amount ?? 0) / 100;
      console.log(`    ${period.padEnd(7)} $${dollars} → ${price.id}`);
      env.push(`${ENV_NAME[plan][period]}="${price.id}"`);
    }
  }

  console.log('\nAdd these to your .env:\n');
  console.log(env.join('\n'));
  console.log(
    '\nThen enable the Customer Portal once at ' +
      'https://dashboard.stripe.com/settings/billing/portal\n',
  );
}

main().catch((err) => {
  console.error('\nSetup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
