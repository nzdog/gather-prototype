-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "inviteSendConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "inviteAnchorAt" TIMESTAMP(3);
