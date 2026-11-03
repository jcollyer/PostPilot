import { isEmailConfigured, sendEmail } from '@postpilot/notifications';

import type { AccountEmail } from './emails';

/** Send an account email; never throws, reports whether it went. */
export async function trySend(to: string, email: AccountEmail, context: string): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn(`[accounts] email is not configured — not sending ${context} to ${to}`);
    return false;
  }
  try {
    await sendEmail({ to, subject: email.subject, text: email.text });
    return true;
  } catch (err) {
    console.error(
      `[accounts] failed to send ${context}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
