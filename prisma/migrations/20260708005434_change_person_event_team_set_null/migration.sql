-- DropForeignKey
ALTER TABLE "PersonEvent" DROP CONSTRAINT "PersonEvent_teamId_fkey";

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
