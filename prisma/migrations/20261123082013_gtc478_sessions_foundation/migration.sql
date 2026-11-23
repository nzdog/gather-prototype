-- AlterTable
ALTER TABLE "Day" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SessionAbsence" (
    "id" TEXT NOT NULL,
    "personEventId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionAbsence_dayId_idx" ON "SessionAbsence"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAbsence_personEventId_dayId_key" ON "SessionAbsence"("personEventId", "dayId");

-- AddForeignKey
ALTER TABLE "SessionAbsence" ADD CONSTRAINT "SessionAbsence_personEventId_fkey" FOREIGN KEY ("personEventId") REFERENCES "PersonEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAbsence" ADD CONSTRAINT "SessionAbsence_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
