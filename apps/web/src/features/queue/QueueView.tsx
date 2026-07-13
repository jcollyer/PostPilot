'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Film,
  GripVertical,
  Loader2,
  Pause,
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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
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

const PLATFORM_SHORT: Record<Platform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'IG',
  YOUTUBE: 'YT',
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

export function QueueView() {
  const utils = trpc.useUtils();
  // Poll while anything is mid-publish so the UI tracks the worker.
  const queue = trpc.queue.get.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (i) => i.status === 'PUBLISHING' || i.tasks.some((t) => t.status === 'PROCESSING'),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="text-muted-foreground text-sm">
            {active.length} in rotation · PostPilot publishes the top of the queue at each scheduled
            time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => smartArrange.mutate()}
            disabled={busy || active.length < 3}
            title="Reorder to space similar videos apart"
          >
            {smartArrange.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shuffle className="mr-2 h-4 w-4" />
            )}
            Smart arrange
          </Button>
          {isPaused ? (
            <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play className="mr-2 h-4 w-4" /> Resume queue
            </Button>
          ) : (
            <Button variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
              <Pause className="mr-2 h-4 w-4" /> Pause queue
            </Button>
          )}
        </div>
      </div>

      {isPaused ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The queue is paused — nothing will publish until you resume.
        </div>
      ) : null}

      {publishError ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {publishError}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Up next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queue.isLoading ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : active.length === 0 ? (
                <EmptyQueue />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <label className="text-muted-foreground flex cursor-pointer select-none items-center gap-2 text-sm">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={toggleSelectAll}
                        aria-label={allSelected ? 'Deselect all' : 'Select all'}
                      />
                      {someSelected ? `${selectedCount} selected` : 'Select all'}
                    </label>

                    {someSelected ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={bulkPublish}
                          disabled={bulkBusy}
                          title="Publish the selected items now"
                        >
                          <Send className="mr-1 h-4 w-4" /> Publish now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={bulkSkip}
                          disabled={bulkBusy}
                          title="Skip the selected items"
                        >
                          <SkipForward className="mr-1 h-4 w-4" /> Skip
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={bulkDelete}
                          disabled={bulkBusy}
                          className="text-destructive hover:text-destructive"
                          title="Remove the selected items from the queue"
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Delete
                        </Button>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-muted-foreground hover:text-foreground p-1"
                          aria-label="Clear selection"
                          title="Clear selection"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={active.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-2">
                        {active.map((item) => (
                          <SortableRow
                            key={item.id}
                            item={item}
                            tiktok={tiktok}
                            instagram={instagram}
                            youtube={youtube}
                            selected={selectedIds.has(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
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
                </>
              )}

              {completed.length > 0 ? (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Published
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => clearCompleted.mutate()}
                      disabled={clearCompleted.isPending}
                      title="Remove all published items from this list (posts stay live)"
                    >
                      {clearCompleted.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-4 w-4" />
                      )}
                      Clear published
                    </Button>
                  </div>
                  {visiblePublished.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-md border p-2">
                      <Thumb url={item.video.thumbnailUrl} />
                      <div className="min-w-0 flex-1">
                        <span className="block min-w-0 truncate text-sm font-medium">
                          {item.video.title ?? item.video.originalFilename ?? 'Untitled'}
                        </span>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          {item.tasks.map((t) => (
                            <TaskChip
                              key={t.id}
                              task={t}
                              tiktok={tiktok}
                              instagram={instagram}
                              youtube={youtube}
                              onRetry={() => retryPublish.mutate({ taskId: t.id })}
                            />
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem.mutate({ itemId: item.id })}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Remove from queue
                      </Button>
                    </div>
                  ))}
                  {completed.length > PUBLISHED_CAP ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setShowAllPublished((v) => !v)}
                    >
                      {showAllPublished
                        ? 'Show less'
                        : `Show ${completed.length - PUBLISHED_CAP} more`}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {skipped.length > 0 ? (
                <div className="space-y-2 pt-3">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Skipped
                  </p>
                  {skipped.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-dashed p-2 opacity-70"
                    >
                      <Thumb url={item.video.thumbnailUrl} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.video.title ?? item.video.originalFilename ?? 'Untitled'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unskip.mutate({ itemId: item.id })}
                      >
                        <RotateCcw className="mr-1 h-4 w-4" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleEditor onChanged={refresh} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" /> Upcoming posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingList
                data={upcoming.data}
                loading={upcoming.isLoading}
                tiktok={tiktok}
                instagram={instagram}
                youtube={youtube}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Film className="text-muted-foreground h-7 w-7" />
      <p className="font-medium">Your queue is empty</p>
      <p className="text-muted-foreground max-w-xs text-sm">
        Add ready videos from your Media Library, set a schedule, and PostPilot takes it from there.
      </p>
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
      className="border-input accent-primary h-4 w-4 shrink-0 cursor-pointer rounded"
    />
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="bg-muted flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Film className="text-muted-foreground h-4 w-4" />
      )}
    </div>
  );
}

/** Small round account avatar shown inside a platform pill. */
function PlatformAvatar({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="-ml-0.5 h-3.5 w-3.5 shrink-0 rounded-full object-cover"
    />
  );
}

/** The account avatar to show inside a given platform's pill, if any. */
function platformAvatarUrl(
  platform: Platform,
  tiktok: TikTokAccount | null,
  instagram: InstagramAccount | null,
  youtube: YouTubeAccount | null,
): string | null {
  if (platform === 'TIKTOK') return tiktok?.avatarUrl ?? null;
  if (platform === 'INSTAGRAM') return instagram?.avatarUrl ?? null;
  if (platform === 'YOUTUBE') return youtube?.avatarUrl ?? null;
  return null;
}

function SortableRow({
  item,
  tiktok,
  instagram,
  youtube,
  selected,
  onToggleSelect,
  onSkip,
  onRemove,
  onRetry,
  onPublishNow,
  publishing,
}: {
  item: QueueItem;
  tiktok: TikTokAccount | null;
  instagram: InstagramAccount | null;
  youtube: YouTubeAccount | null;
  selected: boolean;
  onToggleSelect: () => void;
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bg-card flex items-center gap-2 rounded-md border p-2 ${
        isDragging ? 'shadow-lg' : ''
      } ${selected ? 'border-primary ring-primary/30 ring-1' : ''}`}
    >
      <Checkbox
        checked={selected}
        onChange={onToggleSelect}
        aria-label={selected ? 'Deselect item' : 'Select item'}
      />

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Thumb url={item.video.thumbnailUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {item.video.title ?? item.video.originalFilename ?? 'Untitled'}
          </span>
          {item.video.isDuplicate ? (
            <Copy className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Possible duplicate" />
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{item.scheduledAt ? formatSlot(item.scheduledAt) : 'Awaiting a slot'}</span>
          {item.tasks.length > 0 ? (
            item.tasks.map((t) => (
              <TaskChip
                key={t.id}
                task={t}
                tiktok={tiktok}
                instagram={instagram}
                youtube={youtube}
                onRetry={() => onRetry(t.id)}
              />
            ))
          ) : (
            <Destinations
              platforms={item.postsTo}
              tiktok={tiktok}
              instagram={instagram}
              youtube={youtube}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onPublishNow}
          disabled={publishing}
          title="Publish this item now, without waiting for its scheduled time"
        >
          {publishing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1 h-4 w-4" />
          )}
          Publish now
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Skip"
          title="Skip"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Remove"
          title="Remove from queue"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * Where this item will post, shown before publish tasks are materialized (i.e.
 * while it's still awaiting a slot). Once scheduled, the per-platform TaskChips
 * convey the same destinations with live status, so this is only the fallback.
 */
function Destinations({
  platforms,
  tiktok,
  instagram,
  youtube,
}: {
  platforms: Platform[];
  tiktok: TikTokAccount | null;
  instagram: InstagramAccount | null;
  youtube: YouTubeAccount | null;
}) {
  if (platforms.length === 0) {
    return <span className="text-muted-foreground">No connected platforms</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground/70">Posts to</span>
      {platforms.map((p) => {
        const handle =
          p === 'TIKTOK'
            ? tiktok?.username
            : p === 'INSTAGRAM'
              ? instagram?.username
              : p === 'YOUTUBE'
                ? youtube?.username
                : null;
        return (
          <span
            key={p}
            className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-slate-600"
            title={handle ? `${PLATFORM_LABELS[p]} · @${handle}` : PLATFORM_LABELS[p]}
          >
            <PlatformAvatar url={platformAvatarUrl(p, tiktok, instagram, youtube)} />
            {PLATFORM_SHORT[p]}
          </span>
        );
      })}
    </span>
  );
}

type QueueTask = QueueItem['tasks'][number];

function TaskChip({
  task,
  tiktok,
  instagram,
  youtube,
  onRetry,
}: {
  task: QueueTask;
  tiktok: TikTokAccount | null;
  instagram: InstagramAccount | null;
  youtube: YouTubeAccount | null;
  onRetry: () => void;
}) {
  const label = PLATFORM_SHORT[task.platform];
  const full = PLATFORM_LABELS[task.platform];
  const base = 'inline-flex items-center gap-0.5 rounded px-1';
  // Show the connected account avatar inside the pill (TikTok, Instagram, YouTube).
  const avatar = (
    <PlatformAvatar url={platformAvatarUrl(task.platform, tiktok, instagram, youtube)} />
  );
  const handle =
    task.platform === 'TIKTOK'
      ? tiktok?.username
      : task.platform === 'INSTAGRAM'
        ? instagram?.username
        : task.platform === 'YOUTUBE'
          ? youtube?.username
          : null;
  const at = handle ? ` · @${handle}` : '';

  if (task.status === 'PUBLISHED') {
    const cls = `${base} bg-emerald-100 text-emerald-700`;
    if (task.postUrl) {
      return (
        <a
          href={task.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          title={`Posted to ${full}${at}`}
        >
          <Check className="h-3 w-3" /> {avatar} {label} <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return (
      <span className={cls} title={`Posted to ${full}${at}`}>
        <Check className="h-3 w-3" /> {avatar} {label}
      </span>
    );
  }

  if (task.status === 'PROCESSING') {
    return (
      <span className={`${base} bg-blue-100 text-blue-700`} title={`Publishing to ${full}${at}…`}>
        <Loader2 className="h-3 w-3 animate-spin" /> {avatar} {label}
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
        className={`${base} bg-red-100 text-red-700 hover:bg-red-200`}
        title={title}
      >
        <AlertTriangle className="h-3 w-3" /> {avatar} {label} <RefreshCw className="h-3 w-3" />
      </button>
    );
  }

  // SCHEDULED / PENDING
  return (
    <span className={`${base} bg-slate-100 text-slate-600`} title={`Scheduled for ${full}${at}`}>
      {avatar} {label}
    </span>
  );
}

function UpcomingList({
  data,
  loading,
  tiktok,
  instagram,
  youtube,
}: {
  data: Upcoming | undefined;
  loading: boolean;
  tiktok: TikTokAccount | null;
  instagram: InstagramAccount | null;
  youtube: YouTubeAccount | null;
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing scheduled yet. Add a schedule and queued videos will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([day, posts]) => (
        <div key={day}>
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
            {day}
          </p>
          <ul className="space-y-1.5">
            {posts.map((p) => {
              const avatarUrl = platformAvatarUrl(p.platform, tiktok, instagram, youtube);
              const handle =
                p.platform === 'TIKTOK'
                  ? (tiktok?.username ?? tiktok?.nickname ?? null)
                  : p.platform === 'INSTAGRAM'
                    ? (instagram?.username ?? null)
                    : p.platform === 'YOUTUBE'
                      ? (youtube?.username ?? null)
                      : null;
              return (
                <li key={p.taskId} className="flex items-center gap-2 text-sm">
                  <Thumb url={p.thumbnailUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{p.title ?? 'Untitled'}</p>
                    <p className="text-muted-foreground flex items-center gap-1 text-xs">
                      <span>
                        {formatTime(p.scheduledAt)} · {PLATFORM_LABELS[p.platform]}
                      </span>
                      {avatarUrl || handle ? (
                        <span className="flex items-center gap-1">
                          {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarUrl}
                              alt=""
                              className="h-4 w-4 shrink-0 rounded-full object-cover"
                            />
                          ) : null}
                          {handle ? (
                            <span className="truncate">
                              {handle.startsWith('@') ? handle : `@${handle}`}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {p.needsConnection ? (
                        <span className="text-red-600">· reconnect needed</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
