-- AlterEnum
ALTER TYPE "OutboundKind" ADD VALUE 'CHASE_MORE';

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "handBackReminders" INTEGER,
ADD COLUMN     "handedBackAt" TIMESTAMP(3);
