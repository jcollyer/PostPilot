import { fmtDateTime } from '../lib/dashboard-format';
import {
  itemTitle,
  platformName,
  problemTasks,
  queueItemState,
  type Platform,
  type QueueData,
  type QueueItem,
  type QueueItemState,
  type QueueTask,
} from './queue';

/**
 * Queue item sheet model: one item's per-platform status and the actions its
 * state offers, derived from `queue.get`. The section an item sits in decides
 * the actions, using the Queue model's own rule so the sheet and the list
 * never disagree:
 *
 * - Needs attention: Retry per FAILED/HELD task, or "Reconnect <Platform> in
 *   Settings" when that task has no usable connection; then Skip.
 * - Up next: Publish now (confirmed first), Skip.
 * - Published: none; its View post links are the point.
 * - Skipped: Restore.
 *
 * Only Publish now carries a confirm: it can't be taken back, while Retry,
 * Skip and Restore can.
 */

/** What the confirm before an irreversible action says. */
export interface QueueItemConfirm {
  title: string;
  message: string;
  confirmLabel: string;
}

export type QueueItemAction =
  | { kind: 'retry'; key: string; taskId: string; label: string }
  | { kind: 'reconnect'; key: string; label: string }
  | {
      kind: 'publishNow';
      key: 'publishNow';
      label: string;
      confirm: QueueItemConfirm;
    }
  | { kind: 'skip'; key: 'skip'; label: string }
  | { kind: 'restore'; key: 'restore'; label: string };

export interface QueueItemPlatformRow {
  key: string;
  platform: Platform;
  name: string;
  status: string;
  tone: 'critical' | 'muted';
  /** The full error, for a failed task; the row only had room for a line. */
  error: string | null;
  postUrl: string | null;
}

export interface QueueItemSheet {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  state: QueueItemState;
  /** The section it sits in, e.g. "Needs attention". */
  stateLabel: string;
  platforms: QueueItemPlatformRow[];
  actions: QueueItemAction[];
}

const STATE_LABEL: Record<QueueItemState, string> = {
  attention: 'Needs attention',
  upNext: 'Up next',
  published: 'Published',
  skipped: 'Skipped',
};

export function buildQueueItemSheet(queue: QueueData, itemId: string): QueueItemSheet | null {
  const item = queue.items.find((it) => it.id === itemId);
  if (!item) return null;
  const state = queueItemState(item);
  return {
    id: item.id,
    title: itemTitle(item),
    thumbnailUrl: item.media.thumbnailUrl,
    state,
    stateLabel: STATE_LABEL[state],
    platforms: platformRows(item, state),
    actions: actions(item, state),
  };
}

// --- Actions ---------------------------------------------------------------

const SKIP = { kind: 'skip', key: 'skip', label: 'Skip' } as const;

function actions(item: QueueItem, state: QueueItemState): QueueItemAction[] {
  switch (state) {
    case 'attention':
      return [...problemTasks(item).map(taskAction), SKIP];
    case 'upNext':
      return [publishNow(item), SKIP];
    case 'published':
      return [];
    case 'skipped':
      return [{ kind: 'restore', key: 'restore', label: 'Restore' }];
  }
}

function taskAction(task: QueueTask): QueueItemAction {
  const name = platformName(task.platform);
  return task.needsConnection
    ? { kind: 'reconnect', key: `reconnect:${task.id}`, label: `Reconnect ${name} in Settings` }
    : { kind: 'retry', key: `retry:${task.id}`, taskId: task.id, label: `Retry ${name}` };
}

/** Statuses after which a platform has gone out (or is going out) already. */
const GONE_OUT = new Set<QueueTask['status']>(['UPLOADING', 'PROCESSING', 'PUBLISHED']);

function publishNow(item: QueueItem): QueueItemAction {
  const gone = new Set(item.tasks.filter((t) => GONE_OUT.has(t.status)).map((t) => t.platform));
  const left = item.postsTo.filter((p) => !gone.has(p)).map(platformName);
  const where = left.length > 0 ? `to ${joinList(left)} ` : '';
  return {
    kind: 'publishNow',
    key: 'publishNow',
    label: 'Publish now',
    confirm: {
      title: `Publish “${itemTitle(item)}” now?`,
      message: `Posts ${where}right away instead of waiting for its slot.`,
      confirmLabel: 'Publish now',
    },
  };
}

/** "A", "A and B", "A, B and C". */
function joinList(parts: string[]): string {
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// --- Platforms -------------------------------------------------------------

function platformRows(item: QueueItem, state: QueueItemState): QueueItemPlatformRow[] {
  const rows = item.tasks.map(taskRow);
  // Up next items get their tasks slot by slot, so a platform can have none yet.
  if (state === 'upNext') {
    const hasTask = new Set(item.tasks.map((t) => t.platform));
    for (const platform of item.postsTo.filter((p) => !hasTask.has(p))) {
      rows.push({
        key: `waiting:${platform}`,
        platform,
        name: platformName(platform),
        status: 'Waiting for a slot',
        tone: 'muted',
        error: null,
        postUrl: null,
      });
    }
  }
  return rows;
}

function taskRow(task: QueueTask): QueueItemPlatformRow {
  const [status, tone] = taskStatus(task);
  return {
    key: task.id,
    platform: task.platform,
    name: platformName(task.platform),
    status,
    tone,
    error: task.status === 'FAILED' || task.status === 'HELD' ? task.lastError || null : null,
    postUrl: task.postUrl,
  };
}

function taskStatus(task: QueueTask): [string, QueueItemPlatformRow['tone']] {
  switch (task.status) {
    case 'PUBLISHED':
      return [task.publishedAt ? `Posted ${fmtDateTime(task.publishedAt)}` : 'Posted', 'muted'];
    case 'FAILED':
      return ['Failed', 'critical'];
    case 'HELD':
      return ['On hold · needs reconnecting', 'critical'];
    case 'UPLOADING':
    case 'PROCESSING':
      return ['Publishing now', 'muted'];
    case 'SKIPPED':
      return ['Skipped', 'muted'];
    case 'PENDING':
    case 'SCHEDULED':
      return [`Scheduled ${fmtDateTime(task.scheduledAt)}`, 'muted'];
  }
}
