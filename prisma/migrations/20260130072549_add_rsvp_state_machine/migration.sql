-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'YES', 'NO', 'NOT_SURE');

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "rsvpRespondedAt" TIMESTAMP(3),
ADD COLUMN     "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING';
