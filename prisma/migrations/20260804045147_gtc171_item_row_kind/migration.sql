-- CreateEnum
CREATE TYPE "RowKind" AS ENUM ('ITEM', 'TASK');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "kind" "RowKind" NOT NULL DEFAULT 'ITEM';
