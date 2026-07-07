-- Add profile picture URL to platform connections (e.g. Instagram profile_picture_url).
ALTER TABLE "PlatformConnection" ADD COLUMN "avatarUrl" TEXT;
