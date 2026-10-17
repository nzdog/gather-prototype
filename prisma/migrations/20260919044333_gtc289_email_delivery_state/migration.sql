-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "deliveryCheckedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryPollDoneAt" TIMESTAMP(3),
ADD COLUMN     "deliveryState" TEXT,
ADD COLUMN     "providerErrorCode" TEXT,
ADD COLUMN     "providerLastEvent" TEXT;

-- CreateIndex
CREATE INDEX "OutboundMessage_deliveryPollDoneAt_deliveryCheckedAt_idx" ON "OutboundMessage"("deliveryPollDoneAt", "deliveryCheckedAt");
