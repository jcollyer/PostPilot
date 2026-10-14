import { describe, expect, it } from 'vitest';

import { googleSignInErrorMessage } from './google-signin-error';

/** The shape our @better-auth/expo patch throws when the auth sheet returns `?error=<code>`. */
function oauthError(code: string, description?: string) {
  return Object.assign(new Error(description ?? code), { code });
}

describe('googleSignInErrorMessage', () => {
  it('explains an unverified email/password account that Google cannot link to', () => {
    const message = googleSignInErrorMessage(oauthError('account_not_linked'));
    expect(message).toMatch(/already has a PostPilot account/);
    expect(message).toMatch(/verif/i);
  });

  it('stays quiet when the user declines on the consent screen, like a cancel', () => {
    expect(googleSignInErrorMessage(oauthError('access_denied'))).toBeNull();
    expect(
      googleSignInErrorMessage(oauthError('access_denied', 'The user denied access.')),
    ).toBeNull();
  });

  it('uses the provider description for other OAuth errors', () => {
    expect(googleSignInErrorMessage(oauthError('server_error', 'Google is unavailable.'))).toBe(
      'Google is unavailable.',
    );
  });

  it('falls back to a generic message when the error carries only a code', () => {
    expect(googleSignInErrorMessage(oauthError('invalid_code'))).toBe(
      'Could not sign in with Google.',
    );
  });

  it('uses the message of a Better Auth error response', () => {
    expect(googleSignInErrorMessage({ message: 'Provider not found', status: 404 })).toBe(
      'Provider not found',
    );
  });

  it('falls back to a generic message for anything else', () => {
    expect(googleSignInErrorMessage(undefined)).toBe('Could not sign in with Google.');
    expect(googleSignInErrorMessage({ status: 500 })).toBe('Could not sign in with Google.');
  });
});
