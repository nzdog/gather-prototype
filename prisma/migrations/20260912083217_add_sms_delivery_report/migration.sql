-- CreateTable
CREATE TABLE "SmsDeliveryReport" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "detail" TEXT,
    "providerJobNumber" TEXT,
    "providerSentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteEventId" TEXT,
    "eventId" TEXT,
    "personId" TEXT,

    CONSTRAINT "SmsDeliveryReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsDeliveryReport_providerMessageId_idx" ON "SmsDeliveryReport"("providerMessageId");

-- CreateIndex
CREATE INDEX "SmsDeliveryReport_destination_idx" ON "SmsDeliveryReport"("destination");

-- CreateIndex
CREATE INDEX "SmsDeliveryReport_receivedAt_idx" ON "SmsDeliveryReport"("receivedAt");

-- CreateIndex
CREATE INDEX "SmsDeliveryReport_eventId_idx" ON "SmsDeliveryReport"("eventId");

-- CreateIndex
CREATE INDEX "SmsDeliveryReport_inviteEventId_idx" ON "SmsDeliveryReport"("inviteEventId");

-- AddForeignKey
ALTER TABLE "SmsDeliveryReport" ADD CONSTRAINT "SmsDeliveryReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsDeliveryReport" ADD CONSTRAINT "SmsDeliveryReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
