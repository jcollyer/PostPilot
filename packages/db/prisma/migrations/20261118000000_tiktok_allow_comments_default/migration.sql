-- Per-user default for TikTok comments.
--
-- TikTok's Direct Post guidelines require interactions (comment/duet/stitch)
-- to be off unless the user turns them on, so this starts false for everyone.
-- Turning it on in Settings makes new videos' TikTok options start with
-- comments allowed. Existing VideoPlatformMeta rows are not touched.
ALTER TABLE "user" ADD COLUMN "tiktokAllowCommentsDefault" BOOLEAN NOT NULL DEFAULT false;
