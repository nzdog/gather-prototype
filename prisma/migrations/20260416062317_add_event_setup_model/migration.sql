-- CreateTable
CREATE TABLE "EventSetup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "eventTypeOther" TEXT,
    "mainsData" JSONB,
    "sidesData" JSONB,
    "dessertsData" JSONB,
    "drinksData" JSONB,
    "setupCleanupData" JSONB,
    "dietaryData" JSONB,
    "otherNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSetup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSetup_eventId_key" ON "EventSetup"("eventId");

-- AddForeignKey
ALTER TABLE "EventSetup" ADD CONSTRAINT "EventSetup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
