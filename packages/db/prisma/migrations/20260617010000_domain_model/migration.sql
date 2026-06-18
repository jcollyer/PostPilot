-- PostPilot domain model (chunk 2)
-- Platform connections, media library, queue/scheduler, publishing, notifications.

-- Extension (pgvector) -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums ----------------------------------------------------------------------
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'YOUTUBE');
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT', 'PAUSED', 'DISCONNECTED');
CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "AiPipelineStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "QueueStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "QueueItemStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHING', 'COMPLETED', 'HELD', 'SKIPPED', 'CANCELED');
CREATE TYPE "PublishStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'HELD', 'SKIPPED');
CREATE TYPE "DuplicateType" AS ENUM ('EXACT', 'NEAR', 'TRIMMED', 'REEXPORT');
CREATE TYPE "DuplicateMethod" AS ENUM ('PHASH', 'EMBEDDING');
CREATE TYPE "NotificationType" AS ENUM ('RECONNECT_REQUIRED', 'CONTENT_REJECTED', 'PUBLISH_FAILED', 'QUEUE_LOW', 'QUEUE_EMPTY', 'QUEUE_RESUMED', 'SYSTEM');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH', 'SMS');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- Extend user ----------------------------------------------------------------
ALTER TABLE "user" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "user" ADD COLUMN "phoneNumber" TEXT;

-- Tables ---------------------------------------------------------------------
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalAccountId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "needsReconnectSince" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "cdnUrl" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "coverImageKey" TEXT,
    "coverImageUrl" TEXT,
    "selectedThumbnailId" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "transcript" TEXT,
    "aiStatus" "AiPipelineStatus" NOT NULL DEFAULT 'PENDING',
    "aiProcessedAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "pHash" TEXT,
    "embedding" vector(1536),
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "uploadSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoPlatformMeta" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPlatformMeta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ThumbnailCandidate" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "frameTimeSec" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThumbnailCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DuplicateMatch" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "matchedVideoId" TEXT NOT NULL,
    "type" "DuplicateType" NOT NULL,
    "method" "DuplicateMethod" NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "status" "QueueItemStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "times" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "platforms" "Platform"[] NOT NULL DEFAULT ARRAY[]::"Platform"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "connectionId" TEXT,
    "platform" "Platform" NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "externalContainerId" TEXT,
    "platformPostId" TEXT,
    "platformPostUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "platform" "Platform",
    "relatedConnectionId" TEXT,
    "relatedVideoId" TEXT,
    "dedupeKey" TEXT,
    "throttledUntil" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" "DevicePlatform",
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- Indexes --------------------------------------------------------------------
CREATE UNIQUE INDEX "PlatformConnection_userId_platform_externalAccountId_key" ON "PlatformConnection"("userId", "platform", "externalAccountId");
CREATE INDEX "PlatformConnection_userId_idx" ON "PlatformConnection"("userId");
CREATE INDEX "PlatformConnection_status_idx" ON "PlatformConnection"("status");

CREATE INDEX "UploadSession_userId_idx" ON "UploadSession"("userId");

CREATE UNIQUE INDEX "Category_userId_slug_key" ON "Category"("userId", "slug");
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

CREATE UNIQUE INDEX "Video_selectedThumbnailId_key" ON "Video"("selectedThumbnailId");
CREATE INDEX "Video_userId_idx" ON "Video"("userId");
CREATE INDEX "Video_userId_status_idx" ON "Video"("userId", "status");
CREATE INDEX "Video_categoryId_idx" ON "Video"("categoryId");
CREATE INDEX "Video_uploadSessionId_idx" ON "Video"("uploadSessionId");
CREATE INDEX "Video_duplicateOfId_idx" ON "Video"("duplicateOfId");

CREATE UNIQUE INDEX "VideoPlatformMeta_videoId_platform_key" ON "VideoPlatformMeta"("videoId", "platform");
CREATE INDEX "VideoPlatformMeta_videoId_idx" ON "VideoPlatformMeta"("videoId");

CREATE INDEX "ThumbnailCandidate_videoId_idx" ON "ThumbnailCandidate"("videoId");

CREATE UNIQUE INDEX "DuplicateMatch_videoId_matchedVideoId_method_key" ON "DuplicateMatch"("videoId", "matchedVideoId", "method");
CREATE INDEX "DuplicateMatch_videoId_idx" ON "DuplicateMatch"("videoId");
CREATE INDEX "DuplicateMatch_matchedVideoId_idx" ON "DuplicateMatch"("matchedVideoId");

CREATE UNIQUE INDEX "Queue_userId_key" ON "Queue"("userId");

CREATE INDEX "QueueItem_queueId_position_idx" ON "QueueItem"("queueId", "position");
CREATE INDEX "QueueItem_queueId_status_idx" ON "QueueItem"("queueId", "status");
CREATE INDEX "QueueItem_videoId_idx" ON "QueueItem"("videoId");

CREATE INDEX "Schedule_queueId_idx" ON "Schedule"("queueId");

CREATE INDEX "PublishTask_status_scheduledAt_idx" ON "PublishTask"("status", "scheduledAt");
CREATE INDEX "PublishTask_queueItemId_idx" ON "PublishTask"("queueItemId");
CREATE INDEX "PublishTask_connectionId_idx" ON "PublishTask"("connectionId");
CREATE INDEX "PublishTask_nextAttemptAt_idx" ON "PublishTask"("nextAttemptAt");

CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_dedupeKey_idx" ON "Notification"("userId", "dedupeKey");

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

CREATE UNIQUE INDEX "Device_expoPushToken_key" ON "Device"("expoPushToken");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- Approximate-nearest-neighbor index for embedding similarity (cosine).
-- Managed here, not in schema.prisma, because Prisma cannot express indexes on
-- Unsupported (vector) columns.
CREATE INDEX "Video_embedding_idx" ON "Video" USING hnsw ("embedding" vector_cosine_ops);

-- Foreign keys ---------------------------------------------------------------
ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Video" ADD CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_selectedThumbnailId_fkey" FOREIGN KEY ("selectedThumbnailId") REFERENCES "ThumbnailCandidate"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "Video" ADD CONSTRAINT "Video_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "VideoPlatformMeta" ADD CONSTRAINT "VideoPlatformMeta_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThumbnailCandidate" ADD CONSTRAINT "ThumbnailCandidate_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DuplicateMatch" ADD CONSTRAINT "DuplicateMatch_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuplicateMatch" ADD CONSTRAINT "DuplicateMatch_matchedVideoId_fkey" FOREIGN KEY ("matchedVideoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Queue" ADD CONSTRAINT "Queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
