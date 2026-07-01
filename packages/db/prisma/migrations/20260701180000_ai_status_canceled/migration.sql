-- AlterEnum
-- Adds CANCELED to AiPipelineStatus: reached when a user stops metadata
-- generation while a video is still PENDING (not yet picked up by the worker).
ALTER TYPE "AiPipelineStatus" ADD VALUE 'CANCELED';
