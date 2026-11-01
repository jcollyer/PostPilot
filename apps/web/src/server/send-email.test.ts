import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The Resend SDK resolves with `{ error }` instead of throwing, which once let
 * every rejected verification/reset email disappear without a trace. These
 * cases pin down that a rejection surfaces as a thrown error.
 */

const send = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (args: unknown) => send(args) };
  },
}));

vi.stubEnv('AUTH_RESEND_KEY', 're_test');
vi.stubEnv('EMAIL_FROM', 'noreply@example.com');

const { sendEmail } = await import('./send-email');

const MESSAGE = { to: 'a@example.com', subject: 'Verify your email', html: '<p>hi</p>' };

beforeEach(() => {
  send.mockReset();
});

describe('sendEmail', () => {
  it('sends from EMAIL_FROM and resolves when Resend accepts', async () => {
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await expect(sendEmail(MESSAGE)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith({ from: 'noreply@example.com', ...MESSAGE });
  });

  it('throws when Resend rejects the send', async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'You can only send testing emails' },
    });

    await expect(sendEmail(MESSAGE)).rejects.toThrow(
      /resend rejected "Verify your email": validation_error You can only send testing emails/,
    );
  });
});
