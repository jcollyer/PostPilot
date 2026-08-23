'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Film, Pause } from 'lucide-react';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Skeleton } from '@/components/ui/skeleton';
import { AccountAvatar, PlatformLogo } from '@/components/PlatformGlyph';
import { trpc } from '@/lib/trpc/client';

/**
 * The window the runway is drawn against. A creator who batches once and walks
 * away is planning in months, not days, so the strip reads "how much of a
 * quarter am I covered for" — a backlog measure, not a calendar.
 */
const RUNWAY_HORIZON_DAYS = 90;

/** Below this, the queue is close enough to empty to say so in colour. */
const RUNWAY_LOW_DAYS = 14;

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(d));
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d));
}

/** "43 days" as the creator would say it: weeks and months, not raw days. */
function humanDuration(days: number): string {
  const d = Math.round(days);
  if (d <= 1) return 'about a day';
  if (d < 14) return `about ${d} days`;
  if (d < 60) return `about ${Math.round(d / 7)} weeks`;
  return `about ${Math.round(d / 30)} months`;
}

/** "twice a day", "3 times a week" — the cadence in the creator's own terms. */
function humanCadence(postsPerDay: number): string {
  if (postsPerDay >= 1) {
    const n = Math.round(postsPerDay);
    if (n === 1) return 'once a day';
    if (n === 2) return 'twice a day';
    return `${n} times a day`;
  }
  const perWeek = Math.round(postsPerDay * 7);
  if (perWeek <= 1) return 'about once a week';
  return `${perWeek} times a week`;
}

export function DashboardView({ greeting }: { greeting: string }) {
  const { data, isLoading } = trpc.dashboard.overview.useQuery();

  if (isLoading || !data) return <DashboardSkeleton />;

  const { health } = data;
  const paused = data.queueStatus === 'PAUSED';
  const broken = data.connections.filter(
    (c) => c.configured && c.connection?.status === 'NEEDS_RECONNECT',
  );
  // Nothing uploaded, nothing published, nothing connected: this account has
  // never run. An empty queue means something different on day one than it does
  // after six weeks of posting, and the copy should not treat them alike.
  const firstRun =
    health.remaining === 0 &&
    data.readyVideos === 0 &&
    data.lastPublished == null &&
    data.connections.every((c) => c.connection == null);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-medium tracking-tight">Hello {greeting}</h1>
        <Link
          href="/media"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring group -m-1 inline-flex items-center gap-1 rounded p-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          {data.readyVideos} {data.readyVideos === 1 ? 'video' : 'videos'} ready to queue
          <ArrowRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          />
        </Link>
      </div>

      {/* The readout. Everything a creator opens this page to learn is in this
          one block: is it running, how long does it last, when must they act. */}
      <section className="bg-card border-border mt-4 rounded-xl border">
        <div className="p-6 sm:p-7">
          <Status paused={paused} postsPerDay={health.postsPerDay} remaining={health.remaining} />

          <p className="mt-3 text-pretty text-[1.75rem] font-medium leading-[1.15] tracking-[-0.02em] sm:text-[2rem]">
            <Runline
              paused={paused}
              remaining={health.remaining}
              postsPerDay={health.postsPerDay}
              daysRemaining={health.daysRemaining}
              firstRun={firstRun}
            />
          </p>

          {health.postsPerDay > 0 && health.remaining > 0 ? (
            <Runway
              daysRemaining={health.daysRemaining}
              estimatedEmptyDate={health.estimatedEmptyDate}
              recommendedUploadBy={health.recommendedUploadBy}
            />
          ) : (
            <NoRunway
              remaining={health.remaining}
              postsPerDay={health.postsPerDay}
              firstRun={firstRun}
            />
          )}
        </div>

        <div className="border-line sm:divide-line grid border-t sm:grid-cols-2 sm:divide-x">
          <Slot label="Next out">
            {data.nextPost ? (
              <PostRow
                thumbnailUrl={data.nextPost.thumbnailUrl}
                title={data.nextPost.title}
                platform={data.nextPost.platform}
                sub={fmtDateTime(data.nextPost.scheduledAt)}
              />
            ) : (
              <Empty text="Nothing scheduled yet" href="/queue" action="Set a schedule" />
            )}
          </Slot>

          <Slot label="Last published" className="border-line border-t sm:border-t-0">
            {data.lastPublished ? (
              <PostRow
                thumbnailUrl={data.lastPublished.thumbnailUrl}
                title={data.lastPublished.title}
                platform={data.lastPublished.platform}
                sub={fmtDateTime(data.lastPublished.publishedAt)}
                href={data.lastPublished.postUrl}
              />
            ) : (
              <Empty text="Nothing published yet" />
            )}
          </Slot>
        </div>
      </section>

      {/* Connections. Healthy platforms stay quiet — only a broken one is
          allowed to take colour, and it carries its own way out. */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">Accounts</h2>
          <Link
            href="/settings/connections"
            className="text-muted-foreground hover:text-foreground text-sm underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
          >
            Manage
          </Link>
        </div>

        <ul className="border-border bg-card divide-line mt-3 divide-y rounded-xl border">
          {data.connections.map((c) => (
            <ConnectionRow key={c.platform} entry={c} />
          ))}
        </ul>

        {broken.length > 0 ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Posts bound for{' '}
            {broken.map((b) => PLATFORM_LABELS[b.platform as Platform]).join(' and ')} are being
            held, not skipped — they publish as soon as you reconnect.
          </p>
        ) : null}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The engine's actual state, not a decoration. The live dot only appears when
 * something really is due to go out — a pulsing "Running" over an empty queue
 * would be the one lie this page could tell.
 */
function Status({
  paused,
  postsPerDay,
  remaining,
}: {
  paused: boolean;
  postsPerDay: number;
  remaining: number;
}) {
  if (paused) {
    return (
      <span className="text-warn inline-flex items-center gap-2 text-sm font-medium">
        <Pause className="h-3.5 w-3.5" aria-hidden />
        Paused
      </span>
    );
  }
  if (postsPerDay > 0 && remaining > 0) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span className="pp-live-dot" aria-hidden />
        Publishing {humanCadence(postsPerDay)}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
      <span className="bg-muted-foreground/40 h-2 w-2 flex-none rounded-full" aria-hidden />
      Nothing to publish
    </span>
  );
}

/**
 * The one sentence the page exists to say. Written as prose with the number
 * carrying the weight, rather than as a metric tile — a creator wants to be
 * told how long they are covered for, not handed a figure to interpret.
 */
function Runline({
  paused,
  remaining,
  postsPerDay,
  daysRemaining,
  firstRun,
}: {
  paused: boolean;
  remaining: number;
  postsPerDay: number;
  daysRemaining: number | null;
  firstRun: boolean;
}) {
  if (remaining === 0) {
    return firstRun ? (
      <>Let&rsquo;s get your first batch posting.</>
    ) : (
      <>Your queue is empty — nothing is waiting to go out.</>
    );
  }
  const count = (
    <>
      {remaining} {remaining === 1 ? 'video' : 'videos'}
    </>
  );
  if (paused) {
    return <>{count} are holding until you resume the queue.</>;
  }
  if (postsPerDay <= 0 || daysRemaining == null) {
    return <>{count} are waiting on a posting schedule.</>;
  }
  return (
    <>
      {count} left —{' '}
      <span className="text-muted-foreground">{humanDuration(daysRemaining)} of posting.</span>
    </>
  );
}

/**
 * Days of content left, drawn against a fixed 90-day window so the strip means
 * the same thing every visit. The upload-by tick is the actionable part: it is
 * the moment the creator needs to start filming again, not the moment they run
 * out.
 */
function Runway({
  daysRemaining,
  estimatedEmptyDate,
  recommendedUploadBy,
}: {
  daysRemaining: number | null;
  estimatedEmptyDate: Date | string | null;
  recommendedUploadBy: Date | string | null;
}) {
  const days = daysRemaining ?? 0;
  const run = Math.min(days / RUNWAY_HORIZON_DAYS, 1);
  const low = days <= RUNWAY_LOW_DAYS;

  const uploadByDays =
    recommendedUploadBy != null
      ? (new Date(recommendedUploadBy).getTime() - Date.now()) / 86_400_000
      : null;
  const markAt =
    uploadByDays != null && uploadByDays > 0
      ? Math.min(uploadByDays / RUNWAY_HORIZON_DAYS, 1)
      : null;

  return (
    <div className="mt-6">
      <div
        className="pp-runway"
        style={{ ['--pp-run' as string]: run }}
        role="img"
        aria-label={`${Math.round(days)} days of content remaining, shown against a ${RUNWAY_HORIZON_DAYS} day view`}
      >
        {markAt != null ? (
          <span
            aria-hidden
            className="bg-foreground absolute inset-y-0 w-0.5 rounded-full"
            style={{ left: `calc(${markAt * 100}% - 1px)` }}
          />
        ) : null}
      </div>

      <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {recommendedUploadBy ? (
          <span className={low ? 'text-warn font-medium' : 'text-foreground'}>
            Upload more by {fmtDate(recommendedUploadBy)}
          </span>
        ) : null}
        {estimatedEmptyDate ? <span>Empty around {fmtDate(estimatedEmptyDate)}</span> : null}
        <span className="ml-auto hidden sm:inline">3 months</span>
      </div>
    </div>
  );
}

/** What stands in for the runway when there is nothing to project. */
function NoRunway({
  remaining,
  postsPerDay,
  firstRun,
}: {
  remaining: number;
  postsPerDay: number;
  firstRun: boolean;
}) {
  if (remaining === 0) {
    return firstRun ? (
      <ol className="text-muted-foreground mt-5 space-y-2 text-sm">
        <Step n={1} href="/settings/connections" action="Connect an account">
          TikTok, Instagram, or YouTube — whichever you post to.
        </Step>
        <Step n={2} href="/media" action="Upload your videos">
          Drop in a batch; PostPilot writes the titles and captions.
        </Step>
        <Step n={3} href="/queue" action="Set a posting schedule">
          Then walk away — we&rsquo;ll only ping you if we genuinely need you.
        </Step>
      </ol>
    ) : (
      <p className="text-muted-foreground mt-4 text-sm">
        <Link href="/media" className="text-foreground underline underline-offset-2">
          Upload more videos
        </Link>{' '}
        and add them to the queue to start posting again.
      </p>
    );
  }
  if (postsPerDay <= 0) {
    return (
      <p className="text-muted-foreground mt-4 text-sm">
        <Link href="/queue" className="text-foreground underline underline-offset-2">
          Add a posting schedule
        </Link>{' '}
        and PostPilot will start working through them.
      </p>
    );
  }
  return null;
}

/** One numbered setup step. Only ever shown on a brand-new account. */
function Step({
  n,
  href,
  action,
  children,
}: {
  n: number;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="border-border text-muted-foreground mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-medium"
      >
        {n}
      </span>
      <span>
        <Link href={href} className="text-foreground font-medium underline underline-offset-2">
          {action}
        </Link>{' '}
        — {children}
      </span>
    </li>
  );
}

function Slot({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`p-5 sm:p-6 ${className ?? ''}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function PostRow({
  thumbnailUrl,
  title,
  platform,
  sub,
  href,
}: {
  thumbnailUrl: string | null;
  title: string | null;
  platform: Platform;
  sub: string;
  href?: string | null;
}) {
  const body = (
    <div className="flex items-center gap-3">
      <span className="bg-muted ring-line flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded ring-1">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Film className="text-muted-foreground h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title ?? 'Untitled'}</span>
        <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
          {PLATFORM_LABELS[platform]} · {sub}
          {href ? <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden /> : null}
        </span>
      </span>
    </div>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-visible:ring-ring -m-1 block rounded-md p-1 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2"
    >
      {body}
    </a>
  ) : (
    body
  );
}

function Empty({ text, href, action }: { text: string; href?: string; action?: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      {text}
      {href && action ? (
        <>
          {' · '}
          <Link href={href} className="text-foreground underline underline-offset-2">
            {action}
          </Link>
        </>
      ) : null}
    </p>
  );
}

/**
 * Display a username as an @-handle without doubling the prefix — some
 * platforms (e.g. YouTube's customUrl) already include a leading "@".
 */
function formatHandle(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
}

type ConnectionEntry = {
  platform: string;
  configured: boolean;
  connection: {
    id: string;
    status: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

function ConnectionRow({ entry }: { entry: ConnectionEntry }) {
  const platform = entry.platform as Platform;
  const conn = entry.connection;
  const status = conn?.status ?? (entry.configured ? 'NONE' : 'UNAVAILABLE');
  const handle = conn?.username ? formatHandle(conn.username) : (conn?.displayName ?? null);
  const broken = status === 'NEEDS_RECONNECT';

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${broken ? 'bg-danger-soft' : ''}`}>
      <PlatformLogo platform={platform} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{PLATFORM_LABELS[platform]}</span>
        {handle ? (
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-xs">
            <AccountAvatar url={conn?.avatarUrl ?? null} name={handle} />
            {handle}
          </span>
        ) : null}
      </span>

      {broken ? (
        <Link
          href="/settings/connections"
          className="bg-primary text-primary-foreground focus-visible:ring-ring ring-offset-background hover:bg-primary/85 inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Reconnect
        </Link>
      ) : status === 'ACTIVE' ? (
        <span className="text-muted-foreground shrink-0 text-xs">Connected</span>
      ) : status === 'PAUSED' ? (
        <span className="text-warn shrink-0 text-xs font-medium">Paused</span>
      ) : status === 'UNAVAILABLE' ? (
        <span className="text-muted-foreground shrink-0 text-xs">Coming soon</span>
      ) : (
        <Link
          href="/settings/connections"
          className="border-input hover:bg-accent focus-visible:ring-ring ring-offset-background inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Connect
        </Link>
      )}
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline justify-between gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>

      <section className="bg-card border-border mt-4 rounded-xl border">
        <div className="p-6 sm:p-7">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-4 h-8 w-[85%]" />
          <Skeleton className="mt-7 h-2.5 w-full rounded-full" />
          <div className="mt-3 flex gap-5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="border-line sm:divide-line grid border-t sm:grid-cols-2 sm:divide-x">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`p-5 sm:p-6 ${i === 1 ? 'border-line border-t sm:border-t-0' : ''}`}
            >
              <Skeleton className="h-3 w-20" />
              <div className="mt-3 flex items-center gap-3">
                <Skeleton className="h-12 w-8 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Skeleton className="h-4 w-20" />
        <div className="border-border bg-card divide-line mt-3 divide-y rounded-xl border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
