import { appBaseUrl } from '@postpilot/billing';
import { ACCOUNT_DELETION_REMINDER_DAYS } from '@postpilot/types';

/**
 * Account-lifecycle emails. Transactional, so they go straight to Resend rather
 * than through the alert pipeline: notification preferences don't apply, and a
 * deleted account has no queue alerts left to throttle against.
 */

export interface AccountEmail {
  subject: string;
  text: string;
}

interface Recipient {
  name: string | null;
  timezone: string;
}

/** "December 31, 2026" in the creator's own timezone. */
function formatDate(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: timezone });
  } catch {
    // An unrecognised zone shouldn't cost the creator their notice.
    return date.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
  }
}

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi,';
}

/** Sent the moment an account is deleted. */
export function deletionConfirmationEmail(user: Recipient, scheduledFor: Date): AccountEmail {
  const date = formatDate(scheduledFor, user.timezone);
  return {
    subject: 'Your PostPilot account is scheduled for deletion',
    text: [
      greeting(user.name),
      '',
      "We've deactivated your PostPilot account as you asked. You've been signed out everywhere, your connected platforms have been disconnected, and nothing more will be published. If you're on a paid plan, it won't renew.",
      '',
      `Your account and media library will be permanently deleted on ${date}. If you change your mind, sign in before then and choose Restore:`,
      `${appBaseUrl()}/signin`,
      '',
      "If you didn't ask for this, sign in and restore your account, then change your password.",
      '',
      '— PostPilot',
    ].join('\n'),
  };
}

/** Sent ACCOUNT_DELETION_REMINDER_DAYS before the purge. */
export function deletionReminderEmail(user: Recipient, scheduledFor: Date): AccountEmail {
  const date = formatDate(scheduledFor, user.timezone);
  return {
    subject: `Your PostPilot account will be deleted on ${date}`,
    text: [
      greeting(user.name),
      '',
      `This is your last reminder: in ${ACCOUNT_DELETION_REMINDER_DAYS} days, on ${date}, your PostPilot account and everything in your media library will be permanently deleted. This can't be undone.`,
      '',
      'To keep your account, sign in and choose Restore:',
      `${appBaseUrl()}/signin`,
      '',
      "If you meant to leave, there's nothing you need to do.",
      '',
      '— PostPilot',
    ].join('\n'),
  };
}
