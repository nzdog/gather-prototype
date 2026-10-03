/*
  Warnings:

  - You are about to drop the column `name` on the `Household` table. All the data in the column will be lost.
  - You are about to drop the column `proxyPersonId` on the `Household` table. All the data in the column will be lost.
  - You are about to drop the `HouseholdMember` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Household` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('PRIMARY_CONTACT', 'PARTNER', 'GUEST');

-- DropForeignKey
ALTER TABLE "Household" DROP CONSTRAINT "Household_proxyPersonId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdMember" DROP CONSTRAINT "HouseholdMember_householdId_fkey";

-- DropForeignKey
ALTER TABLE "HouseholdMember" DROP CONSTRAINT "HouseholdMember_personEventId_fkey";

-- DropIndex
DROP INDEX "Household_eventId_proxyPersonId_key";

-- AlterTable
ALTER TABLE "Household" DROP COLUMN "name",
DROP COLUMN "proxyPersonId",
ADD COLUMN     "childCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "householdId" TEXT,
ADD COLUMN     "householdRole" "HouseholdRole";

-- DropTable
DROP TABLE "HouseholdMember";

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
