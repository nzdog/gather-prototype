-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "contactPersonEventId" TEXT;

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "isYoungPerson" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Household_contactPersonEventId_idx" ON "Household"("contactPersonEventId");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_contactPersonEventId_fkey" FOREIGN KEY ("contactPersonEventId") REFERENCES "PersonEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
