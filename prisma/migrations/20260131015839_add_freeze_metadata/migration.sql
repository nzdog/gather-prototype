-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "complianceAtFreeze" DOUBLE PRECISION,
ADD COLUMN     "freezeReason" TEXT,
ADD COLUMN     "frozenAt" TIMESTAMP(3);
