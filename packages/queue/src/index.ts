// Scheduling
export {
  ensureQueue,
  recomputeSchedule,
  rescheduleAllActiveQueues,
  getUpcoming,
  type UpcomingPost,
} from './scheduler';
export {
  getCalendar,
  type Calendar,
  type CalendarChip,
  type CalendarPost,
  type CalendarRange,
  type CalendarState,
} from './calendar';
export { generateSlots, type Slot, type ScheduleRule } from './slots';

// Smart ordering
export { smartArrangeQueue } from './service';
export { orderBySpacing, type OrderableItem } from './ordering';
export { readEmbeddings, cosineSimilarity } from './embeddings';

// Float-position helpers
export { appendPosition, positionBetween, normalizedPositions } from './positions';

// Config
export { HORIZON_DAYS, MAX_SLOTS, POSITION_STEP } from './config';
