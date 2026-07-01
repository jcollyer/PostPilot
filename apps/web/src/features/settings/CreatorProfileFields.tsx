'use client';

import { EMOJI_PREFERENCE_LABELS, type EmojiPreference } from '@postpilot/types';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Shared creator-profile form: fields for niche/tone/audience/banned
 * words/example caption/emoji preference — every one optional. Used by both
 * the settings card (CreatorProfileSettings) and the first-run onboarding
 * modal (CreatorProfileOnboarding), so the fields themselves live here as a
 * pure controlled component and each caller owns its own data-fetching,
 * saving, and layout/CTAs.
 */

export interface CreatorProfileFormValues {
  niche: string;
  tone: string;
  audience: string;
  /** Raw comma-separated text as typed — parsed to string[] on save. */
  bannedWords: string;
  exampleCaption: string;
  emojiPreference: EmojiPreference;
}

export const EMPTY_CREATOR_PROFILE_VALUES: CreatorProfileFormValues = {
  niche: '',
  tone: '',
  audience: '',
  bannedWords: '',
  exampleCaption: '',
  emojiPreference: 'MODERATE',
};

/** Shape of the profile row as returned by trpc.creatorProfile.get. */
export interface CreatorProfileRecord {
  niche: string | null;
  tone: string | null;
  audience: string | null;
  bannedWords: string[];
  exampleCaption: string | null;
  emojiPreference: EmojiPreference;
}

export function toCreatorProfileFormValues(
  profile: CreatorProfileRecord | null | undefined,
): CreatorProfileFormValues {
  if (!profile) return EMPTY_CREATOR_PROFILE_VALUES;
  return {
    niche: profile.niche ?? '',
    tone: profile.tone ?? '',
    audience: profile.audience ?? '',
    bannedWords: profile.bannedWords.join(', '),
    exampleCaption: profile.exampleCaption ?? '',
    emojiPreference: profile.emojiPreference,
  };
}

/** Comma-separated (not whitespace-split, so multi-word phrases survive), deduped, capped. */
export function parseBannedWords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

const EMOJI_OPTIONS = Object.entries(EMOJI_PREFERENCE_LABELS) as [EmojiPreference, string][];

export function CreatorProfileFields({
  values,
  onChange,
  idPrefix = 'creator-profile',
}: {
  values: CreatorProfileFormValues;
  onChange: (next: CreatorProfileFormValues) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof CreatorProfileFormValues>(
    key: K,
    value: CreatorProfileFormValues[K],
  ) => onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-niche`}>Niche</Label>
        <Input
          id={`${idPrefix}-niche`}
          value={values.niche}
          onChange={(e) => set('niche', e.target.value)}
          placeholder="e.g. Van life & budget travel"
          maxLength={80}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-tone`}>Tone</Label>
        <Input
          id={`${idPrefix}-tone`}
          value={values.tone}
          onChange={(e) => set('tone', e.target.value)}
          placeholder="e.g. Witty, a little sarcastic, never corporate"
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-audience`}>Audience</Label>
        <Input
          id={`${idPrefix}-audience`}
          value={values.audience}
          onChange={(e) => set('audience', e.target.value)}
          placeholder="e.g. 20-somethings saving up to travel"
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-banned`}>Words to avoid</Label>
        <Input
          id={`${idPrefix}-banned`}
          value={values.bannedWords}
          onChange={(e) => set('bannedWords', e.target.value)}
          placeholder="e.g. cheap, hustle, girl boss"
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated — phrases are fine. The AI will never use these.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-example`}>Example caption</Label>
        <textarea
          id={`${idPrefix}-example`}
          value={values.exampleCaption}
          onChange={(e) => set('exampleCaption', e.target.value)}
          placeholder="Paste a caption you've written that sounds like you…"
          rows={3}
          maxLength={2200}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-emoji`}>Emoji use</Label>
        <Select
          value={values.emojiPreference}
          onValueChange={(v) => set('emojiPreference', v as EmojiPreference)}
        >
          <SelectTrigger id={`${idPrefix}-emoji`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMOJI_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
