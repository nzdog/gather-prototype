# Gather: Builder's Specification

## For Claude Code Implementation

**Version:** 1.2 (Final)  
**Date:** December 2025  
**Scope:** Working prototype with real Christmas 2025 data

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
  team     Team   @relation(fields: [teamId], references: [id])

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
  dropOffTime          String?     // e.g., "5:30pm", "12 noon"
  dropOffLocation      String?     // e.g., "Kate's Kitchen", "Marquee"

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

### Application-Layer Invariants

1. **Assignment team match:** When assigning a person to an item, verify `PersonEvent.teamId === Item.teamId`
2. **Orphan handling:** When removing a person, delete their assignments, set affected items to `UNASSIGNED`, populate `previouslyAssignedTo`
3. **Status maintenance:** When assignment created → `Item.status = ASSIGNED`. When assignment deleted → `Item.status = UNASSIGNED`

---

## 4. Access Model

### Role Determination

Role comes from token scope:
- `HOST`: Full structural control over event
- `COORDINATOR`: Owns a team, can manage items within it
- `PARTICIPANT`: Can view and acknowledge their assignments only

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
| DELETE | `/api/c/[token]/items/[itemId]` | Delete item (blocked if frozen, never if critical) |
| POST | `/api/c/[token]/items/[itemId]/assign` | Assign person (must be in same team) |
| DELETE | `/api/c/[token]/items/[itemId]/assign` | Remove assignment |

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
    deleteItem: false, // Never allowed while frozen
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
│ │ Christmas Day · 12 noon         │ │
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
- Assigned items with: name, quantity, constraints, day, time, location
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

### Event

```typescript
const event = {
  name: "Richardson Family Christmas",
  startDate: new Date("2025-12-24T00:00:00.000Z"),
  endDate: new Date("2025-12-26T23:59:59.000Z"),
  status: "CONFIRMING",
  hostName: "Jacqui",
};
```

### Days

```typescript
const days = [
  { name: "Christmas Eve", date: new Date("2025-12-24T00:00:00.000Z") },
  { name: "Christmas Day", date: new Date("2025-12-25T00:00:00.000Z") },
  { name: "Boxing Day", date: new Date("2025-12-26T00:00:00.000Z") },
];
```

### Drop-off Locations and Times

```typescript
const dropOff = {
  eve: { time: "5:30pm", location: "Kate's Kitchen" },
  day: { time: "12 noon", location: "Marquee" },
  box: { time: "12 noon", location: "Marquee" },
};
```

### Teams

```typescript
const teams = [
  { name: "Entrées & Nibbles", scope: "Pre-meal food, easy grazing", coordinator: "Joanna" },
  { name: "Mains – Proteins", scope: "Centre protein dishes for 36-40", coordinator: "Kate" },
  { name: "Vegetables & Sides", scope: "Salads + hot veg, volume + balance", coordinator: "Jacqui" },
  { name: "Puddings", scope: "Desserts including GF options", coordinator: "Anika" },
  { name: "Later Food", scope: "Evening / next-day easy food", coordinator: "Gus" },
  { name: "Drinks", scope: "All drinks + ice", coordinator: "Ian" },
  { name: "Setup", scope: "Tables, labels, rubbish setup", coordinator: "Elliot" },
  { name: "Clean-up", scope: "Dishwasher, clearing, dessert cleanup", coordinator: "Nigel" },
];
```

### People (One Team Per Person)

```typescript
const people = [
  // Host (also Veg & Sides coordinator)
  { name: "Jacqui", role: "HOST", team: "Vegetables & Sides" },

  // Coordinators
  { name: "Joanna", role: "COORDINATOR", team: "Entrées & Nibbles" },
  { name: "Kate", role: "COORDINATOR", team: "Mains – Proteins" },
  { name: "Anika", role: "COORDINATOR", team: "Puddings" },
  { name: "Gus", role: "COORDINATOR", team: "Later Food" },
  { name: "Ian", role: "COORDINATOR", team: "Drinks" },
  { name: "Elliot", role: "COORDINATOR", team: "Setup" },
  { name: "Nigel", role: "COORDINATOR", team: "Clean-up" },

  // Entrées & Nibbles participants
  { name: "Pete", role: "PARTICIPANT", team: "Entrées & Nibbles" },
  { name: "Jack", role: "PARTICIPANT", team: "Entrées & Nibbles" },
  { name: "Tom", role: "PARTICIPANT", team: "Entrées & Nibbles" },
  { name: "Jane", role: "PARTICIPANT", team: "Entrées & Nibbles" },
  { name: "Gavin", role: "PARTICIPANT", team: "Entrées & Nibbles" },

  // Mains – Proteins participants
  { name: "Angus", role: "PARTICIPANT", team: "Mains – Proteins" },
  { name: "Dougal", role: "PARTICIPANT", team: "Mains – Proteins" },
  { name: "Robyn", role: "PARTICIPANT", team: "Mains – Proteins" },

  // Vegetables & Sides participants
  { name: "Emma", role: "PARTICIPANT", team: "Vegetables & Sides" },
  { name: "Grace", role: "PARTICIPANT", team: "Vegetables & Sides" },

  // Puddings participants
  { name: "Keith", role: "PARTICIPANT", team: "Puddings" },
  { name: "Rosie", role: "PARTICIPANT", team: "Puddings" },
  { name: "Lance", role: "PARTICIPANT", team: "Puddings" },

  // Clean-up participants
  { name: "George", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Aaron", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Florence", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Emily", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Charlie", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Lucas", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Oliver", role: "PARTICIPANT", team: "Clean-up" },
  { name: "Annie", role: "PARTICIPANT", team: "Clean-up" },
];
```

### Items

Items are organized by team. Where original assignees were in different teams, items are marked UNASSIGNED to demonstrate the freeze-gate.

```typescript
const items = [
  // ============================================
  // ENTRÉES & NIBBLES (Coordinator: Joanna)
  // ============================================
  { 
    team: "Entrées & Nibbles", 
    name: "Ceviche snapper starter — Jack's portion", 
    quantity: "Half platter", 
    assignee: "Jack", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Entrées & Nibbles", 
    name: "Ceviche snapper starter — Tom's portion", 
    quantity: "Half platter", 
    assignee: "Tom", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Entrées & Nibbles", 
    name: "Potato chips, nuts, nibbles — Pete", 
    quantity: "Plenty", 
    assignee: "Pete", 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Entrées & Nibbles", 
    name: "Potato chips, nuts, nibbles — Joanna", 
    quantity: "Plenty", 
    assignee: "Joanna", 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Entrées & Nibbles", 
    name: "Platter food — Jane", 
    quantity: "1 platter", 
    assignee: "Jane", 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Entrées & Nibbles", 
    name: "Platter food — Gavin", 
    quantity: "1 platter", 
    assignee: "Gavin", 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // MAINS – PROTEINS (Coordinator: Kate)
  // ============================================
  { 
    team: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Angus", 
    quantity: "1", 
    assignee: "Angus", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Dougal", 
    quantity: "1", 
    assignee: "Dougal", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Turkey + stuffing + gravy — Robyn", 
    quantity: "1", 
    assignee: "Robyn", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Ham (basted) — Kate", 
    quantity: "1", 
    assignee: "Kate", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Ham (basted) — Angus", 
    quantity: "1", 
    assignee: "Angus", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Beef fillets — Kate", 
    quantity: "3", 
    assignee: "Kate", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Beef fillets — Angus", 
    quantity: "2", 
    assignee: "Angus", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Salmon fillets", 
    quantity: "2", 
    assignee: "Kate", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: true,
  },
  { 
    team: "Mains – Proteins", 
    name: "Farm sausages", 
    quantity: "Plenty", 
    assignee: "Robyn", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },

  // ============================================
  // VEGETABLES & SIDES (Coordinator: Jacqui)
  // ============================================
  { 
    team: "Vegetables & Sides", 
    name: "Potato gratin", 
    quantity: "3", 
    assignee: null, // Originally Kate, Robyn, Dougal (all Mains)
    glutenFree: false, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Veg team",
  },
  { 
    team: "Vegetables & Sides", 
    name: "Vege pilaf (raw)", 
    quantity: "Large", 
    assignee: "Jacqui", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "Coleslaw", 
    quantity: "Large", 
    assignee: "Emma", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "Green salad", 
    quantity: "Large", 
    assignee: "Grace", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "Roasted carrots w/ ricotta", 
    quantity: "Large", 
    assignee: "Jacqui", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "New potatoes", 
    quantity: "Large", 
    assignee: "Emma", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "Roast vegetables", 
    quantity: "2 large dishes", 
    assignee: "Grace", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Vegetables & Sides", 
    name: "Beetroot salad", 
    quantity: "2", 
    assignee: "Jacqui", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // PUDDINGS (Coordinator: Anika)
  // ============================================
  { 
    team: "Puddings", 
    name: "Ice cream sticks (minis)", 
    quantity: "36", 
    assignee: "Keith", 
    glutenFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Puddings", 
    name: "Sweet platters", 
    quantity: "Platter", 
    assignee: null, // Originally Joanna (Entrées)
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Meringues", 
    quantity: "Plenty", 
    assignee: "Rosie", 
    dairyFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
  },
  { 
    team: "Puddings", 
    name: "Ginger crunch (GF)", 
    quantity: "Tray", 
    assignee: null, // Originally Kate (Mains)
    glutenFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Fudge", 
    quantity: "Tray", 
    assignee: null, // Originally Kate (Mains)
    glutenFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "GF Christmas cake", 
    quantity: "1", 
    assignee: null, // Originally Kate (Mains)
    glutenFree: true, 
    day: "Christmas Eve",
    dropOffTime: "5:30pm",
    dropOffLocation: "Kate's Kitchen",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Xmas pudding (non-GF)", 
    quantity: "2", 
    assignee: "Anika", 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Puddings", 
    name: "GF Xmas pudding", 
    quantity: "1", 
    assignee: null, // Originally Jacqui (Veg)
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "GF trifle", 
    quantity: "3", 
    assignee: null, // Originally Kate (Mains)
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Pavlova — Anika", 
    quantity: "1", 
    assignee: "Anika", 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Puddings", 
    name: "Pavlova — Lance", 
    quantity: "1", 
    assignee: "Lance", 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
  },
  { 
    team: "Puddings", 
    name: "Pavlova", 
    quantity: "1", 
    assignee: null, // Originally Ian (Drinks)
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Berries", 
    quantity: "Plenty", 
    assignee: null, // Originally Gus (Later Food)
    glutenFree: true, 
    dairyFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Puddings team",
  },
  { 
    team: "Puddings", 
    name: "Vanilla ice cream — Rosie", 
    quantity: "2 tubs", 
    assignee: "Rosie", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Puddings", 
    name: "Vanilla ice cream — Lance", 
    quantity: "2 tubs", 
    assignee: "Lance", 
    glutenFree: true, 
    day: "Christmas Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },

  // ============================================
  // LATER FOOD (Coordinator: Gus)
  // ============================================
  { 
    team: "Later Food", 
    name: "BBQ sausages", 
    quantity: "Plenty", 
    assignee: "Gus", 
    glutenFree: true, 
    dairyFree: true, 
    day: "Boxing Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
  },
  { 
    team: "Later Food", 
    name: "Bread buns", 
    quantity: "Plenty", 
    assignee: null, // Originally Joanna (Entrées)
    day: "Boxing Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Later Food team",
  },
  { 
    team: "Later Food", 
    name: "GF buns", 
    quantity: "Plenty", 
    assignee: null, // Originally Kate (Mains)
    glutenFree: true, 
    day: "Boxing Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: false,
    notes: "UNASSIGNED — needs coordinator to assign within Later Food team",
  },
  { 
    team: "Later Food", 
    name: "Birthday cake (Joanna's 50th)", 
    quantity: "1", 
    assignee: null, // Originally Robyn (Mains)
    day: "Boxing Day",
    dropOffTime: "12 noon",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Later Food team",
  },

  // ============================================
  // DRINKS (Coordinator: Ian)
  // ============================================
  { 
    team: "Drinks", 
    name: "Welcoming bubbles", 
    quantity: "Plenty", 
    assignee: "Ian", 
    glutenFree: true, 
    dairyFree: true, 
    day: null, // All days
    dropOffTime: null,
    dropOffLocation: "Bring to main fridge on arrival",
    critical: false,
  },

  // ============================================
  // SETUP (Coordinator: Elliot)
  // ============================================
  { 
    team: "Setup", 
    name: "Table setup + labels", 
    quantity: "All tables", 
    assignee: null, // Originally Anika, Jacqui (other teams)
    day: "Christmas Day",
    dropOffTime: "10:00am",
    dropOffLocation: "Marquee",
    critical: true,
    notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Setup team",
  },
  { 
    team: "Setup", 
    name: "Buggy + rubbish bags", 
    quantity: "1 set", 
    assignee: "Elliot", 
    day: "Christmas Day",
    dropOffTime: "10:00am",
    dropOffLocation: "Marquee",
    critical: true,
  },

  // ============================================
  // CLEAN-UP (Coordinator: Nigel)
  // ============================================
  { 
    team: "Clean-up", 
    name: "Clear plates (mains) — George", 
    quantity: "Rostered", 
    assignee: "George", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After mains",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Clear plates (mains) — Aaron", 
    quantity: "Rostered", 
    assignee: "Aaron", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After mains",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Clear plates (mains) — Florence", 
    quantity: "Rostered", 
    assignee: "Florence", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After mains",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Clear plates (mains) — Emily", 
    quantity: "Rostered", 
    assignee: "Emily", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After mains",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Rinse + dishwasher", 
    quantity: "Rostered", 
    assignee: "Charlie", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "Kitchen",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Dessert clean-up — Lucas", 
    quantity: "Rostered", 
    assignee: "Lucas", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After dessert",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Dessert clean-up — Oliver", 
    quantity: "Rostered", 
    assignee: "Oliver", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After dessert",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Dessert clean-up — Annie", 
    quantity: "Rostered", 
    assignee: "Annie", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "After dessert",
    critical: false,
  },
  { 
    team: "Clean-up", 
    name: "Clean-up coordination", 
    quantity: "All", 
    assignee: "Nigel", 
    day: "Christmas Day",
    dropOffTime: null,
    dropOffLocation: "Kitchen",
    critical: true,
  },
];
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
   - Create Event
   - Create Days
   - Create People
   - Create Teams (with coordinator references)
   - Create PersonEvent records (one per person, linking to their team)
   - Create Items (with dayId references where applicable)
   - Create Assignments (only for items with non-null assignee)
   - Create AccessTokens (one per person with appropriate scope)

7. Run `prisma db seed`

### Phase 3: Auth Layer (Day 1)

8. Create `lib/auth.ts`:
   - `resolveToken(token)` → returns person, event, team, scope
   - Token validation middleware

### Phase 4: Participant View (Day 2)

9. Create `/p/[token]/page.tsx`
10. Create `GET /api/p/[token]`
11. Create `POST /api/p/[token]/ack/[assignmentId]`

### Phase 5: Coordinator View (Day 2)

12. Create `/c/[token]/page.tsx`
13. Create `GET /api/c/[token]`
14. Create `POST /api/c/[token]/items`
15. Create `PATCH /api/c/[token]/items/[itemId]`
16. Create `POST /api/c/[token]/items/[itemId]/assign`

### Phase 6: Host Overview (Day 3)

17. Create `/h/[token]/page.tsx`
18. Create `GET /api/h/[token]`
19. Create `PATCH /api/h/[token]/status`

### Phase 7: Workflow Guards (Day 3)

20. Create `lib/workflow.ts`:
    - `canMutate(eventStatus, action, role)` → boolean
    - `canFreeze(event)` → boolean (checks critical gaps)
21. Apply guards to all mutation routes
22. Implement override logging

### Phase 8: Testing (Day 3)

23. Verify all acceptance criteria
24. Test freeze gate with critical gaps
25. Test orphan flow (remove person → items become unassigned)

---

## 10. Acceptance Criteria

### Participant View
- [ ] `/p/[token]` shows only that person's assignments
- [ ] Shows drop-off time and location
- [ ] Can acknowledge assignment
- [ ] Cannot see other teams or people
- [ ] Cannot edit anything
- [ ] Team sheet is read-only

### Coordinator View
- [ ] `/c/[token]` only works for valid coordinator token
- [ ] Shows all items in their team with assignment status
- [ ] Unassigned items clearly visible
- [ ] Critical items marked
- [ ] Can create/edit items when not frozen
- [ ] Can assign people (only from same team)
- [ ] Cannot see other teams' items
- [ ] Other teams shown as status only

### Host Overview
- [ ] `/h/[token]` shows all teams with computed status
- [ ] Freeze button disabled when critical gaps exist
- [ ] Shows count of critical gaps blocking freeze
- [ ] Can drill down to any team
- [ ] Unfreeze is logged

### Workflow
- [ ] Freeze blocked if any critical item is UNASSIGNED
- [ ] Mutations blocked when frozen (coordinator)
- [ ] Host override possible when frozen (logged)
- [ ] Delete blocked while frozen (no override)

### Data Integrity
- [ ] No person in multiple teams (enforced by schema)
- [ ] No item with multiple assignments (enforced by schema)
- [ ] Assignment requires person in same team as item (enforced in API)
- [ ] 55 items loaded
- [ ] 13 unassigned items (demonstrating gaps)
- [ ] 6 critical gaps (demonstrating freeze gate)

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
│   │       │       ├── route.ts    # GET team
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
│   │   ├── auth.ts                 # Token resolution
│   │   └── workflow.ts             # Mutation guards, status computation
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
Read the attached Gather Builder's Specification v1.2 completely.

Your task:
1. Create a detailed implementation plan based on this spec
2. Present the plan for my review before executing
3. After approval, build the prototype following the spec exactly

Critical invariants to enforce:
- One person belongs to exactly one team per event (PersonEvent.teamId required)
- One assignment per item (Assignment.itemId unique)
- Assignee must be in the same team as the item (enforce in API)
- Token-scoped auth via AccessToken table (HOST/COORDINATOR/PARTICIPANT)
- Freeze blocked when any critical item is UNASSIGNED

Use the seed data exactly as specified. The prototype should demonstrate:
- 55 total items across 8 teams
- 13 unassigned items showing as gaps
- 6 critical gaps blocking the freeze action

Do not add features outside the spec.
Do not "improve" the design.
Build exactly what is specified.

Attached: gather-builder-spec-v1.2.md
```

---

## End of Specification
