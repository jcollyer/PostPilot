-- CreateEnum
CREATE TYPE "EmojiPreference" AS ENUM ('NONE', 'MODERATE', 'HEAVY');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "creatorOnboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niche" TEXT,
    "tone" TEXT,
    "audience" TEXT,
    "bannedWords" TEXT[],
    "exampleCaption" TEXT,
    "emojiPreference" "EmojiPreference" NOT NULL DEFAULT 'MODERATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
