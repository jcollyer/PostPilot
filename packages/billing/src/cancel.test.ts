import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * cancelAllSubscriptions runs when an account is deleted. Missing a running
 * subscription keeps charging someone who no longer has an account.
 */

const list = vi.fn();
const cancel = vi.fn();

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return {
    ...actual,
    getStripe: () => ({
      subscriptions: {
        list: (params: unknown) => list(params),
        cancel: (id: string) => cancel(id),
      },
    }),
  };
});

const { cancelAllSubscriptions } = await import('./cancel');

/** A page of subscriptions with these statuses, as subscriptions.list returns it. */
function page(...statuses: string[]) {
  return { data: statuses.map((status, i) => ({ id: `sub_${i}`, status })) };
}

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue(page());
  cancel.mockResolvedValue({});
});

describe('cancelAllSubscriptions', () => {
  it('cancels every running subscription on the customer, including a duplicate', async () => {
    list.mockResolvedValue(page('active', 'past_due'));

    expect(await cancelAllSubscriptions('cus_1')).toBe(2);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(['sub_0', 'sub_1']);
  });

  it('leaves subscriptions that have already ended alone', async () => {
    list.mockResolvedValue(page('canceled', 'incomplete_expired', 'trialing'));

    expect(await cancelAllSubscriptions('cus_1')).toBe(1);
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(['sub_2']);
  });

  it('does nothing for a customer with no subscriptions', async () => {
    expect(await cancelAllSubscriptions('cus_1')).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('throws when Stripe refuses a cancel, so the account is not deleted', async () => {
    list.mockResolvedValue(page('active'));
    cancel.mockRejectedValue(new Error('stripe down'));

    await expect(cancelAllSubscriptions('cus_1')).rejects.toThrow('stripe down');
  });
});
