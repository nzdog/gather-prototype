-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "proxyPersonId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "personEventId" TEXT,
    "proxyNudgeCount" INTEGER NOT NULL DEFAULT 0,
    "lastProxyNudgeAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Household_eventId_proxyPersonId_key" ON "Household"("eventId", "proxyPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_personEventId_key" ON "HouseholdMember"("personEventId");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_proxyPersonId_fkey" FOREIGN KEY ("proxyPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_personEventId_fkey" FOREIGN KEY ("personEventId") REFERENCES "PersonEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
