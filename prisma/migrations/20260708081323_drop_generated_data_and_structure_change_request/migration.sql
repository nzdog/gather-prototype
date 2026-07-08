/*
  Warnings:

  - You are about to drop the column `generatedData` on the `EventSetup` table. All the data in the column will be lost.
  - You are about to drop the `StructureChangeRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StructureChangeRequest" DROP CONSTRAINT "StructureChangeRequest_eventId_fkey";

-- AlterTable
ALTER TABLE "EventSetup" DROP COLUMN "generatedData";

-- DropTable
DROP TABLE "StructureChangeRequest";

-- DropEnum
DROP TYPE "StructureChangeStatus";

-- DropEnum
DROP TYPE "StructureChangeType";
