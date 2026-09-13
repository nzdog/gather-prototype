-- AlterEnum
ALTER TYPE "HouseholdRole" ADD VALUE 'CHILD';

-- RenameColumn
ALTER TABLE "Household" RENAME COLUMN "childCount" TO "littleCount";
