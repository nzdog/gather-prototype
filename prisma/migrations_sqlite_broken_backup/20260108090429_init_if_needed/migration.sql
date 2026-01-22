/*
  Warnings:

  - You are about to drop the column `acknowledged` on the `Assignment` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AssignmentResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "ItemSource" ADD VALUE 'HOST_EDITED';

-- AlterTable
ALTER TABLE "Assignment" DROP COLUMN "acknowledged",
ADD COLUMN     "response" "AssignmentResponse" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "generatedBatchId" TEXT;
