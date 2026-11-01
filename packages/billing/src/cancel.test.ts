import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * These run around account deletion. Missing a running subscription keeps
 * charging someone who no longer has an account; resuming the wrong one undoes
 * a cancellation the creator chose for themselves.
 */

const list = vi.fn();
const cancel = vi.fn();
const update = vi.fn();

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return {
    ...actual,
    getStripe: () => ({
      subscriptions: {
        list: (params: unknown) => list(params),
        cancel: (id: string) => cancel(id),
        update: (id: string, params: unknown) => update(id, params),
      },
    }),
  };
});

const { cancelAllSubscriptions, scheduleCancelForAccountDeletion, resumeAfterAccountRestore } =
  await import('./cancel');

/** A page of subscriptions with these statuses, as subscriptions.list returns it. */
function page(...statuses: string[]) {
  return { data: statuses.map((status, i) => ({ id: `sub_${i}`, status })) };
}

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue(page());
  cancel.mockResolvedValue({});
  update.mockResolvedValue({});
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

/** A subscription as subscriptions.list returns it, with the fields these read. */
function sub(id: string, status: string, cancelAtPeriodEnd = false, metadata = {}) {
  return { id, status, cancel_at_period_end: cancelAtPeriodEnd, metadata };
}

describe('scheduleCancelForAccountDeletion', () => {
  it('sets renewing subscriptions to end at period end, tagged as a deletion', async () => {
    list.mockResolvedValue({ data: [sub('sub_a', 'active'), sub('sub_b', 'canceled')] });

    expect(await scheduleCancelForAccountDeletion('cus_1')).toBe(1);
    expect(update).toHaveBeenCalledWith('sub_a', {
      cancel_at_period_end: true,
      metadata: { cancelReason: 'account_deletion' },
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('leaves a subscription the creator already set to cancel untagged', async () => {
    list.mockResolvedValue({ data: [sub('sub_a', 'active', true)] });

    expect(await scheduleCancelForAccountDeletion('cus_1')).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('resumeAfterAccountRestore', () => {
  it('resumes only the subscriptions the deletion scheduled to cancel', async () => {
    list.mockResolvedValue({
      data: [
        sub('sub_ours', 'active', true, { cancelReason: 'account_deletion' }),
        sub('sub_theirs', 'active', true),
        sub('sub_renewing', 'active'),
      ],
    });

    expect(await resumeAfterAccountRestore('cus_1')).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('sub_ours', {
      cancel_at_period_end: false,
      metadata: { cancelReason: '' },
    });
  });

  it('cannot revive a subscription that already ran out', async () => {
    list.mockResolvedValue({
      data: [sub('sub_ours', 'canceled', true, { cancelReason: 'account_deletion' })],
    });

    expect(await resumeAfterAccountRestore('cus_1')).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
