-- Denormalized publish history on media rows so the Media Library can show a
-- "Posted" badge and per-platform post links without joining through the queue.
-- `postedAt` is the first successful publish time (null = never posted).
-- `postedPosts` is a JSON array of { platform, postedAt, postUrl } capturing the
-- latest successful post per platform. Written by the publishing runner on every
-- PUBLISHED task (scheduled or "Publish now"); persists even after the queue item
-- is removed, so re-queuing a posted item doesn't lose its history.
ALTER TABLE "Video" ADD COLUMN "postedAt" TIMESTAMP(3);
ALTER TABLE "Video" ADD COLUMN "postedPosts" JSONB;
ALTER TABLE "Image" ADD COLUMN "postedAt" TIMESTAMP(3);
ALTER TABLE "Image" ADD COLUMN "postedPosts" JSONB;
