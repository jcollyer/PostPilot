import { z } from 'zod';

import { scheduleRuleSchema } from './domain';

/**
 * Queue + scheduling input validation, shared by the API and both clients.
 * The queue is one ordered list per user; items carry a float `position`;
 * recurring `Schedule`s drive when items publish (see scheduleRuleSchema).
 */

/** Add one or more videos to the end of the queue. */
export const addVideosToQueueSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(500),
});
export type AddVideosToQueueInput = z.infer<typeof addVideosToQueueSchema>;

/** Add one or more images/carousels to the end of the queue (Instagram-only). */
export const addImagesToQueueSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(500),
});
export type AddImagesToQueueInput = z.infer<typeof addImagesToQueueSchema>;

export const queueItemIdSchema = z.object({ itemId: z.string().min(1) });
export type QueueItemIdInput = z.infer<typeof queueItemIdSchema>;

/**
 * Move an item to sit immediately after `afterItemId` (null = move to the
 * front). The server computes the new float position from its neighbours.
 */
export const moveQueueItemSchema = z.object({
  itemId: z.string().min(1),
  afterItemId: z.string().min(1).nullable(),
});
export type MoveQueueItemInput = z.infer<typeof moveQueueItemSchema>;

/** Create a recurring schedule (days/times/timezone/platforms). */
export const createScheduleSchema = scheduleRuleSchema;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/** Update an existing schedule (all rule fields optional, plus the id). */
export const updateScheduleSchema = scheduleRuleSchema.partial().extend({
  scheduleId: z.string().min(1),
});
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export const scheduleIdSchema = z.object({ scheduleId: z.string().min(1) });
export type ScheduleIdInput = z.infer<typeof scheduleIdSchema>;

/** How many upcoming posts to return for the timeline view. */
export const upcomingSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});
export type UpcomingInput = z.infer<typeof upcomingSchema>;

/** Is `tz` an IANA time zone this runtime knows? */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * One month grid of the queue calendar: `from`/`to` are the grid's first and
 * last-exclusive instants, and `timeZone` is the viewer's, which decides the
 * local day each post falls on.
 */
export const calendarSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  })
  .refine((r) => r.from < r.to, 'Range must end after it starts')
  // A month grid is at most six weeks; a little slack for DST.
  .refine((r) => r.to.getTime() - r.from.getTime() <= 43 * 86_400_000, 'Range too long');
export type CalendarInput = z.infer<typeof calendarSchema>;

/** Retry a single failed/held publish task. */
export const retryPublishSchema = z.object({ taskId: z.string().min(1) });
export type RetryPublishInput = z.infer<typeof retryPublishSchema>;
