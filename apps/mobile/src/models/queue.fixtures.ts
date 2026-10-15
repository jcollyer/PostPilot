import type { QueueData, QueueSchedules } from './queue';

/** Shared `queue.get` / `listSchedules` fixtures for the Queue model tests. */

const HOUR = 3_600_000;
// Fixture dates sit at midday UTC, so formatted dates hold in any zone from UTC-11 to UTC+11 (CI runs in UTC).
export const NOW = new Date('2026-10-14T12:00:00Z');
export const hoursFromNow = (n: number) => new Date(NOW.getTime() + n * HOUR);

export type Item = QueueData['items'][number];
export type Task = Item['tasks'][number];
export type Schedule = QueueSchedules[number];

export function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `task_${Math.random().toString(36).slice(2)}`,
    platform: 'TIKTOK',
    status: 'SCHEDULED',
    scheduledAt: hoursFromNow(24),
    publishedAt: null,
    postUrl: null,
    lastError: null,
    needsConnection: false,
    ...overrides,
  };
}

export function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    position: 1,
    status: 'PENDING',
    scheduledAt: null,
    postsTo: ['TIKTOK', 'INSTAGRAM'],
    media: {
      mediaType: 'VIDEO',
      id: `video_${id}`,
      title: `Video ${id}`,
      originalFilename: `${id}.mp4`,
      durationSec: 30,
      thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
      category: null,
      isDuplicate: false,
      targetPlatforms: [],
    },
    tasks: [],
    ...overrides,
  };
}

export function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: `sched_${Math.random().toString(36).slice(2)}`,
    queueId: 'queue_1',
    name: null,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
    times: ['09:00', '18:00'],
    platforms: ['TIKTOK'],
    isActive: true,
    createdAt: hoursFromNow(-100),
    updatedAt: hoursFromNow(-100),
    ...overrides,
  };
}

export function queue(items: Item[], status: QueueData['status'] = 'ACTIVE'): QueueData {
  return { status, pausedAt: status === 'PAUSED' ? hoursFromNow(-1) : null, items };
}
