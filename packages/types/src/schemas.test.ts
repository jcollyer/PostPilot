import { describe, it, expect } from 'vitest';

import {
  updateProfileSchema,
  deleteAccountSchema,
  updateCreatorProfileSchema,
} from './schemas';

describe('updateProfileSchema', () => {
  it('accepts a valid name and trims whitespace', () => {
    const parsed = updateProfileSchema.parse({ name: '  Jeremy  ' });
    expect(parsed.name).toBe('Jeremy');
  });

  it('rejects an empty name', () => {
    expect(updateProfileSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name longer than 80 chars', () => {
    expect(updateProfileSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });
});

describe('deleteAccountSchema', () => {
  it('requires a non-empty confirmEmail', () => {
    expect(deleteAccountSchema.safeParse({ confirmEmail: '' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirmEmail: 'a@b.com' }).success).toBe(true);
  });
});

describe('updateCreatorProfileSchema', () => {
  const base = {
    niche: 'drone travel',
    tone: 'upbeat',
    audience: 'creators',
    bannedWords: ['synergy'],
    exampleCaption: 'Check this out',
    emojiPreference: 'MODERATE' as const,
  };

  it('accepts a fully populated profile', () => {
    expect(updateCreatorProfileSchema.safeParse(base).success).toBe(true);
  });

  it('accepts nulls for optional text fields and an empty banned list', () => {
    const parsed = updateCreatorProfileSchema.parse({
      niche: null,
      tone: null,
      audience: null,
      bannedWords: [],
      exampleCaption: null,
      emojiPreference: 'NONE',
    });
    expect(parsed.niche).toBeNull();
    expect(parsed.bannedWords).toEqual([]);
  });

  it('rejects an invalid emoji preference', () => {
    expect(
      updateCreatorProfileSchema.safeParse({ ...base, emojiPreference: 'TONS' }).success,
    ).toBe(false);
  });

  it('rejects more than 50 banned words', () => {
    const bannedWords = Array.from({ length: 51 }, (_, i) => `w${i}`);
    expect(updateCreatorProfileSchema.safeParse({ ...base, bannedWords }).success).toBe(false);
  });
});
