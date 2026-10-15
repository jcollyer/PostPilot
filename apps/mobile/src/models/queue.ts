import { fmtDateTime, PLATFORM_LABEL } from '../lib/dashboard-format';
import type { RouterOutputs } from '../lib/trpc';

/**
 * Queue screen model: the status line, the schedule summary and the sections,
 * derived from `queue.get` + `queue.listSchedules` plus `now`. The screen only
 * maps this to components.
 *
 * Section rules: an item with any FAILED or HELD task goes only in Needs
 * attention; Up next is every other active item (not SKIPPED/COMPLETED) in
 * queue order; Published is COMPLETED items newest first, capped; Skipped is a
 * count plus the rows behind its disclosure. Skipping is how a creator
 * dismisses a failure, so a skipped item stays in Skipped even if it kept a
 * failed task.
 */

export type QueueData = RouterOutputs['queue']['get'];
export type QueueSchedules = RouterOutputs['queue']['listSchedules'];
export type QueueItem = QueueData['items'][number];
export type QueueTask = QueueItem['tasks'][number];
export type Platform = QueueItem['postsTo'][number];

/** Which section an item belongs in; the item sheet's actions follow from it. */
export type QueueItemState = 'attention' | 'upNext' | 'published' | 'skipped';

/** How many published items show before "Show more". */
export const PUBLISHED_CAP = 5;

/** Longest error excerpt a row's meta line carries; the item sheet has the rest. */
const SHORT_ERROR_MAX = 50;

export interface QueueRow {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  meta: string;
  tone: 'critical' | 'muted';
  /** Platform glyphs to show beside the meta line. */
  platforms: Platform[];
}

export interface QueueStatusLine {
  paused: boolean;
  tone: 'ok' | 'warn';
  label: string;
  detail: string;
  /** `label · detail`, for the single status line. */
  copy: string;
}

export interface QueueModel {
  status: QueueStatusLine;
  /** Read-only, e.g. "Posts 2×/day · Mon–Fri · 9a, 6p". */
  schedule: string;
  needsAttention: QueueRow[];
  upNext: QueueRow[];
  published: { rows: QueueRow[]; more: QueueRow[]; hasMore: boolean };
  skipped: { count: number; label: string; rows: QueueRow[] };
}

export function buildQueueModel(
  queue: QueueData,
  schedules: QueueSchedules,
  _now: Date,
): QueueModel {
  const attention: QueueItem[] = [];
  const active: QueueItem[] = [];
  const completed: QueueItem[] = [];
  const skipped: QueueItem[] = [];

  const bySection: Record<QueueItemState, QueueItem[]> = {
    attention,
    upNext: active,
    published: completed,
    skipped,
  };
  for (const item of queue.items) bySection[queueItemState(item)].push(item);

  completed.sort((a, b) => latestPublishedAt(b) - latestPublishedAt(a));
  const publishedRows = completed.map(publishedRow);
  const paused = queue.status === 'PAUSED';

  return {
    status: statusLine(paused, active.length),
    schedule: scheduleSummary(schedules),
    needsAttention: attention.map(attentionRow),
    upNext: active.map(upNextRow),
    published: {
      rows: publishedRows.slice(0, PUBLISHED_CAP),
      more: publishedRows.slice(PUBLISHED_CAP),
      hasMore: publishedRows.length > PUBLISHED_CAP,
    },
    skipped: {
      count: skipped.length,
      label: `Skipped (${skipped.length})`,
      rows: skipped.map((item) => row(item, 'Skipped', 'muted', item.postsTo)),
    },
  };
}

/** The section rules above, for one item. */
export function queueItemState(item: QueueItem): QueueItemState {
  if (item.status === 'SKIPPED') return 'skipped';
  if (problemTasks(item).length > 0) return 'attention';
  if (item.status === 'COMPLETED') return 'published';
  return 'upNext';
}

// --- Sections --------------------------------------------------------------

/** One list section as the screen draws it, for the viewer's current toggles. */
export interface QueueSection {
  key: 'attention' | 'upNext' | 'published' | 'skipped';
  /** Plain heading; null for Skipped, which is its own disclosure row. */
  title: string | null;
  data: QueueRow[];
  /** A row that closes the group after the items, if any. */
  footer: 'empty' | 'show-more' | 'show-fewer' | null;
}

/**
 * The sections to draw, in order. Needs attention, Published and Skipped show
 * only when they have items; Up next always shows, with an empty state.
 * Published shows its latest rows until expanded; Skipped lists its rows only
 * while open.
 */
export function queueSections(
  model: QueueModel,
  view: { showAllPublished: boolean; skippedOpen: boolean },
): QueueSection[] {
  const sections: QueueSection[] = [];
  if (model.needsAttention.length > 0) {
    sections.push({
      key: 'attention',
      title: 'Needs attention',
      data: model.needsAttention,
      footer: null,
    });
  }
  sections.push({
    key: 'upNext',
    title: 'Up next',
    data: model.upNext,
    footer: model.upNext.length === 0 ? 'empty' : null,
  });
  if (model.published.rows.length > 0) {
    const { rows, more, hasMore } = model.published;
    sections.push({
      key: 'published',
      title: 'Published',
      data: view.showAllPublished ? [...rows, ...more] : rows,
      footer: hasMore ? (view.showAllPublished ? 'show-fewer' : 'show-more') : null,
    });
  }
  if (model.skipped.count > 0) {
    sections.push({
      key: 'skipped',
      title: null,
      data: view.skippedOpen ? model.skipped.rows : [],
      footer: null,
    });
  }
  return sections;
}

// --- Status line -----------------------------------------------------------

function statusLine(paused: boolean, inRotation: number): QueueStatusLine {
  const [tone, label, detail] = paused
    ? (['warn', 'Paused', `${inRotation} waiting · nothing posts until you resume`] as const)
    : (['ok', 'Running', `${inRotation} in rotation`] as const);
  return { paused, tone, label, detail, copy: `${label} · ${detail}` };
}

// --- Rows ------------------------------------------------------------------

function row(
  item: QueueItem,
  meta: string,
  tone: QueueRow['tone'],
  platforms: Platform[],
): QueueRow {
  return {
    id: item.id,
    title: itemTitle(item),
    thumbnailUrl: item.media.thumbnailUrl,
    meta,
    tone,
    platforms,
  };
}

function upNextRow(item: QueueItem, index: number): QueueRow {
  const slot = nextSlot(item);
  const meta = item.tasks.some((t) => t.status === 'UPLOADING' || t.status === 'PROCESSING')
    ? 'Publishing now'
    : slot
      ? fmtDateTime(slot)
      : `#${index + 1} · Waiting`;
  return row(item, meta, 'muted', item.postsTo);
}

/**
 * When the item next posts. An item's own `scheduledAt` is its earliest task,
 * which for a partly posted item is already in the past, so once it has tasks
 * the earliest still-unposted one decides.
 */
function nextSlot(item: QueueItem): Date | null {
  if (item.tasks.length === 0) return item.scheduledAt ? new Date(item.scheduledAt) : null;
  const pending = item.tasks
    .filter((t) => t.status === 'PENDING' || t.status === 'SCHEDULED')
    .map((t) => new Date(t.scheduledAt).getTime());
  return pending.length > 0 ? new Date(Math.min(...pending)) : null;
}

/** "<Platform> failed · <short error>", naming the first problem task. */
function attentionRow(item: QueueItem): QueueRow {
  const [first, ...rest] = problemTasks(item);
  const name = platformName(first.platform);
  const parts =
    first.status === 'HELD'
      ? [`${name} on hold`, 'needs reconnecting']
      : [`${name} failed`, shortError(first.lastError)];
  if (rest.length > 0) parts.push(`+${rest.length} more`);
  return row(item, parts.filter(Boolean).join(' · '), 'critical', []);
}

function publishedRow(item: QueueItem): QueueRow {
  const latest = latestPublishedAt(item);
  const platforms = item.tasks.filter((t) => t.status === 'PUBLISHED').map((t) => t.platform);
  return row(item, latest ? `Posted ${fmtDateTime(new Date(latest))}` : 'Posted', 'muted', platforms);
}

export function itemTitle(item: QueueItem): string {
  return item.media.title ?? item.media.originalFilename ?? 'Untitled';
}

export function problemTasks(item: QueueItem): QueueTask[] {
  return item.tasks.filter((t) => t.status === 'FAILED' || t.status === 'HELD');
}

/** Latest publish time across an item's tasks, in ms (0 when none). */
function latestPublishedAt(item: QueueItem): number {
  return item.tasks.reduce(
    (max, t) => (t.publishedAt ? Math.max(max, new Date(t.publishedAt).getTime()) : max),
    0,
  );
}

/** First line of an error, cut at a word boundary to fit one row. */
function shortError(error: string | null): string {
  const line = (error ?? '').split('\n')[0].trim().replace(/\.$/, '');
  if (line.length <= SHORT_ERROR_MAX) return line;
  const cut = line.slice(0, SHORT_ERROR_MAX + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : SHORT_ERROR_MAX).trimEnd()}…`;
}

export function platformName(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

// --- Schedule summary ------------------------------------------------------

/** Days in reading order, Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Posts 2×/day · Mon–Fri · 9a, 6p". Active schedules on the same days merge
 * (a TikTok and an Instagram schedule at the same times read as one); groups on
 * different days join with "; ". Times are shown as written, in the schedule's
 * own zone.
 */
function scheduleSummary(schedules: QueueSchedules): string {
  const groups = new Map<string, { days: number[]; times: Set<string> }>();
  for (const s of schedules) {
    if (!s.isActive || s.daysOfWeek.length === 0 || s.times.length === 0) continue;
    const days = WEEK.filter((d) => s.daysOfWeek.includes(d));
    const key = days.join(',');
    const group = groups.get(key) ?? { days, times: new Set<string>() };
    s.times.forEach((t) => group.times.add(t));
    groups.set(key, group);
  }
  if (groups.size === 0) return 'No posting schedule · add one on the web';

  const parts = [...groups.values()].map(({ days, times }) => {
    const sorted = [...times].sort();
    return `${sorted.length}×/day · ${dayRange(days)} · ${sorted.map(shortTime).join(', ')}`;
  });
  return `Posts ${parts.join('; ')}`;
}

/** "Every day", "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri". Days come Monday-first. */
function dayRange(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const runs: number[][] = [];
  for (const d of days) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (run && prev !== undefined && WEEK.indexOf(d) === WEEK.indexOf(prev) + 1) run.push(d);
    else runs.push([d]);
  }
  return runs
    .map((run) =>
      run.length >= 3
        ? `${DAY_SHORT[run[0]]}–${DAY_SHORT[run[run.length - 1]]}`
        : run.map((d) => DAY_SHORT[d]).join(', '),
    )
    .join(', ');
}

/** "09:00" → "9a", "18:30" → "6:30p", "00:00" → "12a". */
function shortTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'a' : 'p';
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}
