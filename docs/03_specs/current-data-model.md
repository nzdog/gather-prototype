# Current Data Model: Gather Prototype
**Report Date:** 2026-01-23
**Purpose:** Document current implementation of people, roles, tokens, assignments, and permissions
**Scope:** Map existing reality without proposing schema changes

---

## Executive Summary

Gather uses a **dual-identity system** with three separate role systems:

1. **Person** (event-scoped identity) linked to events via **PersonEvent** with **PersonRole** (HOST/COORDINATOR/PARTICIPANT)
2. **User** (global identity) linked to events via **EventRole** with **EventRoleType** (HOST/COHOST/COORDINATOR)
3. **AccessToken** (magic link system) with **TokenScope** (HOST/COORDINATOR/PARTICIPANT)

**Key Finding:** The Person model can optionally link to a User account (via `Person.userId`). When a Person claims their account, they get a User record and session-based auth. Before claiming, they use token-based auth exclusively.

---

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AUTHENTICATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │  MagicLink   │────────>│     User     │<────────│   Session    │    │
│  │ (auth token) │         │ (global id)  │         │  (cookie)    │    │
│  └──────────────┘         └───────┬──────┘         └──────────────┘    │
│                                    │                                     │
│                                    │ Person.userId (optional)            │
│                                    │                                     │
│                                    v                                     │
│                          ┌─────────────────┐                            │
│                          │  EventRole      │                            │
│                          │  (User→Event)   │                            │
│                          │  EventRoleType  │                            │
│                          └─────────────────┘                            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            EVENT DATA LAYER                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │    Event     │────────>│  AccessToken │────────>│    Person    │    │
│  │              │         │ (magic link) │         │ (event id)   │    │
│  │  hostId ─────┼────────>│  TokenScope  │         │              │    │
│  │  coHostId    │         └──────────────┘         └──────┬───────┘    │
│  └──────┬───────┘                                          │            │
│         │                                                  │            │
│         │ eventId                                  personId│            │
│         │                                                  │            │
│         v                                                  v            │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │     Team     │<────────│  PersonEvent │────────>│  Assignment  │    │
│  │              │         │ (join table) │         │              │    │
│  │coordinatorId │         │  PersonRole  │         │              │    │
│  └──────┬───────┘         └──────────────┘         └──────┬───────┘    │
│         │                                                  │            │
│         │ teamId                                           │ itemId     │
│         │                                                  │            │
│         v                                                  v            │
│  ┌──────────────┐                                   ┌──────────────┐    │
│  │     Item     │<──────────────────────────────────│              │    │
│  │              │                                   │              │    │
│  └──────────────┘                                   └──────────────┘    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Role Systems: The Three Pillars

Gather uses **three separate role enum systems** that serve different purposes:

### 1. EventRoleType (User → Event association)
**Location:** `prisma/schema.prisma:198-202`, `EventRole` model
**Purpose:** Session-based authorization for authenticated users
**Values:**
- `HOST` - Event creator/owner
- `COHOST` - Secondary host
- `COORDINATOR` - Team coordinator (legacy/backup system)

**Usage:**
- Created when a Person claims their account via `/api/auth/verify` (lines 76-98)
- Checked by `requireEventRole()` in `src/lib/auth/guards.ts:48-82`
- Used for dashboard routes at `/api/events/*` (session-based auth)

**Storage:** `EventRole` table with `userId + eventId + role` (unique constraint)

---

### 2. PersonRole (Person → Event association)
**Location:** `prisma/schema.prisma:192-196`, `PersonEvent` model
**Purpose:** Event-scoped role assignment for all participants
**Values:**
- `HOST` - Event host (redundant with Event.hostId)
- `COORDINATOR` - Team coordinator
- `PARTICIPANT` - Regular participant

**Usage:**
- Set when adding people via `/api/events/[id]/people` POST (line 137)
- Used to determine which AccessToken scopes to create in `src/lib/tokens.ts:194-216`
- Stored in join table `PersonEvent` linking Person to Event + Team

**Storage:** `PersonEvent` table with `personId + eventId + teamId + role`

---

### 3. TokenScope (Magic link access control)
**Location:** `prisma/schema.prisma:318-322`, `AccessToken` model
**Purpose:** Token-based authorization for magic links
**Values:**
- `HOST` - Full event access
- `COORDINATOR` - Team-scoped access (requires teamId)
- `PARTICIPANT` - Read-only assignment view

**Usage:**
- Created by `ensureEventTokens()` in `src/lib/tokens.ts:34-226`
- Validated by `resolveToken()` in `src/lib/auth.ts:25-107`
- Checked by `requireTokenScope()` in `src/lib/auth/guards.ts:98-122`
- Routes: `/api/h/[token]`, `/api/c/[token]`, `/api/p/[token]`

**Storage:** `AccessToken` table with `eventId + personId + scope + teamId` (unique constraint)

---

## Core Models

### Event (Event container)
**Location:** `prisma/schema.prisma:16-108`

**Key Identity Fields:**
- `hostId: String` → Person (host identity, required)
- `coHostId: String?` → Person (optional co-host)
- `status: EventStatus` (DRAFT | CONFIRMING | FROZEN | COMPLETE)

**Relations:**
- `people: PersonEvent[]` - All participants/coordinators/hosts
- `teams: Team[]` - Team structure
- `tokens: AccessToken[]` - Magic links for access
- `eventRoles: EventRole[]` - Session-based roles (User → Event)

**Notes:**
- No `Guest` table exists; guest count stored as `guestCount: Int?`
- `isLegacy: Boolean` flag exists but unclear usage

---

### Person (Event-scoped identity)
**Location:** `prisma/schema.prisma:147-171`

**Key Fields:**
- `id: String @id @default(cuid())`
- `name: String` (required)
- `email: String? @unique`
- `phone: String?`
- `userId: String?` → User (optional link to global account)

**Relations:**
- `hostedEvents: Event[]` (via hostId)
- `cohostedEvents: Event[]` (via coHostId)
- `coordinatedTeams: Team[]` (via coordinatorId)
- `eventMemberships: PersonEvent[]` (join table to events)
- `assignments: Assignment[]` (items assigned to person)
- `tokens: AccessToken[]` (magic links)

**Indexes:**
- `@@index([userId])`
- `@@index([email])`

**Critical Claim Flow Field:**
- `userId: String?` - When null, Person is "unclaimed" (no User account linked)
- Claim flow sets this via `/api/auth/claim` → `/api/auth/verify`

---

### PersonEvent (Join table: Person ↔ Event)
**Location:** `prisma/schema.prisma:174-190`

**Key Fields:**
- `personId: String` → Person
- `eventId: String` → Event
- `teamId: String?` → Team (optional; supports unassigned people)
- `role: PersonRole` (HOST | COORDINATOR | PARTICIPANT)

**Constraints:**
- `@@unique([personId, eventId])` - One person, one role per event

**Purpose:**
- Links Person to Event with team assignment and role
- Used to determine which AccessToken scopes to create
- Queried for team member lists in coordinator views

---

### User (Global authenticated identity)
**Location:** `prisma/schema.prisma:336-349`

**Key Fields:**
- `id: String @id @default(cuid())`
- `email: String @unique`
- `billingStatus: BillingStatus @default(FREE)`

**Relations:**
- `sessions: Session[]` - Active sessions
- `people: Person[]` - Linked event-scoped identities (via Person.userId)
- `eventRoles: EventRole[]` - Event access grants
- `subscription: Subscription?` - Stripe billing

**Indexes:**
- `@@index([email])`

**Notes:**
- Created when Person claims their account via magic link
- One User can link to multiple Person records (same email across events)

---

### EventRole (User → Event role grant)
**Location:** `prisma/schema.prisma:398-410`

**Key Fields:**
- `userId: String` → User
- `eventId: String` → Event
- `role: EventRoleType` (HOST | COHOST | COORDINATOR)

**Constraints:**
- `@@unique([userId, eventId])`

**Indexes:**
- `@@index([userId])`
- `@@index([eventId])`

**Purpose:**
- Created when Person claims their account (links User to their hosted/co-hosted events)
- Used for session-based auth on dashboard routes (`/api/events/*`)
- Separate from PersonRole (different enum, different purpose)

---

### AccessToken (Magic link authentication)
**Location:** `prisma/schema.prisma:298-316`

**Key Fields:**
- `token: String @unique` (64-char hex string)
- `scope: TokenScope` (HOST | COORDINATOR | PARTICIPANT)
- `eventId: String` → Event
- `personId: String` → Person
- `teamId: String?` → Team (required for COORDINATOR scope)
- `expiresAt: DateTime?` (90 days from creation)

**Constraints:**
- `@@unique([eventId, personId, scope, teamId])`

**Purpose:**
- Enables passwordless access via magic links: `/h/[token]`, `/c/[token]`, `/p/[token]`
- Created by `ensureEventTokens()` based on PersonRole values
- Validated by `resolveToken()` which returns AuthContext

**COORDINATOR Validation Rules** (src/lib/auth.ts:54-88):
- Must have `teamId` set
- Person must be either:
  - Listed in `PersonEvent.teamId` matching `token.teamId`, OR
  - Set as `Team.coordinatorId`

---

### Team (Responsibility group)
**Location:** `prisma/schema.prisma:121-145`

**Key Fields:**
- `name: String`
- `scope: String?` (description)
- `domain: Domain?` (PROTEINS | SIDES | DESSERTS | etc.)
- `coordinatorId: String?` → Person

**Relations:**
- `eventId: String` → Event
- `coordinator: Person?` (via coordinatorId)
- `items: Item[]`
- `members: PersonEvent[]` (people assigned to team)
- `tokens: AccessToken[]` (coordinator tokens for this team)

**Notes:**
- `coordinatorId` is the "official" coordinator (creates COORDINATOR token)
- People can also have `PersonEvent.role = COORDINATOR` as backup system

---

### Item (Task/obligation)
**Location:** `prisma/schema.prisma:204-275`

**Key Fields:**
- `name: String`
- `quantity: String?` (human-readable)
- `description: String?`
- `critical: Boolean @default(false)`
- `status: ItemStatus` (ASSIGNED | UNASSIGNED)
- `teamId: String` → Team
- `dayId: String?` → Day

**Relations:**
- `team: Team`
- `day: Day?`
- `assignment: Assignment?` (1:1 relationship)

**Notes:**
- `status` field exists but appears to be derived from `assignment` existence
- One item can have at most one assignment (1:1 via `@unique` on Assignment.itemId)

---

### Assignment (Person → Item obligation)
**Location:** `prisma/schema.prisma:282-295`

**Key Fields:**
- `itemId: String @unique` (1:1 with Item)
- `personId: String` → Person
- `response: AssignmentResponse` (PENDING | ACCEPTED | DECLINED)

**Constraints:**
- `@unique` on `itemId` enforces 1:1 relationship with Item
- No `onDelete` cascade for Person (requires app-layer orchestration)

**Purpose:**
- Represents "who is bringing what"
- Queried to compute team status (SORTED vs CRITICAL_GAP)
- Updated via `/api/events/[id]/items/[itemId]/assign` or `/api/c/[token]/items/[itemId]/assign`

---

### Session (User session)
**Location:** `prisma/schema.prisma:373-383`

**Key Fields:**
- `userId: String` → User
- `token: String @unique` (stored in httpOnly cookie)
- `expiresAt: DateTime` (30 days)

**Indexes:**
- `@@index([token])`
- `@@index([userId])`

**Purpose:**
- Created after successful magic link verification
- Used by `getUser()` in `src/lib/auth/session.ts:5-21`
- Enables session-based auth for dashboard routes

---

### MagicLink (Passwordless auth token)
**Location:** `prisma/schema.prisma:385-396`

**Key Fields:**
- `email: String`
- `token: String @unique` (64-char hex)
- `expiresAt: DateTime` (15 minutes)
- `usedAt: DateTime?` (single-use enforcement)

**Indexes:**
- `@@index([token])`
- `@@index([email])`
- `@@index([expiresAt])`

**Purpose:**
- Created by `/api/auth/claim` (claim flow) or `/api/auth/magic-link` (global signin)
- Verified by `/api/auth/verify` which creates User + Session
- Single-use via `usedAt` timestamp

---

## Relationships & Cardinalities

### Event Ownership
```
Event.hostId ──1:N──> Person (host)
Event.coHostId ──1:N──> Person (coHost)
```

### Event Participation
```
Person ──N:M──> Event  (via PersonEvent join table)
PersonEvent.teamId ──N:1──> Team
PersonEvent.role ──enum──> PersonRole
```

### Team Coordination
```
Team.coordinatorId ──N:1──> Person (coordinator)
Team.eventId ──N:1──> Event
```

### Items & Assignments
```
Item.teamId ──N:1──> Team
Item.dayId ──N:1──> Day
Item ──1:1──> Assignment (via @unique on Assignment.itemId)
Assignment.personId ──N:1──> Person
```

### Access Tokens
```
AccessToken.eventId ──N:1──> Event
AccessToken.personId ──N:1──> Person
AccessToken.teamId ──N:1──> Team (only for COORDINATOR scope)
AccessToken.scope ──enum──> TokenScope
```

### User Account Linking
```
Person.userId ──N:1──> User (optional)
User ──1:N──> Session
User ──N:M──> Event (via EventRole)
EventRole.role ──enum──> EventRoleType
```

---

## Auth Surfaces: Session vs Token

### Session-Based Routes (User authentication)
**Auth Mechanism:** Cookie-based session (30-day expiry)
**Guard Function:** `requireEventRole()` in `src/lib/auth/guards.ts:48-82`
**Used By:**
- `/api/events/*` - Event management dashboard
- `/api/events/[id]/people` - Add/list participants
- `/api/events/[id]/teams` - Team management
- `/api/events/[id]/items/[itemId]/assign` - Host assigning items
- `/api/templates/*` - Template management

**Flow:**
1. User signs in via magic link (or claims Person account)
2. Session created, token stored in httpOnly cookie
3. `getUser()` validates cookie against Session table
4. `requireEventRole()` checks EventRole table for permission

---

### Token-Based Routes (Magic link authentication)
**Auth Mechanism:** AccessToken in URL path
**Guard Function:** `resolveToken()` in `src/lib/auth.ts:25-107`
**Used By:**
- `/api/h/[token]` - Host view (TokenScope = HOST)
- `/api/c/[token]` - Coordinator view (TokenScope = COORDINATOR)
- `/api/p/[token]` - Participant view (TokenScope = PARTICIPANT)

**Flow:**
1. Token created by `ensureEventTokens()` based on PersonEvent.role
2. URL like `/h/abc123...` sent to Person via email/SMS
3. `resolveToken()` validates token, checks expiry, returns AuthContext
4. For COORDINATOR tokens, validates teamId matches PersonEvent.teamId

**Token Generation Rules** (`src/lib/tokens.ts:140-216`):
- HOST tokens: Created for `Event.hostId` and `Event.coHostId`
- COORDINATOR tokens: Created for `Team.coordinatorId` (with teamId) AND `PersonEvent.role=COORDINATOR`
- PARTICIPANT tokens: Created for `PersonEvent.role=PARTICIPANT` (excludes coordinators)

---

### Hybrid Routes (Either auth method)
**Guard Function:** `requireEventRoleOrToken()` in `src/lib/auth/guards.ts:218-248`
**Used By:** (Currently limited, but pattern exists for future use)

**Flow:**
1. Try session-based auth first (`requireEventRole`)
2. If fails and token provided, try token-based auth (`requireTokenScope`)
3. If both fail, return 401

---

## Claim Flow: Linking Person → User

### Current Implementation
**Entry Point:** `/api/auth/claim` (POST)
**Verification:** `/api/auth/verify` (POST)
**Trigger:** Host view (`/api/h/[token]`) detects `Person.userId === null` (line 25)

### Flow
1. Host accesses event via `/h/[token]` (magic link)
2. API detects `Person.userId === null` → sets `authStatus = 'unclaimed'`
3. Frontend shows "Claim Account" prompt
4. User enters email → POST to `/api/auth/claim` with `{email, personId, returnToken}`
5. System creates `MagicLink` record, sends email
6. User clicks link → `/auth/verify?token=...&personId=...&returnUrl=...`
7. Verification route (`/api/auth/verify`):
   - Validates MagicLink token
   - Creates or finds User by email
   - **Sets `Person.userId = user.id`** (line 58-62)
   - Creates EventRole records for hosted/co-hosted events (lines 65-98)
   - Creates Session, sets httpOnly cookie
   - Redirects to `returnUrl` (e.g., `/h/[token]?claimed=true`)

### Schema Fields Used
- `Person.userId: String?` - Null = unclaimed, Set = claimed
- `MagicLink.usedAt: DateTime?` - Single-use enforcement
- `EventRole` records created linking User to Events

### Missing Fields (Claim System Gaps)
**NO fields currently track:**
- When Person was claimed (`claimedAt: DateTime?`)
- Which magic link was used to claim (`claimedViaToken: String?`)
- Original invitation method (email/SMS/shared link)
- Claim source (individual invite vs shared link)

---

## Legacy & Duplicate Systems

### LEGACY: PersonRole.HOST
**Issue:** `PersonEvent.role` can be `HOST`, but this duplicates `Event.hostId`
**Status:** Appears unused in code; PersonRole.COORDINATOR and .PARTICIPANT are primary
**Evidence:** No code searches for `PersonEvent.role = 'HOST'` in auth logic

### CURRENT: Dual Coordinator Systems
**System 1:** `Team.coordinatorId` → Person (official coordinator)
**System 2:** `PersonEvent.role = 'COORDINATOR'` (backup/alternative)

**Both are supported:**
- Token creation checks both (lines 165-192 in `src/lib/tokens.ts`)
- Token validation allows either (lines 78-88 in `src/lib/auth.ts`)

**Reason:** Allows coordinators added via "People" section without setting Team.coordinatorId

### Inconsistency: EventRoleType.COORDINATOR
**Issue:** EventRoleType includes COORDINATOR, but unclear when User gets this role
**Evidence:** Claim flow only creates HOST/COHOST EventRoles (lines 76-98 in `/api/auth/verify`)
**Status:** Appears to be a planned feature or legacy enum value

---

## Candidate Attachment Points for Shared Invite Link Claim Flow

**DO NOT IMPLEMENT - Analysis Only**

### 1. AccessToken Table (Strongest Candidate)
**Rationale:** Already stores tokens with scope and person linkage
**Missing Fields (Hypothetical):**
- `claimedAt: DateTime?` - When token was first used
- `claimedBy: String?` - IP/user agent fingerprint
- `inviteSource: InviteSource?` - INDIVIDUAL | SHARED_LINK
- `shareableLink: Boolean?` - Flag for reusable vs single-use

**Pros:**
- Natural fit - tokens already represent access grants
- Existing `expiresAt` field provides lifecycle management
- `@@unique` constraint handles deduplication

**Cons:**
- Current unique constraint `[eventId, personId, scope, teamId]` assumes Person exists upfront
- Shared links need to work before Person is created

---

### 2. New SharedInviteLink Table (Alternative)
**Rationale:** Separate concern - shared links vs individual access tokens
**Hypothetical Schema:**
```prisma
model SharedInviteLink {
  id         String     @id @default(cuid())
  eventId    String
  event      Event      @relation(fields: [eventId], references: [id])
  teamId     String?
  team       Team?      @relation(fields: [teamId], references: [id])
  token      String     @unique
  scope      TokenScope
  maxClaims  Int?       // null = unlimited
  expiresAt  DateTime?
  createdBy  String     // userId or personId
  createdAt  DateTime   @default(now())

  claims     InviteClaim[]
}

model InviteClaim {
  id                  String            @id @default(cuid())
  sharedInviteLinkId  String
  link                SharedInviteLink  @relation(...)
  personId            String
  person              Person            @relation(...)
  claimedAt           DateTime          @default(now())

  @@unique([sharedInviteLinkId, personId])
}
```

**Pros:**
- Clean separation of concerns
- Supports multi-claim tracking (one link, many people)
- Can add `maxClaims` limit

**Cons:**
- Additional table complexity
- Duplicates token/scope/expiry logic from AccessToken

---

### 3. PersonEvent Table (Weak Candidate)
**Missing Fields (Hypothetical):**
- `claimedVia: String?` - Token used to claim
- `joinedAt: DateTime?` - When person joined event

**Pros:**
- Already links Person to Event

**Cons:**
- Doesn't handle pre-claim state (Person doesn't exist yet)
- Mixing join-table concerns with claim tracking

---

### 4. New ClaimHistory Table (Audit Trail Option)
**Purpose:** Append-only audit log of all claim events
**Hypothetical Schema:**
```prisma
model ClaimHistory {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(...)
  eventId   String
  event     Event    @relation(...)
  claimedAt DateTime @default(now())
  method    ClaimMethod  // MAGIC_LINK | SHARED_LINK
  tokenUsed String?
  ipAddress String?
}
```

**Pros:**
- Preserves full claim history
- Supports analytics

**Cons:**
- Not needed for core functionality
- Adds storage overhead

---

## Migration & Database Notes

### Migration History
**Single Migration:** `20260119083345_init` (PostgreSQL)
**Status:** Clean slate - no legacy SQLite artifacts in active schema
**Backup:** `prisma/migrations_sqlite_broken_backup/` (deprecated)

### Database Provider
**Active:** PostgreSQL (`datasource db` in schema.prisma:7-10)
**Dev Database:** `prisma/dev.db` (likely SQLite, unused for production)

### Indexes (Performance-Critical)
**Person:**
- `@@index([userId])` - User linkage lookups
- `@@index([email])` - Person search by email

**EventRole:**
- `@@index([userId])` - User's events
- `@@index([eventId])` - Event's roles

**Session:**
- `@@index([token])` - Cookie validation
- `@@index([userId])` - User's sessions

**MagicLink:**
- `@@index([token])` - Token validation
- `@@index([email])` - Email-based lookups
- `@@index([expiresAt])` - Cleanup queries

**PersonEvent:**
- No explicit indexes (relies on unique constraint)
- **Potential optimization:** Add `@@index([eventId, role])` for role filtering

---

## Summary: Three Role Systems in Action

### When Person is Unclaimed (Token-Only Access)
1. Person record created (name, email, phone)
2. PersonEvent created with PersonRole (COORDINATOR or PARTICIPANT)
3. AccessToken created with TokenScope based on PersonRole
4. Person accesses event via `/h/[token]`, `/c/[token]`, or `/p/[token]`
5. **No User, no Session, no EventRole**

### When Person Claims Account
1. Person enters email in claim flow
2. MagicLink created, email sent
3. Person clicks link → `/api/auth/verify`
4. **Person.userId set** → links to User
5. EventRole records created (HOST or COHOST for their events)
6. Session created, cookie set
7. Person can now use dashboard (`/api/events/*`) with session auth
8. **AccessTokens still work** - backwards compatible

### When User Creates New Event (Dashboard)
1. User authenticated via Session
2. Event created with `hostId` = new Person record linked to User
3. PersonEvent created with PersonRole = HOST (or COORDINATOR)
4. EventRole created with EventRoleType = HOST
5. AccessToken created with TokenScope = HOST
6. **All three systems populated simultaneously**

---

## File References

### Schema
- `prisma/schema.prisma` - Complete data model definition

### Auth Implementation
- `src/lib/auth.ts` - `resolveToken()`, `getUserEventsWithRole()`
- `src/lib/auth/guards.ts` - `requireEventRole()`, `requireTokenScope()`, `requireEventRoleOrToken()`
- `src/lib/auth/session.ts` - `getUser()` (session validation)
- `src/lib/tokens.ts` - `ensureEventTokens()`, `listInviteLinks()`

### API Routes (Token-Based)
- `src/app/api/h/[token]/route.ts` - Host view
- `src/app/api/c/[token]/route.ts` - Coordinator view
- `src/app/api/p/[token]/route.ts` - Participant view

### API Routes (Session-Based)
- `src/app/api/events/[id]/people/route.ts` - People management
- `src/app/api/events/[id]/teams/route.ts` - Team management

### API Routes (Auth)
- `src/app/api/auth/claim/route.ts` - Initiate claim flow
- `src/app/api/auth/verify/route.ts` - Verify magic link, create User + Session
- `src/app/api/auth/magic-link/route.ts` - Global signin

---

## End of Report
**Status:** Complete
**Schema Changes Proposed:** None (as requested)
**Next Step:** Use this map to design shared invite link + self-claim flow safely
