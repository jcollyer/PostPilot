-- Opt-in storage retention.
--
-- Storage is the recurring cost of holding a library: the AI pipeline bills once
-- per video at upload, but R2 bills every month for as long as the source file
-- is kept. Without a retention policy a library only ever grows, so a creator's
-- storage bill climbs forever even though they publish and move on.
--
-- `user.deleteSourceAfterPublish` opts a creator into having source files
-- removed once they've been published for a retention window. It is off by
-- default and never enabled on a user's behalf — this discards their media.
--
-- `Video.sourceDeletedAt` records when the retention job removed the source.
-- Non-null means "storageKey" no longer points at a real object: the video
-- can't be re-published or re-run through the AI pipeline, but its metadata,
-- thumbnails and post history survive so the Media Library still renders it.
-- Only the source object is deleted, not the whole per-video prefix.
--
-- Videos only. Images are a rounding error against video storage, and leaving
-- them alone keeps carousels intact.
ALTER TABLE "user" ADD COLUMN "deleteSourceAfterPublish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Video" ADD COLUMN "sourceDeletedAt" TIMESTAMP(3);

-- Drives the retention sweep: scoped to opted-in users, ordered by how long ago
-- the video was published.
CREATE INDEX "Video_userId_postedAt_idx" ON "Video"("userId", "postedAt");
