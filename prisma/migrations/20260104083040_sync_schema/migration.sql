/*
  Warnings:

  - Added the required column `updatedAt` to the `Item` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OccasionType" AS ENUM ('CHRISTMAS', 'THANKSGIVING', 'EASTER', 'WEDDING', 'BIRTHDAY', 'REUNION', 'RETREAT', 'OTHER');

-- CreateEnum
CREATE TYPE "GuestCountConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DietaryStatus" AS ENUM ('UNSPECIFIED', 'NONE', 'SPECIFIED');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('HOME', 'HIRED_VENUE', 'OUTDOOR', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "KitchenAccess" AS ENUM ('FULL', 'LIMITED', 'NONE', 'CATERING_ONLY');

-- CreateEnum
CREATE TYPE "GenerationPath" AS ENUM ('AI', 'TEMPLATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "StructureMode" AS ENUM ('EDITABLE', 'LOCKED', 'CHANGE_REQUESTED');

-- CreateEnum
CREATE TYPE "HostReadinessConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Domain" AS ENUM ('PROTEINS', 'VEGETARIAN_MAINS', 'SIDES', 'SALADS', 'STARTERS', 'DESSERTS', 'DRINKS', 'LATER_FOOD', 'SETUP', 'CLEANUP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DomainConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ItemSource" AS ENUM ('GENERATED', 'TEMPLATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('KG', 'G', 'L', 'ML', 'COUNT', 'PACKS', 'TRAYS', 'SERVINGS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "QuantityState" AS ENUM ('SPECIFIED', 'PLACEHOLDER', 'NA');

-- CreateEnum
CREATE TYPE "QuantityLabel" AS ENUM ('CALCULATED', 'HEURISTIC', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "QuantitySource" AS ENUM ('HOST_INPUTS', 'HOST_HISTORY', 'HOST_DEFAULTS', 'SYSTEM_HEURISTICS', 'AGGREGATE_PATTERNS', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "QuantityDeferredTo" AS ENUM ('COORDINATOR');

-- CreateEnum
CREATE TYPE "CriticalSource" AS ENUM ('AI', 'HOST', 'RULE');

-- CreateEnum
CREATE TYPE "CriticalOverride" AS ENUM ('NONE', 'ADDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "LastEditedBy" AS ENUM ('AI', 'HOST');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('TIMING', 'DIETARY_GAP', 'STRUCTURAL_IMBALANCE', 'CONSTRAINT_VIOLATION', 'COVERAGE_GAP', 'QUANTITY_MISSING', 'EQUIPMENT_MISMATCH');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('CRITICAL', 'SIGNIFICANT', 'ADVISORY');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('CONSTRAINT', 'RISK', 'PATTERN', 'PREFERENCE', 'ASSUMPTION');

-- CreateEnum
CREATE TYPE "ResolutionClass" AS ENUM ('FIX_IN_PLAN', 'DECISION_REQUIRED', 'DELEGATE_ALLOWED', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'ACKNOWLEDGED', 'DELEGATED');

-- CreateEnum
CREATE TYPE "DelegatedTo" AS ENUM ('COORDINATOR');

-- CreateEnum
CREATE TYPE "MitigationPlanType" AS ENUM ('SUBSTITUTE', 'REASSIGN', 'COMMUNICATE', 'ACCEPT_GAP', 'EXTERNAL_CATERING', 'BRING_OWN', 'OTHER');

-- CreateEnum
CREATE TYPE "AlternativesConsidered" AS ENUM ('NONE', 'REVIEWED', 'ATTEMPTED');

-- CreateEnum
CREATE TYPE "AcknowledgementStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SnapshotPhase" AS ENUM ('CONFIRMING');

-- CreateEnum
CREATE TYPE "StructureChangeType" AS ENUM ('ADD_TEAM', 'RENAME_TEAM', 'REMOVE_TEAM', 'MOVE_ITEM_TEAM', 'ADD_ITEM_TO_TEAM', 'REMOVE_ITEM', 'CHANGE_CRITICAL_FLAG');

-- CreateEnum
CREATE TYPE "StructureChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateSource" AS ENUM ('HOST', 'GATHER_CURATED');

-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('TEAM_STRUCTURE', 'DOMAIN_COVERAGE', 'QUANTITY_RATIO', 'CRITICAL_ITEMS');

-- CreateEnum
CREATE TYPE "PatternConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DeletionScope" AS ENUM ('ALL', 'EVENTS', 'PATTERNS', 'SPECIFIC_EVENT');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "blindAccept" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkPlanBeforeGate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkPlanInvocations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cloneAdaptations" JSONB,
ADD COLUMN     "clonedFromId" TEXT,
ADD COLUMN     "coHostId" TEXT,
ADD COLUMN     "currentRevisionId" TEXT,
ADD COLUMN     "dietaryAllergies" TEXT,
ADD COLUMN     "dietaryDairyFree" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dietaryGlutenFree" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dietaryStatus" "DietaryStatus" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "dietaryVegan" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dietaryVegetarian" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstCheckPlanAt" TIMESTAMP(3),
ADD COLUMN     "generationPath" "GenerationPath",
ADD COLUMN     "guestCountConfidence" "GuestCountConfidence" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "guestCountMax" INTEGER,
ADD COLUMN     "guestCountMin" INTEGER,
ADD COLUMN     "hostReadinessConfidence" "HostReadinessConfidence",
ADD COLUMN     "lastCheckPlanAt" TIMESTAMP(3),
ADD COLUMN     "madeAnyEditBeforeCheckPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualAdditionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "occasionDescription" TEXT,
ADD COLUMN     "occasionType" "OccasionType",
ADD COLUMN     "planSnapshotIdAtConfirming" TEXT,
ADD COLUMN     "structureMode" "StructureMode" NOT NULL DEFAULT 'EDITABLE',
ADD COLUMN     "transitionAttempts" JSONB,
ADD COLUMN     "transitionedToConfirmingAt" TIMESTAMP(3),
ADD COLUMN     "venueBbqAvailable" BOOLEAN,
ADD COLUMN     "venueKitchenAccess" "KitchenAccess",
ADD COLUMN     "venueName" TEXT,
ADD COLUMN     "venueNotes" TEXT,
ADD COLUMN     "venueOvenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "venueStoretopBurners" INTEGER,
ADD COLUMN     "venueTimingEnd" TEXT,
ADD COLUMN     "venueTimingStart" TEXT,
ADD COLUMN     "venueType" "VenueType";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "criticalOverride" "CriticalOverride" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "criticalReason" TEXT,
ADD COLUMN     "criticalSource" "CriticalSource",
ADD COLUMN     "dietaryTags" JSONB,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "equipmentLoad" DOUBLE PRECISION,
ADD COLUMN     "equipmentNeeds" JSONB,
ADD COLUMN     "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastEditedBy" "LastEditedBy",
ADD COLUMN     "placeholderAcknowledged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prepEndTime" TEXT,
ADD COLUMN     "prepStartTime" TEXT,
ADD COLUMN     "quantityAmount" DOUBLE PRECISION,
ADD COLUMN     "quantityDeferredTo" "QuantityDeferredTo",
ADD COLUMN     "quantityDerivedFromTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantityLabel" "QuantityLabel",
ADD COLUMN     "quantitySource" "QuantitySource",
ADD COLUMN     "quantityState" "QuantityState" NOT NULL DEFAULT 'SPECIFIED',
ADD COLUMN     "quantityText" TEXT,
ADD COLUMN     "quantityUnit" "QuantityUnit",
ADD COLUMN     "quantityUnitCustom" TEXT,
ADD COLUMN     "serveTime" TEXT,
ADD COLUMN     "source" "ItemSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "domain" "Domain",
ADD COLUMN     "domainConfidence" "DomainConfidence" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "ItemSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" "ConflictType" NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "resolutionClass" "ResolutionClass" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedItems" JSONB,
    "affectedDays" JSONB,
    "affectedParties" JSONB,
    "equipment" TEXT,
    "timeSlot" TEXT,
    "capacityAvailable" DOUBLE PRECISION,
    "capacityRequired" DOUBLE PRECISION,
    "dietaryType" TEXT,
    "guestCount" INTEGER,
    "category" TEXT,
    "currentCoverage" INTEGER,
    "minimumNeeded" INTEGER,
    "suggestion" JSONB,
    "inputsReferenced" JSONB,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "viewDuration" INTEGER NOT NULL DEFAULT 0,
    "whyThisViewed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedWithoutReading" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "delegatedTo" "DelegatedTo",
    "delegatedAt" TIMESTAMP(3),
    "canDelegate" BOOLEAN NOT NULL DEFAULT false,
    "delegateToRoles" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acknowledgement" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedBy" TEXT NOT NULL,
    "impactStatement" TEXT NOT NULL,
    "impactUnderstood" BOOLEAN NOT NULL,
    "mitigationPlanType" "MitigationPlanType" NOT NULL,
    "affectedParties" JSONB,
    "alternativesConsidered" "AlternativesConsidered" NOT NULL DEFAULT 'NONE',
    "visibilityCohosts" BOOLEAN NOT NULL DEFAULT true,
    "visibilityCoordinators" TEXT NOT NULL DEFAULT 'NONE',
    "visibilityParticipants" BOOLEAN NOT NULL DEFAULT false,
    "supersedesAcknowledgementId" TEXT,
    "status" "AcknowledgementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "teams" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "days" JSONB NOT NULL,
    "conflicts" JSONB NOT NULL,
    "acknowledgements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "PlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "phase" "SnapshotPhase" NOT NULL,
    "teams" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "days" JSONB NOT NULL,
    "criticalFlags" JSONB NOT NULL,
    "acknowledgements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructureChangeRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "StructureChangeType" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "impactedCoordinators" JSONB,
    "impactedItems" JSONB,
    "deltaFromSnapshot" JSONB,
    "status" "StructureChangeStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "previousCriticalState" BOOLEAN,
    "newCriticalState" BOOLEAN,

    CONSTRAINT "StructureChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructureTemplate" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "templateSource" "TemplateSource" NOT NULL,
    "name" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "teams" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "days" JSONB NOT NULL,
    "version" TEXT,
    "changelogSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructureTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantitiesProfile" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "derivedFrom" JSONB NOT NULL,
    "ratios" JSONB NOT NULL,
    "itemQuantities" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantitiesProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostMemory" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "learningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aggregateContributionConsent" BOOLEAN NOT NULL DEFAULT false,
    "useHistoryByDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostPattern" (
    "id" TEXT NOT NULL,
    "hostMemoryId" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "patternType" "PatternType" NOT NULL,
    "patternData" JSONB NOT NULL,
    "derivedFrom" JSONB NOT NULL,
    "confidence" "PatternConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostDefault" (
    "id" TEXT NOT NULL,
    "hostMemoryId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedSuggestion" (
    "id" TEXT NOT NULL,
    "hostMemoryId" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "DismissedSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionReceipt" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL,
    "scope" "DeletionScope" NOT NULL,
    "targetIds" JSONB,
    "derivedArtifactsRemoved" BOOLEAN NOT NULL,
    "aggregateContributionPurged" BOOLEAN NOT NULL,

    CONSTRAINT "DeletionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conflict_eventId_status_idx" ON "Conflict"("eventId", "status");

-- CreateIndex
CREATE INDEX "Conflict_fingerprint_idx" ON "Conflict"("fingerprint");

-- CreateIndex
CREATE INDEX "Acknowledgement_eventId_idx" ON "Acknowledgement"("eventId");

-- CreateIndex
CREATE INDEX "Acknowledgement_conflictId_idx" ON "Acknowledgement"("conflictId");

-- CreateIndex
CREATE INDEX "PlanRevision_eventId_idx" ON "PlanRevision"("eventId");

-- CreateIndex
CREATE INDEX "PlanSnapshot_eventId_idx" ON "PlanSnapshot"("eventId");

-- CreateIndex
CREATE INDEX "StructureChangeRequest_eventId_status_idx" ON "StructureChangeRequest"("eventId", "status");

-- CreateIndex
CREATE INDEX "StructureTemplate_hostId_idx" ON "StructureTemplate"("hostId");

-- CreateIndex
CREATE INDEX "StructureTemplate_templateSource_idx" ON "StructureTemplate"("templateSource");

-- CreateIndex
CREATE INDEX "QuantitiesProfile_hostId_occasionType_idx" ON "QuantitiesProfile"("hostId", "occasionType");

-- CreateIndex
CREATE UNIQUE INDEX "HostMemory_hostId_key" ON "HostMemory"("hostId");

-- CreateIndex
CREATE INDEX "HostPattern_hostMemoryId_idx" ON "HostPattern"("hostMemoryId");

-- CreateIndex
CREATE INDEX "HostDefault_hostMemoryId_idx" ON "HostDefault"("hostMemoryId");

-- CreateIndex
CREATE INDEX "DismissedSuggestion_hostMemoryId_idx" ON "DismissedSuggestion"("hostMemoryId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_coHostId_fkey" FOREIGN KEY ("coHostId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_planSnapshotIdAtConfirming_fkey" FOREIGN KEY ("planSnapshotIdAtConfirming") REFERENCES "PlanSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "PlanRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "Conflict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRevision" ADD CONSTRAINT "PlanRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureChangeRequest" ADD CONSTRAINT "StructureChangeRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostMemory" ADD CONSTRAINT "HostMemory_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostPattern" ADD CONSTRAINT "HostPattern_hostMemoryId_fkey" FOREIGN KEY ("hostMemoryId") REFERENCES "HostMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostDefault" ADD CONSTRAINT "HostDefault_hostMemoryId_fkey" FOREIGN KEY ("hostMemoryId") REFERENCES "HostMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedSuggestion" ADD CONSTRAINT "DismissedSuggestion_hostMemoryId_fkey" FOREIGN KEY ("hostMemoryId") REFERENCES "HostMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
