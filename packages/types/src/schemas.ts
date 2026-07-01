import { z } from 'zod';

import { emojiPreferenceSchema } from './domain';

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

/**
 * Full-replace payload for the signed-in user's CreatorProfile — explicit
 * voice/context instructions injected into every AI metadata generation run
 * (see @postpilot/ai-pipeline's steps/metadata.ts). Every field is nullable
 * (or empty-array) rather than optional: the client always sends the whole
 * form, and null/[] means "not set," not "leave unchanged."
 */
export const updateCreatorProfileSchema = z.object({
  niche: z.string().trim().max(80).nullable(),
  tone: z.string().trim().max(200).nullable(),
  audience: z.string().trim().max(200).nullable(),
  // Words/phrases the AI must never use. Phrases are allowed (not split on
  // whitespace), so keep the per-item cap generous.
  bannedWords: z.array(z.string().trim().min(1).max(60)).max(50),
  exampleCaption: z.string().trim().max(2200).nullable(),
  emojiPreference: emojiPreferenceSchema,
});
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;
