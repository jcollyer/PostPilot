const FALLBACK_MESSAGE = 'Could not sign in with Google.';

/**
 * User-facing copy for a failed Google sign-in, or null when the failure
 * should look like a cancel.
 *
 * Failures reach the screen two ways: as the `{ error }` of a Better Auth
 * response (the request to start the flow failed), or thrown when the auth
 * sheet returns to `postpilot:///signin?error=<code>`. The stock
 * @better-auth/expo plugin ignores that `error` param; our patch
 * (patches/@better-auth+expo+*.patch) makes it throw with the code on `.code`
 * and the provider's `error_description` as the message — or, when there
 * isn't one, just the code again, which isn't fit to show.
 */
export function googleSignInErrorMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return FALLBACK_MESSAGE;
  const { code, message } = err as { code?: unknown; message?: unknown };

  // Declined on Google's consent screen: the same as cancelling the sheet.
  if (code === 'access_denied') return null;

  // An email/password account with an unverified email exists for this
  // address; Better Auth won't link Google to it until the email is verified.
  if (code === 'account_not_linked') {
    return "This email already has a PostPilot account that isn't verified yet. Open the verification link we emailed you, then Continue with Google will work.";
  }

  if (typeof message === 'string' && message && message !== code) return message;
  return FALLBACK_MESSAGE;
}
