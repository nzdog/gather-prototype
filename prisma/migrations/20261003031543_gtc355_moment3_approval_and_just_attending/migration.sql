-- AlterTable
ALTER TABLE "EventSetup" ADD COLUMN     "planApprovedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "justAttending" BOOLEAN NOT NULL DEFAULT false;
