import { isLiveSubscriptionStatus } from './checkout';
import { getStripe } from './config';

/**
 * Cancel every running subscription on a customer, immediately.
 *
 * Used when an account is deleted: there is no account left to keep paying
 * for, so waiting for period end would only bill someone who no longer exists
 * here. Asks Stripe rather than trusting the stored subscription id — a second
 * subscription opened during webhook lag would otherwise keep charging.
 *
 * Returns how many subscriptions were canceled. The resulting
 * `customer.subscription.deleted` webhooks find no user once the account is
 * gone, which the webhook reports rather than retries.
 */
export async function cancelAllSubscriptions(customerId: string): Promise<number> {
  const stripe = getStripe();

  // The default listing already leaves out canceled subscriptions; the status
  // check drops the other dead one, incomplete_expired.
  const { data } = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
  const live = data.filter((subscription) => isLiveSubscriptionStatus(subscription.status));

  for (const subscription of live) {
    await stripe.subscriptions.cancel(subscription.id);
  }

  return live.length;
}
