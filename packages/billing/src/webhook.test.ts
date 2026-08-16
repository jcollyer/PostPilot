import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The webhook is the only writer of plan state, so its failure modes are all
 * expensive: entitle someone who didn't pay, or cut off someone who did.
 *
 * The cases below are the ones Stripe's own delivery guarantees force on us —
 * duplicate events, out-of-order events, an unknown price, a customer this
 * deployment has never seen — plus the status boundary where access should and
 * shouldn't survive.
 */

const retrieve = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();

vi.mock('@postpilot/db', () => ({
  prisma: {
    user: {
      findUnique: (args: unknown) => findUnique(args),
      update: (args: unknown) => update(args),
    },
  },
}));

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return {
    ...actual,
    getStripe: () => ({ subscriptions: { retrieve: (id: string) => retrieve(id) } }),
  };
});

const { applyEvent } = await import('./webhook');

const PRICE_CREATOR = 'price_creator_monthly';
const PRICE_PRO = 'price_pro_annual';

/** A subscription shaped the way the 2025 API versions return one. */
function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: PRICE_CREATOR }, current_period_end: 1800000000 }],
    },
    metadata: {},
    ...overrides,
  };
}

function event(type: string, object: unknown) {
  return { type, data: { object } } as never;
}

/** The `data` written on the most recent user.update. */
function lastUpdate(): any {
  return update.mock.calls.at(-1)?.[0]?.data;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRIPE_PRICE_CREATOR_MONTHLY = PRICE_CREATOR;
  process.env.STRIPE_PRICE_PRO_ANNUAL = PRICE_PRO;
  findUnique.mockResolvedValue({ id: 'u1', plan: 'FREE', planSelectedAt: null });
  update.mockResolvedValue({});
  retrieve.mockResolvedValue(subscription());
});

describe('applyEvent', () => {
  it('entitles the plan matching the subscription price', async () => {
    const result = await applyEvent(event('customer.subscription.created', subscription()));

    expect(result).toMatchObject({ handled: true, userId: 'u1', plan: 'CREATOR' });
    expect(lastUpdate()).toMatchObject({
      plan: 'CREATOR',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionStatus: 'active',
      stripePriceId: PRICE_CREATOR,
    });
  });

  it('re-reads the subscription instead of trusting the event payload', async () => {
    // Stripe gives no ordering guarantee, so a stale `updated` can arrive after
    // the change it predates. The event says CREATOR; Stripe says PRO.
    retrieve.mockResolvedValue(
      subscription({ items: { data: [{ price: { id: PRICE_PRO }, current_period_end: 1 }] } }),
    );

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(result.plan).toBe('PRO');
  });

  it('is idempotent across duplicate deliveries', async () => {
    await applyEvent(event('customer.subscription.updated', subscription()));
    const first = lastUpdate();
    await applyEvent(event('customer.subscription.updated', subscription()));

    // At-least-once delivery: replaying must land on the same state.
    expect(lastUpdate()).toEqual(first);
  });

  it('keeps access while Stripe is still retrying a failed payment', async () => {
    retrieve.mockResolvedValue(subscription({ status: 'past_due' }));

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    expect(result.plan).toBe('CREATOR');
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired'])('downgrades on %s', async (status) => {
    retrieve.mockResolvedValue(subscription({ status }));

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    expect(result.plan).toBe('FREE');
    expect(lastUpdate()).toMatchObject({ plan: 'FREE' });
  });

  it('leaves the plan alone when the price is unknown to this deployment', async () => {
    findUnique.mockResolvedValue({ id: 'u1', plan: 'PRO', planSelectedAt: new Date() });
    retrieve.mockResolvedValue(
      subscription({
        items: { data: [{ price: { id: 'price_from_prod' }, current_period_end: 1 }] },
      }),
    );

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    // Guessing here would either hand out PRO or strip a paying customer.
    expect(result.plan).toBe('PRO');
  });

  it('reports rather than throws for a customer it cannot resolve', async () => {
    findUnique.mockResolvedValue(null);

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    // Throwing would make Stripe retry an event that can never succeed.
    expect(result.handled).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('falls back to subscription metadata when the customer id is unknown', async () => {
    findUnique
      .mockResolvedValueOnce(null) // by stripeCustomerId
      .mockResolvedValueOnce({ id: 'u9', plan: 'FREE', planSelectedAt: null }); // by metadata id
    retrieve.mockResolvedValue(subscription({ metadata: { userId: 'u9' } }));

    const result = await applyEvent(event('customer.subscription.updated', subscription()));

    expect(result).toMatchObject({ handled: true, userId: 'u9' });
  });

  it('reads the period end from the subscription item', async () => {
    await applyEvent(event('customer.subscription.updated', subscription()));

    expect(lastUpdate().currentPeriodEnd).toEqual(new Date(1800000000 * 1000));
  });

  it('falls back to a top-level period end on older API versions', async () => {
    retrieve.mockResolvedValue(
      subscription({
        items: { data: [{ price: { id: PRICE_CREATOR } }] },
        current_period_end: 1700000000,
      }),
    );

    await applyEvent(event('customer.subscription.updated', subscription()));

    expect(lastUpdate().currentPeriodEnd).toEqual(new Date(1700000000 * 1000));
  });

  it('stamps plan selection for a user who went straight to Checkout', async () => {
    await applyEvent(
      event('checkout.session.completed', { subscription: 'sub_1', client_reference_id: 'u1' }),
    );

    expect(lastUpdate().planSelectedAt).toBeInstanceOf(Date);
  });

  it('does not restamp selection for a user who already chose', async () => {
    const chosen = new Date('2026-01-01T00:00:00.000Z');
    findUnique.mockResolvedValue({ id: 'u1', plan: 'CREATOR', planSelectedAt: chosen });

    await applyEvent(event('customer.subscription.updated', subscription()));

    expect(lastUpdate().planSelectedAt).toBeUndefined();
  });

  it('ignores a checkout session with no subscription', async () => {
    const result = await applyEvent(event('checkout.session.completed', { subscription: null }));

    expect(result.handled).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores event types it does not model', async () => {
    const result = await applyEvent(event('invoice.created', {}));

    expect(result).toMatchObject({ handled: false, detail: 'ignored' });
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('isSignatureError', () => {
  it('identifies a Stripe signature failure', async () => {
    const Stripe = (await import('stripe')).default;
    const { isSignatureError } = await import('./webhook');

    // Provoke a real rejection rather than constructing the error class by
    // hand, so this keeps testing Stripe's actual behaviour across SDK bumps.
    let caught: unknown;
    try {
      new Stripe('sk_test_dummy').webhooks.constructEvent('{}', 't=1,v1=bad', 'whsec_dummy');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isSignatureError(caught)).toBe(true);
  });

  it('does not mistake a config or database failure for one', async () => {
    const { isSignatureError } = await import('./webhook');

    // These must produce a 500 so Stripe retries — a 400 would drop the event.
    expect(isSignatureError(new Error('missing STRIPE_WEBHOOK_SECRET'))).toBe(false);
    expect(isSignatureError(new Error('connection terminated'))).toBe(false);
    expect(isSignatureError(null)).toBe(false);
  });
});
