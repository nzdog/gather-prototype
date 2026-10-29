-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "sampleEventId" TEXT;

-- CreateIndex
CREATE INDEX "Person_sampleEventId_idx" ON "Person"("sampleEventId");
