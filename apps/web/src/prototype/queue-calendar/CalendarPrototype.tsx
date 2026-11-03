'use client';

// PROTOTYPE — four candidate homes for the queue calendar, switchable from a
// floating bar (map #104, ticket #105). Throwaway: lives on the
// `prototype/queue-calendar` branch only.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, List, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { DayAgenda, Legend, MonthGrid, MonthHeader, useCalendarState } from './CalendarMonth';
import type { MockPost } from './mock';

type Variant = 'modal' | 'sheet' | 'inline' | 'page';

const VARIANTS: { id: Variant; label: string }[] = [
  { id: 'modal', label: 'Modal' },
  { id: 'sheet', label: 'Side sheet' },
  { id: 'inline', label: 'In place' },
  { id: 'page', label: 'Own page' },
];

/* --- prototype settings, shared between /queue and /queue/calendar --------- */

type Settings = { variant: Variant; projected: boolean };
const KEY = 'pp-proto-calendar';
const DEFAULTS: Settings = { variant: 'modal', projected: true };

function readSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function useSettings() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    setS(readSettings());
    const on = () => setS(readSettings());
    window.addEventListener('pp-proto', on);
    return () => window.removeEventListener('pp-proto', on);
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...readSettings(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private window: the switcher just won't persist */
    }
    window.dispatchEvent(new Event('pp-proto'));
  };
  return [s, update] as const;
}

/** The "would open Edit details" stand-in; click behaviour is ticket #106's call. */
function useOpenStandIn() {
  const [post, setPost] = useState<MockPost | null>(null);
  useEffect(() => {
    if (!post) return;
    const t = setTimeout(() => setPost(null), 2600);
    return () => clearTimeout(t);
  }, [post]);
  const toast = post ? (
    <div
      role="status"
      className="bg-foreground text-background fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-3.5 py-2 text-sm shadow-[0_8px_24px_hsl(var(--foreground)/0.25)]"
    >
      Would open <span className="font-medium">Edit details</span> for “{post.title}”
    </div>
  ) : null;
  return { open: setPost, toast };
}

/* -------------------------------------------------------------------------- */

/**
 * Replaces the queue page's "Upcoming posts" section: same heading and list,
 * plus the calendar icon button that opens whichever variant is selected.
 */
export function UpcomingSection({ list }: { list: ReactNode }) {
  const [settings] = useSettings();
  const [open, setOpen] = useState(false);
  const [inline, setInline] = useState(false);
  const stand = useOpenStandIn();
  const v = settings.variant;
  const showingInline = v === 'inline' && inline;

  const button =
    v === 'page' ? (
      <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0" title="Calendar view">
        <Link href="/queue/calendar" aria-label="Open calendar view">
          <CalendarDays className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
    ) : (
      <Button
        size="sm"
        variant={showingInline ? 'secondary' : 'ghost'}
        className="h-8 w-8 p-0"
        title={showingInline ? 'List view' : 'Calendar view'}
        aria-label={showingInline ? 'Show as list' : 'Show as calendar'}
        aria-pressed={v === 'inline' ? inline : undefined}
        onClick={() => (v === 'inline' ? setInline((x) => !x) : setOpen(true))}
      >
        {showingInline ? (
          <List className="h-4 w-4" aria-hidden />
        ) : (
          <CalendarDays className="h-4 w-4" aria-hidden />
        )}
      </Button>
    );

  return (
    <section className="pb-16">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Upcoming posts</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {showingInline
              ? 'Your queue laid out on your schedule.'
              : 'The next slots your schedules produce.'}
          </p>
        </div>
        <div className="-mr-1.5 -mt-1">{button}</div>
      </div>
      <div className="mt-3">
        {showingInline ? <InlineCalendar onOpenPost={stand.open} projected={settings.projected} /> : list}
      </div>

      {v === 'modal' ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex h-[min(52rem,92vh)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl [&>button:last-child]:hidden">
            <CalendarFrame
              title={<DialogTitle className="text-base font-medium">Upcoming posts</DialogTitle>}
              close={
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setOpen(false)} aria-label="Close calendar">
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              }
              projected={settings.projected}
              onOpenPost={stand.open}
              layout="split"
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {v === 'sheet' ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className="gap-0 overflow-y-auto p-0 sm:w-[44rem] lg:w-[min(52rem,62vw)] [&>button:last-child]:hidden">
            <CalendarFrame
              title={<SheetTitle className="text-base font-medium">Upcoming posts</SheetTitle>}
              close={
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setOpen(false)} aria-label="Close calendar">
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              }
              projected={settings.projected}
              onOpenPost={stand.open}
              layout="stacked"
            />
          </SheetContent>
        </Sheet>
      ) : null}

      {stand.toast}
      <PrototypeBar />
    </section>
  );
}

/** Header + month nav + grid + agenda, as one block every overlay variant reuses. */
function CalendarFrame({
  title,
  close,
  projected,
  onOpenPost,
  layout,
}: {
  title: ReactNode;
  close?: ReactNode;
  projected: boolean;
  onOpenPost: (p: MockPost) => void;
  /** split = agenda beside the grid (wide homes); stacked = agenda under it. */
  layout: 'split' | 'stacked';
}) {
  const cal = useCalendarState(projected);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        {title}
        {close}
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5',
          layout === 'split' && 'lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6',
        )}
      >
        <div className="min-w-0 space-y-3">
          <MonthHeader cal={cal} />
          <MonthGrid cal={cal} density="full" onOpenPost={onOpenPost} />
          <Legend />
        </div>
        <div className={cn('mt-6', layout === 'split' && 'lg:mt-[2.75rem]')}>
          <DayAgenda cal={cal} onOpenPost={onOpenPost} />
        </div>
      </div>
    </div>
  );
}

/** In-place variant: the aside is ~22rem wide, so a dot month plus the day's list. */
function InlineCalendar({
  onOpenPost,
  projected,
}: {
  onOpenPost: (p: MockPost) => void;
  projected: boolean;
}) {
  const cal = useCalendarState(projected);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <MonthHeader cal={cal} compact />
        <MonthGrid cal={cal} density="compact" onOpenPost={onOpenPost} />
      </div>
      <DayAgenda cal={cal} onOpenPost={onOpenPost} />
    </div>
  );
}

/** The "own page" variant at /queue/calendar. */
export function CalendarPage() {
  const [settings] = useSettings();
  const stand = useOpenStandIn();
  const cal = useCalendarState(settings.projected);
  return (
    <div className="space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/queue"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex items-center gap-1 rounded px-1 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Queue
          </Link>
          <h1 className="mt-1 text-2xl font-medium tracking-[-0.02em]">Calendar</h1>
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        <div className="min-w-0 space-y-3">
          <MonthHeader cal={cal} />
          <MonthGrid cal={cal} density="full" onOpenPost={stand.open} />
          <Legend />
        </div>
        <div className="mt-8 lg:mt-[2.75rem]">
          <DayAgenda cal={cal} onOpenPost={stand.open} />
        </div>
      </div>
      {stand.toast}
      <PrototypeBar />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Floating switcher so the variants can be compared without code edits. */
function PrototypeBar() {
  const [s, update] = useSettings();
  return (
    <div className="bg-foreground text-background fixed bottom-4 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full p-1 text-xs shadow-[0_10px_30px_hsl(var(--foreground)/0.3)]">
      <span className="text-background/60 shrink-0 pl-2.5 pr-1">Prototype</span>
      {VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => update({ variant: v.id })}
          aria-pressed={s.variant === v.id}
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1.5 transition-colors',
            s.variant === v.id ? 'bg-background text-foreground font-medium' : 'hover:bg-background/15',
          )}
        >
          {v.label}
        </button>
      ))}
      <label className="hover:bg-background/15 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5">
        <input
          type="checkbox"
          checked={s.projected}
          onChange={(e) => update({ projected: e.target.checked })}
          className="accent-[hsl(var(--primary))]"
        />
        Projected
      </label>
    </div>
  );
}
