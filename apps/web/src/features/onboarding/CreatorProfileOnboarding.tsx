'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import {
  CreatorProfileFields,
  EMPTY_CREATOR_PROFILE_VALUES,
  parseBannedWords,
  toCreatorProfileFormValues,
  type CreatorProfileFormValues,
} from '@/features/settings/CreatorProfileFields';

/**
 * First-run modal: a few optional questions about the creator's niche/tone/
 * voice, used as AI style context (see @postpilot/ai-pipeline's
 * steps/metadata.ts). Shown once — gated on `creatorOnboardingCompletedAt`,
 * which is set on either save or skip, so it never reappears after a
 * decision either way. Mounted in the authenticated app layout so it can
 * surface on whatever page the creator lands on first.
 *
 * Every field is optional; skipping (or saving with everything blank) is a
 * completely valid outcome — the AI prompt just omits the block, same as
 * today.
 */
export function CreatorProfileOnboarding() {
  const utils = trpc.useUtils();
  const { data } = trpc.creatorProfile.get.useQuery();

  const [values, setValues] = useState<CreatorProfileFormValues>(EMPTY_CREATOR_PROFILE_VALUES);
  useEffect(() => {
    if (data?.profile) setValues(toCreatorProfileFormValues(data.profile));
  }, [data?.profile]);

  const invalidate = () => utils.creatorProfile.get.invalidate();
  const update = trpc.creatorProfile.update.useMutation({ onSuccess: invalidate });
  const skip = trpc.creatorProfile.skipOnboarding.useMutation({ onSuccess: invalidate });

  // Undefined while loading -> stay closed rather than flash open then shut.
  const shouldShow = data ? !data.onboardingCompleted : false;
  const busy = update.isPending || skip.isPending;

  const save = () => {
    update.mutate({
      niche: values.niche.trim() || null,
      tone: values.tone.trim() || null,
      audience: values.audience.trim() || null,
      bannedWords: parseBannedWords(values.bannedWords),
      exampleCaption: values.exampleCaption.trim() || null,
      emojiPreference: values.emojiPreference,
    });
  };

  return (
    <Dialog
      open={shouldShow}
      onOpenChange={(open) => {
        // Escape / outside-click / the header's X all count as "later" —
        // there's no ambiguous half-dismissed state to worry about.
        if (!open && !busy) skip.mutate();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Tell us about your content
          </DialogTitle>
          <DialogDescription>
            A few optional details help the AI write captions that actually sound like you. Skip
            anything you're not sure about — you can change these anytime in Settings.
          </DialogDescription>
        </DialogHeader>

        <CreatorProfileFields values={values} onChange={setValues} idPrefix="onboarding" />

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" onClick={() => skip.mutate()} disabled={busy}>
            Skip for now
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save & continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
