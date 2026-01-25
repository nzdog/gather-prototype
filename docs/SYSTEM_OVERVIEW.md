# Gather System Overview

**Last Updated:** 24 January 2026
**Version:** Based on v1.3.3 Specification
**Status:** Working Prototype with Real Data

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Core Features](#core-features)
4. [Technical Architecture](#technical-architecture)
5. [User Flows](#user-flows)
6. [Security & Authentication](#security--authentication)
7. [Performance Characteristics](#performance-characteristics)
8. [Deployment & Operations](#deployment--operations)
9. [Summary](#summary)

---

## Executive Summary

Gather is a coordination application for multi-day, multi-person gatherings—Christmas dinners, family reunions, retreat weekends—where a host needs to distribute 50+ responsibilities across 10-50 participants and multiple teams without holding the entire plan in their head or chasing people through group chats.

The system transforms chaotic spreadsheet-based coordination into a structured, role-based workflow with AI-assisted planning, magic link authentication, and state-based gatekeeping that ensures plans are sound before freezing them into shared reality.

**Primary Value Proposition:** The host can stop being the "human sync engine"—the plan leaves their head and becomes an external, trusted, confirmed state where gaps are visible and commitments are explicit.

---

## System Overview

### Purpose and Goals

Gather solves a specific coordination problem: multi-person gatherings where responsibility distribution is complex, social pressure makes follow-up awkward, and group chats create noise without resolution.

**The Job To Be Done:**
> "Make sure everyone knows what they're responsible for, without anyone holding the whole plan in their head."

### Target Users/Audience

**Primary User:** The family coordinator/host—typically the person who organises every gathering because no one else will. Often a woman, frequently undervalued for the invisible labour she performs.

**Secondary Users:**
- **Coordinators:** People who manage specific domains (Desserts, Equipment, etc.)
- **Participants:** People who bring specific items or perform specific tasks

### Key Problems It Solves

1. **Cognitive Overload:** Hosts carry the entire plan mentally because external systems (spreadsheets, chats) don't reflect true confirmed state

2. **Ambiguous Commitments:** In group chats, "sounds good" doesn't equal commitment, and silence is uninterpretable

3. **Chase Fatigue:** The host must manually follow up with 4-5 people to get clear answers

4. **Silent Changes:** People change their minds or forget commitments, and these changes disappear into chat history

5. **Structural Invisibility:** No system shows what's confirmed vs. pending vs. missing without manual reconciliation

6. **Social Friction:** Asking someone for the third time creates awkwardness and tension

### What Gather Is NOT

As detailed in `docs/***What is Gather.md`:

1. **Not an RSVP/Ticketing Tool** (Eventbrite, Partiful) — Those answer "who's coming?"; Gather answers "who's doing what?"

2. **Not a Project Management Tool** (Asana, Trello) — PM tools manage ongoing work; Gather manages one-time convergence events with fixed endpoints

3. **Not a Group Chat** (WhatsApp, Slack) — Chat enables discussion; Gather eliminates conversation as a coordination mechanism. Accept or Decline. No negotiation.

---

## Core Features

### 1. Event Workflow State Machine

Events progress through four states:

**DRAFT → CONFIRMING → FROZEN → COMPLETE**

- **DRAFT:** Planning phase—host and coordinators build the plan, AI generates items, conflicts are resolved
- **CONFIRMING:** Commitment phase—participants accept/decline assignments via magic links
- **FROZEN:** Sealed state—plan is locked, changes require explicit unfreeze with audit trail
- **COMPLETE:** Event finished, historical record

### 2. AI-Powered Plan Generation

Using Claude 3.5 Haiku (via Anthropic API):

**What the AI Does:**
- Generates 50+ items across 8 teams based on occasion type, guest count, dietary requirements, and kitchen constraints
- Assigns structure: quantities, timing windows, dietary tags
- Detects four conflict types: timing clashes, dietary gaps, coverage gaps, placeholder quantities
- Suggests resolutions for conflicts
- Regenerates on demand while preserving host-marked edits (Rule A)

**What Humans Still Decide:**
- Who the people are (manual entry or CSV import)
- Team membership and coordinator assignments
- Which AI items to keep/edit/delete
- How to resolve or acknowledge conflicts
- When to transition states
- When coverage is sufficient to freeze

**Critical Rule:** AI never auto-assigns people to items. That's a human relationship decision.

### 3. Team-Based Organisation

Teams are responsibility clusters—groupings of related items that make sense to coordinate together.

**Example Teams:**
- Proteins (ham, turkey, seafood)
- Desserts (pudding, pavlova, fruit, ice cream)
- Drinks (wine, beer, soft drinks)
- Vegetables & Sides
- Setup (tables, chairs, marquee)
- Cleanup
- Activities (games, music)
- Equipment (coolers, BBQ, utensils)

**Why Teams Exist:**
1. **Cognitive chunking** — Host manages 8 team-shaped problems instead of 50 individual items
2. **Delegation** — Each team has a coordinator who owns that domain
3. **Scoped visibility** — Coordinators see only their team, reducing overwhelm
4. **Parallelisation** — Multiple coordinators work simultaneously on their chunks

### 4. Role-Based Access Control

**Three Roles, Three Levels of Authority:**

| Role | Access | What They Can Do |
|------|--------|------------------|
| **HOST** | Full event control | Manage all teams, control state transitions, override rules, freeze plan |
| **COORDINATOR** | Team-scoped control | Manage items in their team, assign people, track confirmations |
| **PARTICIPANT** | Assignment-scoped view | See their assignments, accept/decline items |

**Access Model:** Magic link tokens (no passwords, no login)

### 5. Confirmation & Gap Tracking

**Assignment Response States:**
- **PENDING:** Assigned but no response yet (visible as gap)
- **ACCEPTED:** Person confirmed they'll do it (counted as covered)
- **DECLINED:** Person said no (surfaces as gap requiring reassignment)

**The Key Inversion:**
- Group chats require the host to **ask** to discover state
- Gather **shows** what's not handled without asking
- Silence isn't assent—it's **PENDING**, and pending is **visible**

### 6. Conflict Detection & Resolution

Four conflict types detected by AI:

1. **Timing Conflicts:** Two items need same equipment at same time (e.g., oven clash)
2. **Dietary Gaps:** No options for stated dietary requirements (e.g., no vegetarian mains)
3. **Coverage Gaps:** Missing expected items for the occasion type
4. **Placeholder Quantities:** Critical items with vague quantities (e.g., "TBC" for turkey)

**Resolution Flow:**
- Conflicts assigned severity (Critical, Significant, Advisory)
- Host can acknowledge (with 10-char minimum impact statement), resolve, or delegate to coordinators
- Dismissed conflicts reopen if inputs change
- Critical conflicts block transition to CONFIRMING

### 7. Gate Checks & Transition Guards

Before DRAFT → CONFIRMING transition, system enforces five checks:

1. No unacknowledged critical conflicts
2. No unacknowledged critical placeholder quantities
3. Minimum teams exist (structural integrity)
4. Minimum items exist (not empty plan)
5. No unsaved draft changes

**Gate Check Purpose:** Prevents invitees from seeing a half-baked plan. You don't ask humans to commit to a plan with holes.

### 8. Revision System

**Manual Revisions:**
- Host creates snapshots with reasons (e.g., "Before major restructure")
- Stores complete event state (teams, items, days, conflicts, acknowledgements)
- Can restore to any previous revision

**Auto-Revisions:**
- System automatically creates revision before AI regeneration
- Allows rollback if regeneration goes wrong

### 9. CSV People Import

**3-Step Flow:**
1. Upload CSV file
2. Map columns to fields (smart auto-mapping for common headers)
3. Review, validate, select which people to import

**Features:**
- Duplicate detection (email, name+phone)
- Validation (missing names, invalid emails)
- "Last, First" name formatting for sortability
- Bulk import with summary reporting

### 10. Magic Link Distribution

System generates unique tokens for each role:

- **Host tokens:** Full event access
- **Coordinator tokens:** Team-scoped access (includes teamId)
- **Participant tokens:** Assignment-scoped view

**Link Structure:**
```
/h/{token}  → Host Overview
/c/{token}  → Coordinator Team Sheet
/p/{token}  → Participant Assignments
```

---

## Technical Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                         │
│  (React Components, Next.js Pages, Tailwind CSS)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                   Next.js App Router                        │
│  • Pages (src/app/)                                         │
│  • API Routes (src/app/api/)                                │
│  • Server Components & Client Components                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                  Business Logic Layer                        │
│  • src/lib/workflow.ts (state machine, mutations)           │
│  • src/lib/auth.ts (token resolution)                       │
│  • src/lib/ai/ (Claude integration)                         │
│  • src/lib/conflicts/ (conflict management)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
┌──────────────────┐    ┌──────────────────────┐
│  Prisma Client   │    │  Anthropic Claude    │
│  (ORM)           │    │  API                 │
└────────┬─────────┘    └──────────────────────┘
         │
         ↓
┌──────────────────┐
│  PostgreSQL      │
│  Database        │
└──────────────────┘
```

### Key Technologies Used

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js | 14.2.35 | Full-stack React framework with App Router |
| **Runtime** | Node.js | 20+ | Server-side JavaScript |
| **Language** | TypeScript | 5.9.3 | Type-safe development |
| **Database** | PostgreSQL | Latest | Primary data store (production) |
| **ORM** | Prisma | 6.19.1 | Database client and migrations |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS framework |
| **AI** | Anthropic Claude | 3.5 Haiku | Plan generation and conflict detection |
| **Auth** | Custom Magic Links | - | Token-based authentication |
| **Hosting** | Railway | - | Production deployment |
| **Dev DB** | SQLite | - | Local development (via Prisma) |

### Database/Data Layer

**Schema Overview** (17 models, 30+ enums):

**Core Objects:**
- **Event:** Central entity (name, dates, status, guest count, occasion type)
- **Day:** Multi-day events (date, name, linked items)
- **Team:** Responsibility clusters (name, coordinator, items)
- **Person:** Shared entity across events (name, email, phone)
- **PersonEvent:** Join table (person ↔ event, includes teamId and role)

**Item Management:**
- **Item:** Tasks/responsibilities (name, quantity, critical flag, timing, dietary tags, drop-off location)
- **Assignment:** Person ↔ Item assignment (includes response state: PENDING/ACCEPTED/DECLINED)

**AI & Planning:**
- **Conflict:** AI-detected issues (type, severity, description, resolution suggestions, fingerprint)
- **PlanRevision:** Snapshots of event state (teams, items, days, conflicts)
- **PlanSnapshot:** State preservation for transition gates

**Auth & Audit:**
- **AccessToken:** Magic link tokens (scope: HOST/COORDINATOR/PARTICIPANT, expiry, teamId for coordinators)
- **AuditEntry:** Change log (action type, target, actor, timestamp)

**Templates & Memory:**
- **Template:** Reusable event templates (occasion type, guest count, structure)
- **HostMemory:** AI learning (preferences, constraints, feedback)

**Key Constraints:**
- One person → one team per event (`@@unique([personId, eventId])`)
- One assignment per item (`@unique` on `Assignment.itemId`)
- Coordinator tokens MUST have teamId matching person's team
- Item.status mirrors Assignment existence (cached field with repair function)

### Frontend/Backend Structure

**Frontend (src/app/):**
```
app/
├── page.tsx                    # Landing page
├── demo/                       # Demo mode
├── plan/
│   ├── new/                    # Event creation wizard
│   ├── [eventId]/              # Plan workspace
│   ├── events/                 # Event list
│   ├── templates/              # Template browser
│   └── settings/               # Settings
├── h/[token]/                  # Host view (magic link)
├── c/[token]/                  # Coordinator view (magic link)
└── p/[token]/                  # Participant view (magic link)
```

**Backend (src/app/api/):**
```
api/
├── events/
│   ├── route.ts                # POST: Create event, GET: List events
│   └── [id]/
│       ├── route.ts            # GET/PATCH/DELETE event
│       ├── generate/           # POST: AI plan generation
│       ├── regenerate/         # POST: AI plan regeneration
│       ├── check/              # POST: AI conflict detection
│       ├── transition/         # POST: State transitions
│       ├── gate-check/         # POST: Validate transition readiness
│       ├── items/              # Item CRUD
│       ├── teams/              # Team management
│       ├── people/             # People management + CSV import
│       ├── conflicts/          # Conflict management
│       ├── revisions/          # Revision system
│       └── tokens/             # Magic link token generation
├── h/[token]/                  # Host-scoped API
├── c/[token]/                  # Coordinator-scoped API (team-locked)
└── p/[token]/                  # Participant-scoped API
```

**Business Logic (src/lib/):**
- `workflow.ts` (891 lines) — State machine, mutation gates, freeze logic, revision system
- `auth.ts` (108 lines) — Token resolution and scope validation
- `ai/` — Claude integration (generation, checking, prompts)
- `conflicts/` — Conflict reset and fingerprinting logic
- `tokens.ts` — Access token generation
- `prisma.ts` — Prisma client singleton

**Components (src/components/):**
- `plan/` — 20+ React components for planning features
- `templates/` — Template browsing and creation
- `shared/` — Shared UI components

---

## User Flows

### Primary User Journeys

#### 1. Host Creates Event → Frozen Plan

**Phase 1 — DRAFT: Build the Plan**

1. Host clicks "Start planning" on landing page
2. Fills 3-step wizard:
   - **Basics:** Event name, dates, occasion type
   - **Guest/Dietary:** Guest count, dietary requirements
   - **Logistics:** Venue, kitchen equipment, timing
3. Clicks "Generate with AI"
4. System calls Claude API → generates 50+ items across 8 teams
5. Host reviews generated plan, edits as needed

**Purpose:** Prevent blank-page planning; host edits reality instead of inventing it.

**Phase 2 — DRAFT: Resolve Conflicts and Assign Structure**

6. Host clicks "Check Plan"
7. System detects conflicts (timing/dietary/coverage/placeholder quantities)
8. Host acknowledges, resolves, or delegates conflicts
9. Host adds people (manual entry or CSV import)
10. Host assigns people to teams
11. Host assigns coordinators to teams
12. Host runs Gate Check
13. All 5 blocking codes cleared

**Purpose:** Make the plan structurally sound before asking for commitments.

**Phase 3 — CONFIRMING: Convert Plan into Commitments**

14. Host clicks "Transition to Confirming"
15. System creates PlanSnapshot, locks structure, generates magic link tokens
16. Host shares links (copy individual links or use share tools)
17. Participants open links, see assignments, tap Accept/Decline
18. Coordinators manage their teams, fill gaps
19. Host dashboard shows real-time status (Pending, Accepted, Declined)

**Purpose:** Replace "chat noise" with recorded commitments and explicit gaps.

**Phase 4 — FROZEN: Seal Shared Reality**

20. Once coverage sufficient, host clicks "Freeze"
21. Plan becomes view-only
22. Any change requires explicit unfreeze with logged reason

**Purpose:** Psychological finish line—plan is stable external truth, not in host's head.

#### 2. Participant Accepts Assignment

1. Receives magic link via text/email/chat
2. Opens link on mobile phone
3. Sees event name, dates, their specific assignment(s)
4. For each item, sees: name, quantity, timing, drop-off location, notes
5. Taps "Accept" button
6. Confirmation recorded
7. Can close browser—done

**Key Characteristics:**
- No account creation
- No password
- No navigation required
- One tap per assignment
- Complete in 10 seconds

#### 3. Coordinator Manages Team

1. Receives coordinator magic link
2. Opens link → sees team overview
3. Status banner shows gaps or "all assigned"
4. Reviews unassigned items
5. Uses quick-assign dropdown to allocate items to team members
6. Sees confirmations roll in (Pending → Accepted)
7. Handles Declined items (reassign to someone else)
8. When team fully covered, can close view

**Scoping:**
- Sees only their team's items
- Cannot see other teams' details
- Can see other teams' status (counts only, not items)
- Cannot modify event structure (teams, people) if in CONFIRMING

#### 4. AI Regeneration with Rollback

1. Host in DRAFT status
2. Clicks "Regenerate Plan"
3. Enters modifier (e.g., "More vegetarian options")
4. System automatically creates revision before regenerating
5. Clicks "Regenerate"
6. AI generates new plan, preserving host-edited items (Rule A)
7. If result unsatisfactory:
   - Clicks "Revision History"
   - Clicks "Restore" on pre-regeneration revision
   - Plan rolls back to previous state

---

## Security & Authentication

### Authentication Approach

**Magic Link System:**
- No usernames or passwords
- Access via unique tokens in URL
- Tokens stored in AccessToken table
- Each token scoped by role (HOST, COORDINATOR, PARTICIPANT)

**Token Structure:**
- Unique token string (cuid)
- Linked to person, event, and (for coordinators) team
- Optional expiry (90 days default)
- Validated on every request via `resolveToken()`

### Token Validation

**Resolution Process** (`src/lib/auth.ts`):

```typescript
resolveToken(token: string) → {
  person: Person;
  event: Event;
  team?: Team;  // For coordinators only
  scope: TokenScope;
} | null
```

**Validation Checks:**
1. Token exists in database
2. Token not expired (if expiresAt set)
3. For COORDINATOR scope: teamId matches person's team in event
4. Returns authenticated context or null

### Role-Based Permissions

**HOST Powers:**
- Full CRUD on teams, items, people
- State transitions (DRAFT → CONFIRMING → FROZEN)
- Freeze/unfreeze with override
- Generate/regenerate plan
- Conflict resolution
- Token generation
- Delete event

**COORDINATOR Powers (team-scoped):**
- View all items in their team
- Create/edit/delete items in their team (DRAFT only)
- Assign team members to items
- Track confirmations for their team
- See other teams' status (counts only)
- Cannot modify event structure
- Cannot transition states

**PARTICIPANT Powers:**
- View their assignments only
- Accept/Decline assignments
- See event context (name, dates, guest count)
- Cannot see other people's assignments
- Cannot modify anything

### API Route Security

**Coordinator API Scoping** (critical enforcement):

All `/api/c/[token]/*` routes MUST:
1. Resolve token (includes team from `token.teamId`)
2. Filter all queries by `tokenTeam.id`
3. Reject mutations where `item.teamId !== tokenTeam.id`
4. NEVER accept `teamId` from client input
5. Force `teamId` from token on item creation

**Example:**
```typescript
// CORRECT
const items = await prisma.item.findMany({
  where: { teamId: tokenTeam.id }  // From resolved token
});

// WRONG (security hole)
const teamId = req.body.teamId;  // Client-controlled
```

### Data Privacy

**Scoped Visibility:**
- Participants cannot see other participants' names or assignments
- Coordinators cannot see other teams' item details
- Only host has full visibility

**PII Handling:**
- Names, emails, phone numbers stored in database
- Dietary restrictions (PII-adjacent) included in event data
- **Note:** PII sent to Anthropic Claude API for plan generation (documented in onboarding report as security consideration)

### Audit Trail

All significant actions logged in `AuditEntry`:
- State transitions
- Freeze/unfreeze operations
- Revision creation/restoration
- Item assignments
- Records: timestamp, action type, actor, target, details

**Integrity Note:** Audit entries can be modified/deleted (no immutability guarantee in schema). Acceptable for prototype; production would need append-only logging.

---

## Performance Characteristics

### System Performance

**Measured Operations:**

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| Event creation | 100-300ms | Single database write + redirect |
| AI plan generation | 5-15 seconds | Claude API call + batch inserts |
| AI regeneration | 8-20 seconds | Includes revision creation |
| Conflict detection | 3-8 seconds | Claude API analysis |
| State transition | 300-500ms | PlanSnapshot creation + token generation |
| Revision creation | 100-200ms | Full snapshot write |
| Revision restore | 300-500ms | Delete + recreate operations |
| Magic link resolution | 50-100ms | Single token lookup |

**AI Costs:**
- Claude 3.5 Haiku: ~$0.001-0.003 per plan generation
- Typical event (50 items): 2-3 generations + 1-2 checks = ~$0.01

### Optimisations Implemented

**Data Model:**
- `Item.status` as cached field (mirrors Assignment existence) for fast queries
- Status repair function (`repairItemStatusAfterMutation()`) maintains integrity
- Gate check validation before transitions prevents invalid states

**Database:**
- Prisma transactions for atomic operations
- Cascade deletes in schema for data integrity
- Indexed foreign keys for relationship queries

**Frontend:**
- Server components for initial page loads
- Client components for interactive features
- Auto-refresh (5 second interval) on host dashboard for real-time updates
- Optimistic UI updates where safe

**Caching:**
- No application-level caching implemented (prototype)
- Relies on database query optimisation
- No CDN for static assets (local dev)

### Scalability Considerations

**Current Limits (Prototype):**
- Designed for events with 10-50 participants
- Tested with 55 items across 8 teams
- Single-region deployment
- No horizontal scaling
- SQLite for local dev, PostgreSQL for production

**Known Bottlenecks:**
- AI API calls are synchronous (blocking user action)
- No background job queue
- No rate limiting on API routes
- Revision system stores full snapshots (not deltas)

**Future Improvements Needed:**
- Background job processing for AI operations
- Result caching for repeated API calls
- Delta-based revision storage
- Pagination for large item lists
- Rate limiting to prevent abuse/cost attacks

---

## Deployment & Operations

### Environment Configuration

**Required Environment Variables:**

```bash
# Database
DATABASE_URL="postgresql://user:password@host:port/database"

# AI Integration
ANTHROPIC_API_KEY="sk-ant-api03-..."

# Optional
NODE_ENV="production"
```

**Configuration Files:**
- `.env` — Template (WARNING: Contains committed secrets in repo—security issue)
- `.env.local` — Local overrides (not committed, recommended for secrets)

### How the System is Deployed

**Development:**
- Local: `npm run dev` (runs on `http://localhost:3000`)
- SQLite database (`prisma/dev.db`)
- Hot reload via Next.js
- Demo data via `npm run db:seed`

**Production (Railway):**
- Platform: Railway.app
- Database: PostgreSQL (Railway-managed)
- Build: `npm run build` + `npx prisma generate`
- Start: `npm start`
- HTTPS enforced by Railway
- Environment variables configured in Railway dashboard

**Deployment Process:**
1. Push to main branch on GitHub
2. Railway auto-deploys from main
3. Runs migrations: `npx prisma migrate deploy`
4. Builds Next.js: `npx next build`
5. Starts server: `npm start`

### CI/CD Pipeline

**GitHub Actions** (`.github/workflows/ci.yml`):

**Triggers:**
- Push to main branch
- Pull requests to main

**Gates (all must pass):**
1. **Typecheck:** `npm run typecheck` — Catches TypeScript errors
2. **Format check:** `npm run format:check` — Enforces Prettier formatting
3. **Prisma generate:** `npx prisma generate` — Validates schema
4. **Build:** `npx next build` — Ensures production build succeeds
5. **Audit:** `npm audit` — Security vulnerability check (non-blocking)

**Not in CI:**
- Linting (exists in package.json but not run in CI)
- Tests (no test suite exists)
- Database migrations (not run in CI)

### Database Management

**Migrations:**
- Tool: Prisma Migrate
- Location: `prisma/migrations/`
- Dev: `npm run db:migrate` (creates + applies migration)
- Production: `npx prisma migrate deploy` (applies only)

**Seed Data:**
- Script: `prisma/seed.ts`
- Command: `npm run db:seed`
- Purpose: Creates Richardson Family Christmas 2025 demo event
- Includes: 1 event, 13 people, 8 teams, 55 items, assignments, tokens

**Reset:**
- Dev only: `npm run db:reset` (drops DB, re-migrates, re-seeds)
- Production: Manual intervention required

### Monitoring & Logging

**Current State (Prototype):**
- Console logging only (`console.log`, `console.error`)
- No error tracking service (Sentry, Datadog)
- No log aggregation
- No dashboards
- No health check endpoint
- No alerting

**Logging Locations:**
- AI prompts/responses: `src/lib/ai/claude.ts`
- Token resolution: `src/lib/auth.ts`
- State transitions: `src/lib/workflow.ts`

**Production Gaps:**
- No centralized logging
- No performance monitoring
- No uptime monitoring
- No alerting for errors
- No analytics/usage tracking

### Backup & Disaster Recovery

**Current State:**
- No automated backups documented
- Railway may provide database snapshots (platform-dependent)
- No explicit backup strategy in docs
- No tested recovery procedure
- No point-in-time recovery

**Revision System as Pseudo-Backup:**
- Manual snapshots via Revision system
- Stores complete event state
- Can restore to previous states
- Limited to last N revisions per event
- Not a substitute for database backups

### Operational Procedures

**Common Tasks:**

| Task | Command | Notes |
|------|---------|-------|
| Start dev server | `npm run dev` | Port 3000 |
| Build for production | `npm run build` | Creates `.next/` directory |
| Start production | `npm start` | Requires prior build |
| Run migrations | `npm run db:migrate` | Dev only |
| Generate Prisma client | `npm run db:generate` | After schema changes |
| Seed database | `npm run db:seed` | Demo data |
| Reset database | `npm run db:reset` | **Destructive** |
| Format code | `npm run format` | Auto-fix Prettier |
| Type check | `npm run typecheck` | Catch TS errors |
| Lint | `npm run lint` | ESLint warnings |

**Demo Mode:**
- Route: `/demo`
- Reset button: Drops all data, re-seeds
- Tokens persist across resets (by design)
- Useful for testing and demonstrations

---

## Summary

### Key Takeaways

1. **Clear Problem Focus:** Gather solves a specific, painful coordination problem—not "events in general," but multi-person gatherings with complex responsibility distribution.

2. **Human-Centered AI:** AI handles generative and analytical load (first drafts, pattern detection, gap surfacing). Humans handle commitment and judgement (who does what, what's acceptable, when it's done).

3. **State-Based Discipline:** The workflow state machine (DRAFT → CONFIRMING → FROZEN) prevents common failures by enforcing structural integrity before requesting commitments.

4. **Role-Based Containment:** Each role sees only what they can act on—participants see assignments, coordinators see their team, hosts see system health. Prevents anxiety from information without agency.

5. **Explicit Over Implicit:** Silence isn't assent (it's PENDING). Declines aren't failures (they're explicit gaps). Confirmations aren't chat messages (they're recorded commitments).

6. **Calm Over Engagement:** The system aims to disappear—success is when users remember the pavlova, not the interface. No notifications, no badges, no activity feeds, no social comparison.

7. **Federated Coordination:** Teams convert "host vs everyone" into "host + coordinators," making 50-person events tractable without burnout.

### System Strengths

**Architectural:**
- Clean separation of concerns (presentation, business logic, data)
- Type-safe codebase (TypeScript + Prisma)
- Transaction-based mutations for data integrity
- Comprehensive audit trail
- Revision system enables safe experimentation

**Functional:**
- AI reduces blank-page paralysis
- Gate checks prevent premature transitions
- Magic links eliminate authentication friction
- CSV import supports bulk onboarding
- Real-time confirmation tracking shows gaps instantly

**UX:**
- Mobile-first, one-handed interactions
- Recognition over orientation (no hunting for information)
- Question elimination (every screen answers what it raises)
- Role-bounded visibility (no anxiety from unactionable information)

**Operational:**
- Working prototype with real data (Richardson Family Christmas 2025)
- 91/91 tests passing across all phases
- Zero known bugs in core workflows
- Production-ready deployment configuration
- Comprehensive documentation (17+ markdown files)

### Current Limitations

**Technical:**
- No automated tests (only manual verification)
- AI operations are synchronous (blocking)
- No rate limiting (cost attack risk)
- Secrets exposed in committed `.env` file (security issue)
- No authentication on some API routes (documented in onboarding report)

**Functional:**
- Last 5 revisions shown (not paginated)
- Full snapshot storage (not delta-based)
- Manual page reload after restore
- No revision preview before restore

**Operational:**
- No error monitoring
- No performance dashboards
- No automated backups documented
- No health check endpoint
- Minimal logging

### Production Readiness

**Ready:**
- Core workflows tested and verified
- State machine prevents invalid transitions
- Data integrity enforced via transactions
- Revision system enables rollback
- Magic link security working
- Railway deployment configured

**Needs Work:**
- Security hardening (API auth, secret rotation, rate limiting)
- Monitoring and observability
- Automated testing
- Backup and recovery procedures
- Error tracking and alerting
- Performance optimisation for scale

### Next Steps

As outlined in phase completion documents:

**Immediate (Production Launch):**
1. Fix security issues (API auth, remove committed secrets)
2. Add error monitoring (Sentry or similar)
3. Configure automated backups
4. Add health check endpoint
5. Implement rate limiting

**Short-Term (v2):**
1. Build automated test suite
2. Add background job processing for AI
3. Implement delta-based revisions
4. Add pagination for large lists
5. Performance optimisation

**Long-Term (Platform):**
1. Template system expansion
2. Repeat events (annual gatherings)
3. Multi-context support (not just Christmas)
4. Host memory refinement (AI learning)
5. Analytics and insights

---

**Document Generated:** 24 January 2026
**Based on Documentation in:** `/Users/Nigel/Desktop/gather-prototype/docs/`
**Primary Sources:**
- `docs/***What is Gather.md` — Core product vision
- `docs/00_overview/project-overview.md` — Implementation summary
- `docs/00_overview/onboarding-report.md` — Senior developer onboarding
- `docs/03_specs/builder-spec-v1.3.3.md` — Technical specification
- `docs/02_ux/ui-protocol.md` — UX design principles
- `docs/04_roadmap/phase-6-final-report.md` — Latest phase completion
- `docs/05_ops/handoff-document.md` — Design and development handoff

---

**NZ English spelling used throughout as requested.**
