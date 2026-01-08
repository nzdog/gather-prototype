# Gather Prototype — Implementation Plan v1.3.3

## Change Log (v1.3.2 → v1.3.3)

1. **workflow.ts transaction typing fixed** — use `Prisma.TransactionClient` (no homemade Omit type)
2. **computeTeamStatusFromItems made synchronous** — it never awaited anything; remove async/await everywhere
3. **Host PATCH audit "from status" stabilized** — capture `fromStatus` before update and use it consistently in logs and transition validation
4. **Participant ACK made idempotent + race-safe** — ownership check and "already acknowledged" check performed inside transaction; audit logged only on first ACK
5. **removePerson now logs + repairs correctly** — adds `actorId` param for audit, logs `REMOVE_PERSON` and `UNASSIGN_ITEM` per affected item, and calls `repairItemStatusAfterMutation` after assignment deletions
6. **Coordinator GET + Host GET updated** — remove `await` from `computeTeamStatusFromItems` calls

---

## Project Overview

Building a coordination app for Christmas 2025 gathering with 8 teams, 55 items, and 3 role types (Participant, Coordinator, Host). Implement from scratch following spec v1.3.3 exactly.

---

## Critical Constraints to Enforce

### Schema Invariants

1. **One person → one team per event:** `@@unique([personId, eventId])` + required teamId on PersonEvent
2. **One assignment per item:** `@unique` on Assignment.itemId
3. **COORDINATOR tokens require teamId match:** AccessToken.teamId must equal PersonEvent.teamId
4. **Item.status is cached mirror:** ASSIGNED/UNASSIGNED based on Assignment existence
5. **Coordinator scoping:** all coordinator queries/mutations filtered by token.teamId only
6. **Freeze gate:** query `assignment: null` directly, NOT Item.status
7. **No GET mutations:** repairs only after mutations, never in GET routes

---

## Phase 1: Foundation Setup

**Objective:** Initialize Next.js 14 App Router + TypeScript + Tailwind + Prisma/SQLite.

```bash
npx create-next-app@14 . --typescript --tailwind --app --src-dir
npm install prisma @prisma/client
npm install -D tsx @types/node
npx prisma init --datasource-provider sqlite
```

**Route signature standard:**

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // params.token is synchronous
}
```

---

## Phase 2: Database Schema

Implement schema exactly from spec Section 3.

```bash
npx prisma migrate dev --name init
npx prisma generate
```

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

**File:** `src/lib/timezone.ts`

NZDT UTC+13 helper only valid for December 2025.

```typescript
export function makeNzdtChristmas2025Date(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const nzdtOffsetMinutes = 13 * 60;
  const utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(utc - nzdtOffsetMinutes * 60 * 1000);
}
```

---

## Phase 5: Seed Data

Seed in correct FK order. Assignments created only if team matches. Set Item.status inline after each assignment creation.

No "batch repair" step required because status is explicitly set for each assignment creation, sequentially.

---

## Phase 6: Authentication Layer

**File:** `src/lib/auth.ts`

`resolveToken()` validates:
- Token exists and not expired
- COORDINATOR invariant: token.teamId must match PersonEvent.teamId

---

## Phase 7: Workflow Library

**File:** `src/lib/workflow.ts`

### Key Contracts

- Team status in GET routes computed from assignment existence (not cached status)
- Item.status repair only after assignment mutations, inside the same transaction
- Transaction typing uses `Prisma.TransactionClient`
- `removePerson` requires `actorId` for auditing and does proper repair + logs

### Required Exports

```typescript
import { prisma } from './prisma';
import type { Item, Assignment, Person, EventStatus, Prisma } from '@prisma/client';

type ItemWithAssignmentAndPerson = Item & {
  assignment: (Assignment & { person: Person }) | null;
};

type Tx = Prisma.TransactionClient;

// SYNCHRONOUS - no async/await
export function computeTeamStatusFromItems(
  items: ItemWithAssignmentAndPerson[]
): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
  const hasCriticalGap = items.some(i => i.critical && i.assignment === null);
  const hasGap = items.some(i => i.assignment === null);
  if (hasCriticalGap) return 'CRITICAL_GAP';
  if (hasGap) return 'GAP';
  return 'SORTED';
}

export async function repairItemStatusAfterMutation(
  tx: Tx,
  itemId: string
): Promise<void>;

export async function canFreeze(eventId: string): Promise<boolean>;
export async function getCriticalGapCount(eventId: string): Promise<number>;

export function canTransition(fromStatus: EventStatus, toStatus: EventStatus): boolean;

export function canMutate(
  eventStatus: EventStatus,
  action: 'createItem' | 'editItem' | 'deleteItem' | 'assignItem' | 'addPerson' | 'removePerson',
  itemCritical?: boolean
): boolean;

export async function logAudit(
  tx: Tx,
  params: {
    eventId: string;
    actorId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    details?: string;
  }
): Promise<void>;

export async function removePerson(
  personId: string,
  eventId: string,
  actorId: string
): Promise<void>;
```

### removePerson Implementation

```typescript
export async function removePerson(
  personId: string,
  eventId: string,
  actorId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { name: true }
    });
    if (!person) throw new Error('Person not found');

    // Log REMOVE_PERSON first
    await logAudit(tx, {
      eventId,
      actorId,
      actionType: 'REMOVE_PERSON',
      targetType: 'PersonEvent',
      targetId: personId,
      details: `Removed person ${person.name} from event`
    });

    const assignments = await tx.assignment.findMany({
      where: { personId, item: { team: { eventId } } },
      include: { item: true }
    });

    for (const assignment of assignments) {
      // Update previouslyAssignedTo
      await tx.item.update({
        where: { id: assignment.itemId },
        data: {
          previouslyAssignedTo: assignment.item.previouslyAssignedTo
            ? `${assignment.item.previouslyAssignedTo}, ${person.name}`
            : person.name,
        }
      });

      // Delete assignment
      await tx.assignment.delete({ where: { id: assignment.id } });

      // Repair status after deletion
      await repairItemStatusAfterMutation(tx, assignment.itemId);

      // Log UNASSIGN_ITEM
      await logAudit(tx, {
        eventId,
        actorId,
        actionType: 'UNASSIGN_ITEM',
        targetType: 'Item',
        targetId: assignment.itemId,
        details: `Unassigned item due to removing person ${person.name}`
      });
    }

    await tx.accessToken.deleteMany({ where: { personId, eventId } });
    await tx.personEvent.deleteMany({ where: { personId, eventId } });
  });
}
```

---

## Phase 8: Participant View

### GET /api/p/[token]

- No repair loop
- Returns assignments + item + day + assignment.person

### POST /api/p/[token]/ack/[assignmentId]

**Idempotent + race-safe:**

```typescript
export async function POST(request: NextRequest, { params }) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: params.assignmentId }
    });

    if (!assignment || assignment.personId !== context.person.id) {
      return { found: false };
    }

    // Idempotent: skip if already acknowledged
    if (assignment.acknowledged) {
      return { found: true, alreadyAcked: true };
    }

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

    return { found: true, alreadyAcked: false };
  });

  if (!result.found) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
```

---

## Phase 9: Coordinator View

### GET /api/c/[token]

```typescript
// Compute status SYNCHRONOUSLY (no await)
const myStatus = computeTeamStatusFromItems(myItems);
```

Other teams: status only via `item.groupBy` aggregate, no item visibility.

### Assignment POST/DELETE

- All mutations in transactions
- After assignment create/delete: call `repairItemStatusAfterMutation(tx, item.id)`
- Log `ASSIGN_ITEM` / `REASSIGN_ITEM` / `UNASSIGN_ITEM`

---

## Phase 10: Host Overview

### GET /api/h/[token]

```typescript
// For each team, compute status SYNCHRONOUSLY (no await)
const status = computeTeamStatusFromItems(team.items);
```

`freezeAllowed` computed from `canFreeze()` (assignment-null direct).

### PATCH /api/h/[token]/status

**Correctness requirements:**

```typescript
export async function PATCH(request: NextRequest, { params }) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Capture BEFORE any update
  const fromStatus = context.event.status;

  if (fromStatus === 'COMPLETE') {
    return NextResponse.json({ error: 'Cannot modify completed event' }, { status: 403 });
  }

  const { status } = await request.json();

  if (!canTransition(fromStatus, status)) {
    return NextResponse.json({
      error: `Invalid transition from ${fromStatus} to ${status}`
    }, { status: 400 });
  }

  if (status === 'FROZEN') {
    const allowed = await canFreeze(context.event.id);
    if (!allowed) {
      const gaps = await getCriticalGapCount(context.event.id);
      return NextResponse.json({
        error: `Cannot freeze: ${gaps} critical gaps`
      }, { status: 400 });
    }
  }

  // Single transaction
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
      details: `Changed status from ${fromStatus} to ${status}`
    });

    // Log override in same transaction
    if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
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

---

## Phase 11: UI Components

Functional Tailwind components only. No extra abstractions.

- `ItemCard.tsx` - Display item fields
- `TeamCard.tsx` - Display team summary
- `ConfirmButton.tsx` - Acknowledge button
- `AssignItemForm.tsx` - Assignment dropdown

---

## Testing & Validation

### Must-Pass Checks

```bash
# TypeScript compile
npx tsc --noEmit

# Lint
npm run lint
```

### Behavioral Tests

1. **Coordinator + Host GET routes do not write to DB** (no repair on GET)

2. **ACK endpoint idempotency:**
   - First call → logs `ACK_ASSIGNMENT`
   - Second call → returns success, logs nothing new

3. **Host status change audit:**
   - Logs correct "from → to" status

4. **Assign/unassign routes:**
   - Repair runs after mutation
   - Item.status matches assignment existence

5. **Token scoping:**
   - Coordinator routes cannot read any other team's items

---

## Success Criteria

1. 55 items seeded and visible in correct views
2. Participant, Coordinator, Host flows work end-to-end
3. Freeze gate blocks on critical gaps via `assignment: null` query
4. Team scoping and token invariants enforced
5. No GET mutations; repairs only after mutations
6. Audit logs written transactionally for specified actions
7. No features beyond spec

---

## File Structure

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

| Phase | Description | Duration |
|-------|-------------|----------|
| 1-2 | Foundation + Schema | 2 hours |
| 3-5 | Prisma + Timezone + Seed | 3 hours |
| 6-7 | Auth + Workflow | 2 hours |
| 8 | Participant View | 2 hours |
| 9 | Coordinator View | 3 hours |
| 10 | Host Overview | 2 hours |
| 11 | UI Components | 2 hours |
| Testing | Validation | 2 hours |

**Total:** ~18 hours
