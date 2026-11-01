-- Account deletion becomes a soft delete with a grace period.
--
-- Deleting an account used to remove every row on the spot. Now it
-- deactivates the account — sessions revoked, platforms disconnected, queue
-- paused, paid plan set not to renew — and keeps the library for
-- ACCOUNT_DELETION_GRACE_DAYS so a creator can sign back in and restore it.
-- The daily account-deletion sweep purges the rows and every stored file once
-- `deletionScheduledFor` passes.
--
-- `deletionReminderSentAt` records the "last chance to restore" email so the
-- sweep sends it once.
ALTER TABLE "user" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "deletionReminderSentAt" TIMESTAMP(3);

-- Drives the account-deletion sweep: only pending deletions are non-null.
CREATE INDEX "user_deletionScheduledFor_idx" ON "user"("deletionScheduledFor");
