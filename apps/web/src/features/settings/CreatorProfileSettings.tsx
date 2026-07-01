'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';

import {
  CreatorProfileFields,
  EMPTY_CREATOR_PROFILE_VALUES,
  parseBannedWords,
  toCreatorProfileFormValues,
  type CreatorProfileFormValues,
} from './CreatorProfileFields';

/**
 * /settings card for the CreatorProfile — the same fields shown in the
 * first-run onboarding modal (CreatorProfileOnboarding), so creators can
 * come back and tune their voice/niche/banned words anytime.
 */
export function CreatorProfileSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.creatorProfile.get.useQuery();

  const [values, setValues] = useState<CreatorProfileFormValues>(EMPTY_CREATOR_PROFILE_VALUES);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync from the server once loaded, same pattern as SettingsView's name
  // field — only on server-data change so mid-edit typing isn't clobbered.
  useEffect(() => {
    if (data) setValues(toCreatorProfileFormValues(data.profile));
  }, [data]);

  const update = trpc.creatorProfile.update.useMutation({
    onSuccess: () => {
      utils.creatorProfile.get.invalidate();
      setSavedAt(Date.now());
    },
  });

  const save = () => {
    setSavedAt(null);
    update.mutate({
      niche: values.niche.trim() || null,
      tone: values.tone.trim() || null,
      audience: values.audience.trim() || null,
      bannedWords: parseBannedWords(values.bannedWords),
      exampleCaption: values.exampleCaption.trim() || null,
      emojiPreference: values.emojiPreference,
    });
  };

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CreatorProfileFields values={values} onChange={setValues} idPrefix="settings-creator" />

      <div className="flex items-center justify-end gap-3">
        {savedAt && !update.isPending ? (
          <span className="text-muted-foreground text-sm">Saved.</span>
        ) : null}
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
