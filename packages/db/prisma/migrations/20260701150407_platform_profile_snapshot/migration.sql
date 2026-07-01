-- AlterTable
ALTER TABLE "PlatformConnection" ADD COLUMN "profileBio" TEXT,
ADD COLUMN "profileRecentPosts" JSONB,
ADD COLUMN "profileFetchedAt" TIMESTAMP(3);
