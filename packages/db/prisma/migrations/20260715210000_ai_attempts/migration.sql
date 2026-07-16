-- Count how many times the AI worker has moved a row into RUNNING. Incremented
-- up front (before the heavy pipeline work) so it survives a run killed
-- mid-pipeline by an OOM/restart, letting the worker retire a poison-pill item
-- to FAILED after AI_MAX_ATTEMPTS instead of reclaiming and retrying it forever.
ALTER TABLE "Video" ADD COLUMN "aiAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Image" ADD COLUMN "aiAttempts" INTEGER NOT NULL DEFAULT 0;
