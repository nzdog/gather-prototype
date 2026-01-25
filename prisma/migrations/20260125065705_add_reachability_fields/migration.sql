-- CreateEnum
CREATE TYPE "ReachabilityTier" AS ENUM ('DIRECT', 'PROXY', 'SHARED', 'UNTRACKABLE');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('EMAIL', 'SMS', 'NONE');

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "contactMethod" "ContactMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "proxyPersonEventId" TEXT,
ADD COLUMN     "reachabilityTier" "ReachabilityTier" NOT NULL DEFAULT 'UNTRACKABLE';

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_proxyPersonEventId_fkey" FOREIGN KEY ("proxyPersonEventId") REFERENCES "PersonEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
