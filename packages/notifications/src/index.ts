// Dispatch
export { dispatchPending, type DispatchResult } from './dispatcher';

// Producers
export { createNotification } from './notify';
export { computeQueueHealth, runQueueHealthChecks, type QueueHealth } from './queue-health';

// Transactional mail outside the alert pipeline (account lifecycle notices)
export { sendEmail } from './channels';

// Config / routing
export {
  channelsFor,
  channelsForUser,
  NOTIFICATION_TYPE_META,
  type NotificationTypeMeta,
  type ChannelPreference,
  isEmailConfigured,
  isSmsConfigured,
  THROTTLE_WINDOW_MS,
  QUEUE_LOW_THRESHOLD_DAYS,
} from './config';
