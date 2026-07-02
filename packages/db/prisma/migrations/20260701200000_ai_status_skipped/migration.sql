-- AlterEnum
-- Adds SKIPPED to AiPipelineStatus: reached when a user clears a stopped
-- (CANCELED) video. The video stays in the library but is intentionally
-- excluded from AI metadata generation and the summary bar.
ALTER TYPE "AiPipelineStatus" ADD VALUE 'SKIPPED';
