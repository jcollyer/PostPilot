'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Pause } from 'lucide-react';
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
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { addMonths, dayKey, formatMonth, monthGrid, monthOf, type Month } from './calendar-month';
import { DAY_LABELS, formatLongDay, formatTime } from './format';
import type { QueueEditTarget } from './QueueItemEditDialog';
import { Thumb } from './Thumb';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Chip = RouterOutputs['queue']['calendar']['chips'][number];
type ChipState = Chip['state'];

/** How many chips a day cell shows before "+N more". */
const CELL_CHIPS = 2;

/** Upcoming chips open Edit details; history and in-flight work only select their day. */
const isUpcoming = (state: ChipState) => state === 'scheduled' || state === 'held';

/**
 * The Upcoming posts calendar: a month grid of the queue in a large modal over
 * the Queue page. A read-only view of the queue — it never schedules anything
 * itself.
 */
export function QueueCalendar({
  open,
  onOpenChange,
  publishing,
  onEdit,
  onAddSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something is mid-publish, so the calendar polls (the Queue page's own rule). */
  publishing: boolean;
  onEdit: (target: QueueEditTarget) => void;
  /** Close the calendar and take the user to the schedule editor. */
  onAddSchedule: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh]">
        {/* Mounted only while open, so it starts on today each time and costs
            nothing while closed. */}
        <CalendarBody publishing={publishing} onEdit={onEdit} onAddSchedule={onAddSchedule} />
      </DialogContent>
    </Dialog>
  );
}

function CalendarBody({
  publishing,
  onEdit,
  onAddSchedule,
}: {
  publishing: boolean;
  onEdit: (target: QueueEditTarget) => void;
  onAddSchedule: () => void;
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

  const chipsByDay = useMemo(() => {
    const map = new Map<string, Chip[]>();
    for (const chip of calendar.data?.chips ?? []) {
      const arr = map.get(chip.day) ?? [];
      arr.push(chip);
      map.set(chip.day, arr);
    }
    return map;
  }, [calendar.data]);

  const goTo = (m: Month) => {
    setMonth(m);
    // Keep the selection on the page: today in its own month, else the 1st.
    const now = monthOf(new Date());
    setSelected(
      now.year === m.year && now.month === m.month ? new Date() : new Date(m.year, m.month, 1),
    );
  };

  const edit = (chip: Chip) => onEdit({ mediaId: chip.mediaId, mediaType: chip.mediaType });

  return (
    <>
      <DialogHeader className="border-line flex-row items-center justify-between gap-3 space-y-0 border-b py-3 pl-4 pr-12 sm:pl-6 sm:pr-14">
        <DialogTitle className="text-lg font-medium tabular-nums tracking-[-0.01em]">
          {formatMonth(month)}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Your queue by day: what went out and what&apos;s scheduled.
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
            Your queue is paused. Nothing new posts until you resume it.
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
          <div className="min-w-0">
            <MonthGrid
              days={grid.days}
              month={month}
              todayKey={todayKey}
              selected={selectedKey}
              onSelect={setSelected}
              chipsByDay={chipsByDay}
              loading={calendar.isLoading}
              onEdit={edit}
            />
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
          />
        </div>
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
}: {
  days: Date[];
  month: Month;
  todayKey: string;
  selected: string;
  onSelect: (day: Date) => void;
  chipsByDay: Map<string, Chip[]>;
  loading: boolean;
  onEdit: (chip: Chip) => void;
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
          const chips = chipsByDay.get(key) ?? [];
          const outside = date.getMonth() !== month.month;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const isSelected = key === selected;
          const label = formatLongDay(date);
          return (
            <div
              key={key}
              onClick={() => onSelect(date)}
              className={cn(
                'border-line relative flex min-h-14 cursor-pointer flex-col gap-1 border-b border-r p-1 sm:min-h-[6.75rem] sm:p-1.5',
                isPast && 'bg-muted/50',
                isSelected && 'ring-foreground/60 ring-2 ring-inset',
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(date);
                }}
                aria-label={`${label}, ${chips.length === 0 ? 'no posts' : `${chips.length} ${chips.length === 1 ? 'post' : 'posts'}`}`}
                aria-pressed={isSelected}
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

              {/* Chips from sm up… */}
              <div className={cn('hidden min-w-0 flex-col gap-1 sm:flex', outside && 'opacity-50')}>
                {chips.slice(0, CELL_CHIPS).map((chip) => (
                  <CalendarChip
                    key={chip.key}
                    chip={chip}
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

/**
 * How each state reads: its label (tooltip, day list, legend), the chip and dot
 * treatments, and the icon a chip carries.
 */
const STATE_META: Record<
  ChipState,
  { label: string; chip: string; dot: string; icon: React.ReactNode }
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
  published: {
    label: 'Published',
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
    icon: <Check className="h-3 w-3 shrink-0" aria-hidden />,
  },
};

function chipTooltip(chip: Chip): string {
  return `${chip.title ?? 'Untitled'} · ${STATE_META[chip.state].label} ${formatTime(chip.at)} · ${platformList(chip.posts.map((p) => p.platform))}`;
}

function CalendarChip({ chip, onClick }: { chip: Chip; onClick: () => void }) {
  const meta = STATE_META[chip.state];
  return (
    <button
      type="button"
      title={chipTooltip(chip)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2',
        meta.chip,
      )}
    >
      <Thumb url={chip.thumbnailUrl} size="xs" faded={chip.state === 'published'} />
      <span className="min-w-0 flex-1 truncate">{chip.title ?? 'Untitled'}</span>
      {meta.icon}
      {meta.icon ? <span className="sr-only">{meta.label}</span> : null}
    </button>
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

function DayList({
  day,
  chips,
  loading,
  onEdit,
}: {
  day: Date;
  chips: Chip[];
  loading: boolean;
  onEdit: (chip: Chip) => void;
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
              <li key={row.key}>
                {isUpcoming(row.state) ? (
                  <button
                    type="button"
                    onClick={() => onEdit(row.chip)}
                    title="Edit details"
                    className="hover:bg-accent/60 focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-1.5 py-2">{body}</div>
                )}
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
      {(['scheduled', 'inFlight', 'published', 'held'] as const).map((state) => (
        <span key={state} className="flex items-center gap-1.5">
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
