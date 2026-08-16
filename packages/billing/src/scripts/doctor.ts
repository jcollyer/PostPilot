/**
 * Read-only check of the billing setup: what exists in Stripe, what's in .env,
 * and what's still missing.
 *
 *   npm run billing:doctor
 *
 * Creates and changes nothing — safe to run against a live key. Worth re-running
 * when switching from test to live mode, since prices, the portal config and
 * the webhook secret are all per-mode and none of them carry over.
 */

import Stripe from 'stripe';

import { PLAN_LIMITS } from '@postpilot/types';

import { PAID_PLAN_IDS, type BillingPeriod, type PaidPlanId } from '../config';

const ENV_NAME: Record<PaidPlanId, Record<BillingPeriod, string>> = {
  CREATOR: { monthly: 'STRIPE_PRICE_CREATOR_MONTHLY', annual: 'STRIPE_PRICE_CREATOR_ANNUAL' },
  PRO: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', annual: 'STRIPE_PRICE_PRO_ANNUAL' },
};

const ok = (s: string) => `  ✓ ${s}`;
const bad = (s: string) => `  ✗ ${s}`;
const warn = (s: string) => `  ! ${s}`;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      'STRIPE_SECRET_KEY is not set. Run this from the repo root: npm run billing:doctor',
    );
    process.exit(1);
  }

  const stripe = new Stripe(key, { appInfo: { name: 'PostPilot doctor' } });
  const mode = key.startsWith('sk_live') ? 'LIVE' : 'test';
  const todo: string[] = [];

  console.log(`\nBilling setup — ${mode} mode\n`);

  // --- Prices ---------------------------------------------------------------
  console.log('Prices');
  for (const plan of PAID_PLAN_IDS) {
    for (const period of ['monthly', 'annual'] as const) {
      const lookupKey = `postpilot_${plan.toLowerCase()}_${period}`;
      const envName = ENV_NAME[plan][period];
      const envValue = process.env[envName];

      const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      const price = found.data[0];
      const label = `${PLAN_LIMITS[plan].name} ${period}`;

      if (!price) {
        console.log(bad(`${label} — no price in Stripe`));
        todo.push('Run `npm run billing:setup` to create the products and prices.');
        continue;
      }
      if (!envValue) {
        console.log(bad(`${label} — exists in Stripe (${price.id}) but ${envName} is empty`));
        todo.push(`Set ${envName}="${price.id}" in .env`);
        continue;
      }
      if (envValue !== price.id) {
        console.log(
          warn(`${label} — .env has ${envValue} but Stripe's current price is ${price.id}`),
        );
        todo.push(`Update ${envName} to "${price.id}" in .env`);
        continue;
      }
      const dollars = (price.unit_amount ?? 0) / 100;
      console.log(ok(`${label} — $${dollars} (${price.id})`));
    }
  }

  // --- Customer Portal ------------------------------------------------------
  console.log('\nCustomer Portal');
  try {
    // `products` is not returned unless explicitly expanded — without this the
    // check reports zero products on a perfectly good configuration.
    const configs = await stripe.billingPortal.configurations.list({
      limit: 10,
      expand: ['data.features.subscription_update.products'],
    });
    const active = configs.data.find((c) => c.active);

    if (!active) {
      console.log(bad('no active configuration — "Manage subscription" will fail'));
      todo.push(
        'Enable the Customer Portal at https://dashboard.stripe.com/settings/billing/portal',
      );
    } else {
      console.log(ok(`active configuration (${active.id})`));

      const f = active.features;
      const check = (on: boolean | undefined, label: string, why: string) => {
        if (on) console.log(ok(label));
        else {
          console.log(warn(`${label} is off — ${why}`));
          todo.push(`Turn on "${label}" in the Customer Portal settings.`);
        }
      };

      check(
        f.payment_method_update?.enabled,
        'Update payment method',
        'a past_due customer has no way to fix their card',
      );
      check(
        f.subscription_cancel?.enabled,
        'Cancel subscription',
        'cancellation would have to go through support',
      );

      const update = f.subscription_update;
      if (update?.enabled) {
        const listed = update.products?.length ?? 0;
        console.log(ok(`Switch plans (${listed} product(s) listed)`));
        if (listed < PAID_PLAN_IDS.length) {
          console.log(
            warn(
              `only ${listed} of ${PAID_PLAN_IDS.length} products listed — upgrades may be blocked`,
            ),
          );
          todo.push('List both Creator and Pro (all four prices) under "Switch plans".');
        }
      } else {
        console.log(warn('Switch plans is off — upgrades/downgrades are impossible in the portal'));
        todo.push('Turn on "Switch plans" and list all four prices.');
      }
    }
  } catch (err) {
    console.log(bad(`could not read portal config: ${err instanceof Error ? err.message : err}`));
  }

  // --- Webhook --------------------------------------------------------------
  console.log('\nWebhook');
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    console.log(ok('STRIPE_WEBHOOK_SECRET is set'));
  } else {
    console.log(bad('STRIPE_WEBHOOK_SECRET is empty — plan changes will never be applied'));
    todo.push(
      'Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy the whsec_… it prints.',
    );
  }

  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    if (endpoints.data.length === 0) {
      console.log(
        warn(
          'no hosted endpoint registered (fine for local `stripe listen`, required in production)',
        ),
      );
    } else {
      for (const e of endpoints.data) {
        console.log(ok(`${e.url} — ${e.status}, ${e.enabled_events.length} event(s)`));
      }
    }
  } catch {
    console.log(warn('could not list webhook endpoints'));
  }

  // --- Summary --------------------------------------------------------------
  if (todo.length === 0) {
    console.log('\nEverything is configured.\n');
    return;
  }

  console.log('\nStill to do:\n');
  // De-duplicate: one missing setup run produces the same advice four times.
  for (const item of [...new Set(todo)]) console.log(`  • ${item}`);
  console.log('');
}

main().catch((err) => {
  console.error('\nCheck failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
