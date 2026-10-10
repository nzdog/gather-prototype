-- CreateEnum
CREATE TYPE "ChaseWhenNoMobile" AS ENUM ('BY_EMAIL', 'HAND_TO_HOST');

-- CreateEnum
CREATE TYPE "OutboundKind" AS ENUM ('ASK', 'CHASE_FIRST', 'CHASE_SECOND', 'COORDINATOR_BRIEF');

-- CreateEnum
CREATE TYPE "OutboundChannel" AS ENUM ('EMAIL', 'TEXT');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "chaseWhenNoMobileDefault" "ChaseWhenNoMobile";

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "chaseException" "ChaseWhenNoMobile";

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personEventId" TEXT NOT NULL,
    "kind" "OutboundKind" NOT NULL,
    "channel" "OutboundChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerMessageId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "providerError" TEXT,
    "withheldAt" TIMESTAMP(3),
    "withheldWhy" TEXT,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundMessage_providerMessageId_idx" ON "OutboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_personEventId_idx" ON "OutboundMessage"("personEventId");

-- CreateIndex
CREATE INDEX "OutboundMessage_eventId_idx" ON "OutboundMessage"("eventId");

-- CreateIndex
CREATE INDEX "OutboundMessage_attemptedAt_createdAt_idx" ON "OutboundMessage"("attemptedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_nextAttemptAt_idx" ON "OutboundMessage"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_personEventId_fkey" FOREIGN KEY ("personEventId") REFERENCES "PersonEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
