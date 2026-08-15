'use client';

import { Loader2 } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { SOURCE_RETENTION_DAYS } from '@postpilot/types';
import { trpc } from '@/lib/trpc/client';

/**
 * Opt-in control for removing published source files after the retention
 * window. Off by default and never enabled on the user's behalf — turning it on
 * eventually deletes their media, so the copy says exactly what goes, what
 * stays, and that it can't be undone.
 */
export function StorageSettings() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.user.me.useQuery();

  const update = trpc.user.updateStorageSettings.useMutation({
    // Flip optimistically so the switch feels instant, rolling back on error.
    onMutate: async ({ deleteSourceAfterPublish }) => {
      await utils.user.me.cancel();
      const prev = utils.user.me.getData();
      utils.user.me.setData(undefined, (old) => (old ? { ...old, deleteSourceAfterPublish } : old));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.user.me.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.user.me.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!me) {
    return <p className="text-muted-foreground text-sm">Couldn&apos;t load your settings.</p>;
  }

  const enabled = me.deleteSourceAfterPublish;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-none">Remove source files after publishing</p>
          <p className="text-muted-foreground text-sm">
            Once a video has been posted everywhere it was queued for, its original file is deleted{' '}
            {SOURCE_RETENTION_DAYS} days later.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={update.isPending}
          onCheckedChange={(next) => update.mutate({ deleteSourceAfterPublish: next })}
          aria-label="Remove source files after publishing"
        />
      </div>

      <div className="text-muted-foreground space-y-2 text-sm">
        <p>
          <span className="text-foreground font-medium">What stays:</span> the library entry, its
          thumbnail, title, caption, hashtags, and links to your live posts. Videos still waiting on
          any platform keep their file until every platform is done.
        </p>
        <p>
          <span className="text-foreground font-medium">What goes:</span> the original upload. You
          won&apos;t be able to re-post or re-run AI on that video, and it can&apos;t be recovered —
          download anything you want to keep first.
        </p>
        {enabled ? (
          <p>
            Turning this off stops future deletions, but files already removed are gone for good.
          </p>
        ) : null}
      </div>
    </div>
  );
}
