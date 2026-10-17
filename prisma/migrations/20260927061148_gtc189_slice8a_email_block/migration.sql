-- CreateTable
CREATE TABLE "EmailBlock" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outboundMessageId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "EmailBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailBlock_address_key" ON "EmailBlock"("address");

-- CreateIndex
CREATE INDEX "EmailBlock_eventId_idx" ON "EmailBlock"("eventId");

-- CreateIndex
CREATE INDEX "EmailBlock_outboundMessageId_idx" ON "EmailBlock"("outboundMessageId");

-- AddForeignKey
ALTER TABLE "EmailBlock" ADD CONSTRAINT "EmailBlock_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlock" ADD CONSTRAINT "EmailBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
