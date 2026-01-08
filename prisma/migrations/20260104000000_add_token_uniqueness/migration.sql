-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_eventId_personId_scope_teamId_key" ON "AccessToken"("eventId", "personId", "scope", "teamId");
