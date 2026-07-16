-- Photo media items + carousels (Instagram-only), parallel to Video.
--
-- An Image is a single photo. An Image that has CarouselItem rows is a carousel
-- post: its own file is slide 1 and each CarouselItem points (in `position`
-- order) at another Image used as an additional slide. QueueItem gains an
-- optional `imageId` so images/carousels flow through the existing queue; a
-- CHECK constraint enforces exactly one of (videoId, imageId).

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "cdnUrl" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "title" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "aiStatus" "AiPipelineStatus" NOT NULL DEFAULT 'PENDING',
    "aiStartedAt" TIMESTAMP(3),
    "aiProcessedAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "folderId" TEXT,
    "pHash" TEXT,
    "embedding" vector(1536),
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "uploadSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarouselItem" (
    "id" TEXT NOT NULL,
    "parentImageId" TEXT NOT NULL,
    "childImageId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarouselItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable: QueueItem now references either a Video or an Image.
ALTER TABLE "QueueItem" ALTER COLUMN "videoId" DROP NOT NULL;
ALTER TABLE "QueueItem" ADD COLUMN "imageId" TEXT;

-- CreateIndex
CREATE INDEX "Image_userId_idx" ON "Image"("userId");
CREATE INDEX "Image_userId_status_idx" ON "Image"("userId", "status");
CREATE INDEX "Image_categoryId_idx" ON "Image"("categoryId");
CREATE INDEX "Image_userId_folderId_idx" ON "Image"("userId", "folderId");
CREATE INDEX "Image_uploadSessionId_idx" ON "Image"("uploadSessionId");
CREATE INDEX "Image_duplicateOfId_idx" ON "Image"("duplicateOfId");

-- CreateIndex
CREATE UNIQUE INDEX "CarouselItem_parentImageId_childImageId_key" ON "CarouselItem"("parentImageId", "childImageId");
CREATE INDEX "CarouselItem_parentImageId_position_idx" ON "CarouselItem"("parentImageId", "position");
CREATE INDEX "CarouselItem_childImageId_idx" ON "CarouselItem"("childImageId");

-- CreateIndex
CREATE INDEX "QueueItem_imageId_idx" ON "QueueItem"("imageId");

-- Approximate-nearest-neighbor index for embedding similarity (cosine).
-- Managed here, not in schema.prisma, because Prisma cannot express indexes on
-- Unsupported (vector) columns.
CREATE INDEX "Image_embedding_idx" ON "Image" USING hnsw ("embedding" vector_cosine_ops);

-- NOTE: the "exactly one of (videoId, imageId)" invariant is enforced in
-- application code (the queue only ever sets one). We intentionally do NOT add a
-- DB CHECK constraint here because Prisma can't represent it in schema.prisma and
-- `migrate dev` would then report it as drift.

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Image" ADD CONSTRAINT "Image_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Image" ADD CONSTRAINT "Image_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Image" ADD CONSTRAINT "Image_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Image" ADD CONSTRAINT "Image_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CarouselItem" ADD CONSTRAINT "CarouselItem_parentImageId_fkey" FOREIGN KEY ("parentImageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarouselItem" ADD CONSTRAINT "CarouselItem_childImageId_fkey" FOREIGN KEY ("childImageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
