/*
  Warnings:

  - A unique constraint covering the columns `[eventId,sequence]` on the table `AuditEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('HOST', 'COHOST', 'COORDINATOR', 'GUEST', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "AuditEntry" DROP CONSTRAINT "AuditEntry_actorId_fkey";

-- AlterTable
ALTER TABLE "AuditEntry" ADD COLUMN     "actorKind" "ActorKind" NOT NULL DEFAULT 'HOST',
ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "changeSetId" TEXT,
ADD COLUMN     "field" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reasonRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sequence" INTEGER,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuditEntry_eventId_timestamp_idx" ON "AuditEntry"("eventId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEntry_changeSetId_idx" ON "AuditEntry"("changeSetId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEntry_eventId_sequence_key" ON "AuditEntry"("eventId", "sequence");

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
