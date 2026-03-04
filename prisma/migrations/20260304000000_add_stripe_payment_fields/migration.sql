-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "amountPaid" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Event_stripePaymentIntentId_key" ON "Event"("stripePaymentIntentId");
