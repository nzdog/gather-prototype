-- CreateEnum
CREATE TYPE "InviteEventType" AS ENUM ('INVITE_SEND_CONFIRMED', 'LINK_OPENED', 'NAME_CLAIMED', 'RESPONSE_SUBMITTED', 'NUDGE_SENT_AUTO', 'NUDGE_DEFERRED_QUIET', 'SMS_OPT_OUT_RECEIVED', 'SMS_BLOCKED_OPT_OUT', 'SMS_BLOCKED_INVALID', 'SMS_SEND_FAILED', 'MANUAL_OVERRIDE_MARKED', 'CLAIM_RESET');

-- AlterTable
ALTER TABLE "AccessToken" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "smsOptedOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InviteEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT,
    "type" "InviteEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteEvent_eventId_idx" ON "InviteEvent"("eventId");

-- CreateIndex
CREATE INDEX "InviteEvent_personId_idx" ON "InviteEvent"("personId");

-- CreateIndex
CREATE INDEX "InviteEvent_type_idx" ON "InviteEvent"("type");

-- CreateIndex
CREATE INDEX "InviteEvent_createdAt_idx" ON "InviteEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "InviteEvent" ADD CONSTRAINT "InviteEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteEvent" ADD CONSTRAINT "InviteEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
