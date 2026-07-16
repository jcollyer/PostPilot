-- DropIndex
DROP INDEX "Image_embedding_idx";

-- AlterTable
ALTER TABLE "Image" ALTER COLUMN "hashtags" DROP DEFAULT;
