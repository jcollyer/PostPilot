'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pause,
  Pencil,
  X,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { addMonths, dayKey, formatMonth, monthGrid, monthOf, type Month } from './calendar-month';
import { DAY_LABELS, formatLongDay, formatShortDay, formatTime, PLATFORM_SHORT } from './format';
import type { QueueEditTarget } from './QueueItemEditDialog';
import { Thumb } from './Thumb';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Chip = RouterOutputs['queue']['calendar']['chips'][number];
type ChipState = Chip['state'];
type Post = Chip['posts'][number];
type Slot = RouterOutputs['queue']['calendar']['slots'][number];

/** How many chips a day cell shows before "+N more". */
const CELL_CHIPS = 2;

/**
 * Upcoming chips open Edit details and published ones their menu of live links;
 * in-flight work only selects its day.
 */
const isUpcoming = (state: ChipState) =>
  state === 'scheduled' || state === 'held' || state === 'projected';

/**
 * Posts still waiting — in the live plan or projected past it — can be
 * dragged. Published and in-flight posts are fixed.
 */
const isMovable = isUpcoming;

/** Why a fixed chip won't drag, for its tooltip. */
function fixedReason(chip: Chip): string | null {
  if (chip.state === 'published') return "Already published, so it can't be moved";
  if (chip.state === 'inFlight') return "Publishing now, so it can't be moved";
  if (isMovable(chip.state) && !chip.movable) {
    return "Publishing to another platform now, so it can't be moved yet";
  }
  return null;
}

/**
 * The platforms a drag of this chip places: its first waiting slot that day.
 * The video's other platforms re-flow wherever the queue now puts them.
 */
function dragPlatforms(chip: Chip): Platform[] {
  const waiting = chip.posts.filter((p) => isMovable(p.state));
  const first = Math.min(...waiting.map((p) => p.at.getTime()));
  return waiting.filter((p) => p.at.getTime() === first).map((p) => p.platform);
}

/**
 * Slots that post to every one of `platforms`, by day — live and projected
 * alike, since a drop on either is the same reorder.
 */
function targetsByDay(slots: Slot[], platforms: Platform[]): Map<string, Slot[]> {
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    if (!platforms.every((p) => p in slot.holders)) continue;
    byDay.set(slot.day, [...(byDay.get(slot.day) ?? []), slot]);
  }
  return byDay;
}

/** Drops on a chip win over the day it sits in. */
const chipsFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const chip = hits.find((h) => String(h.id).startsWith('chip:'));
  return chip ? [chip] : hits;
};

/** How long shifted chips flash, and a toast stays up. */
const FLASH_MS = 1600;
const TOAST_MS = 8000;

type Toast =
  | { kind: 'moved'; text: string; undo: { itemId: string; afterItemId: string | null } }
  | { kind: 'info' | 'error'; text: string };

/**
 * A Move to… in progress (pick-a-day mode): the post, the platforms its day-list
 * row places, that row, and the button that started it, to hand focus back on
 * Cancel.
 */
interface Picking {
  chip: Chip;
  platforms: Platform[];
  rowKey: string;
  trigger: HTMLElement | null;
}

/** Can this day-list row be moved? Published and in-flight rows are fixed. */
const rowMovable = (row: { state: ChipState; chip: Chip }) =>
  isMovable(row.state) && row.chip.movable;

/**
 * The Upcoming posts calendar: a month grid of the queue in a large modal over
 * the Queue page. A view of the queue, not a second scheduler: dragging a
 * post just reorders the queue (see `queue.moveToSlot`).
 */
export function QueueCalendar({
  open,
  onOpenChange,
  publishing,
  onEdit,
  onAddSchedule,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something is mid-publish, so the calendar polls (the Queue page's own rule). */
  publishing: boolean;
  onEdit: (target: QueueEditTarget) => void;
  /** Close the calendar and take the user to the schedule editor. */
  onAddSchedule: () => void;
  /** Refetch every view of the queue after a move; resolves once they're fresh. */
  onChanged: () => Promise<unknown>;
}) {
  // Escape backs out of pick-a-day mode before it closes the calendar.
  const onEscape = useRef<(() => boolean) | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh]"
        onEscapeKeyDown={(e) => {
          if (onEscape.current?.()) e.preventDefault();
        }}
      >
        {/* Mounted only while open, so it starts on today each time and costs
            nothing while closed. */}
        <CalendarBody
          publishing={publishing}
          onEdit={onEdit}
          onAddSchedule={onAddSchedule}
          onChanged={onChanged}
          onEscape={onEscape}
        />
      </DialogContent>
    </Dialog>
  );
}

function CalendarBody({
  publishing,
  onEdit,
  onAddSchedule,
  onChanged,
  onEscape,
}: {
  publishing: boolean;
  onEdit: (target: QueueEditTarget) => void;
  onAddSchedule: () => void;
  onChanged: () => Promise<unknown>;
  /** Set to a handler that takes Escape, returning whether it did. */
  onEscape: React.RefObject<(() => boolean) | null>;
}) {
  const todayKey = dayKey(new Date());
  const [month, setMonth] = useState<Month>(() => monthOf(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const selectedKey = dayKey(selected);

  const grid = useMemo(() => monthGrid(month), [month]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const calendar = trpc.queue.calendar.useQuery(
    { from: grid.from, to: grid.to, timeZone },
    { refetchInterval: publishing ? 15000 : false },
  );
  const schedules = trpc.queue.listSchedules.useQuery();
  const hasSchedule = schedules.data?.some((s) => s.isActive) ?? true;

  // --- Moving posts --------------------------------------------------------

  const [dragging, setDragging] = useState<Chip | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  // A drop on its way to the server: the chip shows on its new day meanwhile.
  const [landing, setLanding] = useState<{ chipKey: string; day: string } | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const moveToSlot = trpc.queue.moveToSlot.useMutation();
  const move = trpc.queue.move.useMutation();
  const busy = moveToSlot.isPending || move.isPending;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /** While dragging or picking a day: the days it can land on, and each day's slots for it. */
  const targets = useMemo(() => {
    const platforms = dragging ? dragPlatforms(dragging) : picking?.platforms;
    return platforms ? targetsByDay(calendar.data?.slots ?? [], platforms) : null;
  }, [dragging, picking, calendar.data]);

  const flash = (itemIds: string[]) => {
    clearTimeout(flashTimer.current);
    setFlashing(new Set(itemIds));
    flashTimer.current = setTimeout(() => setFlashing(new Set()), FLASH_MS);
  };

  const onDragEnd = ({ over }: DragEndEvent) => {
    const chip = dragging;
    setDragging(null);
    if (!chip || !over || !targets) return;

    // Onto a chip: that chip's slot. Onto a day: its first slot for these platforms.
    const target = over.data.current?.chip as Chip | undefined;
    const day = target ? target.day : String(over.id).slice('day:'.length);
    const options = targets.get(day) ?? [];
    const slot = target
      ? options.find((s) => target.posts.some((p) => p.at.getTime() === s.at.getTime()))
      : options[0];
    if (!slot) return;

    const platforms = dragPlatforms(chip);
    if (platforms.every((p) => slot.holders[p] === chip.itemId)) return; // already there
    moveTo(chip, slot, platforms, day);
  };

  // --- Move to… (pick-a-day mode) -------------------------------------------

  const pickBar = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const startPicking = (picked: Picking) => {
    setToast(null);
    setPicking(picked);
  };

  const cancelPicking = () => {
    const trigger = picking?.trigger;
    setPicking(null);
    if (trigger?.isConnected) trigger.focus();
  };

  useEffect(() => {
    onEscape.current = picking
      ? () => {
          cancelPicking();
          return true;
        }
      : null;
    return () => {
      onEscape.current = null;
    };
  });

  // Entering pick-a-day mode: bring the instructions into view (the day list
  // sits below the grid on a phone) and focus the first day that takes it.
  useEffect(() => {
    if (!picking) return;
    pickBar.current?.scrollIntoView({ block: 'nearest' });
    const first = gridRef.current?.querySelector<HTMLElement>('[data-pick-target]');
    (first ?? pickBar.current?.querySelector('button'))?.focus({ preventScroll: true });
  }, [picking]);

  /** Picking a day: the same move as a drop on that day's empty space. */
  const pickDay = (date: Date) => {
    if (!picking || !targets) return;
    const day = dayKey(date);
    const slot = targets.get(day)?.[0];
    if (!slot) return;
    const { chip, platforms } = picking;
    setPicking(null);
    setSelected(date);
    if (platforms.every((p) => slot.holders[p] === chip.itemId)) {
      setToast({
        kind: 'info',
        text: `'${chip.title ?? 'Untitled'}' already posts on ${formatShortDay(slot.at)}.`,
      });
      return;
    }
    moveTo(chip, slot, platforms, day);
  };

  /** Move `chip`'s video so `platforms` take `slot`, showing it on `day` meanwhile. */
  const moveTo = (chip: Chip, slot: Slot, platforms: Platform[], day: string) => {
    const title = chip.title ?? 'Untitled';
    setToast(null);
    setLanding({ chipKey: chip.key, day });
    moveToSlot.mutate(
      { itemId: chip.itemId, slotAt: slot.at, platforms },
      {
        onSuccess: async (res) => {
          await onChanged();
          setLanding(null);
          flash(res.shiftedItemIds);
          // A landing past the live plan (or in a paused queue) is an estimate.
          const where = res.landedAt
            ? `${formatShortDay(res.landedAt)}${res.projected ? ' (projected)' : ''}`
            : null;
          const shifted =
            res.shifted > 0
              ? ` · ${res.shifted} ${res.shifted === 1 ? 'post' : 'posts'} shifted`
              : '';
          setToast({
            kind: 'moved',
            text: res.movedToEnd
              ? `Moved '${title}' to the end of your queue${where ? `, ${where}` : ''}${shifted}`
              : `Moved '${title}' to ${where ?? formatShortDay(slot.at)}${shifted}`,
            undo: { itemId: chip.itemId, afterItemId: res.previousAfterItemId },
          });
        },
        onError: async (err) => {
          setLanding(null);
          setToast({ kind: 'error', text: `Couldn't move '${title}'. ${err.message}` });
          await onChanged();
        },
      },
    );
  };

  const undo = ({ itemId, afterItemId }: { itemId: string; afterItemId: string | null }) => {
    setToast(null);
    move.mutate(
      { itemId, afterItemId },
      {
        onSuccess: async () => {
          await onChanged();
          setToast({ kind: 'info', text: 'Move undone.' });
        },
        onError: (err) => setToast({ kind: 'error', text: `Couldn't undo. ${err.message}` }),
      },
    );
  };

  const chipsByDay = useMemo(() => {
    const map = new Map<string, Chip[]>();
    for (const chip of calendar.data?.chips ?? []) {
      const day = landing?.chipKey === chip.key ? landing.day : chip.day;
      const arr = map.get(day) ?? [];
      arr.push(chip);
      map.set(day, arr);
    }
    return map;
  }, [calendar.data, landing]);

  const goTo = (m: Month) => {
    setMonth(m);
    // Keep the selection on the page: today in its own month, else the 1st.
    const now = monthOf(new Date());
    setSelected(
      now.year === m.year && now.month === m.month ? new Date() : new Date(m.year, m.month, 1),
    );
  };

  const edit = (chip: Chip) =>
    onEdit({
      mediaId: chip.mediaId,
      mediaType: chip.mediaType,
      hasLivePost: chip.posts.some((p) => p.state === 'published'),
    });

  return (
    <>
      <DialogHeader className="border-line flex-row items-center justify-between gap-3 space-y-0 border-b py-3 pl-4 pr-12 sm:pl-6 sm:pr-14">
        <DialogTitle className="text-lg font-medium tabular-nums tracking-[-0.01em]">
          {formatMonth(month)}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Your queue by day: what went out, what&apos;s scheduled, and what&apos;s projected to
          follow.
        </DialogDescription>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2.5"
            onClick={() => goTo(monthOf(new Date()))}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Previous month"
            onClick={() => goTo(addMonths(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Next month"
            onClick={() => goTo(addMonths(month, 1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {calendar.data?.status === 'PAUSED' ? (
          <p className="bg-muted text-muted-foreground mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
            <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Your queue is paused. Nothing new posts until you resume it — projected posts show what
            would go out if you resumed now. You can rearrange them before you resume.
          </p>
        ) : null}
        {!hasSchedule ? (
          <div className="bg-muted mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm">
            <p className="text-muted-foreground">
              No schedules yet, so nothing is planned. Add one and queued posts will appear here.
            </p>
            <Button size="sm" variant="outline" className="h-8" onClick={onAddSchedule}>
              Add a schedule
            </Button>
          </div>
        ) : null}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6">
          <div className="min-w-0" ref={gridRef}>
            {picking ? (
              <div
                ref={pickBar}
                role="status"
                className="bg-primary/10 ring-primary/40 mb-3 flex scroll-mt-4 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md px-3 py-2 text-sm ring-1"
              >
                <p className="min-w-0">
                  Pick a day for{' '}
                  <span className="font-medium">&lsquo;{picking.chip.title ?? 'Untitled'}&rsquo;</span>{' '}
                  on {platformList(picking.platforms)}.{' '}
                  <span className="text-muted-foreground">
                    {targets && targets.size > 0
                      ? 'Highlighted days have a slot for it.'
                      : 'No day this month has a slot for it — try another month.'}
                  </span>
                </p>
                <Button size="sm" variant="outline" className="h-8" onClick={cancelPicking}>
                  Cancel
                </Button>
              </div>
            ) : null}
            <DndContext
              sensors={sensors}
              collisionDetection={chipsFirst}
              onDragStart={({ active }) => setDragging(active.data.current?.chip ?? null)}
              onDragCancel={() => setDragging(null)}
              onDragEnd={onDragEnd}
            >
              <MonthGrid
                days={grid.days}
                month={month}
                todayKey={todayKey}
                selected={selectedKey}
                onSelect={setSelected}
                chipsByDay={chipsByDay}
                loading={calendar.isLoading}
                onEdit={edit}
                targets={targets}
                picking={picking !== null}
                onPick={pickDay}
                canDrag={!busy && !picking}
                flashing={flashing}
              />
              {/* The dialog is centred with a transform, which would offset a
                  fixed overlay inside it, so the dragged chip rides on <body>. */}
              {createPortal(
                <DragOverlay zIndex={100} dropAnimation={null}>
                  {dragging ? (
                    <ChipFace chip={dragging} className="ring-line shadow-lg ring-1" />
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
            </DndContext>
            {calendar.error ? (
              <p className="text-danger mt-3 text-sm">
                This month couldn&apos;t be loaded. {calendar.error.message}
              </p>
            ) : null}
            <Legend />
          </div>
          <DayList
            day={selected}
            chips={chipsByDay.get(selectedKey) ?? []}
            loading={calendar.isLoading}
            onEdit={edit}
            pickingRow={picking?.rowKey ?? null}
            canMove={!busy}
            onMove={startPicking}
          />
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center"
      >
        {toast ? (
          <div
            className={cn(
              'pointer-events-auto flex max-w-full items-center gap-3 rounded-md px-3 py-2 text-sm shadow-lg',
              toast.kind === 'error'
                ? 'bg-danger-soft text-danger ring-danger-line ring-1'
                : 'bg-foreground text-background',
            )}
          >
            <span className="min-w-0">{toast.text}</span>
            {toast.kind === 'moved' ? (
              <button
                type="button"
                onClick={() => undo(toast.undo)}
                disabled={busy}
                className="text-primary focus-visible:ring-ring shrink-0 rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
              >
                Undo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="focus-visible:ring-ring shrink-0 rounded opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function MonthGrid({
  days,
  month,
  todayKey,
  selected,
  onSelect,
  chipsByDay,
  loading,
  onEdit,
  targets,
  picking,
  onPick,
  canDrag,
  flashing,
}: {
  days: Date[];
  month: Month;
  todayKey: string;
  selected: string;
  onSelect: (day: Date) => void;
  chipsByDay: Map<string, Chip[]>;
  loading: boolean;
  onEdit: (chip: Chip) => void;
  /** While dragging or picking a day, the days that take the post; null otherwise. */
  targets: Map<string, Slot[]> | null;
  /** Pick-a-day mode: a day click picks it instead of selecting it. */
  picking: boolean;
  onPick: (day: Date) => void;
  canDrag: boolean;
  /** Items a move just shifted. */
  flashing: Set<string>;
}) {
  return (
    <div className="relative">
      <div className="text-muted-foreground grid grid-cols-7 pb-1.5 text-[11px] font-medium">
        {DAY_LABELS.map((d) => (
          <span key={d} className="text-center sm:px-2 sm:text-left">
            {d}
          </span>
        ))}
      </div>
      <div
        className={cn(
          'border-line grid grid-cols-7 border-l border-t transition-opacity',
          loading && 'opacity-50',
        )}
      >
        {days.map((date) => {
          const key = dayKey(date);
          return (
            <DayCell
              key={key}
              date={date}
              dayKey={key}
              chips={chipsByDay.get(key) ?? []}
              outside={date.getMonth() !== month.month}
              isToday={key === todayKey}
              isPast={key < todayKey}
              isSelected={key === selected}
              onSelect={onSelect}
              onEdit={onEdit}
              dropSlots={targets ? (targets.get(key) ?? []) : null}
              picking={picking}
              onPick={onPick}
              canDrag={canDrag}
              flashing={flashing}
            />
          );
        })}
      </div>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-background/90 text-muted-foreground flex items-center gap-2 rounded-md px-3 py-1.5 text-sm shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DayCell({
  date,
  dayKey: key,
  chips,
  outside,
  isToday,
  isPast,
  isSelected,
  onSelect,
  onEdit,
  dropSlots,
  picking,
  onPick,
  canDrag,
  flashing,
}: {
  date: Date;
  dayKey: string;
  chips: Chip[];
  outside: boolean;
  isToday: boolean;
  isPast: boolean;
  isSelected: boolean;
  onSelect: (day: Date) => void;
  onEdit: (chip: Chip) => void;
  /**
   * During a drag or a day pick, this day's slots that take it (none: an
   * invalid day); null otherwise.
   */
  dropSlots: Slot[] | null;
  picking: boolean;
  onPick: (day: Date) => void;
  canDrag: boolean;
  flashing: Set<string>;
}) {
  const drop = dropSlots ? (dropSlots.length > 0 ? 'valid' : 'invalid') : null;
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}`, disabled: drop !== 'valid' });
  /** A chip takes the drop itself only when its own slot fits; otherwise the day does. */
  const slotFits = (chip: Chip) =>
    dropSlots?.some((s) => chip.posts.some((p) => p.at.getTime() === s.at.getTime())) ?? false;
  /** A click on the day: picks it in pick-a-day mode (if it takes the post), else selects it. */
  const choose = () => {
    if (!picking) onSelect(date);
    else if (drop === 'valid') onPick(date);
  };
  const label = formatLongDay(date);
  const count =
    chips.length === 0 ? 'no posts' : `${chips.length} ${chips.length === 1 ? 'post' : 'posts'}`;
  return (
    <div
      ref={setNodeRef}
      onClick={choose}
      className={cn(
        'border-line relative flex min-h-14 flex-col gap-1 border-b border-r p-1 transition-[opacity,background-color] sm:min-h-[6.75rem] sm:p-1.5',
        picking && drop !== 'valid' ? 'cursor-not-allowed' : 'cursor-pointer',
        isPast && 'bg-muted/50',
        isSelected && !picking && 'ring-foreground/60 ring-2 ring-inset',
        drop === 'valid' &&
          (isOver ? 'bg-primary/30' : picking ? 'bg-primary/10 hover:bg-primary/25' : 'bg-primary/10'),
        drop === 'invalid' && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          choose();
        }}
        // Pick-a-day mode: only the days that take the post are reachable.
        disabled={picking && drop !== 'valid'}
        data-pick-target={picking && drop === 'valid' ? '' : undefined}
        aria-label={picking ? `Move here: ${label}, ${count}` : `${label}, ${count}`}
        aria-pressed={picking ? undefined : isSelected}
        className={cn(
          'focus-visible:ring-ring mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 sm:mx-0',
          isToday
            ? 'bg-primary text-primary-foreground font-semibold'
            : outside
              ? 'text-muted-foreground/50'
              : 'text-foreground',
        )}
      >
        {date.getDate()}
      </button>

      {/* Chips from sm up… While picking a day, a click anywhere in it picks
          the day, so its chips step aside. */}
      <div
        inert={picking}
        className={cn(
          'hidden min-w-0 flex-col gap-1 sm:flex',
          outside && 'opacity-50',
          picking && 'pointer-events-none',
        )}
      >
        {chips.slice(0, CELL_CHIPS).map((chip) => (
          <CalendarChip
            key={chip.key}
            chip={chip}
            draggable={canDrag && chip.movable}
            dropTarget={slotFits(chip)}
            // Only its posts still to come can have shifted.
            flashing={flashing.has(chip.itemId) && isUpcoming(chip.state)}
            onEdit={() => onEdit(chip)}
            onClick={() => (isUpcoming(chip.state) ? onEdit(chip) : onSelect(date))}
          />
        ))}
        {chips.length > CELL_CHIPS ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(date);
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded px-1 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2"
          >
            +{chips.length - CELL_CHIPS} more
          </button>
        ) : null}
      </div>
      {/* …dots on a phone. */}
      <Dots chips={chips} className={cn('sm:hidden', outside && 'opacity-50')} />
    </div>
  );
}

/**
 * How each state reads: its label (tooltip, day list, legend), the chip and dot
 * treatments, and the icon a chip carries.
 */
const STATE_META: Record<
  ChipState,
  { label: string; hint?: string; chip: string; dot: string; icon: React.ReactNode }
> = {
  scheduled: {
    label: 'Scheduled',
    chip: 'bg-card ring-line hover:bg-accent/60 ring-1',
    dot: 'bg-foreground',
    icon: null,
  },
  inFlight: {
    label: 'Publishing now',
    chip: 'bg-card ring-line cursor-default ring-1',
    dot: 'bg-foreground',
    icon: (
      <Loader2
        className="text-muted-foreground h-3 w-3 shrink-0 motion-safe:animate-spin"
        aria-hidden
      />
    ),
  },
  held: {
    label: 'Held',
    chip: 'bg-danger-soft ring-danger-line ring-1',
    dot: 'bg-danger',
    icon: <AlertTriangle className="text-danger h-3 w-3 shrink-0" aria-hidden />,
  },
  projected: {
    label: 'Projected',
    hint: 'What would post if nothing changes',
    // An estimate past the live plan: the outline only, dashed.
    chip: 'border-foreground/30 hover:bg-accent/60 border border-dashed',
    dot: 'ring-foreground/70 ring-1 ring-inset',
    icon: null,
  },
  published: {
    label: 'Published',
    chip: 'bg-muted text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    dot: 'bg-muted-foreground/50',
    icon: <Check className="h-3 w-3 shrink-0" aria-hidden />,
  },
};

function chipTooltip(chip: Chip): string {
  const fixed = fixedReason(chip);
  return `${chip.title ?? 'Untitled'} · ${STATE_META[chip.state].label} ${formatTime(chip.at)} · ${platformList(chip.posts.map((p) => p.platform))}${fixed ? ` — ${fixed}` : ''}`;
}

const CHIP_CLASS =
  'flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] leading-tight';

/** What a chip shows: thumbnail, title, and its state's icon. */
function ChipContent({ chip }: { chip: Chip }) {
  const meta = STATE_META[chip.state];
  return (
    <>
      <Thumb url={chip.thumbnailUrl} size="xs" faded={chip.state === 'published'} />
      <span className="min-w-0 flex-1 truncate">{chip.title ?? 'Untitled'}</span>
      {meta.icon}
    </>
  );
}

/** A chip on its own, as it rides under the pointer while dragged. */
function ChipFace({ chip, className }: { chip: Chip; className?: string }) {
  return (
    <span className={cn(CHIP_CLASS, STATE_META[chip.state].chip, className)}>
      <ChipContent chip={chip} />
    </span>
  );
}

function CalendarChip({
  chip,
  draggable,
  dropTarget,
  flashing,
  onEdit,
  onClick,
}: {
  chip: Chip;
  /** A waiting post, and no move in progress: it can be picked up. */
  draggable: boolean;
  /** A drag is on and this chip's own slot takes it: dropping here takes that slot. */
  dropTarget: boolean;
  /** A move just shifted it. */
  flashing: boolean;
  /** The published menu's "Edit library details". */
  onEdit: () => void;
  onClick: () => void;
}) {
  const meta = STATE_META[chip.state];
  const published = chip.state === 'published';
  const drag = useDraggable({ id: `drag:${chip.key}`, data: { chip }, disabled: !draggable });
  const drop = useDroppable({ id: `chip:${chip.key}`, data: { chip }, disabled: !dropTarget });
  const button = (
    <button
      type="button"
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      title={chipTooltip(chip)}
      {...drag.listeners}
      {...drag.attributes}
      // dnd-kit's attributes call it a draggable, disabled when it can't be
      // dragged; either way it is a working button that opens the post.
      aria-roledescription={undefined}
      aria-disabled={undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!published) onClick();
      }}
      className={cn(
        CHIP_CLASS,
        'focus-visible:ring-ring transition-colors focus-visible:outline-none focus-visible:ring-2',
        meta.chip,
        draggable && 'cursor-grab active:cursor-grabbing',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'ring-primary ring-2',
        flashing && 'pp-shift-flash',
      )}
    >
      <ChipContent chip={chip} />
      {meta.icon ? <span className="sr-only">{meta.label}</span> : null}
    </button>
  );
  return published ? (
    <PublishedMenu posts={chip.posts} onEdit={onEdit}>
      {button}
    </PublishedMenu>
  ) : (
    button
  );
}

/**
 * What a click on a published post offers: its live posts, and the library
 * record behind them. `children` is the button that opens it.
 */
function PublishedMenu({
  posts,
  onEdit,
  children,
}: {
  posts: Post[];
  onEdit: () => void;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // One link per platform. A platform can come back without a URL; then there's
  // nothing to link to.
  const live = new Map(
    posts.flatMap((p) =>
      p.state === 'published' && p.postUrl ? [[p.platform, p.postUrl]] : [],
    ) as [Platform, string][],
  );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* A trigger opens on pointer-down by default, so starting a scroll on a
          row would pop the menu on a phone. Wait for a real click; Enter, Space
          and the arrow keys still go through onOpenChange. */}
      <DropdownMenuTrigger
        asChild
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        // React events bubble through the portal: a click here isn't a click on the day.
        onClick={(e) => e.stopPropagation()}
      >
        {[...live].map(([platform, url]) => (
          <DropdownMenuItem key={platform} asChild className="cursor-pointer">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              View on {PLATFORM_SHORT[platform]}
            </a>
          </DropdownMenuItem>
        ))}
        {live.size > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={onEdit} className="cursor-pointer items-start">
          <Pencil className="mr-2 mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Edit library details
            <span className="text-muted-foreground block text-xs">
              Won&apos;t change the live post
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A day's chips as dots, for cells too narrow for chips. */
function Dots({ chips, className }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <span
      className={cn('flex flex-wrap items-center justify-center gap-0.5', className)}
      aria-hidden
    >
      {chips.slice(0, 4).map((chip) => (
        <span
          key={chip.key}
          className={cn('h-1.5 w-1.5 rounded-full', STATE_META[chip.state].dot)}
        />
      ))}
    </span>
  );
}

/**
 * A chip's posts as day-list rows: one per state and time, so a slot's
 * cross-post stays one row while a publish and a later slot, or a held platform
 * beside a scheduled one, each show for what they are.
 */
function dayRows(chip: Chip) {
  const rows = new Map<
    string,
    { key: string; state: ChipState; at: Date; platforms: Platform[] }
  >();
  for (const post of chip.posts) {
    const key = `${chip.key}:${post.state}:${post.at.getTime()}`;
    const row = rows.get(key) ?? { key, state: post.state, at: post.at, platforms: [] };
    row.platforms.push(post.platform);
    rows.set(key, row);
  }
  return [...rows.values()];
}

function StateLabel({ state, platforms }: { state: ChipState; platforms: Platform[] }) {
  if (state === 'held') {
    return (
      <span className="text-danger flex items-center gap-1 font-medium">
        {STATE_META.held.icon} Held — reconnect{' '}
        {platforms.map((p) => PLATFORM_LABELS[p]).join(' and ')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      {STATE_META[state].icon} {STATE_META[state].label}
    </span>
  );
}

const DAY_ROW_BUTTON =
  'hover:bg-accent/60 focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2';

function DayList({
  day,
  chips,
  loading,
  onEdit,
  pickingRow,
  canMove,
  onMove,
}: {
  day: Date;
  chips: Chip[];
  loading: boolean;
  onEdit: (chip: Chip) => void;
  /** The row whose Move to… is picking a day, if any. */
  pickingRow: string | null;
  /** No move is in progress, so Move to… can start one. */
  canMove: boolean;
  onMove: (picking: Picking) => void;
}) {
  const heading = formatLongDay(day);
  const rows = chips
    .flatMap((chip) => dayRows(chip).map((row) => ({ ...row, chip })))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <section className="mt-6 min-w-0 lg:mt-0" aria-label={`Posts on ${heading}`}>
      <p className="border-line border-b pb-1.5 text-xs font-medium">{heading}</p>
      {loading ? null : rows.length === 0 ? (
        <p className="text-muted-foreground py-3 text-sm">No posts this day.</p>
      ) : (
        <ul className="divide-line divide-y">
          {rows.map((row) => {
            const body = (
              <>
                <Thumb url={row.chip.thumbnailUrl} faded={row.state === 'published'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.chip.title ?? 'Untitled'}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    <span className="tabular-nums">{formatTime(row.at)}</span>
                    <span aria-hidden> · </span>
                    {platformList(row.platforms)}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    <StateLabel state={row.state} platforms={row.platforms} />
                  </span>
                </span>
              </>
            );
            return (
              <li key={row.key} className={cn(rowMovable(row) && 'flex items-center gap-1')}>
                {isUpcoming(row.state) ? (
                  <button
                    type="button"
                    onClick={() => onEdit(row.chip)}
                    title="Edit details"
                    className={cn(DAY_ROW_BUTTON, 'min-w-0')}
                  >
                    {body}
                  </button>
                ) : row.state === 'published' ? (
                  // The whole video's links, not just this row's: platforms publish
                  // seconds apart, so a cross-post usually splits across rows.
                  <PublishedMenu posts={row.chip.posts} onEdit={() => onEdit(row.chip)}>
                    <button type="button" className={DAY_ROW_BUTTON}>
                      {body}
                    </button>
                  </PublishedMenu>
                ) : (
                  <div className="flex items-center gap-3 px-1.5 py-2">{body}</div>
                )}
                {rowMovable(row) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canMove}
                    aria-pressed={pickingRow === row.key}
                    onClick={(e) =>
                      onMove({
                        chip: row.chip,
                        platforms: row.platforms,
                        rowKey: row.key,
                        trigger: e.currentTarget,
                      })
                    }
                    className={cn(
                      'h-8 shrink-0 px-2 text-xs',
                      pickingRow === row.key && 'bg-primary/15 hover:bg-primary/25',
                    )}
                  >
                    Move to…
                    <span className="sr-only">
                      {' '}
                      {row.chip.title ?? 'Untitled'}, {formatTime(row.at)}
                    </span>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function platformList(platforms: Platform[]): string {
  return platforms.map((p) => PLATFORM_LABELS[p]).join(', ');
}

function Legend() {
  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      {(['scheduled', 'projected', 'inFlight', 'published', 'held'] as const).map((state) => (
        <span key={state} className="flex items-center gap-1.5" title={STATE_META[state].hint}>
          <span
            className={cn(
              'flex h-3 w-4 items-center justify-center rounded-sm [&_svg]:h-2.5 [&_svg]:w-2.5',
              STATE_META[state].chip,
            )}
            aria-hidden
          >
            {STATE_META[state].icon}
          </span>
          {STATE_META[state].label}
        </span>
      ))}
    </div>
  );
}
