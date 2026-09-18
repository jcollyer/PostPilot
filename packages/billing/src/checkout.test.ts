import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * hasLiveSubscription decides whether buying a plan opens Checkout or the
 * Portal. Wrong one way, a subscriber pays for a second subscription alongside
 * the first; wrong the other, someone whose subscription ended can't buy back in.
 */

const list = vi.fn();
const findUnique = vi.fn();

vi.mock('@postpilot/db', () => ({
  prisma: { user: { findUnique: (args: unknown) => findUnique(args) } },
}));

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return {
    ...actual,
    getStripe: () => ({ subscriptions: { list: (params: unknown) => list(params) } }),
  };
});

const { hasLiveSubscription, isLiveSubscriptionStatus } = await import('./checkout');

/** A page of subscriptions with these statuses, as subscriptions.list returns it. */
function page(...statuses: string[]) {
  return { data: statuses.map((status, i) => ({ id: `sub_${i}`, status })) };
}

beforeEach(() => {
  vi.resetAllMocks();
  findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
  list.mockResolvedValue(page());
});

describe('hasLiveSubscription', () => {
  it('is false without asking Stripe when the user has never been a customer', async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: null });

    expect(await hasLiveSubscription('u1')).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });

  it('is true while a subscription is running, including through dunning', async () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
      list.mockResolvedValue(page(status));
      expect(await hasLiveSubscription('u1'), status).toBe(true);
    }
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
  });

  it('is false once every subscription has ended, so a lapsed customer can buy again', async () => {
    list.mockResolvedValue(page('canceled', 'incomplete_expired'));

    expect(await hasLiveSubscription('u1')).toBe(false);
  });

  it('finds a running subscription among ended ones', async () => {
    list.mockResolvedValue(page('incomplete_expired', 'active'));

    expect(await hasLiveSubscription('u1')).toBe(true);
  });
});

describe('isLiveSubscriptionStatus', () => {
  it('treats a missing stored status as no subscription', () => {
    expect(isLiveSubscriptionStatus(null)).toBe(false);
    expect(isLiveSubscriptionStatus(undefined)).toBe(false);
  });
});
