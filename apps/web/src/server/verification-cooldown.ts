import { prisma } from '@postpilot/db';

/**
 * Per-address cooldown for verification emails.
 *
 * Better Auth sends a verification email on sign-up, on every sign-in by an
 * unverified user (`sendOnSignIn`), and from `/send-verification-email`. Its
 * IP rate limiter is in-memory per instance, so it doesn't stop repeated
 * sign-ins from flooding one inbox. Someone who signed up with another
 * person's address and keeps signing in would do exactly that. This caps it at
 * one email per address per window, whatever triggered it.
 *
 * The marker lives in the `verification` table (Better Auth's own tokens use
 * other identifiers), so the cooldown holds across server instances. The
 * check-then-write isn't atomic: two simultaneous requests can both send,
 * which is fine for this purpose.
 */
export const VERIFICATION_EMAIL_COOLDOWN_MS = 60_000;

function cooldownIdentifier(email: string): string {
  return `verification-email-cooldown:${email.trim().toLowerCase()}`;
}

/**
 * Returns true (and starts a new cooldown) when a verification email may be
 * sent to `email` now; false if one went out within the cooldown window.
 */
export async function claimVerificationEmailSlot(
  email: string,
  now = new Date(),
): Promise<boolean> {
  const identifier = cooldownIdentifier(email);
  const recent = await prisma.verification.findFirst({
    where: { identifier, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (recent) return false;

  await prisma.verification.deleteMany({ where: { identifier } });
  await prisma.verification.create({
    data: {
      identifier,
      value: 'sent',
      expiresAt: new Date(now.getTime() + VERIFICATION_EMAIL_COOLDOWN_MS),
    },
  });
  return true;
}
