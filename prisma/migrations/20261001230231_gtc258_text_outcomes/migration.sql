/*
  Warnings:

  - A unique constraint covering the columns `[retryOfId]` on the table `OutboundMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OutboundKind" ADD VALUE 'DECIDE_BY_FOLLOWUP';
ALTER TYPE "OutboundKind" ADD VALUE 'THANK_YOU';
ALTER TYPE "OutboundKind" ADD VALUE 'HOST_NUDGE';

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "destination" TEXT,
ADD COLUMN     "retryOfId" TEXT;

-- CreateTable
CREATE TABLE "TextBlock" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "outboundMessageId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "TextBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TextBlock_phoneNumber_key" ON "TextBlock"("phoneNumber");

-- CreateIndex
CREATE INDEX "TextBlock_eventId_idx" ON "TextBlock"("eventId");

-- CreateIndex
CREATE INDEX "TextBlock_outboundMessageId_idx" ON "TextBlock"("outboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_retryOfId_key" ON "OutboundMessage"("retryOfId");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextBlock" ADD CONSTRAINT "TextBlock_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextBlock" ADD CONSTRAINT "TextBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
