-- CreateTable
CREATE TABLE "TnzAccountAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "openKind" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,
    "outboundMessageId" TEXT,

    CONSTRAINT "TnzAccountAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TnzAccountAlert_openKind_key" ON "TnzAccountAlert"("openKind");

-- CreateIndex
CREATE INDEX "TnzAccountAlert_outboundMessageId_idx" ON "TnzAccountAlert"("outboundMessageId");

-- AddForeignKey
ALTER TABLE "TnzAccountAlert" ADD CONSTRAINT "TnzAccountAlert_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
