'use client';

// PROTOTYPE — the month grid, day agenda and header shared by every container
// variant (map #104, ticket #105). Drop and click behaviour are static
// stand-ins here; they are decided in ticket #106.

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { PLATFORM_LABELS } from '@postpilot/types';

import { PlatformGlyph } from '@/components/PlatformGlyph';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTime, DAY_LABELS } from '@/features/queue/format';
import { buildMockPosts, dayKey, monthDays, sameDay, type MockPost } from './mock';

export type CalendarState = ReturnType<typeof useCalendarState>;

export function useCalendarState(showProjected: boolean) {
  const all = useMemo(() => buildMockPosts(), []);
  const posts = useMemo(
    () => (showProjected ? all : all.filter((p) => p.state !== 'projected')),
    [all, showProjected],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, MockPost[]>();
    for (const p of posts) {
      const k = dayKey(p.at);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [posts]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(() => new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const today = () => {
    const d = new Date();
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(d);
  };
  return { posts, byDay, month, shift, today, selected, setSelected };
}

/* -------------------------------------------------------------------------- */

export function MonthHeader({ cal, compact = false }: { cal: CalendarState; compact?: boolean }) {
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    cal.month,
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className={cn('font-medium tabular-nums', compact ? 'text-sm' : 'text-lg tracking-[-0.01em]')}>
        {label}
      </h3>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={cal.today} className="h-8 px-2.5">
          Today
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => cal.shift(-1)}
          aria-label="Previous month"
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => cal.shift(1)}
          aria-label="Next month"
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** How many chips a full-density cell shows before "+N more". */
const CELL_CAP = 2;

export function MonthGrid({
  cal,
  density,
  onOpenPost,
}: {
  cal: CalendarState;
  /** full = chips in cells (dots under `sm`); compact = dots only, for narrow homes. */
  density: 'full' | 'compact';
  onOpenPost: (p: MockPost) => void;
}) {
  const days = monthDays(cal.month);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="min-w-0">
      <div className="text-muted-foreground grid grid-cols-7 pb-1.5 text-[11px] font-medium">
        {DAY_LABELS.map((d) => (
          <span key={d} className={density === 'full' ? 'px-2' : 'text-center'}>
            {density === 'full' ? d : d.slice(0, 1)}
          </span>
        ))}
      </div>
      <div
        className={cn(
          'grid grid-cols-7',
          density === 'full' ? 'border-line border-l border-t' : 'gap-y-0.5',
        )}
      >
        {days.map((d) => {
          const posts = cal.byDay.get(dayKey(d)) ?? [];
          const inMonth = d.getMonth() === cal.month.getMonth();
          const isToday = sameDay(d, now);
          const isPast = d < startOfToday;
          const isSelected = sameDay(d, cal.selected);
          return density === 'full' ? (
            <div
              key={d.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => cal.setSelected(d)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && cal.setSelected(d)}
              aria-label={`${d.toDateString()}, ${posts.length} posts`}
              className={cn(
                'border-line focus-visible:ring-ring relative flex min-h-[4.25rem] cursor-default flex-col gap-1 border-b border-r p-1 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 sm:min-h-[6.5rem] sm:p-1.5',
                isPast && 'bg-muted/45',
                !inMonth && 'text-muted-foreground/60',
                isSelected && 'ring-foreground/70 z-[1] ring-1 ring-inset',
              )}
            >
              <DayNumber day={d} today={isToday} />
              {/* Chips from `sm` up; dots below it, where a cell is ~48px wide. */}
              <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                {posts.slice(0, CELL_CAP).map((p) => (
                  <Chip key={p.id} post={p} dim={!inMonth} onOpen={() => onOpenPost(p)} />
                ))}
                {posts.length > CELL_CAP ? (
                  <span className="text-muted-foreground px-1 text-[11px]">
                    +{posts.length - CELL_CAP} more
                  </span>
                ) : null}
              </div>
              <Dots posts={posts} className="sm:hidden" />
            </div>
          ) : (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => cal.setSelected(d)}
              aria-label={`${d.toDateString()}, ${posts.length} posts`}
              className={cn(
                'focus-visible:ring-ring flex h-11 flex-col items-center justify-start gap-1 rounded-md pt-1 focus-visible:outline-none focus-visible:ring-2',
                !inMonth && 'text-muted-foreground/50',
                isSelected ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <DayNumber day={d} today={isToday} center />
              <Dots posts={posts} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayNumber({ day, today, center = false }: { day: Date; today: boolean; center?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
        !center && 'self-start px-1',
        today && 'bg-primary text-primary-foreground px-1.5 font-semibold',
      )}
    >
      {day.getDate()}
    </span>
  );
}

/** One queue item in a full-density cell: time and title, with a swatch for the thumbnail. */
function Chip({ post, dim, onOpen }: { post: MockPost; dim: boolean; onOpen: () => void }) {
  const movable = post.state === 'scheduled' || post.state === 'projected';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${post.title} · ${formatTime(post.at)}`}
      className={cn(
        'focus-visible:ring-ring group flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2',
        post.state === 'published' && 'text-muted-foreground hover:bg-accent',
        post.state === 'scheduled' && 'bg-card ring-line hover:bg-accent shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] ring-1',
        post.state === 'projected' && 'text-muted-foreground hover:bg-accent border-border border border-dashed',
        post.state === 'held' && 'bg-danger-soft text-danger ring-danger-line ring-1',
        movable && 'cursor-grab',
        dim && 'opacity-60',
      )}
    >
      <Swatch post={post} />
      {/* No time in the cell: slots mostly share one time, and titles need the room. */}
      <span className="min-w-0 flex-1 truncate">{post.title}</span>
      {post.state === 'published' ? (
        <Check className="h-3 w-3 shrink-0" aria-label="Published" />
      ) : null}
    </button>
  );
}

function Swatch({ post, large = false }: { post: MockPost; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-[3px]',
        large ? 'h-12 w-8' : 'h-4 w-[0.6875rem]',
        post.state === 'published' && 'opacity-60',
      )}
      style={{
        background: `linear-gradient(160deg, hsl(${post.hue} 38% 62%), hsl(${(post.hue + 40) % 360} 30% 34%))`,
      }}
    />
  );
}

function Dots({ posts, className }: { posts: MockPost[]; className?: string }) {
  if (posts.length === 0) return null;
  return (
    <span className={cn('flex items-center justify-center gap-0.5', className)} aria-hidden>
      {posts.slice(0, 3).map((p) => (
        <span
          key={p.id}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            p.state === 'published' && 'bg-muted-foreground/45',
            p.state === 'scheduled' && 'bg-foreground',
            p.state === 'projected' && 'border-muted-foreground border',
            p.state === 'held' && 'bg-danger',
          )}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** The selected day's posts, in full: where a busy day's overflow and the phone land. */
export function DayAgenda({
  cal,
  onOpenPost,
}: {
  cal: CalendarState;
  onOpenPost: (p: MockPost) => void;
}) {
  const posts = cal.byDay.get(dayKey(cal.selected)) ?? [];
  const heading = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(cal.selected);
  return (
    <div className="min-w-0">
      <p className="border-line border-b pb-1.5 text-xs font-medium">{heading}</p>
      {posts.length === 0 ? (
        <p className="text-muted-foreground py-3 text-sm">No posts this day.</p>
      ) : (
        <ul className="divide-line divide-y">
          {posts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPost(p)}
                className="hover:bg-accent/60 focus-visible:ring-ring group flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <Swatch post={p} large />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.title}</span>
                  <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className="tabular-nums">{formatTime(p.at)}</span>
                    <span aria-hidden>·</span>
                    {p.platforms.map((pl) => (
                      <PlatformGlyph key={pl} platform={pl} className="h-3 w-3" />
                    ))}
                    <StateLabel post={p} />
                  </span>
                </span>
                {p.state === 'scheduled' || p.state === 'projected' ? (
                  <GripVertical
                    className="text-muted-foreground/60 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StateLabel({ post }: { post: MockPost }) {
  if (post.state === 'published')
    return (
      <span className="flex items-center gap-1">
        <span aria-hidden>·</span> Published
      </span>
    );
  if (post.state === 'projected')
    return (
      <span className="flex items-center gap-1">
        <span aria-hidden>·</span> Projected
      </span>
    );
  if (post.state === 'held')
    return (
      <span className="text-danger flex items-center gap-1 font-medium">
        <AlertTriangle className="h-3 w-3" aria-hidden /> Held — reconnect{' '}
        {PLATFORM_LABELS.INSTAGRAM}
      </span>
    );
  return null;
}

/** Key for the chip treatments, so the prototype is readable without a walkthrough. */
export function Legend() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      <span className="flex items-center gap-1.5">
        <span className="bg-card ring-line h-3 w-4 rounded-sm ring-1" /> Scheduled
      </span>
      <span className="flex items-center gap-1.5">
        <span className="border-border h-3 w-4 rounded-sm border border-dashed" /> Projected (past
        the 21-day plan)
      </span>
      <span className="flex items-center gap-1.5">
        <Check className="h-3 w-3" aria-hidden /> Published
      </span>
      <span className="flex items-center gap-1.5">
        <span className="bg-danger-soft ring-danger-line h-3 w-4 rounded-sm ring-1" /> Held
      </span>
    </div>
  );
}
