-- AlterTable
ALTER TABLE "EventSetup"
  ADD COLUMN "setUpData" JSONB,
  ADD COLUMN "cleanUpData" JSONB,
  ADD COLUMN "otherJobsOtherData" JSONB;
