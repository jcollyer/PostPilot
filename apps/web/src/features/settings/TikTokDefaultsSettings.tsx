'use client';

import { Loader2 } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc/client';

/**
 * Per-account TikTok posting defaults. TikTok's Direct Post guidelines say
 * interactions must not be pre-checked for the creator, so comments stay off
 * until they turn this on themselves. It only seeds TikTok options created
 * afterwards; each video's own TikTok settings can still change it.
 */
export function TikTokDefaultsSettings() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.user.me.useQuery();
  const update = trpc.user.updateTiktokDefaults.useMutation({
    onMutate: async ({ tiktokAllowCommentsDefault }) => {
      await utils.user.me.cancel();
      const prev = utils.user.me.getData();
      utils.user.me.setData(undefined, (old) =>
        old ? { ...old, tiktokAllowCommentsDefault } : old,
      );
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

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">Allow comments on new TikTok posts</p>
        <p className="text-muted-foreground text-sm">
          New videos start with comments turned on. You can still change it per video. Videos
          already in your library keep their current setting.
        </p>
      </div>
      <Switch
        checked={me.tiktokAllowCommentsDefault}
        disabled={update.isPending}
        onCheckedChange={(next) => update.mutate({ tiktokAllowCommentsDefault: next })}
        aria-label="Allow comments on new TikTok posts"
      />
    </div>
  );
}
