-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "displayOrder" INTEGER;

-- Backfill: assign displayOrder sequentially per team, ordered by createdAt ASC.
UPDATE "Item" SET "displayOrder" = subq.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "teamId" ORDER BY "createdAt" ASC) AS rn
  FROM "Item"
) subq
WHERE "Item".id = subq.id;

-- CreateIndex
CREATE INDEX "Item_teamId_displayOrder_idx" ON "Item"("teamId", "displayOrder");
