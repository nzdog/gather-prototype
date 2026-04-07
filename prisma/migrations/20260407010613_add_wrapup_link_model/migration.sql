-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InviteEventType" ADD VALUE 'WRAPUP_MESSAGE_SENT';
ALTER TYPE "InviteEventType" ADD VALUE 'WRAPUP_MESSAGE_FAILED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "wrappedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WrapUpLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "channel" TEXT NOT NULL,
    "dispatched" BOOLEAN NOT NULL DEFAULT false,
    "dispatchedAt" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "failReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrapUpLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrapUpLink_token_key" ON "WrapUpLink"("token");

-- CreateIndex
CREATE INDEX "WrapUpLink_eventId_idx" ON "WrapUpLink"("eventId");

-- CreateIndex
CREATE INDEX "WrapUpLink_token_idx" ON "WrapUpLink"("token");

-- CreateIndex
CREATE INDEX "WrapUpLink_dispatched_createdAt_idx" ON "WrapUpLink"("dispatched", "createdAt");

-- AddForeignKey
ALTER TABLE "WrapUpLink" ADD CONSTRAINT "WrapUpLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrapUpLink" ADD CONSTRAINT "WrapUpLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
