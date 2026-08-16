import { prisma as defaultPrisma, type PrismaClient } from '@postpilot/db';

import { appBaseUrl, getStripe, priceIdFor, type BillingPeriod, type PaidPlanId } from './config';

/**
 * Hosted Checkout and Customer Portal.
 *
 * Both are hosted by Stripe on purpose: card entry, SCA, tax, upgrades,
 * downgrades, cancellation and invoice history all come for free, and no card
 * data ever reaches this app. At $5–12/mo there is no argument for rebuilding
 * any of it.
 */

/**
 * The user's Stripe customer, created on first need and remembered after.
 *
 * `metadata.userId` is set so a customer can be traced back to an account from
 * the Stripe dashboard, and so a webhook can still resolve the account if the
 * local `stripeCustomerId` write ever failed.
 */
export async function ensureCustomer(userId: string, client?: PrismaClient): Promise<string> {
  const prisma = client ?? defaultPrisma;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });
  if (!user) throw new Error(`Cannot create a Stripe customer: no user ${userId}.`);
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export interface CheckoutParams {
  userId: string;
  plan: PaidPlanId;
  period: BillingPeriod;
  /** Path to return to on success; defaults to the billing settings card. */
  successPath?: string;
  /** Path to return to when the user backs out. */
  cancelPath?: string;
  /**
   * Origin the user is browsing, so they return to the same one. Without it a
   * user on a tunnel URL comes back to localhost, where their session cookie
   * doesn't exist, and lands on the sign-in page.
   */
  requestOrigin?: string | null;
  client?: PrismaClient;
}

/**
 * A Checkout session for a paid plan. Returns the URL to send the user to.
 *
 * The resulting plan change is applied by the webhook, not by whatever happens
 * after the redirect — see handleWebhookEvent. The success URL only decides
 * what the user looks at next.
 */
export async function createCheckoutSession(params: CheckoutParams): Promise<string> {
  const { userId, plan, period } = params;
  const customerId = await ensureCustomer(userId, params.client);
  const base = appBaseUrl(params.requestOrigin);

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceIdFor(plan, period), quantity: 1 }],
    // Both are belt and braces for resolving the account in the webhook: the
    // customer lookup is the primary path, these are the fallbacks.
    client_reference_id: userId,
    subscription_data: { metadata: { userId, plan } },
    success_url: `${base}${params.successPath ?? '/settings?checkout=success'}#billing`,
    cancel_url: `${base}${params.cancelPath ?? '/settings?checkout=canceled'}#billing`,
    // Lets Stripe collect the address it needs for tax where applicable.
    billing_address_collection: 'auto',
    allow_promotion_codes: true,
  });

  if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
  return session.url;
}

/**
 * A Customer Portal session — where the user changes plan, switches monthly to
 * annual, updates their card, cancels, or pulls an invoice. Every one of those
 * comes back to us as a webhook.
 */
export async function createPortalSession(params: {
  userId: string;
  returnPath?: string;
  /** Origin the user is browsing; see CheckoutParams.requestOrigin. */
  requestOrigin?: string | null;
  client?: PrismaClient;
}): Promise<string> {
  const customerId = await ensureCustomer(params.userId, params.client);

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBaseUrl(params.requestOrigin)}${params.returnPath ?? '/settings'}#billing`,
  });

  return session.url;
}
