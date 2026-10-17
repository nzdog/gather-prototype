-- AlterTable
ALTER TABLE "MagicLink" ADD COLUMN     "personId" TEXT;

-- CreateIndex
CREATE INDEX "MagicLink_personId_idx" ON "MagicLink"("personId");

-- AddForeignKey
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
