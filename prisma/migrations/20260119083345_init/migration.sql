-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('HOST', 'COORDINATOR', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "EventRoleType" AS ENUM ('HOST', 'COHOST', 'COORDINATOR');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ASSIGNED', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "TokenScope" AS ENUM ('HOST', 'COORDINATOR', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'CONFIRMING', 'FROZEN', 'COMPLETE');

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
CREATE TYPE "ItemSource" AS ENUM ('GENERATED', 'TEMPLATE', 'MANUAL', 'HOST_EDITED');

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

-- CreateEnum
CREATE TYPE "AssignmentResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "guestCount" INTEGER,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "occasionType" "OccasionType",
    "occasionDescription" TEXT,
    "hostId" TEXT NOT NULL,
    "coHostId" TEXT,
    "guestCountConfidence" "GuestCountConfidence" NOT NULL DEFAULT 'MEDIUM',
    "guestCountMin" INTEGER,
    "guestCountMax" INTEGER,
    "dietaryStatus" "DietaryStatus" NOT NULL DEFAULT 'UNSPECIFIED',
    "dietaryVegetarian" INTEGER NOT NULL DEFAULT 0,
    "dietaryVegan" INTEGER NOT NULL DEFAULT 0,
    "dietaryGlutenFree" INTEGER NOT NULL DEFAULT 0,
    "dietaryDairyFree" INTEGER NOT NULL DEFAULT 0,
    "dietaryAllergies" TEXT,
    "venueName" TEXT,
    "venueType" "VenueType",
    "venueKitchenAccess" "KitchenAccess",
    "venueOvenCount" INTEGER NOT NULL DEFAULT 0,
    "venueStoretopBurners" INTEGER,
    "venueBbqAvailable" BOOLEAN,
    "venueTimingStart" TEXT,
    "venueTimingEnd" TEXT,
    "venueNotes" TEXT,
    "generationPath" "GenerationPath",
    "clonedFromId" TEXT,
    "cloneAdaptations" JSONB,
    "checkPlanInvocations" INTEGER NOT NULL DEFAULT 0,
    "firstCheckPlanAt" TIMESTAMP(3),
    "lastCheckPlanAt" TIMESTAMP(3),
    "checkPlanBeforeGate" BOOLEAN NOT NULL DEFAULT false,
    "transitionAttempts" JSONB,
    "transitionedToConfirmingAt" TIMESTAMP(3),
    "planSnapshotIdAtConfirming" TEXT,
    "structureMode" "StructureMode" NOT NULL DEFAULT 'EDITABLE',
    "blindAccept" BOOLEAN NOT NULL DEFAULT false,
    "madeAnyEditBeforeCheckPlan" BOOLEAN NOT NULL DEFAULT false,
    "manualAdditionsCount" INTEGER NOT NULL DEFAULT 0,
    "hostReadinessConfidence" "HostReadinessConfidence",
    "currentRevisionId" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "domain" "Domain",
    "domainConfidence" "DomainConfidence" NOT NULL DEFAULT 'MEDIUM',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "ItemSource" NOT NULL DEFAULT 'MANUAL',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT NOT NULL,
    "coordinatorId" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userId" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT,
    "role" "PersonRole" NOT NULL DEFAULT 'PARTICIPANT',

    CONSTRAINT "PersonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "description" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItemStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "previouslyAssignedTo" TEXT,
    "quantityAmount" DOUBLE PRECISION,
    "quantityUnit" "QuantityUnit",
    "quantityUnitCustom" TEXT,
    "quantityText" TEXT,
    "quantityState" "QuantityState" NOT NULL DEFAULT 'SPECIFIED',
    "quantityLabel" "QuantityLabel",
    "quantitySource" "QuantitySource",
    "quantityDerivedFromTemplate" BOOLEAN NOT NULL DEFAULT false,
    "placeholderAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "quantityDeferredTo" "QuantityDeferredTo",
    "criticalReason" TEXT,
    "criticalSource" "CriticalSource",
    "criticalOverride" "CriticalOverride" NOT NULL DEFAULT 'NONE',
    "glutenFree" BOOLEAN NOT NULL DEFAULT false,
    "dairyFree" BOOLEAN NOT NULL DEFAULT false,
    "vegetarian" BOOLEAN NOT NULL DEFAULT false,
    "dietaryTags" JSONB,
    "equipmentNeeds" JSONB,
    "equipmentLoad" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "prepStartTime" TEXT,
    "prepEndTime" TEXT,
    "serveTime" TEXT,
    "dropOffAt" TIMESTAMP(3),
    "dropOffLocation" TEXT,
    "dropOffNote" TEXT,
    "source" "ItemSource" NOT NULL DEFAULT 'MANUAL',
    "generatedBatchId" TEXT,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedBy" "LastEditedBy",
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT NOT NULL,
    "dayId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "response" "AssignmentResponse" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scope" "TokenScope" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'FREE',
    "statusChangedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLink" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" "EventRoleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "eventId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PersonEvent_personId_eventId_key" ON "PersonEvent"("personId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_itemId_key" ON "Assignment"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_token_key" ON "AccessToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_eventId_personId_scope_teamId_key" ON "AccessToken"("eventId", "personId", "scope", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_token_key" ON "MagicLink"("token");

-- CreateIndex
CREATE INDEX "MagicLink_token_idx" ON "MagicLink"("token");

-- CreateIndex
CREATE INDEX "MagicLink_email_idx" ON "MagicLink"("email");

-- CreateIndex
CREATE INDEX "MagicLink_expiresAt_idx" ON "MagicLink"("expiresAt");

-- CreateIndex
CREATE INDEX "EventRole_userId_idx" ON "EventRole"("userId");

-- CreateIndex
CREATE INDEX "EventRole_eventId_idx" ON "EventRole"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRole_userId_eventId_key" ON "EventRole"("userId", "eventId");

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
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_coHostId_fkey" FOREIGN KEY ("coHostId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_planSnapshotIdAtConfirming_fkey" FOREIGN KEY ("planSnapshotIdAtConfirming") REFERENCES "PlanSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "PlanRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Day" ADD CONSTRAINT "Day_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRole" ADD CONSTRAINT "EventRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRole" ADD CONSTRAINT "EventRole_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
