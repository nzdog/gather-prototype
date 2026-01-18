# Gather Prototype - Implementation Plan v1.3.2

## Change Log (v1.3.1 → v1.3.2)

1. **Fixed Phase 8** - Removed `repairItemStatus` import and repair loop (GET routes don't repair)
2. **Fixed Phase 9** - Replaced `getRepairedTeamStatus` with `computeTeamStatusFromItems`
3. **Fixed Phase 10 GET** - Replaced `getRepairedTeamStatus` with `computeTeamStatusFromItems`
4. **Fixed Phase 10 PATCH** - Merged double transaction into single transaction for atomicity
5. **Fixed canTransition** - Removed CONFIRMING→DRAFT (not in spec state machine)
6. **Clarified Phase 5** - Seed sets status inline during assignment creation; no separate repair needed

## Change Log (v1.3 → v1.3.1)

1. Removed "repair on GET" state mutation - GET routes no longer repair Item.status; repair only after assignment mutations (via repairItemStatusAfterMutation helper)
2. Added explicit event status transition validation - New canTransition() function validates DRAFT→CONFIRMING→FROZEN→COMPLETE state machine
3. Added mutation audit logging - New logAudit() helper logs ACK_ASSIGNMENT, ASSIGN_ITEM, UNASSIGN_ITEM, REASSIGN_ITEM, EVENT_STATUS_CHANGE actions
4. Fixed removePerson previouslyAssignedTo - Now appends person.name instead of raw personId
5. Standardized Next.js route signatures - All routes use canonical async function(request, { params }) with synchronous params
6. Removed getRepairedTeamStatus - Replaced with computeTeamStatusFromItems() that queries assignment directly

---

## Project Overview

Building a coordination app for Christmas 2025 gathering with 8 teams, 55 items, and 3 role types (Participant, Coordinator, Host). Implement from scratch following spec v1.3.3 exactly.

## Critical Constraints to Enforce

### Schema Invariants

1. One person → one team per event: `@@unique([personId, eventId])` + required teamId on PersonEvent
2. One assignment per item: `@unique` on Assignment.itemId
3. COORDINATOR tokens require teamId match: AccessToken.teamId must equal PersonEvent.teamId
4. Item.status as cached mirror: ASSIGNED/UNASSIGNED based on Assignment existence
5. Coordinator route scoping: All queries/mutations filtered by token.teamId only
6. Freeze gate validation: Query `assignment: null` directly, NOT Item.status
7. Sequential operations: Repair runs sequentially within transactions, never parallel

### Implementation Notes

- Timezone helper: Use `makeNzdtChristmas2025Date()` for NZDT (UTC+13) - valid for December 2025 only
- Mutation gating: Centralized in `canMutate()` function - exact matrix from spec Section 6
- Status repair: Only after assignment mutations, never on GET routes
- Team status: Computed from assignment existence via `computeTeamStatusFromItems()`

### Key Data Points

- 55 total items across 8 teams
- 13 unassigned items
- 6 critical gaps (blocks freeze)
- 27 people assigned to teams
- Event status: CONFIRMING

---

## Phase 1: Foundation Setup

**Objective:** Initialize Next.js 14 with App Router, TypeScript, Tailwind CSS, Prisma/SQLite.

**Steps:**

```bash
# 1. Initialize Next.js
npx create-next-app@14 . --typescript --tailwind --app --src-dir

# 2. Install Prisma
npm install prisma @prisma/client
npm install -D tsx @types/node

# 3. Initialize Prisma
npx prisma init --datasource-provider sqlite

# 4. Update .env
DATABASE_URL="file:./dev.db"

# 5. Update .gitignore
# Add: dev.db*, .env (if not already present)
```

**Route Signature Standard:**

All routes use synchronous params:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Access params.token directly
}
```

**Validation:**
- `npm run dev` starts
- `src/` directory exists with `app/`, `lib/`, `components/`
- Prisma CLI responds

---

## Phase 2: Database Schema

**Objective:** Implement exact schema from spec Section 3.

**File:** `prisma/schema.prisma`

Copy schema from spec exactly. Key points:
- Event: startDate, endDate, status (EventStatus enum), hostId
- Day: name, date, eventId
- Team: name, scope, coordinatorId, eventId
- Person: name, email, phone
- PersonEvent: personId, eventId, teamId (required), role (PersonRole enum)
  - `@@unique([personId, eventId])`
- Item: name, quantity, description, critical, status (ASSIGNED/UNASSIGNED), glutenFree, dairyFree, vegetarian, dropOffAt, dropOffLocation, dropOffNote, notes, teamId, dayId, previouslyAssignedTo
- Assignment: itemId (UNIQUE), personId, acknowledged
- AccessToken: token (UNIQUE), scope, expiresAt, eventId, personId, teamId (required for COORDINATOR)
- AuditEntry: timestamp, actionType, targetType, targetId, details, eventId, actorId

**Cascade rules (from spec):**
- Event deletion → cascade children
- Assignment.person → NO cascade (app-layer orchestration)
- PersonEvent.team → cascade (for dev reset only)

**Run:**
```bash
npx prisma migrate dev --name init
npx prisma generate
```

**Validation:**
- Migration succeeds
- All enums present (EventStatus, PersonRole, TokenScope)
- Unique constraints in place

---

## Phase 3: Prisma Client Singleton

**File:** `src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## Phase 4: Timezone Utilities

**Objective:** Create NZDT-specific helper for December 2025.

**File:** `src/lib/timezone.ts`

```typescript
/**
 * Creates a UTC Date from NZ local date and time.
 *
 * ⚠️  WARNING: THIS HELPER IS NZDT-SPECIFIC (UTC+13)
 * ⚠️  It is ONLY valid for dates in NZ Daylight Saving Time.
 * ⚠️  For December 2025, this is correct. For other dates, verify offset.
 */
export function makeNzdtChristmas2025Date(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // NZDT offset: UTC+13 (valid for Christmas 2025)
  const nzdtOffsetMinutes = 13 * 60;

  const utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const adjusted = new Date(utc - nzdtOffsetMinutes * 60 * 1000);

  return adjusted;
}
```

**Display formatting** (inline in UI code):
```typescript
new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland',
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(date)
```

---

## Phase 5: Seed Data

**Objective:** Load exact Christmas 2025 data from spec Section 8.

**File:** `prisma/seed.ts`

```typescript
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { makeNzdtChristmas2025Date } from '../src/lib/timezone';

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

**Seed order (critical for FK constraints):**
1. People (27 people from spec)
2. Event (Richardson Family Christmas, 24-26 Dec 2025, status: CONFIRMING, hostId: Jacqui)
3. Days (Christmas Eve, Christmas Day, Boxing Day with NZDT dates)
4. Teams (8 teams with coordinators)
5. PersonEvent (link each person to event + team, set role)
6. Items (55 items from spec with all fields)
7. Assignments (42 assigned, validate teamId match, set Item.status inline)
8. AccessTokens (validate COORDINATOR tokens have teamId)

**Drop-off reference object:**
```typescript
const dropOff = {
  eve:   { at: makeNzdtChristmas2025Date("2025-12-24", "17:30"), location: "Kate's Kitchen", note: "5:30pm" },
  day:   { at: makeNzdtChristmas2025Date("2025-12-25", "12:00"), location: "Marquee", note: "12 noon" },
  box:   { at: makeNzdtChristmas2025Date("2025-12-26", "12:00"), location: "Marquee", note: "12 noon" },
  setup: { at: makeNzdtChristmas2025Date("2025-12-25", "10:00"), location: "Marquee", note: "10:00am" },
};
```

**Team mismatch handling:**
```typescript
if (assigneeName) {
  const person = personByName.get(assigneeName);
  const personEvent = await prisma.personEvent.findFirst({
    where: { personId: person.id, eventId: event.id }
  });

  if (personEvent?.teamId === teamId) {
    // Create assignment AND set Item.status in same operation
    await prisma.assignment.create({ data: { itemId, personId: person.id, acknowledged: false } });
    await prisma.item.update({ where: { id: itemId }, data: { status: 'ASSIGNED' } });
  } else {
    console.warn(`SEED WARNING: "${assigneeName}" not in team - leaving unassigned`);
    // Item stays UNASSIGNED (default)
  }
}
```

**Note:** Status is set inline during assignment creation. No separate repair step needed because seed runs sequentially and sets status immediately after each assignment.

**Configure package.json:**
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

**Run:**
```bash
npx prisma db seed
```

**Validation:**
- Seed completes without errors
- 55 items (42 assigned, 13 unassigned)
- 6 critical gaps (Puddings: 4, Later Food: 1, Setup: 1)
- All PersonEvents have teamId
- COORDINATOR tokens have teamId matching PersonEvent
- Warnings logged for team mismatches (not errors)

---

## Phase 6: Authentication Layer

**Objective:** Token resolution with COORDINATOR teamId validation.

**File:** `src/lib/auth.ts`

```typescript
import { prisma } from './prisma';
import type { Person, Event, Team, TokenScope } from '@prisma/client';

export async function resolveToken(token: string): Promise<{
  person: Person;
  event: Event;
  team?: Team;
  scope: TokenScope;
} | null> {
  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    include: { person: true, event: true, team: true }
  });

  if (!accessToken || (accessToken.expiresAt && accessToken.expiresAt < new Date())) {
    return null;
  }

  // Validate COORDINATOR token invariant
  if (accessToken.scope === 'COORDINATOR') {
    if (!accessToken.teamId) {
      return null;
    }

    const personEvent = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId: accessToken.personId,
          eventId: accessToken.eventId
        }
      }
    });

    if (personEvent?.teamId !== accessToken.teamId) {
      return null;
    }
  }

  return {
    person: accessToken.person,
    event: accessToken.event,
    team: accessToken.team || undefined,
    scope: accessToken.scope as TokenScope
  };
}
```

**Validation:**
- Invalid/expired tokens return null
- COORDINATOR tokens validate teamId match
- Returns all needed context

---

## Phase 7: Workflow Library

**Objective:** Team status computation, freeze gate, mutation gating, audit logging, remove person.

**File:** `src/lib/workflow.ts`

```typescript
import { prisma } from './prisma';
import type { Item, Assignment, Person, EventStatus, PrismaClient } from '@prisma/client';

// Type for items with assignment + person included
type ItemWithAssignmentAndPerson = Item & {
  assignment: (Assignment & { person: Person }) | null;
};

// Transaction client type
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Computes team status from assignment data directly.
 * Does NOT use cached Item.status - queries assignment existence.
 * Use this in all GET routes.
 */
export async function computeTeamStatusFromItems(
  items: ItemWithAssignmentAndPerson[]
): Promise<'SORTED' | 'GAP' | 'CRITICAL_GAP'> {
  const hasCriticalGap = items.some(i => i.critical && i.assignment === null);
  const hasGap = items.some(i => i.assignment === null);

  if (hasCriticalGap) return 'CRITICAL_GAP';
  if (hasGap) return 'GAP';
  return 'SORTED';
}

/**
 * Repairs Item.status to match Assignment existence.
 * ONLY call this after assignment mutations, within the same transaction.
 */
export async function repairItemStatusAfterMutation(
  tx: TxClient,
  itemId: string
): Promise<void> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    include: { assignment: true }
  });

  if (!item) return;

  const shouldBe = item.assignment !== null ? 'ASSIGNED' : 'UNASSIGNED';

  if (item.status !== shouldBe) {
    await tx.item.update({
      where: { id: itemId },
      data: { status: shouldBe },
    });
  }
}

/**
 * Returns true if event can be frozen.
 * Freeze blocked if ANY critical item lacks assignment.
 * Queries Assignment directly, NOT Item.status.
 */
export async function canFreeze(eventId: string): Promise<boolean> {
  const criticalUnassignedCount = await prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null,
    },
  });

  return criticalUnassignedCount === 0;
}

export async function getCriticalGapCount(eventId: string): Promise<number> {
  return prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null,
    },
  });
}

/**
 * Validates event status transitions.
 * State machine from spec Section 6:
 *   DRAFT → CONFIRMING : Always allowed
 *   CONFIRMING → FROZEN : Blocked if critical gaps (checked separately)
 *   FROZEN → CONFIRMING : Allowed (override, logged)
 *   FROZEN → COMPLETE : Allowed
 *   COMPLETE → * : Never allowed
 */
export function canTransition(fromStatus: EventStatus, toStatus: EventStatus): boolean {
  if (fromStatus === toStatus) return true;
  if (fromStatus === 'COMPLETE') return false;

  const validTransitions: Record<EventStatus, EventStatus[]> = {
    DRAFT: ['CONFIRMING'],
    CONFIRMING: ['FROZEN'],  // Only forward; no back to DRAFT per spec
    FROZEN: ['CONFIRMING', 'COMPLETE'],
    COMPLETE: []
  };

  return validTransitions[fromStatus].includes(toStatus);
}

/**
 * Mutation gating from spec Section 6 MUTATION_RULES.
 */
export function canMutate(
  eventStatus: EventStatus,
  action: 'createItem' | 'editItem' | 'deleteItem' | 'assignItem' | 'addPerson' | 'removePerson',
  itemCritical?: boolean
): boolean {
  if (eventStatus === 'COMPLETE') return false;
  if (eventStatus === 'FROZEN') return false;

  if (eventStatus === 'CONFIRMING') {
    if (action === 'deleteItem' && itemCritical) {
      return false;
    }
    return true;
  }

  // DRAFT: all mutations allowed
  return true;
}

/**
 * Audit helper: logs action to AuditEntry within transaction.
 */
export async function logAudit(
  tx: TxClient,
  params: {
    eventId: string;
    actorId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    details?: string;
  }
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      eventId: params.eventId,
      actorId: params.actorId,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details || '',
      timestamp: new Date()
    }
  });
}

/**
 * Removes a person from an event.
 * Appends person.name to previouslyAssignedTo (human-readable).
 */
export async function removePerson(personId: string, eventId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { name: true }
    });

    if (!person) throw new Error('Person not found');

    const assignments = await tx.assignment.findMany({
      where: {
        personId,
        item: { team: { eventId } }
      },
      include: { item: true }
    });

    for (const assignment of assignments) {
      await tx.item.update({
        where: { id: assignment.itemId },
        data: {
          status: 'UNASSIGNED',
          previouslyAssignedTo: assignment.item.previouslyAssignedTo
            ? `${assignment.item.previouslyAssignedTo}, ${person.name}`
            : person.name,
        }
      });

      await tx.assignment.delete({
        where: { id: assignment.id }
      });
    }

    await tx.accessToken.deleteMany({
      where: { personId, eventId }
    });

    await tx.personEvent.deleteMany({
      where: { personId, eventId }
    });
  });
}
```

**Validation:**
- `computeTeamStatusFromItems()` checks assignment existence (not status)
- `repairItemStatusAfterMutation()` only called in mutation routes
- `canFreeze()` queries Assignment, not status
- `canTransition()` matches spec state machine exactly
- `canMutate()` implements exact MUTATION_RULES matrix
- `removePerson()` uses transaction, appends person.name

---

## Phase 8: Participant View

**Page:** `src/app/p/[token]/page.tsx`

Features:
- Show event name, dates
- Show team name, coordinator name
- Show assigned items with all fields
- Acknowledge button per item

**API Route:** `src/app/api/p/[token]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Fetch team via PersonEvent (PARTICIPANT tokens have teamId: null)
  const personEvent = await prisma.personEvent.findFirst({
    where: { personId: context.person.id, eventId: context.event.id },
    include: {
      team: {
        include: { coordinator: true }
      }
    }
  });

  const assignments = await prisma.assignment.findMany({
    where: { personId: context.person.id },
    include: {
      item: {
        include: {
          day: true,
          assignment: {
            include: { person: true }
          }
        }
      }
    }
  });

  // NO repair on GET - return data as-is
  // Status is computed from assignment existence where needed

  return NextResponse.json({
    assignments,
    event: context.event,
    team: personEvent?.team,
    coordinator: personEvent?.team?.coordinator
  });
}
```

**API Route:** `src/app/api/p/[token]/ack/[assignmentId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; assignmentId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify assignment belongs to this participant
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId }
  });

  if (!assignment || assignment.personId !== context.person.id) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: params.assignmentId },
      data: { acknowledged: true }
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'ACK_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: params.assignmentId,
      details: `Acknowledged assignment for item ${assignment.itemId}`
    });
  });

  return NextResponse.json({ success: true });
}
```

**Validation:**
- Shows only participant's assignments
- NO repair on GET
- Team fetched via PersonEvent
- Cannot acknowledge others' assignments
- Acknowledgment logged to audit

---

## Phase 9: Coordinator View

**Page:** `src/app/c/[token]/page.tsx`

Features:
- Show team name, scope
- Show event status, team status
- Show all items with assignment status
- Add/edit/assign items (if allowed)
- Show other teams' statuses only

**API Route:** `src/app/api/c/[token]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTeamStatusFromItems } from '@/lib/workflow';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const tokenTeam = context.team!;

  // 1. Fetch own team items (scoped to token.teamId)
  const myItems = await prisma.item.findMany({
    where: { teamId: tokenTeam.id },
    include: {
      assignment: { include: { person: true } },
      day: true
    }
  });
  
  // Compute status from assignment existence (no repair)
  const myStatus = await computeTeamStatusFromItems(myItems);

  // 2. Fetch other teams (id + name only)
  const otherTeams = await prisma.team.findMany({
    where: {
      eventId: tokenTeam.eventId,
      id: { not: tokenTeam.id }
    },
    select: { id: true, name: true }
  });

  // 3. Count critical gaps via groupBy (aggregate only, no item data)
  const gapCounts = await prisma.item.groupBy({
    by: ['teamId'],
    where: {
      teamId: { in: otherTeams.map(t => t.id) },
      critical: true,
      assignment: null,
    },
    _count: { _all: true },
  });

  const gapByTeam = new Map(gapCounts.map(g => [g.teamId, g._count._all]));

  // 4. Map to status enum
  const otherTeamsStatus = otherTeams.map(t => ({
    id: t.id,
    name: t.name,
    status: (gapByTeam.get(t.id) ?? 0) > 0 ? 'CRITICAL_GAP' : 'SORTED',
  }));

  // 5. Fetch team members for assignment dropdown
  const teamMembers = await prisma.personEvent.findMany({
    where: { teamId: tokenTeam.id, eventId: tokenTeam.eventId },
    include: { person: true }
  });

  return NextResponse.json({
    team: { id: tokenTeam.id, name: tokenTeam.name, scope: tokenTeam.scope },
    items: myItems,
    myStatus,
    otherTeams: otherTeamsStatus,
    teamMembers: teamMembers.map(pe => pe.person),
    eventStatus: context.event.status
  });
}
```

**API Route:** `src/app/api/c/[token]/items/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canMutate(context.event.status, 'createItem')) {
    return NextResponse.json({ error: 'Event is frozen or complete' }, { status: 403 });
  }

  const body = await request.json();

  // Whitelist fields explicitly
  const { name, quantity, description, critical, glutenFree, dairyFree, vegetarian,
          dropOffAt, dropOffLocation, dropOffNote, notes, dayId } = body;

  const item = await prisma.item.create({
    data: {
      name,
      quantity,
      description,
      critical: critical ?? false,
      glutenFree: glutenFree ?? false,
      dairyFree: dairyFree ?? false,
      vegetarian: vegetarian ?? false,
      dropOffAt: dropOffAt ? new Date(dropOffAt) : null,
      dropOffLocation,
      dropOffNote,
      notes,
      dayId,
      teamId: context.team!.id,  // From token only, NEVER from client
      status: 'UNASSIGNED'
    }
  });

  return NextResponse.json({ item });
}
```

**API Route:** `src/app/api/c/[token]/items/[itemId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate } from '@/lib/workflow';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const item = await prisma.item.findUnique({ where: { id: params.itemId } });
  if (!item || item.teamId !== context.team!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canMutate(context.event.status, 'editItem')) {
    return NextResponse.json({ error: 'Event is frozen or complete' }, { status: 403 });
  }

  const body = await request.json();

  // Whitelist fields - teamId NEVER in update data
  const { name, quantity, description, critical, glutenFree, dairyFree, vegetarian,
          dropOffAt, dropOffLocation, dropOffNote, notes, dayId } = body;

  const updated = await prisma.item.update({
    where: { id: params.itemId },
    data: {
      name,
      quantity,
      description,
      critical,
      glutenFree,
      dairyFree,
      vegetarian,
      dropOffAt: dropOffAt ? new Date(dropOffAt) : undefined,
      dropOffLocation,
      dropOffNote,
      notes,
      dayId
      // teamId NEVER updated
    }
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const item = await prisma.item.findUnique({ where: { id: params.itemId } });
  if (!item || item.teamId !== context.team!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canMutate(context.event.status, 'deleteItem', item.critical)) {
    return NextResponse.json({ error: 'Cannot delete item' }, { status: 403 });
  }

  await prisma.item.delete({ where: { id: params.itemId } });

  return NextResponse.json({ success: true });
}
```

**API Route:** `src/app/api/c/[token]/items/[itemId]/assign/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate, logAudit, repairItemStatusAfterMutation } from '@/lib/workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canMutate(context.event.status, 'assignItem')) {
    return NextResponse.json({ error: 'Event is frozen or complete' }, { status: 403 });
  }

  const { personId } = await request.json();

  const item = await prisma.item.findUnique({ where: { id: params.itemId } });
  if (!item || item.teamId !== context.team!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const personEvent = await prisma.personEvent.findFirst({
    where: { personId, eventId: context.event.id }
  });

  if (!personEvent || personEvent.teamId !== item.teamId) {
    return NextResponse.json({ error: 'Person not in same team' }, { status: 400 });
  }

  const assignment = await prisma.$transaction(async (tx) => {
    // Handle reassignment
    const existing = await tx.assignment.findUnique({
      where: { itemId: item.id }
    });

    let actionType = 'ASSIGN_ITEM';
    if (existing) {
      await tx.assignment.delete({ where: { id: existing.id } });
      actionType = 'REASSIGN_ITEM';
    }

    const newAssignment = await tx.assignment.create({
      data: {
        itemId: item.id,
        personId,
        acknowledged: false
      }
    });

    // Repair status after mutation
    await repairItemStatusAfterMutation(tx, item.id);

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType,
      targetType: 'Item',
      targetId: item.id,
      details: `${actionType === 'REASSIGN_ITEM' ? 'Reassigned' : 'Assigned'} item to person ${personId}`
    });

    return newAssignment;
  });

  return NextResponse.json({ assignment });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canMutate(context.event.status, 'assignItem')) {
    return NextResponse.json({ error: 'Event is frozen or complete' }, { status: 403 });
  }

  const item = await prisma.item.findUnique({
    where: { id: params.itemId },
    include: { assignment: true }
  });

  if (!item || item.teamId !== context.team!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (item.assignment) {
    await prisma.$transaction(async (tx) => {
      await tx.assignment.delete({ where: { id: item.assignment!.id } });

      await repairItemStatusAfterMutation(tx, item.id);

      await logAudit(tx, {
        eventId: context.event.id,
        actorId: context.person.id,
        actionType: 'UNASSIGN_ITEM',
        targetType: 'Item',
        targetId: item.id,
        details: 'Unassigned item'
      });
    });
  }

  return NextResponse.json({ success: true });
}
```

**Validation:**
- COORDINATOR token validated
- All queries scoped to token.teamId
- Item creation whitelists fields, hard-sets teamId
- Item edit whitelists fields, never updates teamId
- Mutations gated by canMutate()
- Status computed from assignment (no repair on GET)
- Status repaired after assignment mutations
- Other teams shown as status only
- Assignment validates team membership
- Reassignment deletes existing first
- All mutations logged to audit

---

## Phase 10: Host Overview

**Page:** `src/app/h/[token]/page.tsx`

Features:
- Show event name, dates, status
- Show all teams with computed status
- Show freeze button (disabled if critical gaps)
- Change event status

**API Route:** `src/app/api/h/[token]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTeamStatusFromItems, canFreeze, getCriticalGapCount } from '@/lib/workflow';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const teams = await prisma.team.findMany({
    where: { eventId: context.event.id },
    include: {
      coordinator: true,
      items: {
        include: {
          assignment: {
            include: { person: true }
          }
        }
      }
    }
  });

  const teamsWithStatus = [];
  for (const team of teams) {
    // Compute status from assignment existence (no repair)
    const status = await computeTeamStatusFromItems(team.items);
    teamsWithStatus.push({
      id: team.id,
      name: team.name,
      status,
      coordinator: team.coordinator
    });
  }

  const freezeAllowed = await canFreeze(context.event.id);
  const criticalGaps = await getCriticalGapCount(context.event.id);

  return NextResponse.json({
    event: context.event,
    teams: teamsWithStatus,
    freezeAllowed,
    criticalGaps
  });
}
```

**API Route:** `src/app/api/h/[token]/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canFreeze, getCriticalGapCount, canTransition, logAudit } from '@/lib/workflow';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (context.event.status === 'COMPLETE') {
    return NextResponse.json({ error: 'Cannot modify completed event' }, { status: 403 });
  }

  const { status } = await request.json();

  // Validate state transition
  if (!canTransition(context.event.status, status)) {
    return NextResponse.json({
      error: `Invalid transition from ${context.event.status} to ${status}`
    }, { status: 400 });
  }

  // Freeze gate check
  if (status === 'FROZEN') {
    const allowed = await canFreeze(context.event.id);
    if (!allowed) {
      const gaps = await getCriticalGapCount(context.event.id);
      return NextResponse.json({
        error: `Cannot freeze: ${gaps} critical gaps`
      }, { status: 400 });
    }
  }

  // Single transaction for update + all audit logs
  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: context.event.id },
      data: { status }
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'EVENT_STATUS_CHANGE',
      targetType: 'Event',
      targetId: context.event.id,
      details: `Changed status from ${context.event.status} to ${status}`
    });

    // Log override in same transaction
    if (context.event.status === 'FROZEN' && status === 'CONFIRMING') {
      await logAudit(tx, {
        eventId: context.event.id,
        actorId: context.person.id,
        actionType: 'OVERRIDE_UNFREEZE',
        targetType: 'Event',
        targetId: context.event.id,
        details: 'Host unfroze event'
      });
    }

    return event;
  });

  return NextResponse.json({ event: updated });
}
```

**Validation:**
- Host sees all teams
- Freeze blocked when critical gaps exist
- Shows critical gap count
- Status changes blocked when COMPLETE
- canTransition validates state machine
- Single transaction for atomic update + audit
- Unfreeze logged as override

---

## Phase 11: Basic UI Components

**Files to create:**
- `src/components/ItemCard.tsx` - Display item fields
- `src/components/TeamCard.tsx` - Display team summary
- `src/components/ConfirmButton.tsx` - Acknowledge assignment button
- `src/components/AssignItemForm.tsx` - Dropdown to assign person

**Implementation:** Simple functional components using Tailwind CSS. Display item fields as specified in spec Section 7 screen mockups. Use inline `Intl.DateTimeFormat` for dates.

---

## Testing & Validation

### Acceptance Criteria Checklist

**Participant View:**
- /p/[token] shows only their assignments
- dropOffAt formatted with Pacific/Auckland timezone
- Can acknowledge assignment
- Cannot edit anything
- Team fetched via PersonEvent
- Cannot acknowledge others' assignments
- Acknowledgment logged to audit

**Coordinator View:**
- /c/[token] validates COORDINATOR token
- Token teamId matches PersonEvent.teamId
- Shows all items in their team
- Can assign people (only from same team)
- Cannot see other teams' items
- Other teams shown as status only (SORTED/CRITICAL_GAP)
- All queries scoped to token.teamId
- Item creation whitelists fields, hard-sets teamId
- Item edit whitelists fields, never updates teamId
- Mutations gated by canMutate()
- Delete blocked for critical items in CONFIRMING
- Reassignment deletes existing first
- Status computed from assignment (no GET repair)
- Status repaired after assignment mutations
- All mutations logged to audit

**Host Overview:**
- /h/[token] shows all teams with status
- Freeze disabled when critical gaps exist
- Shows critical gap count
- Status changes blocked when COMPLETE
- canTransition validates state machine
- Unfreeze logged as override
- Single transaction for status change + audit

**Workflow:**
- Freeze blocked if critical item UNASSIGNED
- Freeze gate queries Assignment directly (not status)
- canTransition matches spec state machine exactly
- canMutate implements exact MUTATION_RULES matrix
- Item.status repaired ONLY after mutations

**Data Integrity:**
- No person in multiple teams
- No item with multiple assignments
- Assignment requires same team
- COORDINATOR tokens have teamId matching PersonEvent
- 55 items loaded
- 13 unassigned items
- 6 critical gaps
- All mutations logged to AuditEntry
- previouslyAssignedTo contains person.name

**Seed Resilience:**
- Seed completes with team mismatches
- Mismatches log warnings, not errors
- Final counts match expected

---

## File Structure Summary

```
/gather-prototype
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── h/[token]/page.tsx
│   │   ├── c/[token]/page.tsx
│   │   ├── p/[token]/page.tsx
│   │   └── api/
│   │       ├── h/[token]/
│   │       │   ├── route.ts
│   │       │   └── status/route.ts
│   │       ├── c/[token]/
│   │       │   ├── route.ts
│   │       │   └── items/
│   │       │       ├── route.ts
│   │       │       └── [itemId]/
│   │       │           ├── route.ts
│   │       │           └── assign/route.ts
│   │       └── p/[token]/
│   │           ├── route.ts
│   │           └── ack/[assignmentId]/route.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── workflow.ts
│   │   └── timezone.ts
│   └── components/
│       ├── ItemCard.tsx
│       ├── TeamCard.tsx
│       ├── ConfirmButton.tsx
│       └── AssignItemForm.tsx
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Implementation Timeline

- Phase 1-2: Foundation + Schema (2 hours)
- Phase 3-5: Prisma + Timezone + Seed (3 hours)
- Phase 6-7: Auth + Workflow (2 hours)
- Phase 8: Participant View (2 hours)
- Phase 9: Coordinator View (3 hours)
- Phase 10: Host Overview (2 hours)
- Phase 11: UI Components (2 hours)
- Testing: Validation (2 hours)

**Total:** ~18 hours

---

## Success Criteria

1. All 55 items seeded and navigable
2. All three views functional
3. Freeze gate correctly blocks (6 critical gaps)
4. COORDINATOR tokens validate teamId match
5. Coordinator routes scope to token.teamId only
6. Coordinator mutations whitelist fields, never accept/update teamId
7. Workflow state gating via canMutate() (exact matrix)
8. canTransition validates state machine (no CONFIRMING→DRAFT)
9. Other teams shown as status only
10. Item.status computed from assignment on GET, repaired after mutations
11. All mutations logged to AuditEntry
12. Timezone displays correctly
13. No features added beyond spec
