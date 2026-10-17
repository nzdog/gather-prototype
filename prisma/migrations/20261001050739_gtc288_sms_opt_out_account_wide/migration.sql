-- DropForeignKey
ALTER TABLE "SmsOptOut" DROP CONSTRAINT "SmsOptOut_hostId_fkey";

-- DropIndex
DROP INDEX "SmsOptOut_phoneNumber_hostId_key";

-- AlterTable
ALTER TABLE "SmsOptOut" ADD COLUMN     "attribution" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "inviteEventId" TEXT,
ADD COLUMN     "optedInAt" TIMESTAMP(3),
ADD COLUMN     "optedInReceivedId" TEXT,
ADD COLUMN     "personId" TEXT,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "providerReceivedId" TEXT,
ALTER COLUMN "hostId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TextReply" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "providerReceivedId" TEXT,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "inviteEventId" TEXT,

    CONSTRAINT "TextReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TextReply_providerReceivedId_idx" ON "TextReply"("providerReceivedId");

-- CreateIndex
CREATE INDEX "TextReply_providerMessageId_idx" ON "TextReply"("providerMessageId");

-- CreateIndex
CREATE INDEX "TextReply_eventId_idx" ON "TextReply"("eventId");

-- CreateIndex
CREATE INDEX "TextReply_personId_idx" ON "TextReply"("personId");

-- CreateIndex
CREATE INDEX "SmsOptOut_providerReceivedId_idx" ON "SmsOptOut"("providerReceivedId");

-- CreateIndex
CREATE INDEX "SmsOptOut_optedInReceivedId_idx" ON "SmsOptOut"("optedInReceivedId");

-- CreateIndex
CREATE INDEX "SmsOptOut_eventId_idx" ON "SmsOptOut"("eventId");

-- CreateIndex
CREATE INDEX "SmsOptOut_personId_idx" ON "SmsOptOut"("personId");

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextReply" ADD CONSTRAINT "TextReply_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextReply" ADD CONSTRAINT "TextReply_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
