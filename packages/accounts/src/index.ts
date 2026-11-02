// Account deletion: soft delete, restore, and the daily purge
export {
  requestAccountDeletion,
  restoreAccount,
  sweepAccountDeletions,
  type DeletionRequestResult,
  type AccountDeletionSweepResult,
} from './deletion';

// Activity tracking and the inactive free account media purge
export { isActivityStale, recordActivity } from './activity';
export {
  mediaRemovalDate,
  sweepInactiveFreeAccounts,
  type InactiveMediaSweepResult,
} from './inactivity';
