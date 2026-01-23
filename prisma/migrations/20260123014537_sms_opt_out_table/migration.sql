-- CreateTable
CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawMessage" TEXT,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsOptOut_phoneNumber_idx" ON "SmsOptOut"("phoneNumber");

-- CreateIndex
CREATE INDEX "SmsOptOut_hostId_idx" ON "SmsOptOut"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsOptOut_phoneNumber_hostId_key" ON "SmsOptOut"("phoneNumber", "hostId");

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
