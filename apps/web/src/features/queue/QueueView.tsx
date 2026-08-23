'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Film,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Shuffle,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { AccountAvatar, PillAvatar } from '@/components/PlatformGlyph';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc/client';
import { QueueItemEditDialog, type QueueEditTarget } from './QueueItemEditDialog';
import { ScheduleEditor } from './ScheduleEditor';
import { formatDayHeading, formatSlot, formatTime } from './format';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type QueueItem = RouterOutputs['queue']['get']['items'][number];
type Upcoming = RouterOutputs['queue']['upcoming'];

/** The connected TikTok account, surfaced next to TikTok-bound queue items. */
type TikTokAccount = {
  avatarUrl: string | null;
  username: string | null;
  nickname: string | null;
};

/** The connected Instagram account, surfaced next to Instagram-bound items. */
type InstagramAccount = {
  avatarUrl: string | null;
  username: string | null;
};

/** The connected YouTube account, surfaced next to YouTube-bound items. */
type YouTubeAccount = {
  avatarUrl: string | null;
  username: string | null;
};

/** Every account handle the queue needs, keyed by platform. */
type Accounts = {
  tiktok: TikTokAccount | null;
  instagram: InstagramAccount | null;
  youtube: YouTubeAccount | null;
};

const PLATFORM_SHORT: Record<Platform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
};

/** How many published items to show before the "Show more" toggle. */
const PUBLISHED_CAP = 3;

/** Latest publish time across an item's tasks, in ms (0 when none). */
function latestPublishedAt(item: QueueItem): number {
  return item.tasks.reduce((max, t) => {
    const ts = t.publishedAt ? new Date(t.publishedAt).getTime() : 0;
    return ts > max ? ts : max;
  }, 0);
}

function mediaTitle(item: QueueItem): string {
  return item.media.title ?? item.media.originalFilename ?? 'Untitled';
}

export function QueueView() {
  const utils = trpc.useUtils();
  // Poll while anything is mid-publish so the UI tracks the worker.
  const queue = trpc.queue.get.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (i) =>
          i.status === 'PUBLISHING' ||
          i.tasks.some((t) => t.status === 'UPLOADING' || t.status === 'PROCESSING'),
      )
        ? 15000
        : false,
  });
  const upcoming = trpc.queue.upcoming.useQuery({ limit: 50 });

  // The connected TikTok account (one per user) — used to badge TikTok items.
  const tiktokInfo = trpc.connections.tiktokCreatorInfo.useQuery();
  const tiktok: TikTokAccount | null = tiktokInfo.data?.available
    ? {
        avatarUrl: tiktokInfo.data.info.creatorAvatarUrl,
        username: tiktokInfo.data.info.creatorUsername,
        nickname: tiktokInfo.data.info.creatorNickname,
      }
    : null;

  // The connected Instagram account — used to badge Instagram-bound items.
  const connections = trpc.connections.overview.useQuery();
  const instagram: InstagramAccount | null = useMemo(() => {
    const conn = connections.data?.find(
      (e) => e.platform === 'INSTAGRAM' && e.connection?.status === 'ACTIVE',
    )?.connection;
    return conn ? { avatarUrl: conn.avatarUrl, username: conn.username } : null;
  }, [connections.data]);

  // The connected YouTube account — used to badge YouTube-bound items.
  const youtube: YouTubeAccount | null = useMemo(() => {
    const conn = connections.data?.find(
      (e) => e.platform === 'YOUTUBE' && e.connection?.status === 'ACTIVE',
    )?.connection;
    return conn ? { avatarUrl: conn.avatarUrl, username: conn.username } : null;
  }, [connections.data]);

  const accounts: Accounts = { tiktok, instagram, youtube };

  const refresh = () => {
    utils.queue.get.invalidate();
    utils.queue.upcoming.invalidate();
  };

  const pause = trpc.queue.pause.useMutation({ onSuccess: refresh });
  const resume = trpc.queue.resume.useMutation({ onSuccess: refresh });
  const smartArrange = trpc.queue.smartArrange.useMutation({ onSuccess: refresh });
  const move = trpc.queue.move.useMutation({ onSettled: refresh });
  const removeItem = trpc.queue.removeItem.useMutation({ onSuccess: refresh });
  const skip = trpc.queue.skip.useMutation({ onSuccess: refresh });
  const unskip = trpc.queue.unskip.useMutation({ onSuccess: refresh });
  const retryPublish = trpc.queue.retryPublish.useMutation({ onSuccess: refresh });
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishNow = trpc.queue.publishNow.useMutation({
    onMutate: () => setPublishError(null),
    onSuccess: (res) => {
      refresh();
      if (!res.success) {
        setPublishError(
          res.reason === 'no_connection'
            ? "Connect an account for this video's platform(s) before publishing."
            : 'That item has nothing left to publish.',
        );
        return;
      }
      const failed = res.results.find((r) => r.outcome === 'failed' || r.outcome === 'held');
      setPublishError(
        failed
          ? `Couldn't publish to ${PLATFORM_LABELS[failed.platform]}: ${failed.detail ?? 'failed'}`
          : null,
      );
    },
  });
  const clearCompleted = trpc.queue.clearCompleted.useMutation({ onSuccess: refresh });

  // How many published items to show before "Show more".
  const [showAllPublished, setShowAllPublished] = useState(false);

  // The row whose "Edit details" panel is open (null = none). Both lists point
  // at the same library record, so either can open the editor.
  const [editTarget, setEditTarget] = useState<QueueEditTarget | null>(null);

  // Local mirror of the server order so drag feels instant.
  const serverItems = queue.data?.items ?? [];
  const [order, setOrder] = useState<QueueItem[]>(serverItems);
  useEffect(() => {
    setOrder(queue.data?.items ?? []);
  }, [queue.data]);

  const active = order.filter((i) => i.status !== 'SKIPPED' && i.status !== 'COMPLETED');
  // Most-recently-published first, so the cap keeps the freshest posts visible.
  const completed = order
    .filter((i) => i.status === 'COMPLETED')
    .sort((a, b) => latestPublishedAt(b) - latestPublishedAt(a));
  const skipped = order.filter((i) => i.status === 'SKIPPED');
  const visiblePublished = showAllPublished ? completed : completed.slice(0, PUBLISHED_CAP);

  // Multi-select for bulk actions on the "Up next" list.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Keep selection in sync with what's actually still active in the queue.
  useEffect(() => {
    setSelectedIds((prev) => {
      const activeSet = new Set(active.map((i) => i.id));
      const next = new Set([...prev].filter((id) => activeSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedActive = active.filter((i) => selectedIds.has(i.id));
  const selectedCount = selectedActive.length;
  const allSelected = active.length > 0 && selectedCount === active.length;
  const someSelected = selectedCount > 0;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      if (active.every((i) => prev.has(i.id))) return new Set();
      return new Set(active.map((i) => i.id));
    });

  const clearSelection = () => setSelectedIds(new Set());

  const bulkBusy = publishNow.isPending || skip.isPending || removeItem.isPending;

  const bulkPublish = () => {
    selectedActive.forEach((i) => publishNow.mutate({ itemId: i.id }));
    clearSelection();
  };
  const bulkSkip = () => {
    selectedActive.forEach((i) => skip.mutate({ itemId: i.id }));
    clearSelection();
  };
  const bulkDelete = () => {
    selectedActive.forEach((i) => removeItem.mutate({ itemId: i.id }));
    clearSelection();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = active.map((i) => i.id);
    const oldIndex = ids.indexOf(a.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;

    const newActive = arrayMove(active, oldIndex, newIndex);
    setOrder([...newActive, ...skipped]);
    const afterItemId = newIndex === 0 ? null : newActive[newIndex - 1]!.id;
    move.mutate({ itemId: a.id as string, afterItemId });
  };

  const isPaused = queue.data?.status === 'PAUSED';
  const busy = move.isPending || smartArrange.isPending;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.02em]">Queue</h1>
          {isPaused ? (
            <p className="border-warn-line bg-warn-soft text-warn mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium">
              <Pause className="h-3.5 w-3.5 flex-none" aria-hidden />
              Paused — {active.length} waiting. Nothing publishes until you resume.
            </p>
          ) : (
            <p className="text-muted-foreground mt-1.5 flex items-start gap-2 text-sm">
              {/* The dot only pulses when something really is queued to go out. */}
              {active.length > 0 ? (
                <span className="pp-live-dot mt-[0.4rem]" aria-hidden />
              ) : (
                <span
                  className="bg-muted-foreground/40 mt-[0.4rem] h-2 w-2 flex-none rounded-full"
                  aria-hidden
                />
              )}
              {active.length > 0 ? (
                <span>
                  <span className="text-foreground font-medium">{active.length} in rotation</span> —
                  PostPilot publishes the top of the queue at each scheduled time.
                </span>
              ) : (
                <span>Nothing in rotation.</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => smartArrange.mutate()}
            disabled={busy || active.length < 3}
            title="Reorder to space similar videos apart"
          >
            {smartArrange.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Shuffle className="h-4 w-4" aria-hidden />
            )}
            Smart arrange
          </Button>
          {isPaused ? (
            <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
              {resume.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Resume queue
            </Button>
          ) : (
            <Button variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
              <Pause className="h-4 w-4" aria-hidden />
              Pause queue
            </Button>
          )}
        </div>
      </header>

      {publishError ? (
        <p
          role="alert"
          className="border-danger-line bg-danger-soft text-danger flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          {publishError}
        </p>
      ) : null}

      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* The working list: what goes out, in what order. */}
        <section className="min-w-0">
          <div className="border-border bg-card overflow-hidden rounded-xl border">
            <div className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-3 sm:px-4">
              {active.length > 0 ? (
                <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={toggleSelectAll}
                    aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  />
                  <span className={someSelected ? 'font-medium' : 'text-muted-foreground'}>
                    {someSelected ? `${selectedCount} selected` : 'Up next'}
                  </span>
                </label>
              ) : (
                <span className="text-muted-foreground text-sm">Up next</span>
              )}

              {someSelected ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="outline" onClick={bulkPublish} disabled={bulkBusy}>
                    <Send className="h-3.5 w-3.5" aria-hidden /> Publish now
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkSkip} disabled={bulkBusy}>
                    <SkipForward className="h-3.5 w-3.5" aria-hidden /> Skip
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={bulkDelete}
                    disabled={bulkBusy}
                    className="text-danger hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                  </Button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-1 rounded p-1.5 focus-visible:outline-none focus-visible:ring-2"
                    aria-label="Clear selection"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>

            {queue.isLoading ? (
              <ul className="divide-line divide-y">
                {[0, 1, 2, 3].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </ul>
            ) : active.length === 0 ? (
              <EmptyQueue hasHistory={completed.length > 0} />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={active.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-line divide-y">
                    {active.map((item, index) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        index={index}
                        accounts={accounts}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onEdit={() =>
                          setEditTarget({
                            mediaId: item.media.id,
                            mediaType: item.media.mediaType,
                          })
                        }
                        onSkip={() => skip.mutate({ itemId: item.id })}
                        onRemove={() => removeItem.mutate({ itemId: item.id })}
                        onRetry={(taskId) => retryPublish.mutate({ taskId })}
                        onPublishNow={() => publishNow.mutate({ itemId: item.id })}
                        publishing={
                          publishNow.isPending && publishNow.variables?.itemId === item.id
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {completed.length > 0 ? (
            <Aside
              title="Published"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => clearCompleted.mutate()}
                  disabled={clearCompleted.isPending}
                  title="Remove all published items from this list (posts stay live)"
                >
                  {clearCompleted.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Clear published
                </Button>
              }
            >
              <ul className="divide-line divide-y">
                {visiblePublished.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <Thumb url={item.media.thumbnailUrl} />
                    <div className="min-w-0 flex-1">
                      <span className="block min-w-0 truncate text-sm">{mediaTitle(item)}</span>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {item.tasks.map((t) => (
                          <TaskChip
                            key={t.id}
                            task={t}
                            accounts={accounts}
                            onRetry={() => retryPublish.mutate({ taskId: t.id })}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem.mutate({ itemId: item.id })}
                      className="text-muted-foreground hover:text-danger focus-visible:ring-ring shrink-0 rounded p-1.5 focus-visible:outline-none focus-visible:ring-2"
                      aria-label={`Remove ${mediaTitle(item)} from the queue`}
                      title="Remove from queue (the post stays live)"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {completed.length > PUBLISHED_CAP ? (
                <button
                  type="button"
                  onClick={() => setShowAllPublished((v) => !v)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 rounded text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
                >
                  {showAllPublished ? 'Show less' : `Show ${completed.length - PUBLISHED_CAP} more`}
                </button>
              ) : null}
            </Aside>
          ) : null}

          {skipped.length > 0 ? (
            <Aside title="Skipped">
              <ul className="divide-line divide-y">
                {skipped.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span className="opacity-55">
                      <Thumb url={item.media.thumbnailUrl} />
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                      {mediaTitle(item)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unskip.mutate({ itemId: item.id })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </Aside>
          ) : null}
        </section>

        {/* The plan: when the engine will act. Reference material, so it sits on
            the page ground rather than in a panel of its own — the working list
            is the only thing here that should read as a surface. */}
        <aside className="min-w-0 space-y-10">
          <section>
            <ScheduleEditor onChanged={refresh} />
          </section>

          <section>
            <h2 className="text-sm font-medium">Upcoming posts</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              The next slots your schedules produce.
            </p>
            <div className="mt-3">
              <UpcomingList
                data={upcoming.data}
                loading={upcoming.isLoading}
                accounts={accounts}
                onEdit={(post) =>
                  setEditTarget({ mediaId: post.mediaId, mediaType: post.mediaType })
                }
              />
            </div>
          </section>
        </aside>
      </div>

      {editTarget ? (
        <QueueItemEditDialog
          target={editTarget}
          open={Boolean(editTarget)}
          onOpenChange={(o) => !o && setEditTarget(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A secondary list under the working queue — published, skipped. */
function Aside({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="border-line flex items-center justify-between gap-4 border-b pb-2">
        <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
        {action}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function EmptyQueue({ hasHistory }: { hasHistory: boolean }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-lg font-medium">
        {hasHistory ? 'Everything queued has gone out' : 'Nothing in the queue yet'}
      </p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed">
        Add ready videos from your library, set a posting schedule, and PostPilot takes it from
        there.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Button asChild size="sm">
          <a href="/media">Open library</a>
        </Button>
      </div>
    </div>
  );
}

/** A small square checkbox with optional indeterminate ("some selected") state. */
function Checkbox({
  checked,
  indeterminate,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="border-input accent-primary focus-visible:ring-ring h-4 w-4 shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
    />
  );
}

/** Rendered as a span so it stays valid inside the clickable upcoming rows. */
function Thumb({ url }: { url: string | null }) {
  return (
    <span className="bg-muted ring-line flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded ring-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Film className="text-muted-foreground h-4 w-4" aria-hidden />
      )}
    </span>
  );
}

/** Small round account avatar shown inside a platform pill. */
function PlatformAvatar({ url }: { url: string | null }) {
  return <PillAvatar url={url} className="-ml-0.5 h-3.5 w-3.5" />;
}

/** The account avatar to show inside a given platform's pill, if any. */
function platformAvatarUrl(platform: Platform, accounts: Accounts): string | null {
  if (platform === 'TIKTOK') return accounts.tiktok?.avatarUrl ?? null;
  if (platform === 'INSTAGRAM') return accounts.instagram?.avatarUrl ?? null;
  if (platform === 'YOUTUBE') return accounts.youtube?.avatarUrl ?? null;
  return null;
}

/** The connected handle for a platform, if any. */
function platformHandle(platform: Platform, accounts: Accounts): string | null {
  if (platform === 'TIKTOK') return accounts.tiktok?.username ?? null;
  if (platform === 'INSTAGRAM') return accounts.instagram?.username ?? null;
  if (platform === 'YOUTUBE') return accounts.youtube?.username ?? null;
  return null;
}

function SortableRow({
  item,
  index,
  accounts,
  selected,
  onToggleSelect,
  onEdit,
  onSkip,
  onRemove,
  onRetry,
  onPublishNow,
  publishing,
}: {
  item: QueueItem;
  index: number;
  accounts: Accounts;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onSkip: () => void;
  onRemove: () => void;
  onRetry: (taskId: string) => void;
  onPublishNow: () => void;
  publishing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const title = mediaTitle(item);

  // Clicking the row opens its edit panel, but the row is full of its own
  // controls (checkbox, drag handle, task chips, actions) — let any of those
  // handle the click themselves. The pencil below is the keyboard equivalent.
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, label')) return;
    // Selecting the title shouldn't also open the editor — a drag-select or a
    // double-click on a word would otherwise be swallowed by the panel.
    if (window.getSelection()?.toString()) return;
    onEdit();
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      onClick={onRowClick}
      className={`hover:bg-accent/40 group relative flex cursor-pointer items-center gap-2.5 px-3 py-3 transition-colors sm:gap-3 sm:px-4 ${
        isDragging
          ? 'bg-card relative z-10 shadow-[0_8px_24px_-8px_hsl(var(--foreground)/0.25)]'
          : ''
      } ${selected ? 'bg-accent' : ''}`}
    >
      <Checkbox
        checked={selected}
        onChange={onToggleSelect}
        aria-label={selected ? `Deselect ${title}` : `Select ${title}`}
      />

      {/* Position doubles as the drag handle: the number tells you where this
          sits in the rotation, and reaching for it is how you change that. */}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative h-7 w-5 shrink-0 cursor-grab touch-none rounded text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 active:cursor-grabbing sm:w-6"
        aria-label={`Reorder ${title}, currently ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        {/* The number gives way to the grip on hover. Touch devices never
            hover, so there the grip is simply always the visible state. */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0 [@media(hover:none)]:opacity-0"
        >
          {index + 1}
        </span>
        <GripVertical
          aria-hidden
          className="absolute inset-0 m-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        />
      </button>

      <Thumb url={item.media.thumbnailUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          {item.media.isDuplicate ? (
            <Copy
              className="text-warn h-3.5 w-3.5 shrink-0"
              aria-label="Possible duplicate"
              role="img"
            />
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <SlotLabel item={item} />
          {item.tasks.length > 0 ? (
            <>
              {item.tasks.map((t) => (
                <TaskChip key={t.id} task={t} accounts={accounts} onRetry={() => onRetry(t.id)} />
              ))}
              <AwaitingSlot
                platforms={item.postsTo.filter((p) => !item.tasks.some((t) => t.platform === p))}
                accounts={accounts}
              />
            </>
          ) : (
            <Destinations platforms={item.postsTo} accounts={accounts} />
          )}
        </div>
      </div>

      {/* Two shortcuts and a menu on a wide screen; on a phone the shortcuts
          fold into the menu, because the title needs those 80px more than the
          row needs a second click target. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onPublishNow}
          disabled={publishing}
          className="text-muted-foreground hover:text-foreground hover:bg-background focus-visible:ring-ring hidden rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 sm:inline-flex"
          aria-label={`Publish ${title} now`}
          title="Publish now, without waiting for its scheduled time"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground hover:bg-background focus-visible:ring-ring hidden rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 sm:inline-flex"
          aria-label={`Edit details for ${title}`}
          title="Edit details"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:bg-background focus-visible:ring-ring rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label={`More actions for ${title}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onPublishNow} className="cursor-pointer sm:hidden">
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Publish now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit} className="cursor-pointer sm:hidden">
              <Pencil className="mr-2 h-4 w-4" aria-hidden />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSkip} className="cursor-pointer">
              <SkipForward className="mr-2 h-4 w-4" aria-hidden />
              Skip this one
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRemove} className="text-danger cursor-pointer">
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Remove from queue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="bg-muted h-4 w-4 shrink-0 animate-pulse rounded" />
      <span className="bg-muted h-4 w-4 shrink-0 animate-pulse rounded" />
      <span className="bg-muted h-12 w-8 shrink-0 animate-pulse rounded" />
      <span className="flex-1 space-y-2">
        <span className="bg-muted block h-4 w-2/3 animate-pulse rounded" />
        <span className="bg-muted block h-3 w-1/3 animate-pulse rounded" />
      </span>
    </li>
  );
}

/**
 * When this item goes out.
 *
 * Its platforms don't have to share a slot: a video targeting all three can take
 * TikTok + YouTube from one schedule and Instagram from another, days apart. The
 * item's own `scheduledAt` is the earliest of those, so naming it alone would
 * imply a time most of the chips don't actually honor — hence the "+N more
 * times" hint, with each chip's tooltip carrying its own.
 */
function SlotLabel({ item }: { item: QueueItem }) {
  const extra = useMemo(() => {
    const times = new Set(item.tasks.map((t) => new Date(t.scheduledAt).getTime()));
    return Math.max(0, times.size - 1);
  }, [item.tasks]);

  if (!item.scheduledAt) return <span className="text-muted-foreground">Awaiting a slot</span>;
  return (
    <span className="text-foreground font-medium">
      {formatSlot(item.scheduledAt)}
      {extra > 0 ? (
        <span
          className="text-muted-foreground font-normal"
          title="This item's platforms publish at different scheduled times"
        >
          {` +${extra} more time${extra > 1 ? 's' : ''}`}
        </span>
      ) : null}
    </span>
  );
}

/** Shared chip geometry, so every destination pill sits on the same baseline. */
const CHIP = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-4';

/**
 * Where this item will post, shown before publish tasks are materialized (i.e.
 * while it's still awaiting a slot). Once scheduled, the per-platform TaskChips
 * convey the same destinations with live status, so this is only the fallback.
 */
function Destinations({ platforms, accounts }: { platforms: Platform[]; accounts: Accounts }) {
  if (platforms.length === 0) {
    return <span className="text-warn font-medium">No connected platforms</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">Posts to</span>
      {platforms.map((p) => {
        const handle = platformHandle(p, accounts);
        return (
          <span
            key={p}
            className={`${CHIP} bg-muted text-muted-foreground`}
            title={handle ? `${PLATFORM_LABELS[p]} · @${handle}` : PLATFORM_LABELS[p]}
          >
            <PlatformAvatar url={platformAvatarUrl(p, accounts)} />
            {PLATFORM_SHORT[p]}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Destinations this item is headed for that don't have a publish task yet.
 *
 * Platforms are materialized slot by slot, so an item can hold its Instagram
 * task while the TikTok/YouTube slot it needs is still past the scheduling
 * horizon. Rendered as dashed placeholders next to the live chips, because a row
 * showing one Instagram chip and nothing else is exactly what made the old
 * "posted to Instagram only" bug invisible.
 */
function AwaitingSlot({ platforms, accounts }: { platforms: Platform[]; accounts: Accounts }) {
  if (platforms.length === 0) return null;
  return (
    <>
      {platforms.map((p) => (
        <span
          key={p}
          className={`${CHIP} border-border text-muted-foreground border border-dashed`}
          title={`${PLATFORM_LABELS[p]} — awaiting a slot in your schedule`}
        >
          <PlatformAvatar url={platformAvatarUrl(p, accounts)} />
          {PLATFORM_SHORT[p]}
        </span>
      ))}
    </>
  );
}

type QueueTask = QueueItem['tasks'][number];

function TaskChip({
  task,
  accounts,
  onRetry,
}: {
  task: QueueTask;
  accounts: Accounts;
  onRetry: () => void;
}) {
  const label = PLATFORM_SHORT[task.platform];
  const full = PLATFORM_LABELS[task.platform];
  // Show the connected account avatar inside the pill (TikTok, Instagram, YouTube).
  const avatar = <PlatformAvatar url={platformAvatarUrl(task.platform, accounts)} />;
  const handle = platformHandle(task.platform, accounts);
  const at = handle ? ` · @${handle}` : '';

  if (task.status === 'PUBLISHED') {
    // A published post is the system working. It stays quiet — no colour, just
    // a tick — so the one failed chip beside it is impossible to miss.
    const cls = `${CHIP} bg-muted text-muted-foreground`;
    if (task.postUrl) {
      return (
        <a
          href={task.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cls} hover:text-foreground transition-colors`}
          title={`Posted to ${full}${at} — open the post`}
        >
          <Check className="h-3 w-3" aria-hidden /> {avatar} {label}{' '}
          <ExternalLink className="h-2.5 w-2.5" aria-hidden />
        </a>
      );
    }
    return (
      <span className={cls} title={`Posted to ${full}${at}`}>
        <Check className="h-3 w-3" aria-hidden /> {avatar} {label}
      </span>
    );
  }

  // UPLOADING = we're pushing the file to the platform; PROCESSING = the platform
  // has it and is transcoding. Both are "in flight" as far as the creator is
  // concerned, so both spin. Before UPLOADING existed, a YouTube upload — which
  // happens entirely inside one publish call — showed the gray "scheduled" chip
  // for its whole duration, indistinguishable from a post that hadn't started.
  if (task.status === 'UPLOADING' || task.status === 'PROCESSING') {
    const title =
      task.status === 'UPLOADING'
        ? `Uploading to ${full}${at}…`
        : `${full} is processing this post${at}…`;
    return (
      <span className={`${CHIP} bg-muted text-foreground font-medium`} title={title}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {avatar} {label}
      </span>
    );
  }

  if (task.status === 'FAILED' || task.status === 'HELD') {
    const title = task.needsConnection
      ? `${full}: reconnect needed — click to retry`
      : `${full}: ${task.lastError ?? 'failed'} — click to retry`;
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${CHIP} bg-danger-soft text-danger ring-danger-line hover:bg-danger-soft/70 font-medium ring-1 transition-colors`}
        title={title}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden /> {avatar} {label}{' '}
        <RefreshCw className="h-2.5 w-2.5" aria-hidden />
      </button>
    );
  }

  // SCHEDULED / PENDING. The time is per-task, not per-item — sibling platforms
  // can be on a different schedule entirely — so the chip carries its own.
  return (
    <span
      className={`${CHIP} bg-muted text-muted-foreground`}
      title={`Scheduled for ${full}${at} — ${formatSlot(task.scheduledAt)}`}
    >
      {avatar} {label}
    </span>
  );
}

function UpcomingList({
  data,
  loading,
  accounts,
  onEdit,
}: {
  data: Upcoming | undefined;
  loading: boolean;
  accounts: Accounts;
  onEdit: (post: Upcoming[number]) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Upcoming>();
    for (const post of data ?? []) {
      const key = formatDayHeading(post.scheduledAt);
      const arr = map.get(key) ?? [];
      arr.push(post);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [data]);

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm leading-relaxed">
        Nothing scheduled yet. Add a schedule and queued videos will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([day, posts]) => (
        <div key={day}>
          <p className="border-line text-foreground border-b pb-1.5 text-xs font-medium">{day}</p>
          <ul className="divide-line divide-y">
            {posts.map((p) => {
              const avatarUrl = platformAvatarUrl(p.platform, accounts);
              const handle =
                p.platform === 'TIKTOK'
                  ? (accounts.tiktok?.username ?? accounts.tiktok?.nickname ?? null)
                  : platformHandle(p.platform, accounts);
              return (
                <li key={p.taskId}>
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    title="Edit details"
                    className="hover:bg-accent/60 focus-visible:ring-ring group flex w-full items-baseline gap-3 rounded-md px-1.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span className="text-muted-foreground w-[4.5rem] shrink-0 text-xs tabular-nums">
                      {formatTime(p.scheduledAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.title ?? 'Untitled'}</span>
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                        <span>{PLATFORM_LABELS[p.platform]}</span>
                        {avatarUrl || handle ? (
                          <span className="flex min-w-0 items-center gap-1">
                            <span aria-hidden>·</span>
                            {avatarUrl ? (
                              <AccountAvatar
                                url={avatarUrl}
                                name={handle ?? PLATFORM_LABELS[p.platform]}
                              />
                            ) : null}
                            {handle ? (
                              <span className="truncate">
                                {handle.startsWith('@') ? handle : `@${handle}`}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      {p.needsConnection ? (
                        <span className="text-danger mt-0.5 block text-xs font-medium">
                          Held — reconnect {PLATFORM_LABELS[p.platform]} to publish this
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
