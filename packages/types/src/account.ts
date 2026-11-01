/**
 * How long a deleted account waits before it is purged for good.
 *
 * Deleting an account deactivates it at once — signed out everywhere, platforms
 * disconnected, publishing stopped, paid plan set not to renew — but the
 * library is kept this long so a creator who changes their mind can sign back
 * in and restore it. After that the account-deletion sweep removes the rows and
 * every stored file.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 60;

/** Days before the purge that the "last chance to restore" email goes out. */
export const ACCOUNT_DELETION_REMINDER_DAYS = 7;

/** When an account deleted at `requestedAt` is purged. */
export function accountDeletionDate(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Message on the FORBIDDEN error an account scheduled for deletion gets from
 * every ordinary API procedure. Clients match on it to send the user to the
 * restore screen.
 */
export const ACCOUNT_PENDING_DELETION = 'ACCOUNT_PENDING_DELETION';
