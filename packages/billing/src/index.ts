// Configuration + Stripe client
export {
  getStripe,
  isBillingConfigured,
  priceIdFor,
  planForPriceId,
  appBaseUrl,
  originFromHeaders,
  PAID_PLAN_IDS,
  type BillingPeriod,
  type PaidPlanId,
} from './config';

// Hosted Checkout + Customer Portal
export {
  ensureCustomer,
  createCheckoutSession,
  createPortalSession,
  type CheckoutParams,
} from './checkout';

// Webhooks — the only writer of plan state
export { handleWebhookEvent, applyEvent, isSignatureError, type WebhookResult } from './webhook';
