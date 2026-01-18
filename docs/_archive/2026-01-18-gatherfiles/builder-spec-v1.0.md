# Gather: Builder's Specification

## For Claude Code Implementation

**Version:** 1.0  
**Date:** December 2025  
**Scope:** Working prototype with real data

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

---

## 2. Technical Decisions

### Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14 (App Router) | Full-stack, fast to ship, good DX |
| Database | SQLite via Prisma | Zero infrastructure, portable, sufficient for prototype |
| Styling | Tailwind CSS | Rapid UI development |
| Auth | Magic links (email-based tokens) | Matches access model |
| Hosting | Local development | Prototype only |

### Alternative Stack (if preferred)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth with magic links |

**Decision for Claude Code:** Use SQLite/Prisma for simplicity. No external dependencies.

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
  id          String   @id @default(cuid())
  name        String
  startDate   DateTime
  endDate     DateTime
  status      EventStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  hostId      String
  host        Person   @relation("EventHost", fields: [hostId], references: [id])
  days        Day[]
  teams       Team[]
  people      PersonEvent[]
  auditLog    AuditEntry[]
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
  id          String  @id @default(cuid())
  name        String
  scope       String? // Description of what this team covers
  
  // Relations
  eventId       String
  event         Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  coordinatorId String
  coordinator   Person  @relation("TeamCoordinator", fields: [coordinatorId], references: [id])
  items         Item[]
  members       PersonEvent[]
}

model Person {
  id        String  @id @default(cuid())
  name      String
  email     String? @unique
  phone     String?
  
  // Magic link token (for auth)
  accessToken String? @unique
  tokenExpiresAt DateTime?
  
  // Relations
  hostedEvents      Event[]       @relation("EventHost")
  coordinatedTeams  Team[]        @relation("TeamCoordinator")
  eventMemberships  PersonEvent[]
  assignments       Assignment[]
  auditActions      AuditEntry[]
}

// Join table: Person <-> Event (with team assignment)
model PersonEvent {
  id       String @id @default(cuid())
  
  personId String
  person   Person @relation(fields: [personId], references: [id], onDelete: Cascade)
  
  eventId  String
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  
  teamId   String?
  team     Team?  @relation(fields: [teamId], references: [id])
  
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
  quantity             String?     // Free text: "3", "Plenty", "2 large dishes"
  description          String?
  critical             Boolean     @default(false)
  status               ItemStatus  @default(UNASSIGNED)
  previouslyAssignedTo String?     // Denormalized: name of removed assignee
  
  // Constraint tags
  glutenFree           Boolean     @default(false)
  dairyFree            Boolean     @default(false)
  vegetarian           Boolean     @default(false)
  
  notes                String?
  
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

model AuditEntry {
  id         String   @id @default(cuid())
  timestamp  DateTime @default(now())
  actionType String   // e.g., "OVERRIDE_REASSIGN", "STATE_CHANGE", "PERSON_REMOVED"
  targetType String   // e.g., "ITEM", "PERSON", "EVENT"
  targetId   String
  details    String?  // JSON or description of what changed
  
  // Relations
  eventId  String
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  
  actorId  String
  actor    Person @relation(fields: [actorId], references: [id])
}
```

### Key Constraints Enforced

| Constraint | How |
|------------|-----|
| One person → one team per event | `@@unique([personId, eventId])` on PersonEvent |
| One assignment per item | `@unique` on Assignment.itemId |
| Coordinator must exist | Required `coordinatorId` on Team |
| Items cannot exist without team | Required `teamId` on Item |

---

## 4. Access Model

### Role Determination

```
Role is determined by PersonEvent.role for the current event:
- HOST: Created the event, full structural control
- COORDINATOR: Owns a team, can manage items within it
- PARTICIPANT: Has assignments, read-only + acknowledge
```

### Magic Link Access

| Role | Access Method |
|------|---------------|
| Host | Email login (creates account) OR magic link |
| Coordinator | Magic link (sent by host) |
| Participant | Magic link (sent by coordinator or host) |

### Link Structure

```
/e/{eventId}                    → Host Overview (requires host auth)
/e/{eventId}/t/{teamId}         → Team Sheet (requires coordinator auth)
/p/{accessToken}                → Participant View (token-based, no login)
```

### Token Generation

```typescript
// Generate unique access token for a person
function generateAccessToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Tokens expire after 90 days (sufficient for annual events)
```

---

## 5. API Routes

### Events

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/events` | Host | List host's events |
| POST | `/api/events` | Host | Create event |
| GET | `/api/events/[id]` | Host | Get event with teams, status |
| PATCH | `/api/events/[id]` | Host | Update event (name, dates, status) |
| POST | `/api/events/[id]/clone` | Host | Clone event for next year |

### Teams

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/events/[id]/teams` | Host/Coord | List teams (coord sees own only) |
| POST | `/api/events/[id]/teams` | Host | Create team |
| GET | `/api/events/[id]/teams/[teamId]` | Host/Coord | Get team with items |
| PATCH | `/api/events/[id]/teams/[teamId]` | Host | Update team |

### Items

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/teams/[teamId]/items` | Coord | List items in team |
| POST | `/api/teams/[teamId]/items` | Coord | Create item (blocked if frozen) |
| PATCH | `/api/items/[id]` | Coord | Update item (blocked if frozen) |
| DELETE | `/api/items/[id]` | Coord | Delete item (blocked if frozen) |

### Assignments

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/items/[id]/assign` | Coord | Assign person to item |
| DELETE | `/api/items/[id]/assign` | Coord | Remove assignment |
| POST | `/api/assignments/[id]/acknowledge` | Participant | Mark acknowledged |

### People

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/events/[id]/people` | Host | List all people in event |
| POST | `/api/events/[id]/people` | Host | Add person to event |
| DELETE | `/api/events/[id]/people/[personId]` | Host | Remove person (orphans assignments) |

### Participant Access

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/participant/[token]` | Token | Get assignments for this person |
| POST | `/api/participant/[token]/acknowledge/[assignmentId]` | Token | Acknowledge assignment |

---

## 6. Workflow Rules (Enforced in API)

### State Transitions

```
DRAFT → CONFIRMING : Always allowed (host only)
CONFIRMING → FROZEN : Blocked if any critical item is unassigned
FROZEN → CONFIRMING : Allowed (host only, logged)
FROZEN → COMPLETE : Allowed (host only)
COMPLETE → * : Never allowed
```

### Mutation Rules by State

```typescript
const MUTATION_RULES = {
  DRAFT: {
    createTeam: true,
    editTeam: true,
    deleteTeam: true,
    createItem: true,
    editItem: true,
    deleteItem: true,
    assignItem: true,
    addPerson: true,
    removePerson: true,
  },
  CONFIRMING: {
    createTeam: false,
    editTeam: false,
    deleteTeam: false,
    createItem: true,
    editItem: true,
    deleteItem: false, // Cannot delete critical items
    assignItem: true,
    addPerson: true,
    removePerson: true, // Creates orphans
  },
  FROZEN: {
    createTeam: false,
    editTeam: false,
    deleteTeam: false,
    createItem: 'OVERRIDE', // Host only, logged
    editItem: 'OVERRIDE',
    deleteItem: false, // Never allowed while frozen
    assignItem: 'OVERRIDE',
    addPerson: 'OVERRIDE',
    removePerson: 'OVERRIDE',
  },
  COMPLETE: {
    // All mutations blocked
  },
};
```

### Override Logging

```typescript
// When host performs override action
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

---

## 7. Screen Specifications

### Screen 1: Participant View (`/p/[token]`)

**Layout:**
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
│ │ 4 tubs · GF                     │ │
│ │ Christmas Day                   │ │
│ │                    [Confirm ✓]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Berries                         │ │
│ │ Plenty · GF · DF                │ │
│ │ Christmas Day                   │ │
│ │                    [Confirmed]  │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [View team sheet →]                 │
└─────────────────────────────────────┘
```

**Data needed:**
- Event name, dates
- Person's team name and coordinator
- Person's assignments with item details

**Actions:**
- Confirm assignment (tap button)
- View team sheet (read-only, optional)

**No access to:**
- Overview
- Other teams
- Other people's assignments

---

### Screen 2: Coordinator View (`/e/[eventId]/t/[teamId]`)

**Layout:**
```
┌─────────────────────────────────────┐
│ ← Back to Overview                  │
│ PUDDINGS                            │
│ You own this team                   │
├─────────────────────────────────────┤
│ Event: Confirming    Team: 2 gaps   │
├─────────────────────────────────────┤
│ ITEMS                    [+ Add]    │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⚠ Pavlovas                 [!]  │ │
│ │ 3 · DF                          │ │
│ │ Unassigned                      │ │
│ │                      [Assign →] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✓ Vanilla ice cream             │ │
│ │ 4 tubs · GF                     │ │
│ │ Jack, Rosie, Lance, Tom    ✓    │ │
│ │                      [Edit]     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✓ GF trifle                [!]  │ │
│ │ 3 · GF                          │ │
│ │ Kate                       ✓    │ │
│ │                      [Edit]     │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ OTHER TEAMS                         │
│ Entrées ✓  Mains ✓  Veg ✓          │
│ Later ✓  Drinks ✓  Setup ✓         │
│ Clean-up ✓                          │
└─────────────────────────────────────┘
```

**Data needed:**
- Team name, scope
- Event status
- All items in team with assignment status
- Other teams' names and status (no detail)

**Actions:**
- Add item
- Edit item
- Assign/reassign person
- Mark item as critical

**No access to:**
- Other teams' items
- Event settings
- Freeze control

---

### Screen 3: Host Overview (`/e/[eventId]`)

**Layout:**
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
│ │ Mains – Proteins           ✓    │ │
│ │ Coordinator: Kate               │ │
│ │ Sorted                     [→]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Puddings                   ⚠    │ │
│ │ Coordinator: Anika              │ │
│ │ 1 critical gap             [→]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ... (all 8 teams)                   │
│                                     │
├─────────────────────────────────────┤
│ ⚠ Cannot freeze: 1 critical gap    │
├─────────────────────────────────────┤
│ [Manage People]  [Event Settings]   │
└─────────────────────────────────────┘
```

**Data needed:**
- Event name, dates, status
- All teams with coordinator and computed status
- Critical gap count
- Override indicator (if frozen with overrides)

**Actions:**
- Change event status (with gates)
- Drill down to any team
- Manage people
- Edit event settings

**Computed team status:**
```typescript
function computeTeamStatus(team: TeamWithItems): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
  const items = team.items;
  const hasCriticalGap = items.some(i => i.critical && i.status === 'UNASSIGNED');
  const hasGap = items.some(i => i.status === 'UNASSIGNED');
  
  if (hasCriticalGap) return 'CRITICAL_GAP';
  if (hasGap) return 'GAP';
  return 'SORTED';
}
```

---

## 8. Seed Data

### Event

```typescript
const event = {
  name: "Richardson Family Christmas",
  startDate: "2025-12-24",
  endDate: "2025-12-26",
  status: "CONFIRMING",
};
```

### Days

```typescript
const days = [
  { name: "Christmas Eve", date: "2025-12-24" },
  { name: "Christmas Day", date: "2025-12-25" },
  { name: "Boxing Day", date: "2025-12-26" },
];
```

### Teams

```typescript
const teams = [
  { name: "Entrées & Nibbles", scope: "Pre-meal food for 36, GF + kid-friendly", coordinator: "Joanna" },
  { name: "Mains – Proteins", scope: "Centre dishes, protein for 36-40, 1 vegetarian option", coordinator: "Kate" },
  { name: "Vegetables & Sides", scope: "Salads + hot veg, 5-6 large dishes, 2 GF", coordinator: "Jacqui" },
  { name: "Puddings", scope: "Desserts for 40, GF + dairy-free options", coordinator: "Anika" },
  { name: "Later Food", scope: "Evening food for 25-30, low effort", coordinator: "Gus" },
  { name: "Drinks", scope: "All drinks, abundant, ice essential", coordinator: "Ian" },
  { name: "Setup", scope: "Physical space, tables for 36, done pre-arrival", coordinator: "Elliot" },
  { name: "Clean-up", scope: "All cleanup, all dishes, rostered early", coordinator: "Gus" },
];
```

### People (Full List)

```typescript
const people = [
  // Coordinators
  { name: "Joanna", role: "COORDINATOR", team: "Entrées & Nibbles" },
  { name: "Kate", role: "COORDINATOR", team: "Mains – Proteins" },
  { name: "Jacqui", role: "COORDINATOR", team: "Vegetables & Sides" },
  { name: "Anika", role: "COORDINATOR", team: "Puddings" },
  { name: "Gus", role: "COORDINATOR", team: "Later Food" }, // Also Clean-up
  { name: "Ian", role: "COORDINATOR", team: "Drinks" },
  { name: "Elliot", role: "COORDINATOR", team: "Setup" },
  
  // Participants (assigned to teams based on their items)
  { name: "Nigel", role: "PARTICIPANT" },
  { name: "Pete", role: "PARTICIPANT" },
  { name: "Jack", role: "PARTICIPANT" },
  { name: "Tom", role: "PARTICIPANT" },
  { name: "Jane", role: "PARTICIPANT" },
  { name: "Gavin", role: "PARTICIPANT" },
  { name: "Angus", role: "PARTICIPANT" },
  { name: "Dougal", role: "PARTICIPANT" },
  { name: "Robyn", role: "PARTICIPANT" },
  { name: "Emma", role: "PARTICIPANT" },
  { name: "Grace", role: "PARTICIPANT" },
  { name: "Keith", role: "PARTICIPANT" },
  { name: "Rosie", role: "PARTICIPANT" },
  { name: "Lance", role: "PARTICIPANT" },
  { name: "Charlie", role: "PARTICIPANT" },
  { name: "Lucas", role: "PARTICIPANT" },
  { name: "Oliver", role: "PARTICIPANT" },
  { name: "Annie", role: "PARTICIPANT" },
  { name: "George", role: "PARTICIPANT" },
  { name: "Aaron", role: "PARTICIPANT" },
  { name: "Florence", role: "PARTICIPANT" },
  { name: "Emily", role: "PARTICIPANT" },
  { name: "Flynn", role: "PARTICIPANT" },
  { name: "Matt", role: "PARTICIPANT" },
  { name: "Yasmin", role: "PARTICIPANT" },
  { name: "Jase", role: "PARTICIPANT" },
  { name: "Emily D", role: "PARTICIPANT" },
];
```

### Items (Complete List)

```typescript
const items = [
  // Entrées & Nibbles
  { team: "Entrées & Nibbles", name: "Ceviche snapper starter", quantity: "Platter", assignees: "Jack, Tom", gf: true, df: true, day: "Christmas Eve", critical: false },
  { team: "Entrées & Nibbles", name: "Potato chips, nuts, nibbles", quantity: "Plenty", assignees: "Pete, Nigel, Ian", gf: "mixed", df: "mixed", day: "Christmas Eve", critical: false },
  { team: "Entrées & Nibbles", name: "Platter food x2", quantity: "2 platters", assignees: "Jane, Gavin, Joanna", gf: "mixed", df: "mixed", day: "Christmas Day", critical: false },

  // Mains – Proteins
  { team: "Mains – Proteins", name: "Turkey + stuffing + gravy", quantity: "3", assignees: "Angus, Dougal, Robyn", gf: true, df: false, day: "Christmas Day", critical: true },
  { team: "Mains – Proteins", name: "Ham (basted)", quantity: "2", assignees: "Kate, Jacqui", gf: true, df: false, day: "Christmas Day", critical: true },
  { team: "Mains – Proteins", name: "Beef fillets", quantity: "5", assignees: "Kate, Angus", gf: true, df: true, day: "Christmas Eve", critical: true },
  { team: "Mains – Proteins", name: "Salmon fillets", quantity: "2", assignees: "Kate", gf: true, df: true, day: "Christmas Eve", critical: true },
  { team: "Mains – Proteins", name: "Farm sausages", quantity: "Plenty", assignees: "Ian, Jacqui", gf: true, df: true, day: "Christmas Eve", critical: false },

  // Vegetables & Sides
  { team: "Vegetables & Sides", name: "Potato gratin", quantity: "3", assignees: "Kate, Robyn, Dougal", gf: false, df: false, day: "Christmas Eve", critical: false },
  { team: "Vegetables & Sides", name: "Vege pilaf (raw)", quantity: "Large", assignees: "Kate", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "Coleslaw", quantity: "Large", assignees: "Robyn", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "Green salad", quantity: "Large", assignees: "Joanna", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "Roasted carrots w/ ricotta", quantity: "Large", assignees: "Kate", gf: true, df: false, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "New potatoes", quantity: "Large", assignees: "Joanna, Nigel", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "Roast vegetables", quantity: "2 large dishes", assignees: "Emma, Grace", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Vegetables & Sides", name: "Beetroot salad", quantity: "2", assignees: "Jacqui, Joanna", gf: true, df: true, day: "Christmas Day", critical: false },

  // Puddings
  { team: "Puddings", name: "Ice cream sticks (minis)", quantity: "36", assignees: "Jane, Gavin, Keith", gf: true, df: false, day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "Sweet platters", quantity: "Platter", assignees: "Joanna", gf: "mixed", df: "mixed", day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "Meringues", quantity: "Plenty", assignees: "Joanna", gf: false, df: true, day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "Ginger crunch (GF)", quantity: "Tray", assignees: "Kate", gf: true, df: false, day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "Fudge", quantity: "Tray", assignees: "Kate", gf: true, df: false, day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "GF Christmas cake", quantity: "1", assignees: "Kate", gf: true, df: false, day: "Christmas Eve", critical: false },
  { team: "Puddings", name: "Xmas pudding (non-GF)", quantity: "2", assignees: "Anika", gf: false, df: false, day: "Christmas Day", critical: true },
  { team: "Puddings", name: "GF Xmas pudding", quantity: "1", assignees: "Jacqui", gf: true, df: false, day: "Christmas Day", critical: true },
  { team: "Puddings", name: "GF trifle", quantity: "3", assignees: "Kate", gf: true, df: false, day: "Christmas Day", critical: true },
  { team: "Puddings", name: "Pavlovas", quantity: "3", assignees: "Ian, Anika", gf: false, df: true, day: "Christmas Day", critical: true },
  { team: "Puddings", name: "Berries", quantity: "Plenty", assignees: "Gus", gf: true, df: true, day: "Christmas Day", critical: false },
  { team: "Puddings", name: "Vanilla ice cream", quantity: "4 tubs", assignees: "Jack, Rosie, Lance, Tom", gf: true, df: false, day: "Christmas Day", critical: false },

  // Later Food
  { team: "Later Food", name: "Leftovers", quantity: "All", assignees: "All", gf: "mixed", df: "mixed", day: "Boxing Day", critical: false },
  { team: "Later Food", name: "BBQ sausages", quantity: "Plenty", assignees: "Gus", gf: true, df: true, day: "Boxing Day", critical: false },
  { team: "Later Food", name: "Bread buns", quantity: "Plenty", assignees: "Joanna", gf: false, df: true, day: "Boxing Day", critical: false },
  { team: "Later Food", name: "GF buns", quantity: "Plenty", assignees: "Kate", gf: true, df: true, day: "Boxing Day", critical: false },
  { team: "Later Food", name: "Birthday cake", quantity: "1", assignees: "Robyn", gf: false, df: false, day: "Boxing Day", notes: "Joanna's 50th", critical: true },

  // Drinks
  { team: "Drinks", name: "Welcoming bubbles", quantity: "Plenty", assignees: "Jacqui, Ian", gf: true, df: true, day: "All", critical: false },

  // Setup
  { team: "Setup", name: "Table setup + labels", quantity: "All tables", assignees: "Anika, Jacqui", day: "Christmas Day", critical: true },
  { team: "Setup", name: "Buggy + rubbish bags", quantity: "1 set", assignees: "Elliot", day: "Christmas Day", critical: true },

  // Clean-up
  { team: "Clean-up", name: "Clear plates (mains)", quantity: "Rostered", assignees: "George, Aaron, Florence, Emily", day: "Christmas Day", critical: false },
  { team: "Clean-up", name: "Rinse + dishwasher", quantity: "Rostered", assignees: "Rosie, Charlie", day: "Christmas Day", critical: false },
  { team: "Clean-up", name: "Dessert clean-up", quantity: "Rostered", assignees: "Tom, Lucas, Oliver, Annie", day: "Christmas Day", critical: false },
];
```

---

## 9. Implementation Order

### Phase 1: Foundation (Day 1)

1. **Initialize project**
   - Next.js 14 with App Router
   - Tailwind CSS
   - Prisma with SQLite

2. **Create database schema**
   - All models from Section 3
   - Run migrations

3. **Create seed script**
   - Load all Christmas 2025 data
   - Generate access tokens for all people

### Phase 2: Participant View (Day 1-2)

4. **Build `/p/[token]` page**
   - Token-based access (no login)
   - Show assignments
   - Confirm button
   - Read-only team sheet link

5. **Build API routes**
   - GET `/api/participant/[token]`
   - POST `/api/participant/[token]/acknowledge/[id]`

### Phase 3: Coordinator View (Day 2)

6. **Build `/e/[eventId]/t/[teamId]` page**
   - Team header with status
   - Item list with assignment status
   - Other teams status strip

7. **Build API routes**
   - GET `/api/teams/[teamId]/items`
   - PATCH `/api/items/[id]`
   - POST `/api/items/[id]/assign`

### Phase 4: Host Overview (Day 2-3)

8. **Build `/e/[eventId]` page**
   - Event header with status
   - Team cards with computed status
   - Freeze control with gate logic

9. **Build API routes**
   - GET `/api/events/[id]`
   - PATCH `/api/events/[id]` (status changes)

### Phase 5: Workflow Enforcement (Day 3)

10. **Implement state guards**
    - Freeze entry conditions
    - Mutation rules by state
    - Override logging

11. **Test workflows**
    - Draft → Confirming → Frozen → Complete
    - Override scenarios
    - Orphan creation on person removal

---

## 10. Acceptance Criteria

### Participant View
- [ ] Landing on `/p/[token]` shows only that person's assignments
- [ ] Can confirm assignment with single tap
- [ ] Cannot see other teams or people
- [ ] Cannot edit anything
- [ ] Team sheet is read-only

### Coordinator View
- [ ] Shows all items in their team
- [ ] Can create/edit items when not frozen
- [ ] Can assign people to items
- [ ] Can mark items as critical
- [ ] Sees other teams' status (name + sorted/gap only)
- [ ] Cannot see other teams' items

### Host Overview
- [ ] Shows all teams with computed status
- [ ] Can freeze only when no critical gaps
- [ ] Can unfreeze (logged)
- [ ] Can drill down to any team
- [ ] Sees override indicator when applicable

### Workflow
- [ ] Freeze blocked if critical items unassigned
- [ ] Mutations blocked when frozen (except host override)
- [ ] Overrides logged to audit table
- [ ] Person removal creates orphaned items (visible)

### Data
- [ ] All 39 items from Christmas 2025 loaded
- [ ] All 8 teams with correct coordinators
- [ ] All people assigned to correct teams
- [ ] Critical flags set correctly

---

## 11. What NOT To Build

Explicitly out of scope for this prototype:

- [ ] User authentication (beyond magic links)
- [ ] Email sending (just generate links)
- [ ] Notifications
- [ ] Clone functionality
- [ ] Mobile app
- [ ] Offline support
- [ ] Multi-event support (one event only)
- [ ] Event creation UI (seed data only)
- [ ] People management UI (seed data only)

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
│   │   ├── page.tsx                    # Redirect to event
│   │   ├── e/
│   │   │   └── [eventId]/
│   │   │       ├── page.tsx            # Host Overview
│   │   │       └── t/
│   │   │           └── [teamId]/
│   │   │               └── page.tsx    # Coordinator View
│   │   ├── p/
│   │   │   └── [token]/
│   │   │       └── page.tsx            # Participant View
│   │   └── api/
│   │       ├── events/
│   │       ├── teams/
│   │       ├── items/
│   │       └── participant/
│   ├── lib/
│   │   ├── prisma.ts                   # Prisma client
│   │   ├── auth.ts                     # Token validation
│   │   └── workflow.ts                 # State guards
│   └── components/
│       ├── ItemCard.tsx
│       ├── TeamCard.tsx
│       ├── StatusBadge.tsx
│       └── ConfirmButton.tsx
├── package.json
├── tailwind.config.js
└── README.md
```

---

## 13. Commands for Claude Code

After reviewing this spec, Claude Code should:

1. **Create the project structure**
2. **Implement the Prisma schema exactly as specified**
3. **Create the seed script with all Christmas 2025 data**
4. **Build the three views in order: Participant → Coordinator → Host**
5. **Implement workflow guards**
6. **Test with the seeded data**

The prototype is complete when all acceptance criteria pass.

---

## End of Specification
