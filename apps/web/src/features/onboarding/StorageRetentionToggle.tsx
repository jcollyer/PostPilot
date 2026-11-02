'use client';

import { Switch } from '@/components/ui/switch';
import { useUpdateStorageSettings } from '@/features/settings/StorageSettings';
import { SOURCE_RETENTION_DAYS } from '@postpilot/types';
import { trpc } from '@/lib/trpc/client';

/**
 * The onboarding disclosure for source retention, shown under the plan cards.
 *
 * New accounts start with `deleteSourceAfterPublish` on (the column default), so
 * this renders pre-checked for them. It reflects the stored value rather than
 * assuming true, so an older account that reaches the plan gate sees what it
 * actually has. Every change is saved straight away through the same mutation
 * as Settings — there's nothing to submit, and choosing a plan doesn't depend
 * on it.
 */
export function StorageRetentionToggle() {
  const { data: me } = trpc.user.me.useQuery();
  const update = useUpdateStorageSettings();

  // Nothing to show until the real value is known: rendering a guess would be
  // the one place this could misstate what's switched on.
  if (!me) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">Free up space</p>
        <p className="text-muted-foreground text-sm">
          Remove original videos {SOURCE_RETENTION_DAYS} days after they&apos;re posted. Thumbnails,
          captions and post history stay. You can change this anytime in Settings.
        </p>
      </div>
      <Switch
        checked={me.deleteSourceAfterPublish}
        disabled={update.isPending}
        onCheckedChange={(next) => update.mutate({ deleteSourceAfterPublish: next })}
        aria-label="Free up space: remove original videos after they're posted"
      />
    </div>
  );
}
