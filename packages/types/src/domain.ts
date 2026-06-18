import { z } from 'zod';

/**
 * Shared domain enums + value-object schemas for PostPilot.
 *
 * These mirror the Prisma enums in packages/db so web, mobile, and the API/
 * workers validate against one definition. Keep the string values in sync with
 * schema.prisma — they are the same tokens stored in Postgres.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const platformSchema = z.enum(['TIKTOK', 'INSTAGRAM', 'YOUTUBE']);
export type Platform = z.infer<typeof platformSchema>;

/** Human-friendly labels for the supported platforms. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram Reels',
  YOUTUBE: 'YouTube Shorts',
};

export const connectionStatusSchema = z.enum([
  'ACTIVE',
  'NEEDS_RECONNECT',
  'PAUSED',
  'DISCONNECTED',
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const mediaStatusSchema = z.enum(['UPLOADING', 'PROCESSING', 'READY', 'FAILED']);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const aiPipelineStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
export type AiPipelineStatus = z.infer<typeof aiPipelineStatusSchema>;

export const queueStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export type QueueStatus = z.infer<typeof queueStatusSchema>;

export const queueItemStatusSchema = z.enum([
  'PENDING',
  'SCHEDULED',
  'PUBLISHING',
  'COMPLETED',
  'HELD',
  'SKIPPED',
  'CANCELED',
]);
export type QueueItemStatus = z.infer<typeof queueItemStatusSchema>;

export const publishStatusSchema = z.enum([
  'PENDING',
  'SCHEDULED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'HELD',
  'SKIPPED',
]);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const duplicateTypeSchema = z.enum(['EXACT', 'NEAR', 'TRIMMED', 'REEXPORT']);
export type DuplicateType = z.infer<typeof duplicateTypeSchema>;

export const notificationTypeSchema = z.enum([
  'RECONNECT_REQUIRED',
  'CONTENT_REJECTED',
  'PUBLISH_FAILED',
  'QUEUE_LOW',
  'QUEUE_EMPTY',
  'QUEUE_RESUMED',
  'SYSTEM',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationChannelSchema = z.enum(['EMAIL', 'PUSH', 'SMS']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

/** Dimension of the pgvector embedding column (must match schema.prisma). */
export const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Schedule rule (value object)
// ---------------------------------------------------------------------------

/** "HH:MM" 24-hour time, e.g. "09:00" or "17:30". */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 09:00');

/**
 * A recurring posting schedule expressed without a calendar UI: which weekdays
 * (0=Sunday..6=Saturday), at which times, in which timezone, scoped to which
 * platforms (empty = all connected platforms).
 *
 * Examples:
 *   - Every day at 9am:  { daysOfWeek: [0,1,2,3,4,5,6], times: ["09:00"] }
 *   - Weekdays:          { daysOfWeek: [1,2,3,4,5],     times: ["09:00"] }
 *   - Mon/Wed/Fri:       { daysOfWeek: [1,3,5],         times: ["09:00"] }
 *   - Twice daily:       { daysOfWeek: [0,1,2,3,4,5,6], times: ["09:00","17:00"] }
 */
export const scheduleRuleSchema = z.object({
  name: z.string().trim().max(80).optional(),
  timezone: z.string().min(1).default('UTC'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day'),
  times: z.array(timeOfDaySchema).min(1, 'Add at least one time'),
  platforms: z.array(platformSchema).default([]),
  isActive: z.boolean().default(true),
});
export type ScheduleRuleInput = z.infer<typeof scheduleRuleSchema>;
