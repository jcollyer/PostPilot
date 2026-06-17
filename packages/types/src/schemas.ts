import { z } from 'zod';

/**
 * Shared validation schemas. These live in their own package so the API
 * layer (server) and both clients (web + mobile) validate against the exact
 * same rules. Add new schemas here as your app grows.
 */

/** Payload for updating the signed-in user's profile. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(80, 'Name is too long'),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Payload for permanently deleting the signed-in user's account. */
export const deleteAccountSchema = z.object({
  // Must match the account email exactly (checked case-insensitively on the
  // server). Acts as a typed confirmation guard against accidental deletes.
  confirmEmail: z.string().trim().min(1, 'Please type your email to confirm'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
