import type Stripe from 'stripe';

import { isLiveSubscriptionStatus } from './checkout';
import { getStripe } from './config';

/**
 * Metadata stamped on a subscription whose cancellation was scheduled by an
 * account deletion, so restoring the account undoes that cancellation and only
 * that one — never a cancellation the creator set up themselves.
 */
const DELETION_REASON = { key: 'cancelReason', value: 'account_deletion' } as const;

/** Running subscriptions on a customer, asked of Stripe rather than our copy. */
async function liveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  // The default listing already leaves out canceled subscriptions; the status
  // check drops the other dead one, incomplete_expired.
  const { data } = await getStripe().subscriptions.list({ customer: customerId, limit: 100 });
  return data.filter((subscription) => isLiveSubscriptionStatus(subscription.status));
}

/**
 * Cancel every running subscription on a customer, immediately.
 *
 * Used when an account is purged: there is no account left to keep paying
 * for. Asks Stripe rather than trusting the stored subscription id — a second
 * subscription opened during webhook lag would otherwise keep charging.
 *
 * Returns how many subscriptions were canceled. The resulting
 * `customer.subscription.deleted` webhooks find no user once the account is
 * gone, which the webhook reports rather than retries.
 */
export async function cancelAllSubscriptions(customerId: string): Promise<number> {
  const stripe = getStripe();
  const live = await liveSubscriptions(customerId);

  for (const subscription of live) {
    await stripe.subscriptions.cancel(subscription.id);
  }

  return live.length;
}

/**
 * Set every running subscription to end at its current period, for an account
 * that has just been deleted. The creator has paid for the period, so it runs
 * out rather than being cut short or refunded; it just doesn't renew.
 *
 * Subscriptions already set to cancel are left alone, so a restore can tell the
 * creator's own cancellation from this one. Returns how many were changed.
 */
export async function scheduleCancelForAccountDeletion(customerId: string): Promise<number> {
  const stripe = getStripe();
  const renewing = (await liveSubscriptions(customerId)).filter((s) => !s.cancel_at_period_end);

  for (const subscription of renewing) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
      metadata: { [DELETION_REASON.key]: DELETION_REASON.value },
    });
  }

  return renewing.length;
}

/**
 * Undo scheduleCancelForAccountDeletion when the account is restored. A
 * subscription that already ran out stays ended — the creator re-subscribes
 * from Settings. Returns how many were resumed.
 */
export async function resumeAfterAccountRestore(customerId: string): Promise<number> {
  const stripe = getStripe();
  const scheduled = (await liveSubscriptions(customerId)).filter(
    (s) => s.cancel_at_period_end && s.metadata?.[DELETION_REASON.key] === DELETION_REASON.value,
  );

  for (const subscription of scheduled) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      // An empty string deletes a metadata key in Stripe.
      metadata: { [DELETION_REASON.key]: '' },
    });
  }

  return scheduled.length;
}
