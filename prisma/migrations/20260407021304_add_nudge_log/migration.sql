-- CreateTable
CREATE TABLE "NudgeLog" (
    "id" TEXT NOT NULL,
    "personEventId" TEXT NOT NULL,
    "nudgeType" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NudgeLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NudgeLog" ADD CONSTRAINT "NudgeLog_personEventId_fkey" FOREIGN KEY ("personEventId") REFERENCES "PersonEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
