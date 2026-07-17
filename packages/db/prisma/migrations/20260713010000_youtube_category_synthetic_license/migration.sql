-- AlterTable
ALTER TABLE "VideoPlatformMeta" ADD COLUMN "youtubeCategoryId" TEXT NOT NULL DEFAULT '22';
ALTER TABLE "VideoPlatformMeta" ADD COLUMN "youtubeContainsSyntheticMedia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VideoPlatformMeta" ADD COLUMN "youtubeLicense" TEXT NOT NULL DEFAULT 'youtube';
