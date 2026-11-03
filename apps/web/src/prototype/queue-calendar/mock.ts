// PROTOTYPE — throwaway mock data for the queue calendar prototype (map #104,
// ticket #105). Not carried into the real build.

import type { Platform } from '@postpilot/types';

/** What a calendar chip stands for in the prototype: one queue item on one day. */
export type MockPost = {
  id: string;
  title: string;
  at: Date;
  platforms: Platform[];
  /** published = already out; scheduled = inside the 21-day plan; projected = beyond it. */
  state: 'published' | 'scheduled' | 'projected' | 'held';
  /** A stable hue so placeholder thumbnails read as different videos. */
  hue: number;
};

/** The scheduler's materialized horizon today (`HORIZON_DAYS`). */
export const PLAN_HORIZON_DAYS = 21;

const TITLES = [
  'Empire State at night',
  'Brooklyn Bridge sunrise drone',
  'Central Park in fog',
  'Hudson Yards timelapse',
  'Coney Island boardwalk',
  'DUMBO rooftop golden hour',
  'Times Square rain walk',
  'Staten Island ferry pass',
  'High Line in snow',
  'Chrysler Building close-up',
  'Williamsburg street food',
  'Battery Park harbor',
  'Grand Central concourse',
  'Queensboro Bridge orbit',
  'Rockaway surf morning',
  'Flatiron blue hour',
];

const ALL: Platform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE'];

function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

/**
 * Two schedules, like a real creator might run: every day 9:00 to all
 * platforms, plus Tue/Thu 17:00 TikTok-only. Past 40 days are published, the
 * next 21 are the materialized plan, and the next ~60 after that are projected.
 */
export function buildMockPosts(): MockPost[] {
  const posts: MockPost[] = [];
  let n = 0;
  for (let offset = -40; offset <= 80; offset++) {
    const slots: { hour: number; platforms: Platform[] }[] = [{ hour: 9, platforms: ALL }];
    const weekday = at(offset, 0).getDay();
    if (weekday === 2 || weekday === 4) slots.push({ hour: 17, platforms: ['TIKTOK'] });

    for (const slot of slots) {
      const when = at(offset, slot.hour);
      const isPast = when.getTime() <= Date.now();
      // Leave a gap a week out, like a skipped day, so empty future days show.
      if (offset === 6 && slot.hour === 9) continue;
      const i = n++;
      const state: MockPost['state'] = isPast
        ? 'published'
        : offset > PLAN_HORIZON_DAYS
          ? 'projected'
          : offset === 3 && slot.hour === 9
            ? 'held'
            : 'scheduled';
      posts.push({
        id: `p${i}`,
        title: TITLES[i % TITLES.length]!,
        at: when,
        platforms: slot.platforms,
        state,
        hue: (i * 47) % 360,
      });
    }
  }
  return posts;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The 6×7 (or 5×7) grid of days covering `month`, Sunday first. */
export function monthDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
