import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Sign-in resends the verification email, so the cooldown is what stands
 * between a repeated sign-in loop and a flooded inbox. These cases pin down
 * when a send is allowed and what marker it leaves behind.
 */

const findFirst = vi.fn();
const deleteMany = vi.fn();
const create = vi.fn();

vi.mock('@postpilot/db', () => ({
  prisma: {
    verification: {
      findFirst: (args: unknown) => findFirst(args),
      deleteMany: (args: unknown) => deleteMany(args),
      create: (args: unknown) => create(args),
    },
  },
}));

const { claimVerificationEmailSlot, VERIFICATION_EMAIL_COOLDOWN_MS } =
  await import('./verification-cooldown');

const NOW = new Date('2026-10-14T12:00:00Z');

beforeEach(() => {
  findFirst.mockReset();
  deleteMany.mockReset().mockResolvedValue({ count: 0 });
  create.mockReset().mockResolvedValue({});
});

describe('claimVerificationEmailSlot', () => {
  it('allows a send and starts the cooldown when none is active', async () => {
    findFirst.mockResolvedValue(null);

    await expect(claimVerificationEmailSlot('a@example.com', NOW)).resolves.toBe(true);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'verification-email-cooldown:a@example.com' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        identifier: 'verification-email-cooldown:a@example.com',
        value: 'sent',
        expiresAt: new Date(NOW.getTime() + VERIFICATION_EMAIL_COOLDOWN_MS),
      },
    });
  });

  it('blocks a send while a cooldown is active, without touching the marker', async () => {
    findFirst.mockResolvedValue({ id: 'v1' });

    await expect(claimVerificationEmailSlot('a@example.com', NOW)).resolves.toBe(false);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        identifier: 'verification-email-cooldown:a@example.com',
        expiresAt: { gt: NOW },
      },
      select: { id: true },
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('treats differently-cased addresses as the same inbox', async () => {
    findFirst.mockResolvedValue(null);

    await claimVerificationEmailSlot('  A@Example.COM ', NOW);

    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { identifier: 'verification-email-cooldown:a@example.com' },
    });
  });
});
