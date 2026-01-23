-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "sharedLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_sharedLinkToken_key" ON "Event"("sharedLinkToken");
