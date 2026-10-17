-- CreateTable
CREATE TABLE "EmailOptOut" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT,

    CONSTRAINT "EmailOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOptOut_eventId_idx" ON "EmailOptOut"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOptOut_personId_eventId_key" ON "EmailOptOut"("personId", "eventId");

-- AddForeignKey
ALTER TABLE "EmailOptOut" ADD CONSTRAINT "EmailOptOut_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOptOut" ADD CONSTRAINT "EmailOptOut_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
