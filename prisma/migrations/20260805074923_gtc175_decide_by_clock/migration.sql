-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "decideByFollowupSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "decideByOffsetHours" INTEGER;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "decideByOffsetHours" INTEGER;
