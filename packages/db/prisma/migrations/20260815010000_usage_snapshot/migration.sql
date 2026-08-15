-- Per-user daily usage history.
--
-- Live usage is always recomputed from Video/Image (see @postpilot/usage); this
-- table is history, so a missed night leaves a gap rather than corrupting the
-- numbers anyone is billed or capped on.
--
-- It exists to answer two questions the live figures can't:
--   1. Is a user trending toward their plan's storage/video caps?
--   2. Does the ~182 MB/video assumption behind the pricing model hold once
--      real creators are uploading? `videoBytes / videosWithSource` is that
--      average, tracked over time.
--
-- `storageBytes` excludes videos whose source the retention sweep removed —
-- that is the point of retention, and counting them would hide its effect.
-- Derived thumbnails and covers are not counted: no size is recorded for them
-- and they are well under 1% of a video's footprint.
CREATE TABLE "UsageSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "storageBytes" BIGINT NOT NULL,
    "videoBytes" BIGINT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "videosWithSource" INTEGER NOT NULL,
    "videosProcessed" INTEGER NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- One row per user per day; the nightly job upserts on this.
CREATE UNIQUE INDEX "UsageSnapshot_userId_day_key" ON "UsageSnapshot"("userId", "day");

-- Supports fleet-wide reporting for a given day ("what did everyone look like
-- last Tuesday"), which is the shape the pricing questions are asked in.
CREATE INDEX "UsageSnapshot_day_idx" ON "UsageSnapshot"("day");

ALTER TABLE "UsageSnapshot" ADD CONSTRAINT "UsageSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
