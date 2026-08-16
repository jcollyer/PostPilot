import Stripe from 'stripe';

import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';
import type { PlanId } from '@postpilot/types';

import { getStripe, planForPriceId } from './config';

/**
 * Stripe webhooks — the only writer of plan state.
 *
 * Nothing downstream of a redirect is trusted: a user can close the tab before
 * the success URL loads, and can equally well type the success URL by hand.
 * `checkout.session.completed` and `customer.subscription.*` are what Stripe
 * guarantees, so they are what moves a user between plans.
 *
 * Two properties this handler has to hold, because Stripe promises neither:
 *
 *  - **At-least-once delivery.** The same event can arrive twice. Every write
 *    here is a full overwrite of subscription state rather than an increment,
 *    so replaying an event changes nothing.
 *  - **No ordering guarantee.** A `subscription.updated` can land before the
 *    `subscription.created` it followed. Rather than trusting the event's
 *    snapshot, the subscription is re-fetched from Stripe and *that* is
 *    applied — whatever order events arrive in, the result is current.
 */

/** Stripe statuses under which the paid plan stays switched on. */
const ENTITLING_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  // Payment failed but Stripe is still retrying and the subscription is alive.
  // Cutting access on the first failed retry punishes an expired card far more
  // than it protects revenue; Stripe moves it to `canceled` or `unpaid` when it
  // genuinely gives up, and those do downgrade.
  'past_due',
]);

/**
 * Whether a failure was Stripe rejecting the signature.
 *
 * The distinction decides the status code, and the status code decides whether
 * Stripe retries: a forged or malformed signature will never verify no matter
 * how often it's resent (400, don't retry), whereas a database blip or a
 * missing secret is our problem and worth retrying (500). Checked against
 * Stripe's own error class rather than by matching the message, which changes.
 */
export function isSignatureError(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeSignatureVerificationError;
}

export interface WebhookResult {
  /** Stripe event type, for logging. */
  type: string;
  /** True when the event moved a user's billing state. */
  handled: boolean;
  userId?: string;
  plan?: PlanId;
  detail?: string;
}

/**
 * Verify a raw request body against the signature header and apply it.
 *
 * `rawBody` must be the exact bytes Stripe sent — any JSON round-trip breaks
 * the signature.
 */
export async function handleWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
  options: { client?: PrismaClient; webhookSecret?: string } = {},
): Promise<WebhookResult> {
  const secret = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('Billing is not configured: missing STRIPE_WEBHOOK_SECRET.');

  // Throws on a bad signature; the route turns that into a 400 so Stripe retries.
  const event = getStripe().webhooks.constructEvent(rawBody, signature, secret);

  return applyEvent(event, options.client ?? defaultPrisma);
}

/** Dispatch a verified event. Exported so tests can skip signature checking. */
export async function applyEvent(
  event: Stripe.Event,
  client: PrismaClient = defaultPrisma,
): Promise<WebhookResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!subscriptionId) {
        return { type: event.type, handled: false, detail: 'session had no subscription' };
      }
      return syncSubscription(subscriptionId, client, event.type);
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      return syncSubscription(subscription.id, client, event.type);
    }

    default:
      // Everything else is Stripe telling us about things we don't model.
      return { type: event.type, handled: false, detail: 'ignored' };
  }
}

/**
 * Period end moved from the subscription onto its items in the 2025 API
 * versions. Read the item first and fall back, so this keeps working across
 * an API version bump rather than silently writing null.
 */
function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const fromItem = subscription.items?.data?.[0]?.current_period_end;
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const seconds = fromItem ?? legacy;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/**
 * Re-read a subscription from Stripe and write the account's billing state to
 * match it. This is the single place `plan` changes.
 */
async function syncSubscription(
  subscriptionId: string,
  client: PrismaClient,
  eventType: string,
): Promise<WebhookResult> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const user = await resolveUser(customerId, subscription, client);
  if (!user) {
    // Nothing to update — most often a subscription from another environment
    // pointed at the same webhook endpoint. Reported, not thrown: throwing
    // makes Stripe retry forever on an event that can never succeed.
    return { type: eventType, handled: false, detail: `no user for customer ${customerId}` };
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const mapped = planForPriceId(priceId);
  const entitled = ENTITLING_STATUSES.has(subscription.status);

  // Unknown price + entitling status means this deployment can't tell what was
  // bought. Leave the plan alone rather than guessing, and record the status so
  // it's visible. Downgrades still apply — those don't depend on the price.
  const plan: PlanId = entitled ? (mapped?.plan ?? user.plan) : 'FREE';

  await client.user.update({
    where: { id: user.id },
    data: {
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripePriceId: priceId,
      currentPeriodEnd: periodEndOf(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      // A user arriving via Checkout without ever seeing the picker has still
      // chosen; don't show them the gate afterwards.
      ...(user.planSelectedAt ? {} : { planSelectedAt: new Date() }),
    },
  });

  if (entitled && !mapped) {
    console.warn(
      `[billing] subscription ${subscription.id} uses unknown price ${priceId}; plan left as ${plan}`,
    );
  }

  return { type: eventType, handled: true, userId: user.id, plan };
}

/**
 * Find the account behind a subscription: by stored customer id first, then by
 * the `userId` metadata stamped at creation. The fallback matters when the
 * customer was created but the local write that recorded its id did not land.
 */
async function resolveUser(
  customerId: string,
  subscription: Stripe.Subscription,
  client: PrismaClient,
) {
  const select = { id: true, plan: true, planSelectedAt: true } as const;

  const byCustomer = await client.user.findUnique({
    where: { stripeCustomerId: customerId },
    select,
  });
  if (byCustomer) return byCustomer;

  const userId = subscription.metadata?.userId;
  if (!userId) return null;

  return client.user.findUnique({ where: { id: userId }, select });
}
