-- Track when a video last entered RUNNING so the worker can reclaim rows
-- orphaned in RUNNING by a killed run (OOM / maxDuration / restart) instead of
-- leaving them stuck forever.
ALTER TABLE "Video" ADD COLUMN "aiStartedAt" TIMESTAMP(3);
