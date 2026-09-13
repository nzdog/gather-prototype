-- CreateEnum
CREATE TYPE "NudgePace" AS ENUM ('STANDARD', 'RELAXED', 'OFF');

-- CreateEnum
CREATE TYPE "NudgeMark" AS ENUM ('GENTLE', 'DONT_CHASE');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "nudgePace" "NudgePace";

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "nudgeMark" "NudgeMark";
