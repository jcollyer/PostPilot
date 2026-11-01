import { Resend } from 'resend';

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';

const resend = process.env.AUTH_RESEND_KEY ? new Resend(process.env.AUTH_RESEND_KEY) : null;

/**
 * Send a transactional email through Resend. If no key is configured (e.g. a
 * fresh local clone) we log the link instead of throwing, so verification
 * never hard-blocks local development.
 *
 * The Resend SDK reports a rejected send in its return value rather than
 * throwing, so we throw it ourselves. Better Auth catches errors from its email
 * hooks and logs them, so a failed send shows up in the server logs instead of
 * vanishing.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    console.warn(`[auth] AUTH_RESEND_KEY not set — would send "${opts.subject}" to ${opts.to}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(`[auth] resend rejected "${opts.subject}": ${error.name} ${error.message}`);
  }
}
