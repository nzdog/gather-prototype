# Gather: Builder's Specification — v1.3.3

## For Claude Code Implementation

**Version:** 1.3.3  
**Date:** December 2025  
**Scope:** Working prototype with real Christmas 2025 data

---

## v1.3.3 Changelog (from v1.3.2)

1. **Fixed Prisma aggregate query** — Replaced invalid `_count.select.items.where` with `item.groupBy` approach for other teams' statuses
2. **Specified Remove Person procedure** — Added explicit delete order to prevent FK constraint failures; chose app-layer orchestration over schema cascade
3. **Made seed more resilient** — Team mismatch now skips assignment + logs warning instead of throwing

---

## Pre-Output Consistency Checklist

- [x] Schema has required fields + relations
- [x] Seed data references only real schema fields
- [x] Coordinator tokens cannot exist without teamId and matching membership
- [x] Drop-off time/date is representable (DateTime via dropOffAt)
- [x] Counts in seed summary match items actually listed (55 items, 13 unassigned, 6 critical gaps)
- [x] repairItemStatus() is async and call ordering is specified
- [x] All seed dates use `makeNzdtChristmas2025Date()` (NZDT-specific, December 2025 only)
- [x] Coordinator APIs scoped to token.teamId only
- [x] Coordinator APIs compute other teams' statuses server-side without exposing items
- [x] canFreeze() queries Assignment existence directly, not cached Item.status
- [x] Schema supports dev reset via `prisma migrate reset` without cascade deadlock
- [x] Other teams' status uses valid Prisma `item.groupBy` (not invalid `_count.where`)
- [x] Remove Person procedure specifies delete order to avoid FK failures
- [x] Seed handles team mismatch gracefully (skip + log, not throw)

---

## 1. Project Overview

### What This Is

A coordination app for multi-day gatherings (Christmas, reunions, retreats) that ensures everyone knows what they're responsible for without anyone holding the whole plan in their head.

### The Job To Be Done

> Make sure everyone knows what they're responsible for, without anyone having to hold the whole plan in their head.

### What This Is NOT

- A recipe app
- A shopping list manager
- A budget tracker
- A seating planner
- A group chat
- A project management tool

### Success Criteria for Prototype

1. A participant can land on their magic link and see their assignments in under 10 seconds
2. A coordinator can see all items in their team and identify gaps instantly
3. A host can see system health (all teams, their status) without reading item lists
4. The Christmas 2025 data is fully loaded and navigable
5. Freeze state prevents mutations (with logged override for host)
6. Freeze is blocked when critical items are unassigned (demonstrable with seed data)

---

## 2. Technical Decisions

### Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14 (App Router) | Full-stack, fast to ship |
| Database | SQLite via Prisma | Zero infrastructure, portable |
| Styling | Tailwind CSS | Rapid UI development |
| Auth | Magic links (token-based) | Matches access model |
| Hosting | Local development | Prototype only |

---

## 3. Data Model

### Schema (Prisma format)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

// ============================================
// CORE OBJECTS
// ============================================

model Event {
  id          String      @id @default(cuid())
  name        String
  startDate   DateTime
  endDate     DateTime
  status      EventStatus @default(DRAFT)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  // Relations
  hostId      String
  host        Person      @relation("EventHost", fields: [hostId], references: [id])
  days        Day[]
  teams       Team[]
  people      PersonEvent[]
  auditLog    AuditEntry[]
  tokens      AccessToken[]
}

enum EventStatus {
  DRAFT
  CONFIRMING
  FROZEN
  COMPLETE
}

model Day {
  id      String   @id @default(cuid())
  name    String
  date    DateTime

  // Relations
  eventId String
  event   Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  items   Item[]
}

model Team {
  id            String  @id @default(cuid())
  name          String
  scope         String?

  // Relations
  eventId       String
  event         Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)

  coordinatorId String
  coordinator   Person  @relation("TeamCoordinator", fields: [coordinatorId], references: [id])

  items         Item[]
  members       PersonEvent[]
  tokens        AccessToken[]
}

model Person {
  id        String  @id @default(cuid())
  name      String
  email     String? @unique
  phone     String?

  // Relations
  hostedEvents      Event[]       @relation("EventHost")
  coordinatedTeams  Team[]        @relation("TeamCoordinator")
  eventMemberships  PersonEvent[]
  assignments       Assignment[]
  auditActions      AuditEntry[]
  tokens            AccessToken[]
}

// Join table: Person <-> Event (with team assignment)
model PersonEvent {
  id       String @id @default(cuid())

  personId String
  person   Person @relation(fields: [personId], references: [id], onDelete: Cascade)

  eventId  String
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  // teamId is REQUIRED to enforce "one team only" strictly
  teamId   String
  team     Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  role     PersonRole @default(PARTICIPANT)

  @@unique([personId, eventId]) // One person, one team per event
}

enum PersonRole {
  HOST
  COORDINATOR
  PARTICIPANT
}

model Item {
  id                   String      @id @default(cuid())
  name                 String
  quantity             String?
  description          String?
  critical             Boolean     @default(false)
  status               ItemStatus  @default(UNASSIGNED)
  previouslyAssignedTo String?

  // Constraint tags
  glutenFree           Boolean     @default(false)
  dairyFree            Boolean     @default(false)
  vegetarian           Boolean     @default(false)

  notes                String?

  // Drop-off logistics
  dropOffAt            DateTime?   // When to drop off (stored as UTC)
  dropOffLocation      String?     // e.g., "Kate's Kitchen", "Marquee"
  dropOffNote          String?     // Human-readable time note, e.g., "12 noon", "after mains"

  // Relations
  teamId      String
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  dayId       String?
  day         Day?     @relation(fields: [dayId], references: [id])

  assignment  Assignment?
}

enum ItemStatus {
  ASSIGNED
  UNASSIGNED
}

model Assignment {
  id           String   @id @default(cuid())
  acknowledged Boolean  @default(false)
  createdAt    DateTime @default(now())

  // Relations
  itemId   String @unique // One assignment per item
  item     Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)

  personId String
  person   Person @relation(fields: [personId], references: [id])
  // NOTE: No onDelete cascade here — removal requires app-layer orchestration
  // See "Remove Person Procedure" in Section 6
}

// Dedicated token table for magic link auth
model AccessToken {
  id          String      @id @default(cuid())
  token       String      @unique
  scope       TokenScope
  expiresAt   DateTime?
  createdAt   DateTime    @default(now())

  eventId     String
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)

  personId    String
  person      Person      @relation(fields: [personId], references: [id], onDelete: Cascade)

  // Required for coordinator-scoped tokens
  teamId      String?
  team        Team?       @relation(fields: [teamId], references: [id])
}

enum TokenScope {
  HOST
  COORDINATOR
  PARTICIPANT
}

model AuditEntry {
  id         String   @id @default(cuid())
  timestamp  DateTime @default(now())
  actionType String
  targetType String
  targetId   String
  details    String?

  eventId  String
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  actorId  String
  actor    Person @relation(fields: [actorId], references: [id])
}
```

### Key Constraints

| Constraint | Enforcement |
|------------|-------------|
| One person → one team per event | `@@unique([personId, eventId])` + required `teamId` |
| One assignment per item | `@unique` on `Assignment.itemId` |
| Coordinator must exist | Required `coordinatorId` on Team |
| Items belong to exactly one team | Required `teamId` on Item |
| Team deletion blocked at application layer | API rejects team deletion; schema uses `onDelete: Cascade` to allow dev resets |
| Person removal requires orchestration | Assignment.person has no cascade; app must delete assignments first (see Section 6) |

### Application-Layer Invariants

1. **Assignment team match:** When assigning a person to an item, verify `PersonEvent.teamId === Item.teamId`

2. **Orphan handling:** When removing a person, delete their assignments, set affected items to `UNASSIGNED`, populate `previouslyAssignedTo`

3. **Status maintenance:** When assignment created → `Item.status = ASSIGNED`. When assignment deleted → `Item.status = UNASSIGNED`

4. **Token-team consistency (COORDINATOR scope):** When creating an AccessToken with `scope = COORDINATOR`:
   - `AccessToken.teamId` MUST be non-null
   - `AccessToken.teamId` MUST equal the person's `PersonEvent.teamId` for that event
   - Reject token creation if these conditions are not met

5. **Item.status as cached mirror:** `Item.status` is a cached representation of whether an Assignment exists:
   - On Assignment create → set `Item.status = ASSIGNED`
   - On Assignment delete → set `Item.status = UNASSIGNED`
   - On read: if mismatch detected (status says ASSIGNED but no Assignment exists, or vice versa), repair by recomputing from Assignment existence

6. **Delete cascade behavior:** Deleting an Item cascades to delete its Assignment (via Prisma `onDelete: Cascade` on Assignment.itemId). Team status recomputes on next read. Delete rules:
   - FROZEN: delete blocked (no override)
   - CONFIRMING: delete allowed only if `item.critical === false`
   - DRAFT: delete always allowed

7. **Coordinator API scoping:** All coordinator API routes MUST:
   - Scope all queries to `token.teamId` only
   - Scope all mutations to `token.teamId` only
   - NEVER accept `teamId` as a client-provided parameter
   - Reject requests where `item.teamId !== token.teamId`

8. **Team deletion prohibition:** Team deletion is blocked at the application layer (API returns 403). The schema uses `onDelete: Cascade` on PersonEvent.team to allow clean dev resets via `prisma migrate reset`. This is intentional: the prototype does not support team deletion, but dev tooling must not deadlock.

### Role vs Coordinator Authority Clarification

Two distinct concepts exist in the system:

1. **PersonEvent.role** — The person's *event-level permission role*:
   - `HOST`: Can change event status, manage teams, perform overrides
   - `COORDINATOR`: Can manage items within their assigned team
   - `PARTICIPANT`: Can view and acknowledge their assignments only

2. **Team.coordinatorId** — The person who *owns* a specific team:
   - This grants operational authority over that team's items
   - Independent of PersonEvent.role

**A HOST can also be a team coordinator.** Example: Jacqui has `PersonEvent.role = HOST` and is also referenced by `Team.coordinatorId` for the "Vegetables & Sides" team. She has both host powers (event-level) and coordinator powers (team-level).

This is not multi-role in the schema — it's two separate authority paths that can overlap.

---

## 4. Access Model

### Role Determination

Role comes from token scope:
- `HOST`: Full structural control over event
- `COORDINATOR`: Owns a team, can manage items within it
- `PARTICIPANT`: Can view and acknowledge their assignments only

### Token Invariants

1. **HOST tokens:** `teamId` is null (host operates at event level)
2. **COORDINATOR tokens:** `teamId` MUST be non-null AND must match the person's `PersonEvent.teamId` for that event
3. **PARTICIPANT tokens:** `teamId` is null (participant accesses via personId + eventId)

These invariants must be enforced at token creation time (in seed script and any future token generation).

### Link Structure

```
/h/{token}              → Host Overview (token contains eventId context)
/c/{token}              → Coordinator Team Sheet (token contains teamId context)
/p/{token}              → Participant View (token contains personId + eventId context)
```

### Token Generation

- Generate unique tokens in seed script
- Tokens expire after 90 days (stored in `expiresAt`)
- Token lookup returns: person, event, team (if coordinator), scope
- For COORDINATOR tokens: validate `teamId` matches person's `PersonEvent.teamId` before creation

---

## 5. API Routes

### Auth Middleware

Every API route resolves the caller by token and enforces scope + membership.

```typescript
// lib/auth.ts
async function resolveToken(token: string): Promise<{
  person: Person;
  event: Event;
  team?: Team;
  scope: TokenScope;
} | null>
```

```typescript
// Validation rules inside resolveToken:
// 1. Token must exist and not be expired
// 2. If scope === COORDINATOR:
//    - token.teamId must be non-null
//    - token.teamId must match PersonEvent.teamId for (personId, eventId)
//    - If mismatch, return null (invalid token)
// 3. Return { person, event, team (for COORDINATOR), scope }
```

### Participant Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/p/[token]` | Get participant's assignments + event context |
| POST | `/api/p/[token]/ack/[assignmentId]` | Acknowledge assignment |

### Coordinator Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/c/[token]` | Get team + items + other teams' statuses |
| POST | `/api/c/[token]/items` | Create item (blocked if frozen) |
| PATCH | `/api/c/[token]/items/[itemId]` | Edit item (blocked if frozen) |
| DELETE | `/api/c/[token]/items/[itemId]` | Delete item (blocked if frozen; in CONFIRMING state, blocked if critical) |
| POST | `/api/c/[token]/items/[itemId]/assign` | Assign person (must be in same team) |
| DELETE | `/api/c/[token]/items/[itemId]/assign` | Remove assignment (sets Item.status = UNASSIGNED) |

### Coordinator Route Scoping Rules

All coordinator routes MUST enforce:

```typescript
// In every coordinator route handler:
// 1. Resolve token (includes team from token.teamId)
const { team: tokenTeam } = await resolveToken(token);

// 2. For GET: filter items by tokenTeam.id
const items = await prisma.item.findMany({
  where: { teamId: tokenTeam.id },
  include: { assignment: true }
});

// 3. For mutations on existing items: verify ownership
const item = await prisma.item.findUnique({ where: { id: itemId } });
if (item.teamId !== tokenTeam.id) {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

// 4. For item creation: force teamId from token
await prisma.item.create({
  data: {
    ...itemData,
    teamId: tokenTeam.id, // NEVER from client
  }
});

// NEVER: accept teamId from request body or query params
```

### Other Teams' Statuses (Coordinator View)

The coordinator GET route returns status indicators for other teams WITHOUT exposing their items. This MUST be implemented using `item.groupBy` for valid Prisma syntax:

```typescript
// In GET /api/c/[token]/route.ts

// 1. Fetch coordinator's own team items (with repair)
const myItems = await prisma.item.findMany({
  where: { teamId: tokenTeam.id },
  include: { assignment: true }
});
const myStatus = await getRepairedTeamStatus(myItems);

// 2. Fetch other teams (id + name only)
const otherTeams = await prisma.team.findMany({
  where: { 
    eventId: tokenTeam.eventId,
    id: { not: tokenTeam.id }
  },
  select: { id: true, name: true }
});

// 3. Count critical gaps per team via groupBy on Item
// This queries assignment: null (not status field) for accuracy
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

// 5. Return coordinator's items + other teams' statuses only
return Response.json({
  team: { id: tokenTeam.id, name: tokenTeam.name },
  items: myItems,
  myStatus,
  otherTeams: otherTeamsStatus, // Status only, no items
});
```

**Critical constraint:** The `otherTeams` array must NEVER contain item data. Coordinator routes must not fetch items where `teamId !== token.teamId` except via aggregate queries (`groupBy` or `count`).

**Known limitation:** This simplified status only distinguishes CRITICAL_GAP vs SORTED. Non-critical gaps (GAP status) for other teams are not shown. Acceptable for prototype.

### Host Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/h/[token]` | Event overview with all teams + statuses |
| PATCH | `/api/h/[token]/status` | Change workflow status (with gates) |
| POST | `/api/h/[token]/override` | Override action while frozen (logged) |

---

## 6. Workflow Rules

### State Machine

```
DRAFT → CONFIRMING      : Always allowed (host only)
CONFIRMING → FROZEN     : Blocked if any critical item is UNASSIGNED
FROZEN → CONFIRMING     : Allowed (host only, logged as override)
FROZEN → COMPLETE       : Allowed (host only)
COMPLETE → *            : Never allowed
```

### Mutation Rules by State

```typescript
const MUTATION_RULES = {
  DRAFT: {
    createItem: true,
    editItem: true,
    deleteItem: true,
    assignItem: true,
    createTeam: true,
    editTeam: true,
    deleteTeam: true,
    addPerson: true,
    removePerson: true,
  },
  CONFIRMING: {
    createItem: true,
    editItem: true,
    deleteItem: 'NON_CRITICAL_ONLY',
    assignItem: true,
    createTeam: false,
    editTeam: false,
    deleteTeam: false,
    addPerson: true,
    removePerson: true, // Creates orphans
  },
  FROZEN: {
    createItem: 'HOST_OVERRIDE',
    editItem: 'HOST_OVERRIDE',
    deleteItem: false, // Never allowed while frozen (no override)
    assignItem: 'HOST_OVERRIDE',
    createTeam: false,
    editTeam: false,
    deleteTeam: false,
    addPerson: 'HOST_OVERRIDE',
    removePerson: 'HOST_OVERRIDE',
  },
  COMPLETE: {
    // All mutations blocked
  },
};
```

### Override Logging

```typescript
async function logOverride(
  eventId: string,
  actorId: string,
  actionType: string,
  targetType: string,
  targetId: string,
  details: string
) {
  await prisma.auditEntry.create({
    data: {
      eventId,
      actorId,
      actionType: `OVERRIDE_${actionType}`,
      targetType,
      targetId,
      details,
    },
  });
}
```

### Computed Team Status

```typescript
function computeTeamStatus(items: Item[]): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
  const hasCriticalGap = items.some(i => i.critical && i.status === 'UNASSIGNED');
  const hasGap = items.some(i => i.status === 'UNASSIGNED');
  
  if (hasCriticalGap) return 'CRITICAL_GAP';
  if (hasGap) return 'GAP';
  return 'SORTED';
}
```

### Item Status Repair

```typescript
// lib/workflow.ts

import { prisma } from './prisma';
import type { Item, Assignment } from '@prisma/client';

type ItemWithAssignment = Item & { assignment: Assignment | null };

/**
 * Repairs Item.status if it doesn't match Assignment existence.
 * Mutates item.status in-place after DB update.
 * Returns void (status is available via item.status after call).
 */
async function repairItemStatus(item: ItemWithAssignment): Promise<void> {
  const shouldBe = item.assignment !== null ? 'ASSIGNED' : 'UNASSIGNED';
  
  if (item.status !== shouldBe) {
    await prisma.item.update({
      where: { id: item.id },
      data: { status: shouldBe },
    });
    // Mutate in-memory object so caller sees correct value
    item.status = shouldBe;
  }
}

/**
 * Repairs all items, then computes team status.
 * MUST be used in all GET routes that return team data.
 * 
 * Call order: repair all → then compute status
 * 
 * WARNING: Items are repaired SEQUENTIALLY, not in parallel.
 * Do NOT replace with Promise.all() — sequential execution ensures
 * deterministic DB state and avoids write contention on SQLite.
 * This is intentional; performance is acceptable for prototype scale.
 */
async function getRepairedTeamStatus(
  items: ItemWithAssignment[]
): Promise<'SORTED' | 'GAP' | 'CRITICAL_GAP'> {
  // Step 1: Repair all items first (MUST be sequential — see docstring)
  for (const item of items) {
    await repairItemStatus(item);
  }
  
  // Step 2: Compute status from repaired items
  return computeTeamStatus(items);
}
```

### Repair Call Sites

`repairItemStatus` (or `getRepairedTeamStatus`) MUST be invoked at exactly these locations:

| Route | When | What to call |
|-------|------|--------------|
| `GET /api/p/[token]` | Before returning assignments | `repairItemStatus()` on each item |
| `GET /api/c/[token]` | Before returning team data | `getRepairedTeamStatus(items)` |
| `GET /api/h/[token]` | Before returning event overview | `getRepairedTeamStatus(items)` for each team |

Pattern for coordinator GET route:
```typescript
// GET /api/c/[token]/route.ts
const items = await prisma.item.findMany({
  where: { teamId: tokenTeam.id },
  include: { assignment: true }
});

// Repair before returning — this mutates items in place
const teamStatus = await getRepairedTeamStatus(items);

return Response.json({ items, teamStatus });
```

### Freeze Gate Implementation

The freeze gate (`canFreeze()`) determines whether the event can transition from CONFIRMING to FROZEN. It MUST query Assignment existence directly, not rely on cached `Item.status`, to prevent stale data from allowing an invalid freeze.

```typescript
/**
 * Returns true if the event can be frozen.
 * Freeze is blocked if ANY critical item lacks an assignment.
 * 
 * CRITICAL: This queries Assignment existence directly.
 * Do NOT use Item.status here — it may be stale.
 */
async function canFreeze(eventId: string): Promise<boolean> {
  const criticalUnassignedCount = await prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null, // Direct check, not status field
    },
  });
  
  return criticalUnassignedCount === 0;
}

/**
 * Returns the count of critical items blocking freeze.
 * Used for UI messaging ("Cannot freeze: N critical gaps").
 */
async function getCriticalGapCount(eventId: string): Promise<number> {
  return prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null,
    },
  });
}
```

**Invariant:** `canFreeze()` and `getCriticalGapCount()` MUST query `assignment: null`, never `status: 'UNASSIGNED'`. The freeze gate is a safety-critical path; it must not trust cached state.

### Remove Person Procedure

The schema does NOT use `onDelete: Cascade` on `Assignment.person`. This is intentional: removing a person requires updating item state (status, previouslyAssignedTo), which cascades cannot do.

**Any endpoint that removes a person MUST follow this exact order:**

```typescript
/**
 * Removes a person from an event.
 * MUST be called in a transaction to ensure atomicity.
 * 
 * @param personId - The person to remove
 * @param eventId - The event context
 */
async function removePerson(personId: string, eventId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Find all assignments for this person in this event
    const assignments = await tx.assignment.findMany({
      where: {
        personId,
        item: { team: { eventId } }
      },
      include: { item: true }
    });

    // 2. For each assignment: update the item, then delete assignment
    for (const assignment of assignments) {
      // Update item: mark unassigned, record who had it
      await tx.item.update({
        where: { id: assignment.itemId },
        data: {
          status: 'UNASSIGNED',
          previouslyAssignedTo: assignment.item.previouslyAssignedTo 
            ? `${assignment.item.previouslyAssignedTo}, ${personId}`
            : personId,
        }
      });

      // Delete the assignment
      await tx.assignment.delete({
        where: { id: assignment.id }
      });
    }

    // 3. Delete access tokens for this person in this event
    await tx.accessToken.deleteMany({
      where: { personId, eventId }
    });

    // 4. Delete PersonEvent (membership)
    await tx.personEvent.deleteMany({
      where: { personId, eventId }
    });

    // 5. Optionally delete Person if orphaned (no other event memberships)
    // For prototype: leave Person record, just remove from event
  });
}
```

**Why not schema cascade?** 
- `onDelete: Cascade` on Assignment.person would delete assignments but NOT update Item.status or previouslyAssignedTo
- The orphan-handling invariant requires item state updates, which only app logic can do
- This explicit procedure ensures items become properly UNASSIGNED with history preserved

**Note:** The prototype does not expose a "remove person" UI (see Section 11: What NOT to build). This procedure exists for completeness and future use.

---

## 7. Screen Specifications

### Screen 1: Participant View (`/p/[token]`)

```
┌─────────────────────────────────────┐
│ Richardson Family Christmas         │
│ 24–26 December 2025                │
├─────────────────────────────────────┤
│ You're part of: PUDDINGS           │
│ Coordinator: Anika                  │
├─────────────────────────────────────┤
│ YOUR ASSIGNMENTS                    │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Vanilla ice cream               │ │
│ │ 2 tubs · GF                     │ │
│ │ Christmas Day · 25 Dec, 12:00pm │ │
│ │ Drop-off: Marquee               │ │
│ │                    [Confirm ✓]  │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ [View team sheet →]                 │
└─────────────────────────────────────┘
```

**Shows:**
- Event name, dates
- Team name, coordinator name
- Assigned items with: name, quantity, constraints, day, dropOffAt formatted as date/time, location
- dropOffNote (if present) shown as human-readable hint
- Confirm button per item

**Does NOT show:**
- Other teams
- Other people's assignments
- Overview
- Edit controls

---

### Screen 2: Coordinator View (`/c/[token]`)

```
┌─────────────────────────────────────┐
│ PUDDINGS                            │
│ You own this team                   │
├─────────────────────────────────────┤
│ Event: Confirming    Team: 8 gaps   │
├─────────────────────────────────────┤
│ ITEMS                    [+ Add]    │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⚠ GF trifle                [!]  │ │
│ │ 3 · GF · Christmas Day          │ │
│ │ UNASSIGNED                      │ │
│ │                      [Assign →] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✓ Xmas pudding (non-GF)    [!]  │ │
│ │ 2 · Christmas Day               │ │
│ │ Anika                      ✓    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✓ Vanilla ice cream             │ │
│ │ 2 tubs · GF · Christmas Day     │ │
│ │ Rosie                      ✓    │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ OTHER TEAMS                         │
│ Entrées ✓  Mains ⚠  Veg ⚠          │
│ Later ⚠   Drinks ✓  Setup ⚠        │
│ Clean-up ✓                          │
└─────────────────────────────────────┘
```

**Shows:**
- Team name, scope
- Event status, team status (with gap count)
- All items: name, quantity, constraints, assignee or "UNASSIGNED"
- Critical flag indicator [!]
- Other teams' names + status (no detail)

**Actions:**
- Add item (if not frozen)
- Edit item (if not frozen)
- Assign/reassign person (if not frozen, person must be in same team)
- Mark critical (if not frozen)

**Does NOT show:**
- Other teams' items
- Freeze control
- Event settings

---

### Screen 3: Host Overview (`/h/[token]`)

```
┌─────────────────────────────────────┐
│ RICHARDSON FAMILY CHRISTMAS         │
│ 24–26 December 2025                │
├─────────────────────────────────────┤
│ Status: CONFIRMING                  │
│                       [Freeze →]    │
├─────────────────────────────────────┤
│ TEAMS                               │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Entrées & Nibbles          ✓    │ │
│ │ Coordinator: Joanna             │ │
│ │ Sorted                     [→]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Puddings                   ⚠    │ │
│ │ Coordinator: Anika              │ │
│ │ Critical gap (8 items)     [→]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Setup                      ⚠    │ │
│ │ Coordinator: Elliot             │ │
│ │ Critical gap (1 item)      [→]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ... (all 8 teams)                   │
│                                     │
├─────────────────────────────────────┤
│ ⚠ Cannot freeze: 12 critical gaps  │
└─────────────────────────────────────┘
```

**Shows:**
- Event name, dates, status
- All teams: name, coordinator, computed status
- Freeze button (disabled with explanation if critical gaps exist)
- Override indicator (if frozen with overrides)

**Actions:**
- Change workflow status (with gates)
- Drill down to any team
- Override actions when frozen (logged)

**Does NOT show (by default):**
- Item-level detail (requires drill-down)
- Individual confirmation status
- Comparative metrics

---

## 8. Seed Data

### Seed Order (Critical)

The seed script MUST create records in this order to satisfy foreign key constraints:

1. **People** — Create all Person records first
2. **Event** — Create Event with `hostId` referencing Jacqui's Person.id
3. **Days** — Create Day records referencing Event.id
4. **Teams** — Create Team records with `coordinatorId` referencing Person.id and `eventId`
5. **PersonEvent** — Create membership records linking Person → Event → Team (one per person)
6. **Items** — Create Item records with `teamId` and optional `dayId`
7. **Assignments** — Create Assignment records only where assignee is non-null AND person's PersonEvent.teamId matches Item.teamId
8. **AccessTokens** — Create tokens for each person with appropriate scope and teamId (for COORDINATOR tokens)

### Timezone Strategy

**Storage:** All `DateTime` fields store UTC internally.

**Display timezone:** Pacific/Auckland (NZDT in December = UTC+13)

**Seed construction:** Seed data specifies NZ local times, converted to UTC for storage using a helper that is SPECIFIC TO DECEMBER 2025 (NZDT).

```typescript
// lib/timezone.ts

/**
 * Creates a UTC Date from NZ local date and time.
 * 
 * ⚠️  WARNING: THIS HELPER IS NZDT-SPECIFIC (UTC+13)
 * ⚠️  It is ONLY valid for dates in NZ Daylight Saving Time.
 * ⚠️  For December 2025, this is correct. For other dates, verify offset.
 * 
 * If reusing this for events outside NZDT (April–September in NZ),
 * you MUST use NZST (UTC+12) instead. Do not use this function blindly.
 * 
 * @param dateStr - Date in "YYYY-MM-DD" format (NZ local)
 * @param timeStr - Time in "HH:mm" 24-hour format (NZ local)
 * @returns Date object representing that NZ local time as UTC
 */
function makeNzdtChristmas2025Date(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  // NZDT offset: UTC+13 (valid for Christmas 2025)
  const nzdtOffsetMinutes = 13 * 60;
  
  // Create a date in UTC that represents this NZ local time
  const utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const adjusted = new Date(utc - nzdtOffsetMinutes * 60 * 1000);
  
  return adjusted;
}

// Examples (verify these in implementation):
// makeNzdtChristmas2025Date("2025-12-24", "17:30") → 2025-12-24T04:30:00.000Z (5:30pm NZ)
// makeNzdtChristmas2025Date("2025-12-25", "12:00") → 2025-12-24T23:00:00.000Z (12 noon NZ)
// makeNzdtChristmas2025Date("2025-12-25", "10:00") → 2025-12-24T21:00:00.000Z (10am NZ)

export { makeNzdtChristmas2025Date };
```

**Display formatting:** When rendering `dropOffAt` in UI, convert UTC → NZ local using:

```typescript
const formatter = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const displayStr = formatter.format(item.dropOffAt);
```

**Critical:** Never format dates using UTC strings or the server's local timezone. All date rendering MUST specify `timeZone: 'Pacific/Auckland'` to ensure correct grouping by day and correct display of drop-off times.

### Event

```typescript
const event = {
  name: "Richardson Family Christmas",
  startDate: makeNzdtChristmas2025Date("2025-12-24", "00:00"),
  endDate: makeNzdtChristmas2025Date("2025-12-26", "23:59"),
  status: "CONFIRMING",
  // hostId will reference Jacqui's Person.id after Person creation
};
```

### Days

```typescript
const days = [
  { name: "Christmas Eve", date: makeNzdtChristmas2025Date("2025-12-24", "00:00") },
  { name: "Christmas Day", date: makeNzdtChristmas2025Date("2025-12-25", "00:00") },
  { name: "Boxing Day", date: makeNzdtChristmas2025Date("2025-12-26", "00:00") },
];
```

### Drop-off Reference Object

```typescript
// Shared drop-off times for seed data
// All times are NZ local (NZDT for December 2025)
const dropOff = {
  eve:   { at: makeNzdtChristmas2025Date("2025-12-24", "17:30"), location: "Kate's Kitchen", note: "5:30pm" },
  day:   { at: makeNzdtChristmas2025Date("2025-12-25", "12:00"), location: "Marquee", note: "12 noon" },
  box:   { at: makeNzdtChristmas2025Date("2025-12-26", "12:00"), location: "Marquee", note: "12 noon" },
  setup: { at: makeNzdtChristmas2025Date("2025-12-25", "10:00"), location: "Marquee", note: "10:00am" },
};
```

### Teams

```typescript
const teams = [
  { name: "Entrées & Nibbles", scope: "Pre-meal food, easy grazing", coordinatorName: "Joanna" },
  { name: "Mains – Proteins", scope: "Centre protein dishes for 36-40", coordinatorName: "Kate" },
  { name: "Vegetables & Sides", scope: "Salads + hot veg, volume + balance", coordinatorName: "Jacqui" },
  { name: "Puddings", scope: "Desserts including GF options", coordinatorName: "Anika" },
  { name: "Later Food", scope: "Evening / next-day easy food", coordinatorName: "Gus" },
  { name: "Drinks", scope: "All drinks + ice", coordinatorName: "Ian" },
  { name: "Setup", scope: "Tables, labels, rubbish setup", coordinatorName: "Elliot" },
  { name: "Clean-up", scope: "Dishwasher, clearing, dessert cleanup", coordinatorName: "Nigel" },
];
// coordinatorName is resolved to coordinatorId after Person creation
```

### People (One Team Per Person)

```typescript
const people = [
  // Host (also Veg & Sides coordinator)
  { name: "Jacqui", role: "HOST", teamName: "Vegetables & Sides" },

  // Coordinators
  { name: "Joanna", role: "COORDINATOR", teamName: "Entrées & Nibbles" },
  { name: "Kate", role: "COORDINATOR", teamName: "Mains – Proteins" },
  { name: "Anika", role: "COORDINATOR", teamName: "Puddings" },
  { name: "Gus", role: "COORDINATOR", teamName: "Later Food" },
  { name: "Ian", role: "COORDINATOR", teamName: "Drinks" },
  { name: "Elliot", role: "COORDINATOR", teamName: "Setup" },
  { name: "Nigel", role: "COORDINATOR", teamName: "Clean-up" },

  // Entrées & Nibbles participants
  { name: "Pete", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
  { name: "Jack", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
  { name: "Tom", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
  { name: "Jane", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
  { name: "Gavin", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },

  // Mains – Proteins participants
  { name: "Angus", role: "PARTICIPANT", teamName: "Mains – Proteins" },
  { name: "Dougal", role: "PARTICIPANT", teamName: "Mains – Proteins" },
  { name: "Robyn", role: "PARTICIPANT", teamName: "Mains – Proteins" },

  // Vegetables & Sides participants
  { name: "Emma", role: "PARTICIPANT", teamName: "Vegetables & Sides" },
  { name: "Grace", role: "PARTICIPANT", teamName: "Vegetables & Sides" },

  // Puddings participants
  { name: "Keith", role: "PARTICIPANT", teamName: "Puddings" },
  { name: "Rosie", role: "PARTICIPANT", teamName: "Puddings" },
  { name: "Lance", role: "PARTICIPANT", teamName: "Puddings" },

  // Clean-up participants
  { name: "George", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Aaron", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Florence", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Emily", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Charlie", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Lucas", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Oliver", role: "PARTICIPANT", teamName: "Clean-up" },
  { name: "Annie", role: "PARTICIPANT", teamName: "Clean-up" },
];
// teamName is resolved to teamId after Team creation
// role is used for PersonEvent.role
```

### Items

Items are organized by team. Where original assignees were in different teams, items are marked UNASSIGNED to demonstrate the freeze-gate.

Note: All items use `dropOff.eve.at`, `dropOff.day.at`, `dropOff.box.at`, or `dropOff.setup.at` for timezone-safe dropOffAt values.

```typescript
const items = [
  // ============================================
  // ENTRÉES & NIBBLES (Coordinator: Joanna)
  // ============================================
  { 
    teamName: "Entrées & Nibbles", 
    name: "Ceviche snapper starter — Jack's portion", 
    quantity: "Half platter", 
    assigneeName: "Jack", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Entrées & Nibbles", 
    name: "Ceviche snapper starter — Tom's portion", 
    quantity: "Half platter", 
    assigneeName: "Tom", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Entrées & Nibbles", 
    name: "Potato chips, nuts, nibbles — Pete", 
    quantity: "Plenty", 
    assigneeName: "Pete", 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Entrées & Nibbles", 
    name: "Potato chips, nuts, nibbles — Joanna", 
    quantity: "Plenty", 
    assigneeName: "Joanna", 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Entrées & Nibbles", 
    name: "Platter food — Jane", 
    quantity: "1 platter", 
    assigneeName: "Jane", 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Entrées & Nibbles", 
    name: "Platter food — Gavin", 
    quantity: "1 platter", 
    assigneeName: "Gavin", 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // MAINS – PROTEINS (Coordinator: Kate)
  // ============================================
  { 
    teamName: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Angus", 
    quantity: "1", 
    assigneeName: "Angus", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Dougal", 
    quantity: "1", 
    assigneeName: "Dougal", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Robyn", 
    quantity: "1", 
    assigneeName: "Robyn", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Ham (basted) — Kate", 
    quantity: "1", 
    assigneeName: "Kate", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Ham (basted) — Angus", 
    quantity: "1", 
    assigneeName: "Angus", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Beef fillets — Kate", 
    quantity: "3", 
    assigneeName: "Kate", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Beef fillets — Angus", 
    quantity: "2", 
    assigneeName: "Angus", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Salmon fillets", 
    quantity: "2", 
    assigneeName: "Kate", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    teamName: "Mains – Proteins", 
    name: "Farm sausages", 
    quantity: "Plenty", 
    assigneeName: "Robyn", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },

  // ============================================
  // VEGETABLES & SIDES (Coordinator: Jacqui)
  // ============================================
  { 
    teamName: "Vegetables & Sides", 
    name: "Potato gratin", 
    quantity: "3", 
    assigneeName: null,
    glutenFree: false, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Veg team",
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Vege pilaf (raw)", 
    quantity: "Large", 
    assigneeName: "Jacqui", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Coleslaw", 
    quantity: "Large", 
    assigneeName: "Emma", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Green salad", 
    quantity: "Large", 
    assigneeName: "Grace", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Roasted carrots w/ ricotta", 
    quantity: "Large", 
    assigneeName: "Jacqui", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "New potatoes", 
    quantity: "Large", 
    assigneeName: "Emma", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Roast vegetables", 
    quantity: "2 large dishes", 
    assigneeName: "Grace", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Vegetables & Sides", 
    name: "Beetroot salad", 
    quantity: "2", 
    assigneeName: "Jacqui", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // PUDDINGS (Coordinator: Anika)
  // ============================================
  { 
    teamName: "Puddings", 
    name: "Ice cream sticks (minis)", 
    quantity: "36", 
    assigneeName: "Keith", 
    glutenFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Puddings", 
    name: "Sweet platters", 
    quantity: "Platter", 
    assigneeName: null,
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Meringues", 
    quantity: "Plenty", 
    assigneeName: "Rosie", 
    dairyFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    teamName: "Puddings", 
    name: "Ginger crunch (GF)", 
    quantity: "Tray", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Fudge", 
    quantity: "Tray", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "GF Christmas cake", 
    quantity: "1", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Christmas Eve",
    dropOffAt: dropOff.eve.at,
    dropOffNote: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Xmas pudding (non-GF)", 
    quantity: "2", 
    assigneeName: "Anika", 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Puddings", 
    name: "GF Xmas pudding", 
    quantity: "1", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "GF trifle", 
    quantity: "3", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Pavlova — Anika", 
    quantity: "1", 
    assigneeName: "Anika", 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Puddings", 
    name: "Pavlova — Lance", 
    quantity: "1", 
    assigneeName: "Lance", 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    teamName: "Puddings", 
    name: "Pavlova", 
    quantity: "1", 
    assigneeName: null,
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Berries", 
    quantity: "Plenty", 
    assigneeName: null,
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    teamName: "Puddings", 
    name: "Vanilla ice cream — Rosie", 
    quantity: "2 tubs", 
    assigneeName: "Rosie", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Puddings", 
    name: "Vanilla ice cream — Lance", 
    quantity: "2 tubs", 
    assigneeName: "Lance", 
    glutenFree: true, 
    dayName: "Christmas Day",
    dropOffAt: dropOff.day.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // LATER FOOD (Coordinator: Gus)
  // ============================================
  { 
    teamName: "Later Food", 
    name: "BBQ sausages", 
    quantity: "Plenty", 
    assigneeName: "Gus", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: "Boxing Day",
    dropOffAt: dropOff.box.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    teamName: "Later Food", 
    name: "Bread buns", 
    quantity: "Plenty", 
    assigneeName: null,
    dayName: "Boxing Day",
    dropOffAt: dropOff.box.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Later Food team",
  },
  { 
    teamName: "Later Food", 
    name: "GF buns", 
    quantity: "Plenty", 
    assigneeName: null,
    glutenFree: true, 
    dayName: "Boxing Day",
    dropOffAt: dropOff.box.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Later Food team",
  },
  { 
    teamName: "Later Food", 
    name: "Birthday cake (Joanna's 50th)", 
    quantity: "1", 
    assigneeName: null,
    dayName: "Boxing Day",
    dropOffAt: dropOff.box.at,
    dropOffNote: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Later Food team",
  },

  // ============================================
  // DRINKS (Coordinator: Ian)
  // ============================================
  { 
    teamName: "Drinks", 
    name: "Welcoming bubbles", 
    quantity: "Plenty", 
    assigneeName: "Ian", 
    glutenFree: true, 
    dairyFree: true, 
    dayName: null,
    dropOffAt: null,
    dropOffNote: "Bring on arrival",
    dropOffLocation: "Main fridge",
    critical: false,
  },

  // ============================================
  // SETUP (Coordinator: Elliot)
  // ============================================
  { 
    teamName: "Setup", 
    name: "Table setup + labels", 
    quantity: "All tables", 
    assigneeName: null,
    dayName: "Christmas Day",
    dropOffAt: dropOff.setup.at,
    dropOffNote: "10:00am",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Setup team",
  },
  { 
    teamName: "Setup", 
    name: "Buggy + rubbish bags", 
    quantity: "1 set", 
    assigneeName: "Elliot", 
    dayName: "Christmas Day",
    dropOffAt: dropOff.setup.at,
    dropOffNote: "10:00am",
    dropOffLocation: "Marquee",
    critical: true,
  },

  // ============================================
  // CLEAN-UP (Coordinator: Nigel)
  // ============================================
  { 
    teamName: "Clean-up", 
    name: "Clear plates (mains) — George", 
    quantity: "Rostered", 
    assigneeName: "George", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After mains",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Clear plates (mains) — Aaron", 
    quantity: "Rostered", 
    assigneeName: "Aaron", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After mains",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Clear plates (mains) — Florence", 
    quantity: "Rostered", 
    assigneeName: "Florence", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After mains",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Clear plates (mains) — Emily", 
    quantity: "Rostered", 
    assigneeName: "Emily", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After mains",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Rinse + dishwasher", 
    quantity: "Rostered", 
    assigneeName: "Charlie", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After mains",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Dessert clean-up — Lucas", 
    quantity: "Rostered", 
    assigneeName: "Lucas", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After dessert",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Dessert clean-up — Oliver", 
    quantity: "Rostered", 
    assigneeName: "Oliver", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After dessert",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Dessert clean-up — Annie", 
    quantity: "Rostered", 
    assigneeName: "Annie", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "After dessert",
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    teamName: "Clean-up", 
    name: "Clean-up coordination", 
    quantity: "All", 
    assigneeName: "Nigel", 
    dayName: "Christmas Day",
    dropOffAt: null,
    dropOffNote: "Ongoing",
    dropOffLocation: "Kitchen",
    critical: true,
  },
];
```

### Seed Field Resolution

The seed data uses human-readable names (e.g., `teamName`, `assigneeName`, `dayName`, `coordinatorName`) for clarity. The seed script must resolve these to actual IDs.

**Team mismatch handling:** If an item's `assigneeName` refers to a person not in the item's team, the seed script MUST NOT throw. Instead, skip the assignment and log a warning. This ensures the seed completes and demonstrates the freeze-gate with intentional gaps.

```typescript
// Pseudocode for seed script resolution
const personByName = new Map<string, Person>();
const teamByName = new Map<string, Team>();
const dayByName = new Map<string, Day>();

// After creating Person records:
people.forEach(p => personByName.set(p.name, createdPerson));

// After creating Team records:
teams.forEach(t => teamByName.set(t.name, createdTeam));

// After creating Day records:
days.forEach(d => dayByName.set(d.name, createdDay));

// When creating Items:
const teamId = teamByName.get(item.teamName)!.id;
const dayId = item.dayName ? dayByName.get(item.dayName)?.id : null;

// When creating Assignments (only if assigneeName is non-null):
if (item.assigneeName) {
  const person = personByName.get(item.assigneeName);
  if (!person) {
    console.warn(`SEED WARNING: Unknown person "${item.assigneeName}" for item "${item.name}" — leaving unassigned`);
    // Item stays UNASSIGNED, no assignment created
  } else {
    const personEvent = await prisma.personEvent.findFirst({
      where: { personId: person.id, eventId: event.id }
    });
    
    if (personEvent?.teamId === teamId) {
      // Team match — create assignment
      await prisma.assignment.create({ ... });
      await prisma.item.update({ where: { id: item.id }, data: { status: 'ASSIGNED' } });
    } else {
      // Team mismatch — skip assignment, log warning
      console.warn(`SEED WARNING: "${item.assigneeName}" is not in team "${item.teamName}" — leaving item "${item.name}" unassigned`);
      // Item stays UNASSIGNED, no assignment created
    }
  }
}
```

### Seed Data Summary

| Team | Total Items | Assigned | Unassigned | Critical Gaps |
|------|-------------|----------|------------|---------------|
| Entrées & Nibbles | 6 | 6 | 0 | 0 |
| Mains – Proteins | 9 | 9 | 0 | 0 |
| Vegetables & Sides | 8 | 7 | 1 | 0 |
| Puddings | 16 | 8 | 8 | 4 |
| Later Food | 4 | 1 | 3 | 1 |
| Drinks | 1 | 1 | 0 | 0 |
| Setup | 2 | 1 | 1 | 1 |
| Clean-up | 9 | 9 | 0 | 0 |
| **TOTAL** | **55** | **42** | **13** | **6** |

**Freeze gate demonstration:** With 6 critical gaps, the event cannot be frozen until coordinators assign those items.

### AccessToken Generation

For each person, create one AccessToken with appropriate scope:

```typescript
// HOST token for Jacqui
await prisma.accessToken.create({
  data: {
    token: generateToken(),
    scope: 'HOST',
    personId: jacqui.id,
    eventId: event.id,
    teamId: null, // HOST tokens have no teamId
    expiresAt: addDays(new Date(), 90),
  }
});

// COORDINATOR tokens (must include teamId matching PersonEvent.teamId)
for (const person of coordinators) {
  const personEvent = await prisma.personEvent.findFirst({
    where: { personId: person.id, eventId: event.id }
  });
  await prisma.accessToken.create({
    data: {
      token: generateToken(),
      scope: 'COORDINATOR',
      personId: person.id,
      eventId: event.id,
      teamId: personEvent.teamId, // MUST match PersonEvent.teamId
      expiresAt: addDays(new Date(), 90),
    }
  });
}

// PARTICIPANT tokens (no teamId)
for (const person of participants) {
  await prisma.accessToken.create({
    data: {
      token: generateToken(),
      scope: 'PARTICIPANT',
      personId: person.id,
      eventId: event.id,
      teamId: null,
      expiresAt: addDays(new Date(), 90),
    }
  });
}
```

### Dev Reset Procedure

When resetting the database during development:

```bash
# Safe reset (drops all tables, reapplies migrations, reseeds)
npx prisma migrate reset

# This works because:
# - All tables are dropped before recreation
# - No cascade order issues
# - Seed runs on clean database
```

**Do NOT use:**
- Manual `DELETE FROM` statements (cascade order matters)
- `prisma db push --force-reset` without understanding implications

The schema uses `onDelete: Cascade` on PersonEvent.team specifically to allow clean dev resets. Team deletion is blocked at the application layer, not the schema layer.

---

## 9. Implementation Order

### Phase 1: Foundation (Day 1)

1. Initialize Next.js 14 project with App Router
2. Configure Tailwind CSS
3. Set up Prisma with SQLite
4. Create schema (copy from Section 3 exactly)
5. Run `prisma migrate dev`

### Phase 2: Seed Data (Day 1)

6. Create `prisma/seed.ts`:
   - Import `makeNzdtChristmas2025Date` from lib/timezone.ts
   - Follow seed order from Section 8: People → Event → Days → Teams → PersonEvent → Items → Assignments → AccessTokens
   - Validate COORDINATOR token teamId matches PersonEvent.teamId
   - Handle team mismatches gracefully (skip + log, not throw)

7. Run `prisma db seed`

### Phase 3: Auth Layer (Day 1)

8. Create `lib/auth.ts`:
   - `resolveToken(token)` → returns person, event, team, scope
   - Token validation middleware
   - For COORDINATOR tokens, verify teamId matches PersonEvent.teamId

9. Create `lib/timezone.ts`:
   - Export `makeNzdtChristmas2025Date()` helper

### Phase 4: Participant View (Day 2)

10. Create `/p/[token]/page.tsx`
11. Create `GET /api/p/[token]` — call `repairItemStatus()` on each item before returning
12. Create `POST /api/p/[token]/ack/[assignmentId]`

### Phase 5: Coordinator View (Day 2)

13. Create `/c/[token]/page.tsx`
14. Create `GET /api/c/[token]`:
    - Call `getRepairedTeamStatus(items)` before returning
    - Scope queries to token.teamId only
    - Compute other teams' statuses via `item.groupBy` (not invalid `_count.where`)
15. Create `POST /api/c/[token]/items` — force teamId from token, never from client
16. Create `PATCH /api/c/[token]/items/[itemId]` — verify item.teamId === token.teamId before mutation
17. Create `POST /api/c/[token]/items/[itemId]/assign`
    - Validate assignee's PersonEvent.teamId === item.teamId
    - Set Item.status = ASSIGNED after creating Assignment

### Phase 6: Host Overview (Day 3)

18. Create `/h/[token]/page.tsx`
19. Create `GET /api/h/[token]` — call `getRepairedTeamStatus(items)` for each team before returning
20. Create `PATCH /api/h/[token]/status`

### Phase 7: Workflow Guards (Day 3)

21. Create `lib/workflow.ts`:
    - `canMutate(eventStatus, action, role)` → boolean
    - `canFreeze(eventId)` → boolean (queries Assignment existence, NOT Item.status)
    - `getCriticalGapCount(eventId)` → number (for UI messaging)
    - `repairItemStatus(item)` — async, mutates item.status in DB and in-place
    - `getRepairedTeamStatus(items)` — repairs all items sequentially, then computes status
    - `computeTeamStatus(items)` → 'SORTED' | 'GAP' | 'CRITICAL_GAP'
    - `removePerson(personId, eventId)` — orchestrated delete with item status updates
22. Apply guards to all mutation routes
23. Implement override logging

### Phase 8: Testing (Day 3)

24. Verify all acceptance criteria
25. Test freeze gate with critical gaps
26. Test orphan flow (remove person → items become unassigned)
27. Test COORDINATOR token validation (teamId must match)
28. Test coordinator route scoping (cannot access other teams' items)
29. Test Item.status repair (verify mismatch is corrected on read)

---

## 10. Acceptance Criteria

### Participant View
- [ ] `/p/[token]` shows only that person's assignments
- [ ] Shows dropOffAt formatted as date/time and location
- [ ] Shows dropOffNote if present
- [ ] Can acknowledge assignment
- [ ] Cannot see other teams or people
- [ ] Cannot edit anything
- [ ] Team sheet is read-only

### Coordinator View
- [ ] `/c/[token]` only works for valid coordinator token
- [ ] Token validation verifies teamId matches PersonEvent.teamId
- [ ] Shows all items in their team with assignment status
- [ ] Unassigned items clearly visible
- [ ] Critical items marked
- [ ] Can create/edit items when not frozen
- [ ] Can assign people (only from same team)
- [ ] Assignment creation sets Item.status = ASSIGNED
- [ ] Cannot see other teams' items
- [ ] Other teams shown as status only (via aggregate query, no item leakage)
- [ ] All queries scoped to token.teamId only
- [ ] Item creation uses teamId from token, never from client
- [ ] Cannot access items where item.teamId !== token.teamId

### Host Overview
- [ ] `/h/[token]` shows all teams with computed status
- [ ] Freeze button disabled when critical gaps exist
- [ ] Shows count of critical gaps blocking freeze
- [ ] Can drill down to any team
- [ ] Unfreeze is logged

### Workflow
- [ ] Freeze blocked if any critical item is UNASSIGNED
- [ ] Freeze gate queries Assignment existence directly (not Item.status)
- [ ] Mutations blocked when frozen (coordinator)
- [ ] Host override possible when frozen (logged)
- [ ] Delete blocked while frozen (no override)
- [ ] Delete in CONFIRMING blocked if item.critical === true

### Data Integrity
- [ ] No person in multiple teams (enforced by schema)
- [ ] No item with multiple assignments (enforced by schema)
- [ ] Assignment requires person in same team as item (enforced in API)
- [ ] COORDINATOR tokens have non-null teamId matching PersonEvent.teamId
- [ ] Item.status is consistent with Assignment existence (repaired on read if mismatched)
- [ ] `repairItemStatus()` called before returning items from GET routes
- [ ] `getRepairedTeamStatus()` called before computing team status
- [ ] 55 items loaded
- [ ] 13 unassigned items (demonstrating gaps)
- [ ] 6 critical gaps (demonstrating freeze gate)

### Seed Resilience
- [ ] Seed completes even if team mismatches exist in data
- [ ] Team mismatches log warnings, not errors
- [ ] Final item counts match expected (55 items, 13 unassigned, 6 critical gaps)

---

## 11. What NOT To Build

Explicitly out of scope for this prototype:

- [ ] Email sending (generate magic links only, log to console)
- [ ] Notifications
- [ ] Clone functionality
- [ ] Multi-event support
- [ ] Event creation UI (seed data only)
- [ ] People management UI (seed data only)
- [ ] Team creation/editing UI
- [ ] Team deletion (blocked at application layer; API returns 403)
- [ ] Person removal UI (procedure exists in workflow.ts for future use)
- [ ] Offline support
- [ ] Mobile app

---

## 12. File Structure

```
/gather-prototype
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db
├── src/
│   ├── app/
│   │   ├── page.tsx                # Redirect or landing
│   │   ├── h/
│   │   │   └── [token]/
│   │   │       └── page.tsx        # Host Overview
│   │   ├── c/
│   │   │   └── [token]/
│   │   │       └── page.tsx        # Coordinator View
│   │   ├── p/
│   │   │   └── [token]/
│   │   │       └── page.tsx        # Participant View
│   │   └── api/
│   │       ├── h/
│   │       │   └── [token]/
│   │       │       ├── route.ts    # GET event overview
│   │       │       └── status/
│   │       │           └── route.ts # PATCH status
│   │       ├── c/
│   │       │   └── [token]/
│   │       │       ├── route.ts    # GET team (uses item.groupBy for other teams)
│   │       │       └── items/
│   │       │           ├── route.ts # POST create item
│   │       │           └── [itemId]/
│   │       │               ├── route.ts # PATCH item
│   │       │               └── assign/
│   │       │                   └── route.ts # POST assign
│   │       └── p/
│   │           └── [token]/
│   │               ├── route.ts    # GET assignments
│   │               └── ack/
│   │                   └── [assignmentId]/
│   │                       └── route.ts # POST acknowledge
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── auth.ts                 # Token resolution + COORDINATOR teamId validation
│   │   ├── workflow.ts             # Mutation guards, computeTeamStatus, repairItemStatus, getRepairedTeamStatus, canFreeze, getCriticalGapCount, removePerson
│   │   └── timezone.ts             # makeNzdtChristmas2025Date() helper
│   └── components/
│       ├── ItemCard.tsx
│       ├── TeamCard.tsx
│       ├── StatusBadge.tsx
│       └── ConfirmButton.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## 13. Commands for Claude Code

Paste this prompt into Claude Code with the spec attached:

```
Read the attached Gather Builder's Specification v1.3.3 completely.

Your task:
1. Create a detailed implementation plan based on this spec
2. Present the plan for my review before executing
3. After approval, build the prototype following the spec exactly

Critical invariants to enforce:
- One person belongs to exactly one team per event (PersonEvent.teamId required)
- One assignment per item (Assignment.itemId unique)
- Assignee must be in the same team as the item (enforce in API)
- Token-scoped auth via AccessToken table (HOST/COORDINATOR/PARTICIPANT)
- COORDINATOR tokens MUST have teamId matching the person's PersonEvent.teamId
- COORDINATOR routes MUST scope all queries/mutations to token.teamId only; never accept teamId from client
- COORDINATOR routes compute other teams' statuses via item.groupBy (not invalid _count.where); never fetch other teams' items
- Item.status is a cached mirror of Assignment existence
- Call repairItemStatus() before returning items from GET routes (sequential, not parallel)
- Call getRepairedTeamStatus() before computing team status
- canFreeze() and getCriticalGapCount() query Assignment existence directly, NOT Item.status
- Freeze blocked when any critical item is UNASSIGNED
- Delete blocked while frozen (no override); in CONFIRMING, blocked if critical
- Team deletion blocked at application layer (return 403)
- Person removal requires orchestrated delete (see removePerson procedure)
- Use makeNzdtChristmas2025Date() for all DateTime construction in seed data (NZDT-specific)
- All date display uses timeZone: 'Pacific/Auckland'
- Seed handles team mismatches gracefully (skip + log warning, not throw)

Use the seed data exactly as specified. The prototype should demonstrate:
- 55 total items across 8 teams
- 13 unassigned items showing as gaps
- 6 critical gaps blocking the freeze action

Do not add features outside the spec.
Do not "improve" the design.
Build exactly what is specified.

Attached: gather-builder-spec-v1.3.3.md
```

---

## Risk Register

| # | Risk | Impact | Mitigation | Status |
|---|------|--------|------------|--------|
| 1 | Other teams' status shows CRITICAL_GAP vs SORTED only (no GAP distinction) | Coordinator can't see non-critical gaps in other teams | Low impact for prototype; documented as known limitation | Accepted |
| 2 | NZDT helper reused for non-December events | Wrong times stored (off by 1 hour in NZST periods) | Helper renamed with explicit warning; future events require new helper or proper timezone library | Mitigated |
| 3 | Sequential repair is slow at scale | Noticeable latency on GET routes with many items | Acceptable for prototype (55 items). Note in code forbids optimization. Production would need batch update. | Accepted |
| 4 | No automated test for freeze gate using Assignment vs status | Regression could reintroduce stale-status bug | Add to Phase 8 testing checklist (manual verification required) | Open |
| 5 | removePerson procedure exists but no UI exposes it | Dead code in prototype | Documented in "What NOT to build"; procedure exists for completeness | Accepted |

---

## End of Specification
