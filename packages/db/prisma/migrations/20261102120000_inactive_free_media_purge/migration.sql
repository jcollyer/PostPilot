-- Inactive free account media purge.
--
-- A free account that goes INACTIVE_MEDIA_PURGE_DAYS (180) without activity
-- has its uploaded media removed from R2, after emails at 150 and 173 days.
-- The account, its settings, metadata and post history are all kept. Paid
-- accounts and accounts already scheduled for deletion are never touched.
--
-- `lastActiveAt` is written by sign-in, authenticated API use, uploads and
-- successful publishes, at most once a day per user. The two warning stamps
-- record which emails have gone out in the current inactive stretch; any
-- activity clears them.
ALTER TABLE "user" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user" ADD COLUMN "inactivityWarningSentAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "inactivityFinalWarningSentAt" TIMESTAMP(3);

-- Images get the same flag videos have had since source retention. The photo
-- row survives with its metadata and post history; only the file goes.
ALTER TABLE "Image" ADD COLUMN "sourceDeletedAt" TIMESTAMP(3);

-- Backfill: nobody has a recorded activity time yet, so take the best evidence
-- there is — the newest session refresh (Better Auth touches a session at most
-- once a day while it is in use), or the signup time for someone with no live
-- session. The column default above would otherwise stamp everyone with the
-- moment this migration ran, which is also safe but throws away the history.
-- Either way the first warning goes out no sooner than the first nightly sweep,
-- and no purge can run until 30 days after it.
UPDATE "user" u
SET "lastActiveAt" = GREATEST(
  u."createdAt",
  COALESCE((SELECT MAX(s."updatedAt") FROM "session" s WHERE s."userId" = u."id"), u."createdAt")
);
