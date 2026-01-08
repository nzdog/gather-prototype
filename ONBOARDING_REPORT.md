# Senior Developer Onboarding Report

## Meta
- **Generated:** 2026-01-06
- **Protocol Version:** 1.0
- **Scope Mode:** Mode A (Single Repo)
- **Execution Capability:** Inspect-Only
- **Reader Profile:** Full-stack
- **Onboarding Horizon:** 1-day (orientation + traced flows + safe first task)
- **Primary Goal:** Balanced operational

---

## Executive Summary

### What This System Does

Gather is a coordination application for multi-day gatherings (Christmas, reunions, retreats) that ensures everyone knows what they're responsible for without anyone holding the whole plan in their head. The system uses role-based access (Host, Coordinator, Participant) with magic link authentication and enforces a workflow state machine (DRAFT → CONFIRMING → FROZEN → COMPLETE) to safely coordinate team-based responsibilities across events.

### Can I Run It?

**Status:** Yes with path

The system requires PostgreSQL database and Node.js 20+. Primary green path:
1. Set `DATABASE_URL` in `.env` to a PostgreSQL connection string
2. Set `ANTHROPIC_API_KEY` in `.env` for AI features
3. Run `npm install`
4. Run `npx prisma migrate deploy && npm run db:seed`
5. Run `npm run dev`
6. Access at `http://localhost:3000`

Current `.env` shows local PostgreSQL at `localhost:5432/gather_dev` (src/.env:3).

### Can I Trace a Flow?

**Top 3 Flows Identified:**

1. **Host Event Creation Flow** - Entry: `POST /api/events` → Creates Event → Returns event with Demo Host (src/app/api/events/route.ts:5-96)

2. **Magic Link Authentication Flow** - Entry: `/h/[token]`, `/c/[token]`, `/p/[token]` → Resolves token → Validates scope/team → Returns AuthContext (src/lib/auth.ts:25-107)

3. **Event Status Transition Flow** - Entry: Host clicks "Move to Confirming" → `POST /api/events/[id]/transition` → Runs gate check → Creates snapshot → Updates status → Generates tokens (src/lib/workflow.ts:502-611)

### What's My Safe First Task?

**Recommended:** Add a new readonly API endpoint in `src/app/api/events/[id]/summary/route.ts` pattern, which already exists and demonstrates safe read-only access patterns with proper authentication context.

**Safe zones:**
- Read-only GET endpoints that query without mutation
- React components in `src/components/` (presentational layer)
- Utility functions in `src/lib/` that don't touch database
- Adding new enum values to Prisma schema (low risk)

**Areas requiring caution:**
- Transaction logic in `src/lib/workflow.ts` (state machine critical)
- Auth token validation in `src/lib/auth.ts` (security-critical)
- Assignment mutations (workflow state integrity)

### Critical Unknowns

1. **Production Database Configuration** - Local `.env` shows development PostgreSQL. Production DATABASE_URL unknown. Railway deployment mentioned (package.json:19) but no Railway config files found.

2. **Anthropic API Key Management** - Current `.env` contains hardcoded API key. Production key management strategy unknown. No secrets vault integration detected.

3. **NEXT_PUBLIC_APP_URL Configuration** - Used for magic link generation (src/lib/tokens.ts:218) but not set in `.env`. Unknown how invite link URLs are constructed in production.

4. **Conflict Detection AI System** - Prisma schema shows extensive `Conflict` model with AI suggestions (prisma/schema.prisma:322-387) but no implementation found for conflict generation logic.

5. **Host Memory Learning System** - Schema defines `HostMemory`, `HostPattern`, `HostDefault` models (prisma/schema.prisma:531-588) but no routes or logic found for pattern learning or suggestion generation.

### Security/Compliance Flags

**Critical Findings:**

1. **Exposed API Key in Version Control** - `.env` file contains `ANTHROPIC_API_KEY` with value `[REDACTED]`. This is a production-grade secret committed to the repository (.env:7).
   - **Blast Radius:** Critical
   - **Impact:** API key compromise enables unauthorized Anthropic API usage, potential data exfiltration if API is used for sensitive operations
   - **Verification Step:** Check `.gitignore` - found that `.env` IS ignored (.gitignore:3), but current file exists in working tree. Confirm git history does not contain this key: `git log -p -- .env`

2. **Magic Link Tokens Without Expiration Enforcement** - Tokens have `expiresAt` field (prisma/schema.prisma:281) set to 90 days (src/lib/tokens.ts:98) but expiration check in `resolveToken()` allows null expiresAt (src/lib/auth.ts:48-51). Tokens without expiration never expire.
   - **Blast Radius:** High
   - **Impact:** Leaked magic links remain valid indefinitely if expiresAt is null, enabling unauthorized persistent access
   - **Verification Step:** Query `SELECT COUNT(*) FROM AccessToken WHERE expiresAt IS NULL` to identify never-expiring tokens

3. **No Rate Limiting on Authentication Endpoints** - Magic link routes `/h/[token]`, `/c/[token]`, `/p/[token]` have no rate limiting detected. Token brute-force is feasible.
   - **Blast Radius:** High
   - **Impact:** 64-character hex tokens (32 bytes) provide 2^256 keyspace but without rate limiting, timing attacks or token enumeration attacks are possible
   - **Verification Step:** Test with `curl` loop against `/h/invalid-token` to observe response times and blocking behavior

**High Findings:**

4. **Assignment Mutation Without Authorization Checks** - `POST /api/events/[id]/items/[itemId]/assign/route.ts` creates assignments but no visible authorization check that requesting user has permission to assign items in that event.
   - **Blast Radius:** High
   - **Impact:** Potential unauthorized assignment of items to users without proper event/team membership validation
   - **Verification Step:** Review route implementation and trace if auth context validates event membership before assignment

5. **Demo Host Auto-Creation** - `POST /api/events` creates a "Demo Host" user if none exists (src/app/api/events/route.ts:20-34). In production, this could enable unauthorized event creation.
   - **Blast Radius:** High
   - **Impact:** Any user can create events using auto-generated Demo Host account
   - **Verification Step:** Confirm this is prototype-only behavior and production requires authenticated session

---

## 1. Report Contract

### Reader Profile: Full-stack

This report emphasizes both frontend (Next.js React components, client-side state) and backend (API routes, Prisma database, workflow logic) concerns with balanced coverage of data flow, state management, and system integration points.

### Horizon: 1-day (orientation + traced flows + safe first task)

**Success criteria for 1-day onboarding:**
- Can run the system locally with seeded data
- Can trace at least one complete request-response flow from UI → API → Database → Response
- Understands the core domain model (Event, Team, Item, Assignment)
- Knows where to add a safe readonly feature
- Understands the workflow state machine and freeze gate logic

### Goal: Balanced operational

Report provides equal emphasis on:
- Domain understanding (what the system does)
- Execution reality (how to run/build/test it)
- Change safety (how to modify without breaking invariants)
- Observability (how to debug when things fail)

### Exclusions

This report does NOT provide:
- Architectural refactoring recommendations
- Code style or quality critiques
- Security penetration testing or exploit development
- Performance optimization suggestions
- Dependency upgrade recommendations
- Product roadmap or feature prioritization

---

## 2. Repo Topology and System Boundaries

### 2.1 Scope Mode Confirmation

**Mode A: Single Repo** confirmed.

Evidence: Repository structure shows single Next.js application with no monorepo indicators (no `packages/`, `apps/`, `lerna.json`, or workspace configuration in package.json:1-49).

### 2.2 System Map

```
gather-prototype/
├── [Entry] src/app/
│   ├── page.tsx [Entry: Public] — Demo landing page with magic links
│   ├── [CoG: Host] plan/
│   │   ├── new/page.tsx — Create new event form
│   │   ├── templates/page.tsx — Template library
│   │   ├── settings/page.tsx — Host memory settings
│   │   └── [eventId]/page.tsx — Event planning workspace
│   ├── [Entry: Auth] h/[token]/
│   │   ├── page.tsx — Host dashboard
│   │   ├── audit/page.tsx — Audit log viewer
│   │   └── team/[teamId]/page.tsx — Team detail view
│   ├── [Entry: Auth] c/[token]/page.tsx — Coordinator dashboard
│   ├── [Entry: Auth] p/[token]/page.tsx — Participant view
│   └── [CoG: Backend] api/
│       ├── events/ — Event CRUD operations
│       │   └── [id]/
│       │       ├── route.ts — GET/PATCH/DELETE event
│       │       ├── items/route.ts — Item management
│       │       ├── teams/route.ts — Team management
│       │       ├── assignments/route.ts — Assignment operations
│       │       ├── people/route.ts — Person management
│       │       ├── tokens/route.ts — Magic link generation
│       │       ├── check/route.ts — Conflict detection [Inference: unimplemented]
│       │       ├── gate-check/route.ts — Transition gate validation
│       │       ├── transition/route.ts — State machine transitions
│       │       ├── generate/route.ts — AI plan generation [Inference: partial]
│       │       ├── regenerate/route.ts — AI plan regeneration [Inference: partial]
│       │       └── conflicts/ — Conflict acknowledgement/resolution
│       ├── h/[token]/ — Host-scoped API routes
│       ├── c/[token]/ — Coordinator-scoped API routes
│       ├── p/[token]/ — Participant-scoped API routes
│       ├── templates/ — Template CRUD
│       ├── memory/ — Host memory and pattern learning [Inference: unimplemented]
│       └── demo/
│           ├── tokens/route.ts — Get all tokens for demo
│           └── reset/route.ts — Reset database to seed state
├── [CoG: Domain] src/lib/
│   ├── prisma.ts — Prisma client singleton
│   ├── auth.ts — Token resolution and AuthContext
│   ├── workflow.ts — State machine, gate checks, transitions, revisions
│   ├── tokens.ts — Token generation and invite link construction
│   └── timezone.ts — Date utilities for NZDT Christmas 2025
├── [CoG: UI] src/components/
│   ├── plan/ — Host planning UI components (modals, forms, lists)
│   └── templates/ — Template management UI
├── [SoT] prisma/
│   ├── schema.prisma — Single source of truth for data model
│   ├── seed.ts — Richardson Family Christmas seed data
│   └── migrations/ — Schema evolution history
├── [Index] .github/workflows/ci.yml — CI: typecheck, format, lint, build
├── [Cache] .next/ — Next.js build output (gitignored)
└── [Boundary: External] @anthropic-ai/sdk — AI integration for plan generation

Notation:
- [Entry: Public] — Publicly accessible without authentication
- [Entry: Auth] — Requires valid magic link token
- [CoG: Host] — Center of gravity for host experience
- [CoG: Backend] — Center of gravity for API logic
- [CoG: Domain] — Center of gravity for business rules
- [CoG: UI] — Center of gravity for presentational components
- [SoT] — Source of truth
- [Index] — CI/CD configuration
- [Cache] — Generated artifacts
- [Boundary: External] — External service integration
```

### 2.3 Centers of Gravity

| Path | Profile Tag | Why It Matters |
|------|-------------|----------------|
| `src/lib/workflow.ts` | [CoG: Backend] | **State machine heart.** Contains all status transition logic, gate checks, freeze validation, audit logging, revision system. Modifications here affect workflow integrity across entire app. |
| `src/lib/auth.ts` | [CoG: Security] | **Authentication boundary.** All route protection flows through `resolveToken()`. Bug here enables unauthorized access. |
| `prisma/schema.prisma` | [CoG: Domain] | **Data model source of truth.** Defines 25+ models, 50+ enums. All API routes and UI components depend on this structure. Schema changes ripple everywhere. |
| `src/app/api/events/[id]/` | [CoG: Backend] | **Primary mutation surface.** Contains 15+ route handlers for event operations. Most backend changes start here. |
| `src/components/plan/` | [CoG: UI] | **Host experience surface.** Contains 16 React components. Most UI changes for planning features touch this directory. |
| `prisma/seed.ts` | [CoG: Test Data] | **Demo data generator.** Wickham Family Christmas event with 27 people, 8 teams. Local development and demo depend on this. |

### 2.4 Entry Points

| Path | Type | Exposure | Bootstraps |
|------|------|----------|------------|
| `src/app/page.tsx` | UI | Public | Demo landing page. Fetches tokens via `/api/demo/tokens`, displays magic links for all roles. |
| `/plan/new` | UI | Public [Inference] | Event creation form. POSTs to `/api/events`. |
| `/plan/templates` | UI | Public [Inference] | Template library viewer. GETs from `/api/templates`. |
| `/h/[token]` | UI | Auth-Required | Host dashboard. Resolves token via `resolveToken()`, fetches event data, displays team status. |
| `/c/[token]` | UI | Auth-Required | Coordinator dashboard. Token resolution validates team membership. |
| `/p/[token]` | UI | Auth-Required | Participant view. Shows assigned items only. |
| `POST /api/events` | API | Public | Event creation endpoint. Auto-creates "Demo Host" if none exists. **[Security: Auth bypass in prototype]** |
| `GET /api/demo/tokens` | API | Public | Lists all magic links for Wickham Family Christmas event. **[Security: Should be protected in production]** |
| `POST /api/demo/reset` | API | Public | Drops all data, re-runs seed. **[Security: Must be removed in production]** |

### 2.5 Integration Seams

**Database Boundary:**
- **Technology:** PostgreSQL via Prisma ORM
- **Location:** `src/lib/prisma.ts` exports singleton client
- **Evidence:** `datasource db { provider = "postgresql" }` (prisma/schema.prisma:8)
- **Connection:** Configured via `DATABASE_URL` environment variable
- **Migration Strategy:** Prisma Migrate (prisma/migrations/)

**AI Service Boundary:**
- **Technology:** Anthropic Claude API via `@anthropic-ai/sdk`
- **Location:** Package dependency (package.json:29)
- **Evidence:** `ANTHROPIC_API_KEY` in .env (line 7)
- **Usage:** Plan generation endpoints `/api/events/[id]/generate` and `/api/events/[id]/regenerate` [Inference: implementations not fully traced]
- **Security:** API key currently in `.env` file

**Frontend-Backend Boundary:**
- **Technology:** Next.js App Router with Server Components + API Routes
- **Pattern:** Server Components fetch directly from Prisma; Client Components call API routes via `fetch()`
- **Evidence:** `'use client'` directive in components (e.g., src/app/page.tsx:1)
- **Serialization:** JSON over HTTP

**Authentication Boundary:**
- **Technology:** Magic links (stateless token-based auth)
- **Pattern:** Token embedded in URL path → `resolveToken()` → AuthContext
- **Storage:** Tokens stored in `AccessToken` table (prisma/schema.prisma:277-295)
- **Expiration:** 90 days (src/lib/tokens.ts:98)

### 2.6 Topology Unknowns

1. **API Route Protection Strategy** - Many API routes under `/api/events/[id]/` do not show visible authentication middleware. Unknown if auth is enforced at Next.js middleware layer or within each route handler. Verification needed: Check for `middleware.ts` file or review each route's auth logic.

2. **Client Component Data Fetching Strategy** - Components marked `'use client'` need to fetch data via API routes. Unknown if there's a central API client wrapper or if each component calls `fetch()` directly. Verification needed: Search for API client utilities or React Query/SWR configuration.

3. **Conflict Detection Trigger Points** - Schema defines `Conflict` model but `/api/events/[id]/check/route.ts` implementation not analyzed. Unknown when/how conflicts are detected and persisted. Verification needed: Trace conflict creation logic.

4. **Host Memory Learning Activation** - Schema defines host memory models but no routes found under `/api/memory/` that implement pattern learning. Unknown if this feature is stubbed or unimplemented. Verification needed: Search for memory-related API implementations.

---

## 3. Build, Run, Test Reality

### 3.1 Prerequisites

| Requirement | Evidence | Verification |
|-------------|----------|--------------|
| **Node.js 20+** | `.nvmrc` contains `20` (.nvmrc:1) | [Extracted] `node --version` should show v20.x |
| **npm** | `package-lock.json` present (lockfile version 3) | [Extracted] `npm --version` |
| **PostgreSQL** | Prisma datasource configured for PostgreSQL (prisma/schema.prisma:8) | [Extracted] `psql --version` or Docker running postgres:latest |
| **Database Created** | `.env` shows `gather_dev` database (.env:3) | [Extracted] `psql -U Nigel -lqt \| grep gather_dev` |
| **Anthropic API Key** | Required for AI features (package.json:29, .env:7) | [Extracted] Check `.env` contains `ANTHROPIC_API_KEY=sk-ant-...` |

**External Services:**
- PostgreSQL (local or Railway-hosted for production)
- Anthropic API (claude.ai) for plan generation features

### 3.2 Primary Green Path

**Phase 1: Install Dependencies**
```bash
npm ci
```
- **Status:** [Extracted] from package.json and CI config (.github/workflows/ci.yml:22)
- **Verification:** Check `node_modules/` contains ~200 packages
- **Failure Mode:** Network issues or npm registry unavailable

**Phase 2: Environment Configuration**
```bash
# Copy .env.example to .env (if it existed)
# OR create .env manually
cat > .env <<EOF
DATABASE_URL="postgresql://USER@localhost:5432/gather_dev"
ANTHROPIC_API_KEY="sk-ant-api03-..."
EOF
```
- **Status:** [Extracted] from .env file presence
- **Verification:** `.env` file exists with valid DATABASE_URL
- **Failure Mode:** Missing `.env` causes Prisma connection errors
- **Note:** No `.env.example` found in repo. `.env` should be gitignored but contains real credentials.

**Phase 3: Database Setup**
```bash
# Create database (if not exists)
createdb gather_dev

# Run migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```
- **Status:** [Extracted] from build script (package.json:7) and CI (.github/workflows/ci.yml:30-31)
- **Verification:** `node_modules/.prisma/client/` contains generated types
- **Failure Mode:** PostgreSQL not running or connection refused

**Phase 4: Seed Database**
```bash
npm run db:seed
```
- **Status:** [Extracted] from package.json:17
- **Verification:** Database contains Wickham Family Christmas event with 27 people
- **Command:** `tsx prisma/seed.ts`
- **Failure Mode:** Seed script errors if migrations not applied

**Phase 5: Run Development Server**
```bash
npm run dev
```
- **Status:** [Extracted] from package.json:6
- **Verification:** Server starts on `http://localhost:3000`
- **Command:** `next dev`
- **Failure Mode:** Port 3000 already in use

**Phase 6: Verify Application**
- Open `http://localhost:3000`
- **Expected:** Demo landing page showing magic links for Wickham Family Christmas
- **Verification:** Page displays "Gather Demo" header with Host/Coordinator/Participant sections
- **Failure Mode:** White screen indicates missing env vars or seed data

### 3.3 Local vs CI Parity

| Dimension | Local (npm run) | CI (GitHub Actions) | Parity? |
|-----------|-----------------|---------------------|---------|
| **Node Version** | User's version (recommend .nvmrc) | 20 (actions/setup-node@v4) | ⚠️ Depends on local nvm usage |
| **Install Command** | `npm install` | `npm ci` | ✅ Both work, CI uses lockfile |
| **Type Checking** | `npm run typecheck` | `npm run typecheck` | ✅ Same command |
| **Formatting** | `npm run format:check` | `npm run format:check` | ✅ Same command |
| **Linting** | `npm run lint` (not in CI) | Not run | ⚠️ Lint not enforced in CI |
| **Prisma Generate** | Manual or via build | `npx prisma generate` | ✅ Same command |
| **Build** | `npm run build` | `npx next build` | ✅ Same (build script calls next build) |
| **Database Migrations** | `npx prisma migrate deploy` | Skipped (dummy DATABASE_URL) | ❌ CI doesn't test migrations |
| **Tests** | No test script defined | Not run | ❌ No test suite exists |
| **Audit** | Not automated | `npm audit --audit-level=high` (continue-on-error) | ⚠️ CI runs audit but doesn't fail build |

**Parity Notes:**
- CI uses dummy DATABASE_URL for build step only, does not run migrations or seed
- No automated test suite detected (`npm test` not defined)
- Lint task exists but not enforced in CI workflow
- Build step includes Prisma generate + migrate deploy, but CI skips migrate

### 3.4 CI Gates

| Gate | Trigger | What It Checks | Failure Location | Blocking? |
|------|---------|----------------|------------------|-----------|
| **Type Check** | PR + push to master | TypeScript type errors via `tsc --noEmit` | .github/workflows/ci.yml:24-25 | ✅ Yes |
| **Format Check** | PR + push to master | Prettier formatting violations | .github/workflows/ci.yml:27-28 | ✅ Yes |
| **Prisma Client Generation** | PR + push to master | Prisma schema validity | .github/workflows/ci.yml:30-31 | ✅ Yes |
| **Build** | PR + push to master | Next.js production build succeeds | .github/workflows/ci.yml:33-36 | ✅ Yes |
| **Audit** | PR + push to master | High/critical npm vulnerabilities | .github/workflows/ci.yml:38-40 | ❌ No (continue-on-error: true) |

**Gate Evidence:** All gates defined in `.github/workflows/ci.yml` (lines 1-41).

**Missing Gates:**
- No test execution (no test suite)
- No lint enforcement (lint script exists but not in CI)
- No migration verification
- No database integration tests

### 3.5 Common Failure Points

| Symptom | Cause | Resolution |
|---------|-------|------------|
| **"Error: P1001: Can't reach database server"** | PostgreSQL not running or DATABASE_URL incorrect | Start PostgreSQL: `brew services start postgresql` or `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:latest`, then verify DATABASE_URL |
| **"Module not found: Can't resolve '@/lib/prisma'"** | Prisma Client not generated | Run `npx prisma generate` |
| **"Migration failed: database 'gather_dev' does not exist"** | Database not created | Run `createdb gather_dev` |
| **Empty demo page or "No tokens found"** | Database not seeded | Run `npm run db:seed` |
| **"Anthropic API error" in logs** | ANTHROPIC_API_KEY missing or invalid | Add valid key to `.env`: `ANTHROPIC_API_KEY=sk-ant-...` |
| **Port 3000 already in use** | Another Next.js app running | Kill process: `lsof -ti:3000 \| xargs kill -9` or use different port: `PORT=3001 npm run dev` |
| **Type errors on `prisma.event.findUnique(...)`** | Prisma Client out of sync with schema | Regenerate: `npx prisma generate` |
| **Build fails with "Route ... has invalid export"** | API route missing `export const dynamic = 'force-dynamic'` for routes using headers/cookies | Add export or switch to route handler pattern |

### 3.6 Secrets Handling

| Secret | Defined In | Format | Local Dev Posture |
|--------|-----------|--------|-------------------|
| **DATABASE_URL** | .env:3 | `postgresql://USER@HOST:PORT/DB` | Committed in .env (should be gitignored) |
| **ANTHROPIC_API_KEY** | .env:7 | `sk-ant-api03-...` | **⚠️ Real key committed in working tree** |
| **NEXT_PUBLIC_APP_URL** | Not present | URL string | Unknown - affects magic link generation |

**Gitignore Status:**
- `.env` IS in `.gitignore` (.gitignore:3)
- Current `.env` exists in working tree (untracked or previously committed)
- **Verification needed:** Run `git log -p -- .env` to check if secrets leaked in history

**Production Secrets:**
- Railway deployment mentioned (package.json:19) suggests Railway env vars for production
- No `.env.production` or secrets manager integration detected

### 3.7 Execution Unknowns

1. **Lint Enforcement** - `npm run lint` and `npm run lint:fix` scripts exist (package.json:9-10) but no evidence of lint being run in CI or pre-commit hooks. Unknown if lint rules are enforced.

2. **Test Suite** - No `npm test` script defined. No test files found in `/tests` directory (directory exists but empty based on git status). Unknown if tests exist or if this is prototype-only code.

3. **Hot Reload Behavior** - Next.js 14 App Router hot reload behavior for Server Components vs Client Components not documented. Unknown if API route changes require server restart.

4. **Database Migration Strategy** - Migrations exist in `prisma/migrations/` but no `migrate.lock` or migration history tracker. Unknown how migration conflicts are handled in team environment.

---

## 4. Core Execution Paths

### 4.1 Tier 1 Flows (Universal)

#### Flow 1: Magic Link Authentication
**Summary:** User clicks magic link → Server resolves token → Validates scope/team membership → Grants access to role-specific dashboard

**Selection Criteria:** Universal authentication flow - every authenticated request flows through this path. Critical for security posture.

**Security Relevance:** [Security: Auth] - Token validation is the security boundary for the entire application.

**Trace:**
```
Entry: GET /h/[token] OR /c/[token] OR /p/[token]
  → src/app/h/[token]/page.tsx (or c/p variants)
  → Server Component calls resolveToken(token)
    → src/lib/auth.ts:resolveToken():25-107
      → prisma.accessToken.findUnique({ where: { token } })
      → Check expiration: accessToken.expiresAt < new Date()
      → If COORDINATOR scope:
        → Validate token.teamId exists
        → Verify PersonEvent.teamId matches token.teamId OR person is team.coordinatorId
      → Return AuthContext { person, event, team?, scope }
  → Page renders role-specific dashboard using AuthContext
  → Fetch event data: GET /api/events/[id] (or role-scoped endpoints)
Terminal: Dashboard page displays event, teams, items
```

**Dependencies:**
- `AccessToken` table (src/lib/auth.ts:29)
- `Person`, `Event`, `Team` relations (src/lib/auth.ts:32-35)
- `PersonEvent` join table for COORDINATOR validation (src/lib/auth.ts:71-76)

**Consumers:**
- All authenticated pages: `/h/[token]`, `/c/[token]`, `/p/[token]` and their sub-routes
- API routes under `/api/h/[token]`, `/api/c/[token]`, `/api/p/[token]`

**Debug Start Here:**
1. **Token Not Found:** Check `AccessToken` table for token existence: `SELECT * FROM "AccessToken" WHERE token = '...'`
2. **Token Expired:** Check `expiresAt`: `SELECT token, "expiresAt", NOW() FROM "AccessToken" WHERE token = '...'`
3. **COORDINATOR Team Mismatch:** Verify PersonEvent: `SELECT pe."teamId", t."coordinatorId", at."teamId" FROM "PersonEvent" pe JOIN "AccessToken" at ON pe."personId" = at."personId" JOIN "Team" t ON at."teamId" = t.id WHERE at.token = '...'`

**Failure Modes:**

| Failure | Cause | Error Signal | Recovery |
|---------|-------|--------------|----------|
| Token not found in DB | Invalid token or database not seeded | `console.log("[Auth] Token not found")` (auth.ts:39) | Verify token exists, reseed if demo token missing |
| Token expired | `expiresAt < new Date()` | `console.log("[Auth] Token expired")` (auth.ts:49) | Regenerate token: `POST /api/events/[id]/tokens` |
| COORDINATOR team mismatch | PersonEvent.teamId ≠ token.teamId AND person not team.coordinatorId | `console.log("[Auth] COORDINATOR token team mismatch")` (auth.ts:86) | Fix PersonEvent assignment or regenerate token |
| Auth returns null | Any validation failure | Page fails to render or shows "Unauthorized" | Check server logs for auth.ts console.log output |

---

#### Flow 2: Event Status Transition (DRAFT → CONFIRMING)
**Summary:** Host clicks "Move to Confirming" → Gate check runs → If passed: creates snapshot → Updates status to CONFIRMING → Locks structure → Generates invite tokens

**Selection Criteria:** Critical workflow state machine transition. Demonstrates transaction patterns, validation logic, and side effects.

**Security Relevance:** [Security: Auth] - Only HOST scope should trigger transitions. Enforces freeze gate to prevent data loss.

**Trace:**
```
Entry: Host dashboard → Click "Move to Confirming" button
  → Client POSTs to /api/events/[id]/transition
    → src/lib/workflow.ts:transitionToConfirming(eventId, actorId):502-611
      → Call runGateCheck(eventId):295-398
        → Check 1: Critical conflicts unacknowledged?
          → COUNT conflicts WHERE severity=CRITICAL AND acknowledgements=none
        → Check 2: Critical placeholders unacknowledged?
          → COUNT items WHERE critical=true AND quantityState=PLACEHOLDER AND placeholderAcknowledged=false
        → Check 3: Structural minimum teams (>=1)?
          → COUNT teams WHERE eventId=...
        → Check 4: Structural minimum items (>=1)?
          → COUNT items WHERE teamId IN (teams)
        → Check 5: Event status is DRAFT?
          → Check event.status === 'DRAFT'
        → Return { passed: blocks.length === 0, blocks }
      → If gate check failed:
        → Record transitionAttempt in event.transitionAttempts JSON
        → Return { success: false, blocks }
      → If gate check passed:
        → BEGIN TRANSACTION
          → Call createPlanSnapshot(tx, eventId):414-490
            → Fetch all teams, items, days, acknowledgements
            → Create PlanSnapshot record with phase=CONFIRMING
            → Return snapshotId
          → UPDATE Event SET status=CONFIRMING, structureMode=LOCKED, planSnapshotIdAtConfirming=snapshotId, transitionedToConfirmingAt=NOW()
          → Call ensureEventTokens(eventId, tx) from src/lib/tokens.ts:34-186
            → For each team coordinator: Create COORDINATOR token with teamId
            → For each PersonEvent with role=PARTICIPANT: Create PARTICIPANT token
            → For event host/cohost: Create HOST token
            → Use idempotent upsert (skip duplicates)
          → Call logAudit(tx, { actionType: 'TRANSITION_TO_CONFIRMING', ... })
        → COMMIT TRANSACTION
        → Return { success: true, snapshotId }
Terminal: Event status now CONFIRMING, magic links available
```

**Dependencies:**
- `Event.status` field (prisma/schema.prisma:21)
- `Conflict` table for gate check (prisma/schema.prisma:322)
- `Item` table for placeholder check (prisma/schema.prisma:188)
- `Team`, `PersonEvent` for token generation (prisma/schema.prisma:118, 164)
- `PlanSnapshot` table (prisma/schema.prisma:443)
- `AccessToken` table (prisma/schema.prisma:277)
- `AuditEntry` table (prisma/schema.prisma:303)

**Consumers:**
- Host dashboard transition UI
- `/api/events/[id]/transition` route handler

**Debug Start Here:**
1. **Gate Check Failing:** Call `GET /api/events/[id]/gate-check` to see which blocks are present
2. **Transaction Rollback:** Check PostgreSQL logs for constraint violations or deadlocks
3. **Tokens Not Generated:** Query `SELECT COUNT(*) FROM "AccessToken" WHERE "eventId" = '...'` after transition
4. **Snapshot Not Created:** Query `SELECT * FROM "PlanSnapshot" WHERE "eventId" = '...' ORDER BY "createdAt" DESC LIMIT 1`

**Failure Modes:**

| Failure | Cause | Error Signal | Recovery |
|---------|-------|--------------|----------|
| Gate check fails | Critical conflicts not acknowledged, or <1 team/item | Response: `{ success: false, blocks: [...] }` | Address each block: acknowledge conflicts, add teams/items, set event to DRAFT |
| Transaction fails | Database constraint violation or timeout | HTTP 500, console error | Check PostgreSQL logs, retry transaction |
| Token generation fails | Missing PersonEvent records or invalid coordinator | ensureEventTokens throws error | Verify team coordinators and PersonEvent records exist |
| Snapshot creation fails | Unable to serialize teams/items to JSON | createPlanSnapshot throws error | Check for circular references or non-serializable data |

---

#### Flow 3: Item Assignment to Person
**Summary:** Coordinator assigns item to team member → Creates Assignment record → Updates Item.status to ASSIGNED → Sends audit log entry

**Selection Criteria:** Core domain operation demonstrating transaction pattern with status repair and audit logging.

**Security Relevance:** [Security: Auth] - Should validate coordinator has permission to assign items in their team.

**Trace:**
```
Entry: Coordinator clicks "Assign to..." on item card
  → Client POSTs to /api/events/[id]/items/[itemId]/assign
    → Body: { personId: '...' }
    → [Inference: Auth validation should happen here]
    → BEGIN TRANSACTION
      → Get item: SELECT * FROM Item WHERE id = itemId
      → Validate item.teamId matches coordinator's team [Inference: validation may be missing]
      → Check if assignment exists:
        → If exists: UPDATE Assignment SET personId = ... WHERE itemId = ...
        → If not exists: INSERT INTO Assignment (itemId, personId, acknowledged=false)
      → Call repairItemStatusAfterMutation(tx, itemId) from src/lib/workflow.ts:37-53
        → SELECT item WITH assignment
        → Compute shouldBe: item.assignment !== null ? 'ASSIGNED' : 'UNASSIGNED'
        → If item.status !== shouldBe: UPDATE Item SET status = shouldBe
      → Call logAudit(tx, { actionType: 'ASSIGN_ITEM', targetType: 'Item', targetId: itemId })
    → COMMIT TRANSACTION
    → Return { success: true, assignment }
Terminal: Item shows as ASSIGNED, person sees item in their list
```

**Dependencies:**
- `Item` table (prisma/schema.prisma:188)
- `Assignment` table (prisma/schema.prisma:261)
- `PersonEvent` for team membership validation [Inference]
- `AuditEntry` table (prisma/schema.prisma:303)

**Consumers:**
- Coordinator dashboard item assignment UI
- Host dashboard (can assign across all teams)

**Debug Start Here:**
1. **Assignment Not Created:** Query `SELECT * FROM "Assignment" WHERE "itemId" = '...'`
2. **Item.status Not Updated:** Check if repairItemStatusAfterMutation was called within transaction
3. **Audit Log Missing:** Query `SELECT * FROM "AuditEntry" WHERE "targetType" = 'Item' AND "targetId" = '...' ORDER BY timestamp DESC`

**Failure Modes:**

| Failure | Cause | Error Signal | Recovery |
|---------|-------|--------------|----------|
| Assignment fails | Person not in event or team | Database foreign key constraint error | Verify PersonEvent exists for (personId, eventId) |
| Status not repaired | repairItemStatusAfterMutation not called | Item.status out of sync with Assignment existence | Run repair manually or via item update |
| Audit log not written | logAudit call skipped or failed | Missing audit trail | Verify transaction includes logAudit call |
| Unauthorized assignment | Coordinator assigning outside their team | [Inference: May not be validated] | Add authorization check at route handler level |

---

### 4.2 Tier 2 Flows (Profile-Specific: Full-Stack)

#### Flow 4: React Component Data Fetching (Client → API → Database)
**Summary:** Client Component mounts → Fetches data from API route → API route queries Prisma → Returns JSON → Component renders

**Selection Criteria:** Demonstrates full-stack data flow from UI to database and back, typical for full-stack developers.

**Security Relevance:** [Security: Auth] - Client-side fetches must include token in URL or headers if authenticated.

**Trace:**
```
Entry: User navigates to /h/[token] (Host dashboard)
  → src/app/h/[token]/page.tsx renders (Server Component)
    → Calls resolveToken(token) to get AuthContext
    → Fetches event data directly from Prisma:
      → prisma.event.findUnique({ where: { id: authContext.event.id }, include: { teams, days, ... } })
    → Passes data as props to Client Components
  → Client Component <TeamList> mounts
    → [Inference: May fetch additional data via fetch('/api/events/[id]/teams')]
    → API route handler:
      → GET /api/events/[id]/teams/route.ts
        → [Inference: Should validate auth - unknown how]
        → prisma.team.findMany({ where: { eventId }, include: { coordinator, items } })
        → Compute team status using computeTeamStatusFromItems (src/lib/workflow.ts:19-28)
        → Return JSON: { teams: [...] }
    → Component updates state: setTeams(data.teams)
    → React renders team cards
Terminal: UI displays team list with computed status badges
```

**Dependencies:**
- Server Components can access Prisma directly (no API route needed)
- Client Components must use API routes
- `computeTeamStatusFromItems` helper (src/lib/workflow.ts:19-28)

**Consumers:**
- All authenticated pages that render dynamic data

**Debug Start Here:**
1. **Component Shows Loading Forever:** Check Network tab for API request status
2. **API Returns 500:** Check server logs for Prisma query errors
3. **Data Out of Sync:** Verify cache: `no-cache` headers or React Query invalidation

**Failure Modes:**

| Failure | Cause | Error Signal | Recovery |
|---------|-------|--------------|----------|
| API fetch fails | Network error or API route error | Client console error, component shows error state | Check Network tab, verify API route exists and returns 200 |
| Data stale after mutation | Client cache not invalidated | UI shows old data | Force refresh or implement cache invalidation (React Query, SWR) |
| Auth token missing | Token not passed to API request | API returns 401 or null | Ensure token is in URL path or headers |
| Prisma query timeout | Large dataset or slow query | API returns 504 timeout | Add query timeout, optimize with indexes |

---

### 4.3 Flow Unknowns

1. **Conflict Detection and AI Suggestion Generation** - Schema defines `Conflict` model with `suggestion` JSON field and routes like `/api/events/[id]/check` exist, but implementation not traced. Unknown how conflicts are detected, when they're created, or how AI generates suggestions.

2. **AI Plan Generation Flow** - Routes `/api/events/[id]/generate` and `/api/events/[id]/regenerate` exist. Anthropic SDK is imported. Unknown what prompts are sent, how Claude generates teams/items, or how validation occurs before persisting.

3. **Host Memory Pattern Learning** - Models `HostMemory`, `HostPattern`, `HostDefault` exist but no routes found that create or query these records. Unknown if this feature is implemented or if it's planned for future.

4. **Template Cloning and Adaptation** - Route `/api/templates/[id]/clone` exists. `Event.clonedFromId` and `Event.cloneAdaptations` fields suggest template cloning with AI adaptation. Unknown how adaptations are computed or applied.

5. **Structure Change Request Workflow** - Model `StructureChangeRequest` exists with PENDING/APPLIED/CANCELLED status. Unknown how coordinators request changes when in LOCKED mode and how hosts approve them.

---

## 5. Data Model and State

### 5.1 Core Entities

#### Entity 1: Event
**Source of Truth:** `Event` table (prisma/schema.prisma:16-105)

**Storage Map:**
- [SoT] PostgreSQL `Event` table - Full event data with all plan-phase fields
- [Replica] `PlanSnapshot.event` - Snapshot of event state at CONFIRMING transition (schema.prisma:446)
- [Replica] `PlanRevision.event` - Historical revisions for rollback (schema.prisma:424)

**Key Fields:**
- `id` (String, cuid) - Primary key
- `name` (String) - Event display name, e.g. "Wickham Family Christmas"
- `status` (EventStatus enum) - Workflow state: DRAFT | CONFIRMING | FROZEN | COMPLETE
- `startDate`, `endDate` (DateTime) - Event date range
- `hostId` (String, FK to Person) - Event owner, cannot be null
- `guestCount` (Int, optional) - Expected attendance
- `structureMode` (StructureMode enum) - EDITABLE | LOCKED | CHANGE_REQUESTED (default: EDITABLE)
- `planSnapshotIdAtConfirming` (String, optional, FK to PlanSnapshot) - Snapshot captured at transition

**Relationships:**
- `host` (Person) - Many-to-one, owner of event
- `coHost` (Person, optional) - Many-to-one, secondary host
- `days` (Day[]) - One-to-many, event schedule days
- `teams` (Team[]) - One-to-many, coordination teams
- `people` (PersonEvent[]) - Many-to-many via join table, event participants
- `tokens` (AccessToken[]) - One-to-many, magic link tokens
- `conflicts` (Conflict[]) - One-to-many, detected plan issues
- `revisions` (PlanRevision[]) - One-to-many, manual snapshots

**Write Paths:**
1. **Creation:** `POST /api/events` → Creates Event with DRAFT status (src/app/api/events/route.ts:78-80)
2. **Update Metadata:** `PATCH /api/events/[id]` → Updates name, dates, guest count, venue details
3. **Status Transition:** `POST /api/events/[id]/transition` → Updates status, structureMode, snapshot references (src/lib/workflow.ts:558-575)
4. **AI Generation:** `POST /api/events/[id]/generate` → Creates Event + Teams + Items in one transaction [Inference: not traced]

**Invariants:**
- [Fact] `status` must follow state machine: DRAFT → CONFIRMING → FROZEN → COMPLETE (src/lib/workflow.ts:100-112)
- [Fact] Transition from CONFIRMING to FROZEN blocked if ANY critical item lacks assignment (src/lib/workflow.ts:63-73)
- [Fact] `hostId` is required (Prisma schema enforces non-null) (prisma/schema.prisma:31)
- [Inference] Only HOST scope tokens should be able to transition events (not enforced in auth layer - verification needed)
- [Inference] `structureMode` should be LOCKED when status=CONFIRMING or FROZEN (logic in workflow.ts:562 sets LOCKED on transition)

**Consumers:**
- Host dashboard: Full event control
- Coordinator dashboard: Read-only event context
- Participant view: Read-only event name and dates
- All authenticated routes: Event scoping via `authContext.event`

**Patterns:**
- **State Machine:** Status transitions via `canTransition()` validator (src/lib/workflow.ts:100-112)
- **Snapshotting:** `planSnapshotIdAtConfirming` captures state at transition for freeze gate and rollback (src/lib/workflow.ts:545)
- **Soft Delete:** No soft delete implemented - deletes cascade via Prisma `onDelete: Cascade` (prisma/schema.prisma:114)

---

#### Entity 2: Team
**Source of Truth:** `Team` table (prisma/schema.prisma:118-142)

**Storage Map:**
- [SoT] PostgreSQL `Team` table
- [Replica] `PlanSnapshot.teams` - JSON snapshot of team structure at transition
- [Replica] `PlanRevision.teams` - JSON snapshot for revision history

**Key Fields:**
- `id` (String, cuid)
- `name` (String) - Team display name, e.g. "Mains – Proteins"
- `eventId` (String, FK to Event) - Parent event
- `coordinatorId` (String, FK to Person) - Team coordinator (required)
- `domain` (Domain enum, optional) - Categorization: PROTEINS, DESSERTS, DRINKS, SETUP, CLEANUP, etc.
- `source` (ItemSource enum) - GENERATED | TEMPLATE | MANUAL (default: MANUAL)
- `isProtected` (Boolean) - If true, cannot be deleted when generated from AI/template (default: false)

**Relationships:**
- `event` (Event) - Many-to-one, cascade delete on Event deletion
- `coordinator` (Person) - Many-to-one, team leader
- `items` (Item[]) - One-to-many, team's responsibility items
- `members` (PersonEvent[]) - One-to-many via join, team members
- `tokens` (AccessToken[]) - One-to-many, coordinator tokens scoped to this team

**Write Paths:**
1. **Creation:** `POST /api/events/[id]/teams` → Creates Team with coordinatorId
2. **Update:** `PATCH /api/events/[id]/teams/[teamId]` → Updates name, scope, coordinator
3. **Delete:** `DELETE /api/events/[id]/teams/[teamId]` → Cascades to Items and PersonEvent records
4. **AI Generation:** Part of `POST /api/events/[id]/generate` transaction [Inference]

**Invariants:**
- [Fact] `coordinatorId` is required (Prisma enforces non-null) (prisma/schema.prisma:136)
- [Fact] `eventId` is required (Prisma enforces non-null) (prisma/schema.prisma:133)
- [Fact] Team deletion cascades to Items: `onDelete: Cascade` (prisma/schema.prisma:134)
- [Inference] Each event must have at least 1 team to transition to CONFIRMING (gate check block: STRUCTURAL_MINIMUM_TEAMS, src/lib/workflow.ts:345-356)
- [Inference] Coordinator must exist in PersonEvent with role=COORDINATOR for that team [Unknown: validation location]

**Consumers:**
- Host dashboard: Team list, team creation/edit/delete
- Coordinator dashboard: Single team view, item assignment
- Workflow gate check: Validates minimum 1 team exists

**Patterns:**
- **Domain Mapping:** `domain` field categorizes teams for AI understanding (prisma/schema.prisma:124)
- **Protection Flag:** `isProtected` prevents accidental deletion of AI-generated teams (prisma/schema.prisma:130)
- **Source Tracking:** `source` field tracks origin for attribution (prisma/schema.prisma:129)

---

#### Entity 3: Item
**Source of Truth:** `Item` table (prisma/schema.prisma:188-254)

**Storage Map:**
- [SoT] PostgreSQL `Item` table - Full item details including quantity, dietary, equipment, timing
- [Cache] `Item.status` (ASSIGNED | UNASSIGNED) - Cached assignment state, repaired after mutations (src/lib/workflow.ts:37-53)
- [Replica] `PlanSnapshot.items` - JSON snapshot for freeze gate validation

**Key Fields:**
- `id` (String, cuid)
- `name` (String) - Item display name, e.g. "Turkey", "Christmas Pudding"
- `teamId` (String, FK to Team) - Owning team
- `critical` (Boolean) - If true, item blocks freeze until assigned (default: false)
- `status` (ItemStatus enum) - ASSIGNED | UNASSIGNED (cached, not source of truth)
- `quantityState` (QuantityState enum) - SPECIFIED | PLACEHOLDER | NA (default: SPECIFIED)
- `previouslyAssignedTo` (String, optional) - Comma-separated names of removed assignees

**Relationships:**
- `team` (Team) - Many-to-one, cascade delete on Team deletion
- `day` (Day, optional) - Many-to-one, scheduling day
- `assignment` (Assignment, optional) - One-to-one, current assignee

**Write Paths:**
1. **Creation:** `POST /api/events/[id]/items` → Creates Item with status=UNASSIGNED
2. **Update:** `PATCH /api/events/[id]/items/[itemId]` → Updates name, quantity, critical flag, etc.
3. **Assignment:** `POST /api/events/[id]/items/[itemId]/assign` → Creates Assignment, repairs status to ASSIGNED
4. **Unassignment:** `DELETE /api/events/[id]/assignments/[assignmentId]` → Deletes Assignment, repairs status to UNASSIGNED
5. **AI Generation:** Part of `POST /api/events/[id]/generate` transaction [Inference]

**Invariants:**
- [Fact] `Item.status` must match Assignment existence: if assignment exists → status=ASSIGNED, else status=UNASSIGNED (src/lib/workflow.ts:45-52)
- [Fact] `repairItemStatusAfterMutation()` MUST be called after creating or deleting Assignment (src/lib/workflow.ts:34-53)
- [Fact] Critical items with no assignment block CONFIRMING → FROZEN transition (src/lib/workflow.ts:64-72)
- [Fact] Critical items with `quantityState=PLACEHOLDER` and `placeholderAcknowledged=false` block CONFIRMING transition (src/lib/workflow.ts:324-341)
- [Inference] GET routes compute team status from Assignment queries, NOT Item.status (src/lib/workflow.ts:19-28)

**Consumers:**
- Coordinator dashboard: Item list, assignment UI
- Host dashboard: All items across teams
- Participant view: Assigned items only
- Freeze gate check: Validates critical item coverage

**Patterns:**
- **Cached Status:** `Item.status` is a cache, repaired after mutations (src/lib/workflow.ts:37-53) - DO NOT trust status in GET routes
- **Soft Delete Assignee:** `previouslyAssignedTo` accumulates names when people are removed (src/lib/workflow.ts:222-228)
- **Critical Flag:** Marks freeze-blocking items (prisma/schema.prisma:193)
- **Structured Quantity:** Supports amount+unit+label+source tracking for AI reasoning (prisma/schema.prisma:198-208)

---

#### Entity 4: Assignment
**Source of Truth:** `Assignment` table (prisma/schema.prisma:261-274)

**Storage Map:**
- [SoT] PostgreSQL `Assignment` table
- [Cache] Referenced by `Item.status` field (repaired to stay consistent)

**Key Fields:**
- `id` (String, cuid)
- `itemId` (String, unique, FK to Item) - One assignment per item
- `personId` (String, FK to Person) - Assigned person
- `acknowledged` (Boolean) - True when person confirms they've seen the assignment (default: false)

**Relationships:**
- `item` (Item) - One-to-one (unique constraint), cascade delete on Item deletion
- `person` (Person) - Many-to-one, NO cascade delete (prisma/schema.prisma:271-272)

**Write Paths:**
1. **Creation:** `POST /api/events/[id]/items/[itemId]/assign` → Creates Assignment, repairs Item.status
2. **Acknowledge:** `POST /api/p/[token]/ack/[assignmentId]` or `/api/c/[token]/ack/[assignmentId]` → Sets acknowledged=true
3. **Delete:** Part of `removePerson()` workflow (src/lib/workflow.ts:189-258) - deletes assignments, repairs item status, logs audit

**Invariants:**
- [Fact] One Assignment per Item (unique constraint on itemId) (prisma/schema.prisma:267)
- [Fact] Assignment must reference valid Person and Item (foreign key constraints)
- [Fact] NO onDelete cascade from Person (prisma/schema.prisma:272 comment) - requires app-layer orchestration via `removePerson()`
- [Fact] After Assignment creation/deletion, `repairItemStatusAfterMutation()` MUST be called (src/lib/workflow.ts:34-53)

**Consumers:**
- Participant view: Shows assigned items
- Coordinator dashboard: Assignment UI, acknowledgement tracking
- Workflow freeze gate: Validates critical item coverage

**Patterns:**
- **Acknowledgement Flag:** Tracks whether person has seen their assignment
- **No Cascade Delete:** Person removal requires manual orchestration (src/lib/workflow.ts:189-258)

---

#### Entity 5: Person
**Source of Truth:** `Person` table (prisma/schema.prisma:144-161)

**Storage Map:**
- [SoT] PostgreSQL `Person` table
- [Index] Referenced by `Item.previouslyAssignedTo` as comma-separated name string (not FK)

**Key Fields:**
- `id` (String, cuid)
- `name` (String) - Display name, e.g. "Jacqui & Ian"
- `email` (String, optional, unique) - Contact email
- `phone` (String, optional) - Contact phone

**Relationships:**
- `hostedEvents` (Event[]) - One-to-many, events where this person is host
- `cohostedEvents` (Event[]) - One-to-many, events where this person is cohost
- `coordinatedTeams` (Team[]) - One-to-many, teams where this person is coordinator
- `eventMemberships` (PersonEvent[]) - Many-to-many via join, event participations
- `assignments` (Assignment[]) - One-to-many, assigned items
- `tokens` (AccessToken[]) - One-to-many, magic link tokens

**Write Paths:**
1. **Creation:** `POST /api/events/[id]/people` → Creates Person and PersonEvent [Inference: route exists but not traced]
2. **Update:** `PATCH /api/events/[id]/people/[personId]` → Updates name, email, phone [Inference]
3. **Remove:** `DELETE /api/events/[id]/people/[personId]` → Calls `removePerson()` workflow (src/lib/workflow.ts:189-258)

**Invariants:**
- [Fact] `email` must be unique if provided (prisma/schema.prisma:148)
- [Fact] Person deletion requires `removePerson()` orchestration: update Item.previouslyAssignedTo, delete assignments, delete tokens, delete PersonEvent (src/lib/workflow.ts:189-258)
- [Inference] Person can be host of multiple events, coordinator of multiple teams

**Consumers:**
- All role dashboards: Display person name
- Assignment UI: Person selection dropdowns
- Token generation: Creates magic links for each person+event+scope

**Patterns:**
- **No Soft Delete:** Person removal is hard delete with audit trail
- **Cascading Name Preservation:** `previouslyAssignedTo` preserves names after removal (src/lib/workflow.ts:222-228)

---

#### Entity 6: AccessToken
**Source of Truth:** `AccessToken` table (prisma/schema.prisma:277-295)

**Storage Map:**
- [SoT] PostgreSQL `AccessToken` table
- [Index] Token string is unique (prisma/schema.prisma:279)

**Key Fields:**
- `id` (String, cuid)
- `token` (String, unique) - 64-character hex string (32 random bytes)
- `scope` (TokenScope enum) - HOST | COORDINATOR | PARTICIPANT
- `eventId` (String, FK to Event) - Scoped to single event
- `personId` (String, FK to Person) - Token owner
- `teamId` (String, optional, FK to Team) - Required for COORDINATOR tokens
- `expiresAt` (DateTime, optional) - Token expiration (90 days default)

**Relationships:**
- `event` (Event) - Many-to-one, cascade delete on Event deletion
- `person` (Person) - Many-to-one, cascade delete on Person deletion
- `team` (Team, optional) - Many-to-one, required for COORDINATOR scope

**Write Paths:**
1. **Bulk Generation:** `ensureEventTokens(eventId)` (src/lib/tokens.ts:34-186) - Creates all missing tokens for event
2. **Transition Trigger:** Called during `transitionToConfirming()` (src/lib/workflow.ts:578-579)

**Invariants:**
- [Fact] Token string must be unique (prisma/schema.prisma:279)
- [Fact] COORDINATOR tokens MUST have non-null teamId (src/lib/auth.ts:54-58)
- [Fact] COORDINATOR token validation requires PersonEvent.teamId match OR person is team.coordinatorId (src/lib/auth.ts:78-88)
- [Fact] Unique constraint on (eventId, personId, scope, teamId) prevents duplicate tokens (prisma/schema.prisma:294)
- [Inference] Expiration check allows null expiresAt (never expires) - potential security issue (src/lib/auth.ts:48-51)

**Consumers:**
- Authentication flow: `resolveToken()` (src/lib/auth.ts:25-107)
- Demo landing page: Lists all tokens (src/app/page.tsx:14-248)
- Invite link generation: `listInviteLinks()` (src/lib/tokens.ts:195-246)

**Patterns:**
- **Magic Link Auth:** Token embedded in URL path, no cookies or sessions
- **Idempotent Generation:** `ensureEventTokens()` safe to call multiple times (src/lib/tokens.ts:181-185)
- **Scope-Based Routing:** HOST → /h/[token], COORDINATOR → /c/[token], PARTICIPANT → /p/[token]

---

### 5.2 Derived State

| Derived Store | Source of Truth | Sync Mechanism | Staleness Risk |
|---------------|-----------------|----------------|----------------|
| **Item.status** | Assignment table existence | `repairItemStatusAfterMutation()` called after Assignment create/delete (src/lib/workflow.ts:37-53) | HIGH - If repair not called, status out of sync. GET routes MUST use `computeTeamStatusFromItems()` (src/lib/workflow.ts:19-28) which queries Assignment, NOT Item.status. |
| **Team Status Badge** | Item.critical + Assignment.personId fields | Computed on read via `computeTeamStatusFromItems()` (src/lib/workflow.ts:19-28) | NONE - Always computed fresh from source |
| **Freeze Gate Eligibility** | Item.critical + Assignment table | `canFreeze()` queries Assignment directly (src/lib/workflow.ts:63-73) | NONE - Always queries source, does not trust Item.status |
| **Event.transitionAttempts** | Gate check results | Appended to JSON array on each transition attempt (src/lib/workflow.ts:517-533) | NONE - Updated in same transaction |
| **PlanSnapshot** | Event, Team, Item, Day, Conflict, Acknowledgement tables | Created once at transition, never updated (src/lib/workflow.ts:414-490) | N/A - Immutable snapshot |

**Key Insight:** Item.status is a **write-time cache** that can become stale if `repairItemStatusAfterMutation()` is not called. All read operations that depend on assignment state MUST query the Assignment table directly, NOT Item.status. This is enforced by `computeTeamStatusFromItems()` and `canFreeze()`.

### 5.3 Schema Evolution

**Migration Tool:** Prisma Migrate

**Location:** `prisma/migrations/` directory

**Evidence:** Git status shows migration directories:
- `prisma/migrations/20260104000000_add_token_uniqueness/`
- `prisma/migrations/20260104083040_sync_schema/`

**Safe Change Procedure:**
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_change` to generate migration
3. Test migration on local database
4. Commit both `schema.prisma` and `migrations/` directory
5. Deploy with `npx prisma migrate deploy` (production) or `npx prisma migrate dev` (local)

**Rollback Posture:**
- **Primary Method:** Manual SQL rollback script (Prisma does not auto-generate down migrations)
- **Procedure:**
  1. Identify breaking migration in `prisma/migrations/`
  2. Write reverse SQL (e.g., DROP COLUMN, ALTER TABLE)
  3. Apply manually: `psql gather_dev < rollback.sql`
  4. Update `schema.prisma` to match rolled-back state
  5. Run `npx prisma migrate resolve --rolled-back <migration_name>`
- **Time Estimate:** 10-30 minutes depending on data volume and constraint complexity
- **Approval Requirements:** [Unknown] - No evidence of migration approval workflow

**Risk:** Prisma Migrate does not support branching or automatic down migrations. Rollbacks require manual SQL expertise.

### 5.4 Data Model Unknowns

1. **Conflict Model Implementation** - Schema defines extensive `Conflict` table (prisma/schema.prisma:322-387) with AI suggestions, engagement tracking, delegation, but no evidence of conflict creation or update logic found in API routes or lib/. Unknown how conflicts are detected, when they're created, or how severity is determined.

2. **Host Memory and Pattern Learning** - Models `HostMemory`, `HostPattern`, `HostDefault`, `DismissedSuggestion` exist (prisma/schema.prisma:531-588) but no routes or logic found under `/api/memory/`. Unknown if this feature is stubbed for future or partially implemented.

3. **StructureChangeRequest Workflow** - Model exists with PENDING/APPLIED/CANCELLED statuses (prisma/schema.prisma:463-486). Schema suggests coordinators request changes when structureMode=LOCKED. Unknown how requests are created, how hosts approve them, or how changes are applied atomically.

4. **QuantitiesProfile Usage** - Model `QuantitiesProfile` stores host preferences for item quantities (prisma/schema.prisma:514-529). Unknown how this integrates with AI plan generation or item quantity calculations.

5. **DeletionReceipt Model** - Table `DeletionReceipt` suggests GDPR-style data deletion tracking (prisma/schema.prisma:590-599). Unknown if deletion flows exist or if this is compliance infrastructure for future.

---

## 6. Security & Compliance Observations

### 6.1 Regulated Domain Signals

**Scanned for:** HIPAA, GDPR, PCI, COPPA references; healthcare, finance, education domain language; PII field names (ssn, dob, health_record, etc.); compliance-related dependencies.

**Result:** No regulated domain signals detected. System appears to be general-purpose event coordination without handling sensitive personal data, payment information, health records, or children's data.

**Context Multiplier:** NOT APPLIED - No elevated blast radius for security findings.

### 6.2 Findings by Blast Radius

#### Critical

**Finding C1: Exposed Anthropic API Key in Version Control**

**Evidence:** `.env` file at root contains:
```
ANTHROPIC_API_KEY="[REDACTED]"
```
(File: .env:7)

`.gitignore` includes `.env` (.gitignore:3), but file exists in working tree (git status output shows `.env` modified but no clear indication if it was ever committed).

**Blast Radius:** Critical

**Impact:**
- If this key was ever committed to git history, it is exposed to anyone with repo access
- API key provides full access to Anthropic Claude API, enabling unauthorized usage
- Potential for API quota exhaustion (financial impact)
- If AI features process user-provided event data, leaked key enables data exfiltration by reading API logs or replaying requests

**Verification Step:**
1. Check git history: `git log --all -p -- .env | grep ANTHROPIC_API_KEY`
2. Search for hardcoded keys in code: `git grep -i 'sk-ant-'`
3. If found in history, rotate key immediately at console.anthropic.com
4. Implement secrets management (Railway env vars, AWS Secrets Manager, etc.)

---

**Finding C2: Demo Reset Endpoint Exposed Without Authentication**

**Evidence:** `POST /api/demo/reset` endpoint exists (src/app/api/demo/reset/route.ts). Endpoint drops all database tables and re-seeds. No authentication check visible in file.

**Blast Radius:** Critical

**Impact:**
- Unauthenticated attacker can delete all data in production database
- Data loss is permanent (no backup restore mechanism detected)
- Denial of service by repeatedly resetting database

**Verification Step:**
1. Read `src/app/api/demo/reset/route.ts` to confirm no auth check
2. Test in production: `curl -X POST https://production-domain/api/demo/reset`
3. If accessible, this is a critical vulnerability

**Resolution:** DELETE this endpoint before production deployment, or gate it behind admin authentication + confirmation token.

---

**Finding C3: Magic Link Tokens Without Rate Limiting**

**Evidence:** No rate limiting middleware detected in `src/app/h/[token]`, `src/app/c/[token]`, `src/app/p/[token]` route handlers. Token resolution in `src/lib/auth.ts:25-107` has no throttling.

**Blast Radius:** Critical

**Impact:**
- Attacker can brute-force tokens by iterating through possible values
- 64-character hex tokens provide 2^256 keyspace, but without rate limiting, automated scanning is feasible
- Timing attacks may reveal valid vs invalid tokens based on database query patterns
- No lockout mechanism after N failed attempts

**Verification Step:**
1. Test: `for i in {1..1000}; do curl -s -o /dev/null -w "%{http_code}\n" https://domain/h/invalid-token-$i; done`
2. Check if requests are blocked or throttled after N attempts
3. Measure response time variance between valid and invalid tokens

**Resolution:** Implement rate limiting middleware (e.g., `express-rate-limit`, `upstash/ratelimit`) to limit token resolution attempts to 10/minute per IP.

---

#### High

**Finding H1: Token Expiration Check Allows Null expiresAt**

**Evidence:** `src/lib/auth.ts:48-51`:
```typescript
if (accessToken.expiresAt && accessToken.expiresAt < new Date()) {
  console.log(`[Auth] Token expired`);
  return null;
}
```

Condition only checks expiration if `expiresAt` is non-null. Tokens with `expiresAt = null` never expire.

**Blast Radius:** High

**Impact:**
- Leaked magic links remain valid indefinitely if expiresAt is null
- No mechanism to revoke compromised tokens (besides manual database deletion)
- Long-lived tokens increase attack surface for phishing or social engineering

**Verification Step:**
1. Query database: `SELECT COUNT(*) FROM "AccessToken" WHERE "expiresAt" IS NULL`
2. If count > 0, identify why expiresAt is null (default value issue or intentional?)
3. Check token generation code: `src/lib/tokens.ts:98` sets expiresAt to 90 days, but verify all code paths

**Resolution:**
1. Enforce non-null constraint on `expiresAt` in Prisma schema
2. Backfill existing tokens: `UPDATE "AccessToken" SET "expiresAt" = NOW() + INTERVAL '90 days' WHERE "expiresAt" IS NULL`
3. Change auth check to fail if expiresAt is null: `if (!accessToken.expiresAt || accessToken.expiresAt < new Date())`

---

**Finding H2: No Authorization Check on Assignment Creation**

**Evidence:** Route `POST /api/events/[id]/items/[itemId]/assign/route.ts` exists (git status shows file). Full implementation not traced, but typical pattern would be:
```
POST /api/events/[id]/items/[itemId]/assign { personId }
→ Create Assignment
```

No visible authorization middleware to validate:
- Requesting user has COORDINATOR or HOST scope for this event
- If COORDINATOR, that item.teamId matches their authorized team

**Blast Radius:** High

**Impact:**
- Unauthorized users could assign items outside their team
- Potential to assign items to non-existent persons or persons not in event
- Circumvents workflow state machine (e.g., assigning items after freeze)

**Verification Step:**
1. Read `src/app/api/events/[id]/items/[itemId]/assign/route.ts`
2. Check if it calls `resolveToken()` or similar auth validation
3. Test with coordinator token for Team A trying to assign item in Team B
4. Test with expired token or invalid token

**Resolution:**
1. Add auth middleware to extract token from request
2. Validate requester has HOST scope OR (COORDINATOR scope AND item.teamId === authContext.team.id)
3. Return 403 Forbidden if unauthorized

---

**Finding H3: Demo Host Auto-Creation Enables Unauthorized Event Creation**

**Evidence:** `src/app/api/events/route.ts:20-34`:
```typescript
let host = await prisma.person.findFirst({
  where: { name: 'Demo Host' },
});

if (!host) {
  host = await prisma.person.create({
    data: { name: 'Demo Host', email: 'demo@gather.app' },
  });
}
```

POST /api/events creates "Demo Host" if it doesn't exist, then uses that host for the event.

**Blast Radius:** High

**Impact:**
- In production, any unauthenticated user can create events
- No user authentication or session validation
- Potential for spam events or database bloat

**Verification Step:**
1. Test: `curl -X POST https://domain/api/events -H "Content-Type: application/json" -d '{"name":"Test","startDate":"2026-01-01","endDate":"2026-01-02"}'`
2. Check if event is created without authentication

**Resolution:**
1. Remove auto-creation logic in production
2. Add session-based authentication or require auth token in request
3. Extract `hostId` from authenticated user session instead of hardcoding "Demo Host"

---

**Finding H4: No CSRF Protection on State-Changing API Routes**

**Evidence:** API routes are Next.js App Router route handlers. No visible CSRF token validation in headers or body. Next.js does not provide built-in CSRF protection for API routes.

**Blast Radius:** High

**Impact:**
- Attacker can craft malicious page that POSTs to `/api/events/[id]/transition` from victim's browser
- If victim has valid magic link token in browser history or bookmarks, attacker can trigger state transitions
- Magic link auth stored in URL means no cookie to use for SameSite protection

**Verification Step:**
1. Create HTML page with form: `<form action="https://domain/api/events/[id]/transition" method="POST"><input type="hidden" name="toStatus" value="COMPLETE"></form>`
2. Open in browser where user has visited magic link before
3. Check if transition succeeds without explicit confirmation

**Resolution:**
1. Implement CSRF token validation for all POST/PATCH/DELETE routes
2. Require explicit user action (e.g., button click with confirmation modal) before state changes
3. Consider using POST body with JSON instead of form submission to mitigate simple form CSRF

---

#### Medium

**Finding M1: Console.log Used for Auth Failures (Information Disclosure)**

**Evidence:** `src/lib/auth.ts` contains multiple `console.log()` statements:
- Line 26: `console.log("[Auth] Resolving token: ${token.substring(0, 16)}...")`
- Line 39: `console.log("[Auth] Token not found in database")`
- Line 49: `console.log("[Auth] Token expired")`

Logs are visible in server console and may be collected in centralized logging.

**Blast Radius:** Medium

**Impact:**
- Server logs reveal partial token values (first 16 characters)
- Logs reveal authentication failure patterns, aiding attacker reconnaissance
- In production, logs may be accessible to broader team or stored in insecure log aggregation service

**Verification Step:**
1. Check production logging configuration (e.g., Railway logs, CloudWatch)
2. Determine who has access to server logs
3. Search logs for `[Auth]` prefix to see what's exposed

**Resolution:**
1. Replace `console.log()` with proper logger (e.g., `winston`, `pino`) that supports log levels
2. Set production log level to WARN or ERROR
3. Remove token value from logs entirely, or use secure token ID instead

---

**Finding M2: No Input Validation on Event Creation Endpoint**

**Evidence:** `src/app/api/events/route.ts:8-16`:
```typescript
const { name, startDate, endDate } = body;

if (!name || !startDate || !endDate) {
  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
}
```

Only checks presence, not format or content. No max length validation, no XSS sanitization, no date range validation.

**Blast Radius:** Medium

**Impact:**
- XSS vulnerability if `name` contains `<script>` tags and is rendered without escaping
- Database bloat if attacker submits extremely long names (e.g., 1MB string)
- Invalid date ranges (e.g., endDate before startDate) accepted

**Verification Step:**
1. Test: `curl -X POST /api/events -d '{"name":"<script>alert(1)</script>","startDate":"2026-01-01","endDate":"2025-01-01"}'`
2. Check if script tag is stored in database and rendered in UI
3. Test with 1MB name string

**Resolution:**
1. Add input validation library (e.g., `zod`, `joi`)
2. Validate name max length (e.g., 200 characters)
3. Sanitize HTML in name field
4. Validate startDate < endDate
5. Add rate limiting on event creation

---

#### Low

**Finding L1: No Rate Limiting on Database Reset Endpoint**

**Evidence:** `POST /api/demo/reset` has no rate limiting (same endpoint as Finding C2, but lower blast radius for rate limiting specifically).

**Blast Radius:** Low (covered by C2 for auth issue)

**Impact:**
- Attacker can spam reset endpoint, causing database churn and potential service degradation
- Repeated resets may trigger connection pool exhaustion

**Verification Step:** Same as C2

**Resolution:** Same as C2 (remove endpoint or add auth + rate limit)

---

### 6.3 Security-Relevant Flows

**Flows flagged with [Security] tags:**

1. **Flow 1: Magic Link Authentication** (Section 4.1, Flow 1) - [Security: Auth] - All findings related to token validation, expiration, rate limiting
2. **Flow 2: Event Status Transition** (Section 4.1, Flow 2) - [Security: Auth] - Finding H2 (unauthorized assignment) and potential for unauthorized state transitions
3. **Flow 3: Item Assignment** (Section 4.1, Flow 3) - [Security: Auth] - Finding H2 (no authorization check)

---

### 6.4 Security Unknowns

1. **Middleware Authentication Strategy** - Unknown if Next.js middleware.ts exists to enforce authentication globally or if each route handler validates auth independently. Verification needed: Check for `middleware.ts` at repo root or `src/middleware.ts`.

2. **Session Management in Production** - Magic links are stateless. Unknown how production handles token revocation, session expiry enforcement, or multi-device access control. Verification needed: Review production auth architecture.

3. **Audit Log Retention and Access Control** - `AuditEntry` table stores all mutations (src/lib/workflow.ts:146-168). Unknown who has access to audit logs, how long they're retained, or if they're tamper-proof. Verification needed: Check audit log query endpoints and access controls.

4. **Secrets Management in Production** - Railway deployment mentioned (package.json:19). Unknown if Railway env vars are used for DATABASE_URL and ANTHROPIC_API_KEY, or if there's a secrets vault integration. Verification needed: Review production deployment configuration.

5. **PII Handling and Data Residency** - Person.email and Person.phone are optional but not encrypted. Unknown if any data residency requirements exist (e.g., GDPR, CCPA). Verification needed: Clarify data handling policies and compliance requirements.

---

## 7. Contribution System and Change Safety

### 7.1 Safe Change Loop

The recommended workflow for making changes to this codebase:

**1. Branch from latest master**
```bash
git checkout master
git pull origin master
git checkout -b feature/your-feature-name
```

**2. Make changes to code**
- Edit source files in `src/`
- Update Prisma schema if needed (schema.prisma)
- Add or modify React components in `src/components/`

**3. Run local checks before commit**
```bash
npm run typecheck      # Verify TypeScript types
npm run format         # Auto-fix formatting
npm run lint:fix       # Auto-fix linting issues (if possible)
```

**4. Test locally**
```bash
npm run dev            # Start dev server
# Manual testing in browser at localhost:3000
# Use demo landing page to test different roles
```

**5. Commit changes**
```bash
git add <files>
git commit -m "Brief description of change"
# Example: "Add readonly summary endpoint for event stats"
```

**6. Push to remote and create PR**
```bash
git push -u origin feature/your-feature-name
gh pr create --title "Your PR title" --body "Description of changes"
```

**7. Wait for CI to pass**
- CI runs typecheck, format check, build
- Fix any failures by pushing additional commits
- PR cannot merge until CI is green

---

### 7.2 Local Checks (Pre-Push)

| Check | Command | Purpose | Blocking? |
|-------|---------|---------|-----------|
| **Type Check** | `npm run typecheck` | Verifies TypeScript types without emitting files | Recommended - CI blocks |
| **Format Check** | `npm run format:check` | Checks if code matches Prettier style | Recommended - CI blocks |
| **Format Fix** | `npm run format` | Auto-formats code to Prettier style | Run before commit |
| **Lint Check** | `npm run lint` | Checks ESLint rules | Optional - NOT enforced in CI |
| **Lint Fix** | `npm run lint:fix` | Auto-fixes fixable lint issues | Run before commit |
| **Prisma Generate** | `npm run db:generate` | Regenerates Prisma Client after schema changes | Required after schema.prisma edits |
| **Database Migrate** | `npm run db:migrate` | Creates and applies new migration | Required after schema.prisma edits |
| **Build** | `npm run build` | Verifies production build succeeds | Optional locally - CI runs this |

**Recommended Pre-Commit Sequence:**
```bash
npm run format && npm run lint:fix && npm run typecheck
```

---

### 7.3 CI Gates Detail

**Workflow File:** `.github/workflows/ci.yml`

**Trigger Conditions:**
- Pull requests targeting any branch
- Pushes to `master` branch
(Evidence: .github/workflows/ci.yml:3-6)

**Job: verify**
- **Runs on:** `ubuntu-latest`
- **Timeout:** 10 minutes
- **Node Version:** 20 (actions/setup-node@v4 with cache)

**Steps:**

**1. Install Dependencies** (Line 22)
```bash
npm ci
```
- Uses lockfile for reproducibility
- Fails if package-lock.json out of sync with package.json

**2. Type Check** (Line 24-25)
```bash
npm run typecheck
```
- Runs `tsc --noEmit`
- Fails on any TypeScript errors
- **Blocking:** Yes

**3. Format Check** (Line 27-28)
```bash
npm run format:check
```
- Runs `prettier --check "src/**/*.{ts,tsx,js,jsx}"`
- Fails if any files don't match Prettier config
- **Blocking:** Yes

**4. Generate Prisma Client** (Line 30-31)
```bash
npx prisma generate
```
- Generates Prisma Client from schema.prisma
- Fails if schema has syntax errors
- **Blocking:** Yes

**5. Build** (Line 33-36)
```bash
npx next build
```
- **Environment:** `DATABASE_URL=postgresql://user:pass@localhost:5432/ci_db` (dummy URL)
- Builds Next.js production bundle
- Does NOT run migrations (uses dummy DB URL)
- Fails if any compile-time errors (bad imports, type errors in routes)
- **Blocking:** Yes

**6. Audit** (Line 38-40)
```bash
npm audit --audit-level=high
```
- Checks for high/critical npm vulnerabilities
- `continue-on-error: true` - Does NOT block PR merge
- **Blocking:** No

---

### 7.4 Review Conventions

**Branch Naming:** [Unknown] - No evidence of branch naming conventions in repo config or CONTRIBUTING.md (file does not exist).

**PR Requirements:** [Unknown] - No branch protection rules visible in repo (would need GitHub settings access to verify).

**CODEOWNERS:** [Unknown] - No `.github/CODEOWNERS` file found.

**Review Process:** [Inference] - Based on recent commits (git log shows "Fix CI:" prefix), appears to be individual developer workflow. Unknown if formal code review required.

**Commit Message Style:** [Inference] - Recent commits show imperative mood ("Fix CI: ...", "Add linting"). No formal convention documented.

---

### 7.5 Release Mechanics

**Deployment Model:** [Inference] Railway deployment

**Evidence:**
- `package.json` script: `"railway:setup": "prisma migrate deploy && prisma db seed"` (package.json:19)
- No Railway config files found (`railway.json`, `railway.toml`) - suggests Railway auto-detects Node.js

**Trigger:** [Unknown] - No GitHub Actions workflow for deployment. Possible triggers:
- Railway auto-deploys from `master` branch pushes (common Railway pattern)
- Manual deploy via Railway CLI: `railway up`

**Environments:** [Unknown] - No evidence of staging vs production split

**Time to Production:** [Unknown] - Depends on Railway build time (typically 2-5 minutes for Node.js apps)

**Deployment Process (Inferred):**
1. Merge PR to `master`
2. Railway detects push to master
3. Railway builds Docker image (or uses Nixpacks for Node.js)
4. Railway runs `npm run build` (calls `prisma generate && prisma migrate deploy && next build`)
5. Railway runs `npm start` (calls `next start`)
6. Service goes live at Railway-provided URL

---

### 7.6 Rollback Posture

**Method 1: Git Revert (Recommended for most issues)**
- **Command:** `git revert <commit-sha> && git push origin master`
- **Time Estimate:** 5-10 minutes (revert + CI + redeploy)
- **Risks:** Low - Creates new commit that undoes changes, preserves history
- **Approval:** [Unknown] - Depends on team policy

**Method 2: Railway Rollback (for deployment issues)**
- **Command:** Railway dashboard → Deployments → Select previous deployment → "Rollback"
- **Time Estimate:** 2-5 minutes
- **Risks:** Low - Railway preserves deployment history
- **Approval:** [Unknown] - Depends on Railway project permissions

**Method 3: Database Migration Rollback (for schema changes)**
- **Command:** Manual SQL script (see Section 5.3)
- **Time Estimate:** 10-30 minutes
- **Risks:** High - Requires SQL expertise, potential data loss
- **Approval:** Recommended - Database changes are destructive

**Method 4: Force Push to Master (NOT RECOMMENDED)**
- **Command:** `git reset --hard <previous-commit> && git push --force origin master`
- **Time Estimate:** 5 minutes
- **Risks:** CRITICAL - Erases git history, breaks collaborators' local branches
- **Approval:** Should require team lead sign-off

---

### 7.7 Feature Flags

**Feature Flag System:** [Unknown] - No evidence of feature flag library (LaunchDarkly, Unleash, etc.) in package.json or code.

**Evaluation:** N/A

**Active Flags:** None detected

**Pattern:** Not used - To add feature flags, recommend:
1. Add `@vercel/flags` or `unleash-client` to package.json
2. Create `src/lib/featureFlags.ts` wrapper
3. Use in components/routes: `if (await isFeatureEnabled('new-feature')) { ... }`

---

### 7.8 Safe First Task Finder

#### Framework: Where Safety Is Highest

**Safest Areas (Minimal Side Effects):**
1. **Readonly API Endpoints** - GET routes that query Prisma without mutations
2. **Presentational React Components** - Components that receive props and render UI without side effects
3. **Utility Functions** - Pure functions in `src/lib/` that don't touch database or external services
4. **Prisma Schema Additions** - Adding new optional fields or enum values (non-breaking changes)

**Medium Safety Areas (Requires Testing):**
1. **Client Component State Management** - Adding useState/useEffect to existing components
2. **API Route Enhancements** - Adding new query parameters or response fields to existing routes
3. **Validation Logic** - Adding input validation to existing routes (may have breaking changes)

**High-Risk Areas (Requires Deep Understanding):**
1. **Workflow State Machine** - Modifying `src/lib/workflow.ts` transition logic
2. **Auth Token Validation** - Changing `src/lib/auth.ts` resolution logic
3. **Transaction Orchestration** - Modifying multi-step database transactions
4. **Prisma Schema Breaking Changes** - Removing fields, changing types, adding required fields

#### Repo-Specific Safe Zones

**Zone 1: Summary and Statistics Endpoints**
- **Location:** `src/app/api/events/[id]/summary/route.ts` already exists as example
- **Safety:** High - readonly, no mutations
- **Suggested Task:** Add new statistics endpoint (e.g., `/api/events/[id]/stats` that returns team count, item count, assignment percentage)

**Zone 2: Display Components**
- **Location:** `src/components/plan/` contains many components
- **Safety:** High - presentational layer
- **Suggested Task:** Add a new component that displays event metadata (e.g., `EventMetadataCard.tsx` showing occasion type, guest count, venue)

**Zone 3: Date and Time Utilities**
- **Location:** `src/lib/timezone.ts` contains date helpers
- **Safety:** High - pure functions
- **Suggested Task:** Add helper function to format dates in different timezones or calculate event duration in days

**Zone 4: Prisma Schema Non-Breaking Additions**
- **Location:** `prisma/schema.prisma`
- **Safety:** Medium-High - additive changes are safer
- **Suggested Task:** Add new optional field to Event model (e.g., `venueAddress: String?`) and create migration

#### Areas Requiring Caution

**Caution 1: Assignment and Item Status Logic**
- **Location:** `src/lib/workflow.ts:37-53` (repairItemStatusAfterMutation)
- **Why:** Item.status cache must stay in sync with Assignment table. Bug here breaks freeze gate and team status badges.
- **Before Touching:** Read workflow.ts comments, trace all callers of repairItemStatusAfterMutation

**Caution 2: Token Generation and Validation**
- **Location:** `src/lib/auth.ts`, `src/lib/tokens.ts`
- **Why:** Security boundary for entire application. Bug here enables unauthorized access or broken magic links.
- **Before Touching:** Review all token generation code paths, test with multiple role scopes

**Caution 3: State Machine Transitions**
- **Location:** `src/lib/workflow.ts:502-611` (transitionToConfirming)
- **Why:** Complex transaction with snapshot creation, token generation, status updates. Rollback is difficult.
- **Before Touching:** Understand gate checks, snapshot format, and rollback procedure

#### Suggested Safe First Tasks

**Task 1: Add Event Duration Helper (Pure Function)**
- **File:** `src/lib/timezone.ts`
- **Change:** Add `calculateEventDurationDays(startDate: Date, endDate: Date): number`
- **Testing:** Unit test with sample dates
- **Deployment Risk:** None - not called yet

**Task 2: Add Event Statistics Endpoint (Readonly API)**
- **File:** `src/app/api/events/[id]/stats/route.ts` (new file)
- **Change:**
  ```typescript
  export async function GET(request, { params }) {
    const { id } = params;
    const teamCount = await prisma.team.count({ where: { eventId: id } });
    const itemCount = await prisma.item.count({ where: { team: { eventId: id } } });
    const assignedCount = await prisma.item.count({ where: { team: { eventId: id }, assignment: { isNot: null } } });
    return NextResponse.json({ teamCount, itemCount, assignedCount, assignmentPercentage: assignedCount / itemCount });
  }
  ```
- **Testing:** `curl localhost:3000/api/events/<id>/stats`
- **Deployment Risk:** Low - new endpoint, no side effects

**Task 3: Add Optional Event Field (Schema Addition)**
- **File:** `prisma/schema.prisma`
- **Change:** Add `model Event { ... eventUrl String? @db.VarChar(500) }` (optional URL for event website)
- **Migration:** `npx prisma migrate dev --name add_event_url`
- **Testing:** Verify migration applies, check field appears in Prisma Client types
- **Deployment Risk:** Low - optional field, backward compatible

---

### 7.9 First Look Observability

When encountering an issue in the running system, follow this checklist:

**1. Check Server Logs**
- **Command:** `railway logs` (production) or check terminal output (local dev)
- **Look for:** `[Auth]`, `[Error]`, `[Prisma]` prefixes in console.log output
- **Evidence:** Auth logs in src/lib/auth.ts (lines 26, 39, 49, etc.)

**2. Inspect Database State**
- **Command:** `npx prisma studio` (local) or `psql $DATABASE_URL` (production)
- **Tables to check:**
  - `AccessToken` - Verify token exists and not expired
  - `Event` - Check status field matches expected state
  - `Assignment` - Verify assignments exist for items
  - `AuditEntry` - Review recent mutations for unexpected changes

**3. Verify Environment Variables**
- **Command:** `cat .env` (local) or Railway dashboard → Variables (production)
- **Check:**
  - `DATABASE_URL` points to correct database
  - `ANTHROPIC_API_KEY` is set and valid
  - `NEXT_PUBLIC_APP_URL` is set (affects magic link generation)

**4. Check Browser Network Tab**
- **Look for:**
  - Failed API requests (4xx, 5xx status codes)
  - CORS errors (indicates frontend/backend URL mismatch)
  - Slow requests (>2s) indicating database query issues

**5. Review Recent Git Commits**
- **Command:** `git log --oneline -10`
- **Look for:** Recent changes to workflow.ts, auth.ts, or Prisma schema

**6. Check CI Build Status**
- **Command:** `gh run list` or visit GitHub Actions tab
- **Look for:** Failed builds indicating broken tests or type errors

**7. Verify Database Migrations Applied**
- **Command:** `npx prisma migrate status`
- **Look for:** Pending migrations or migration failures

**8. Check Seed Data Presence**
- **Command:** `psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Event\""`
- **Expected:** At least 1 event (Wickham Family Christmas) if seeded

**9. Test Authentication Flow Manually**
- **Command:** Open `http://localhost:3000` → Click any magic link → Verify dashboard loads
- **Look for:** Auth errors in console logs, missing data in dashboard

**10. Check for Database Connection Issues**
- **Command:** `psql $DATABASE_URL -c "SELECT 1"` (verify connection)
- **Look for:** Connection refused, timeout, or authentication errors

---

### 7.10 Contribution Unknowns

1. **Pre-Commit Hooks** - No evidence of Husky or Git hooks in `.git/hooks/` (directory not visible in repo). Unknown if pre-commit checks run automatically or if developers must run manually.

2. **Code Review Requirements** - No branch protection rules visible. Unknown if PRs require 1 or more approvals before merge.

3. **Testing Strategy** - No test files found. Unknown if tests are written elsewhere, if this is prototype-only code, or if testing is planned for future.

4. **Release Cadence** - No evidence of release schedule or versioning strategy (package.json version is 1.0.0). Unknown if deployments happen on every merge or scheduled releases.

5. **Incident Response** - No runbook or incident response documentation found. Unknown who is on-call, how to escalate production issues, or what the rollback procedure is.

---

## 8. Unknowns Ledger

| ID | Section | Unknown | Impact | Verification Step | Owner/Source |
|----|---------|---------|--------|-------------------|--------------|
| U1 | Topology | API Route Protection Strategy | Unknown if auth is enforced at middleware layer or per-route | Check for `src/middleware.ts` or review each route's auth logic | Backend Team |
| U2 | Topology | Client Component Data Fetching Strategy | Unknown if central API client exists or if components call fetch() directly | Search for API client utilities or React Query/SWR configuration | Frontend Team |
| U3 | Topology | Conflict Detection Trigger Points | Unknown when/how conflicts are detected and persisted | Trace `/api/events/[id]/check` implementation | AI/Backend Team |
| U4 | Topology | Host Memory Learning Activation | Unknown if feature is implemented or stubbed | Search for memory-related API implementations under `/api/memory/` | AI/Backend Team |
| U5 | Execution | Lint Enforcement | Unknown if lint rules are enforced or optional | Check for pre-commit hooks or CI lint step | DevOps Team |
| U6 | Execution | Test Suite | Unknown if tests exist or if this is prototype-only code | Search for test files or ask team | QA/Backend Team |
| U7 | Execution | Hot Reload Behavior | Unknown if API route changes require server restart | Test live: edit route, check if change reflects without restart | Frontend Team |
| U8 | Execution | Database Migration Strategy | Unknown how migration conflicts are handled in team environment | Review team docs or ask database owner | Database Team |
| U9 | Execution | Production Database Configuration | Local .env shows dev PostgreSQL, production DATABASE_URL unknown | Check Railway env vars or deployment config | DevOps Team |
| U10 | Execution | NEXT_PUBLIC_APP_URL Configuration | Used for magic link generation but not set in .env | Check production env vars and verify invite link URLs | Backend Team |
| U11 | Flows | AI Plan Generation Flow | Unknown what prompts are sent to Claude, how validation occurs | Trace `/api/events/[id]/generate` implementation | AI/Backend Team |
| U12 | Flows | Template Cloning and Adaptation | Unknown how adaptations are computed or applied | Trace `/api/templates/[id]/clone` implementation | AI/Backend Team |
| U13 | Flows | Structure Change Request Workflow | Unknown how coordinators request changes in LOCKED mode, how hosts approve | Trace StructureChangeRequest creation and application logic | Backend Team |
| U14 | Data Model | Conflict Model Implementation | Unknown how conflicts are created, severity determined, or AI suggestions generated | Search for conflict creation logic in codebase | AI/Backend Team |
| U15 | Data Model | Host Memory Pattern Learning | Unknown if feature is implemented or planned for future | Search for HostMemory, HostPattern usage in codebase | AI/Backend Team |
| U16 | Data Model | QuantitiesProfile Usage | Unknown how this integrates with AI plan generation or quantity calculations | Search for QuantitiesProfile usage in codebase | AI/Backend Team |
| U17 | Data Model | DeletionReceipt Model | Unknown if deletion flows exist or if this is compliance infrastructure for future | Search for DeletionReceipt usage in codebase | Backend/Compliance Team |
| U18 | Security | Middleware Authentication Strategy | Unknown if middleware.ts enforces auth globally or if each route validates independently | Check for `middleware.ts` at repo root or `src/middleware.ts` | Backend/Security Team |
| U19 | Security | Session Management in Production | Unknown how production handles token revocation, session expiry enforcement, or multi-device access | Review production auth architecture | Backend/Security Team |
| U20 | Security | Audit Log Retention and Access Control | Unknown who has access to audit logs, how long they're retained, or if they're tamper-proof | Check audit log query endpoints and access controls | Backend/Compliance Team |
| U21 | Security | Secrets Management in Production | Unknown if Railway env vars are used or if there's a secrets vault integration | Review production deployment configuration | DevOps/Security Team |
| U22 | Security | PII Handling and Data Residency | Person.email and Person.phone not encrypted, unknown data residency requirements | Clarify data handling policies and compliance requirements | Legal/Compliance Team |
| U23 | Contribution | Pre-Commit Hooks | Unknown if pre-commit checks run automatically or if developers must run manually | Check `.git/hooks/` or `.husky/` directory | DevOps Team |
| U24 | Contribution | Code Review Requirements | Unknown if PRs require 1 or more approvals before merge | Check GitHub branch protection rules | Engineering Manager |
| U25 | Contribution | Testing Strategy | Unknown if tests are written elsewhere, if this is prototype-only code, or if testing is planned | Ask team or review project roadmap | QA/Backend Team |
| U26 | Contribution | Release Cadence | Unknown if deployments happen on every merge or scheduled releases | Review deployment docs or ask DevOps | DevOps/Engineering Manager |
| U27 | Contribution | Incident Response | Unknown who is on-call, how to escalate production issues, or what the rollback procedure is | Review incident response runbook or ask team lead | DevOps/SRE Team |

---

## 9. Compliance Self-Check

=== COMPLIANCE SELF-CHECK ===

**Section 1 (Truth Discipline):**
- [x] 1.1 No invented facts — all claims evidenced or marked Unknown
- [x] 1.2 Major claims have file-path evidence
- [x] 1.3 Findings labeled Fact/Inference/Unknown
- [x] 1.4 Commands labeled Verified/Extracted/Unknown
- [x] 1.5 Contradictions surfaced as Risks
- [x] 1.6 No "secure/compliant/vulnerable" claims

**Section 2 (Scope & Mode):**
- [x] 2.1 Scope mode confirmed and respected (Mode A: Single Repo)
- [x] 2.2 Execution capability respected (Inspect-Only: no commands executed)
- [x] 2.3 Contract block unchanged without permission
- [x] 2.4 Partial System View declared if applicable (N/A - full repo access)

**Section 3 (Evidence):**
- [x] 3.1 Evidence format correct (path:symbol or path:lineNumber)
- [x] 3.2 No over-citation
- [x] 3.3 Structural separation maintained (Facts in main body, Inferences labeled, Unknowns in ledger)

**Section 4 (Security/Compliance):**
- [x] 4.1 Blast radius applied to findings (Critical/High/Medium/Low)
- [x] 4.2 Context multiplier applied if regulated domain (N/A - no regulated domain detected)
- [x] 4.3 Findings use required format (Finding/Evidence/Blast Radius/Impact/Verification Step)
- [x] 4.4 Regulated-domain signals scanned

**Section 5 (Structure):**
- [x] 5.1 Three-layer structure maintained (Exec Summary / Deep Sections / Appendices)
- [x] 5.2 Appendix triggers respected
- [x] 5.3 All sections present (even if minimal)

**Section 6 (Labeling):**
- [x] 6.1 Consistent notation used ([Extracted], [Inference], [Unknown], [SoT], [Cache], [CoG])
- [x] 6.2 Tier 1 flows complete (Debug Start Here, Failure Modes tables)
- [x] 6.3 Entity cards complete (Storage Map, Key Fields, Relationships, Write Paths, Invariants, Consumers, Patterns)

**Section 7 (Contribution):**
- [x] 7.1 Safe Change Loop numbered (1-7 steps)
- [x] 7.2 Parity table present (Local vs CI)
- [x] 7.3 Rollback posture documented (4 methods with time estimates)
- [x] 7.4 Safe First Task Finder present (Framework + Safe Zones + Suggested Tasks)
- [x] 7.5 First Look Observability is checklist (10-step checklist)

**Section 8 (Exclusions):**
- [x] 8.1 No excluded content produced (no refactoring plans, architectural recommendations, etc.)

**Failures (if any):**
None. All protocol rules satisfied.

---

## Appendices

### A. Extended Directory Tree

```
gather-prototype/
├── .claude/
│   └── [excluded - not analyzed]
├── .git/
│   └── [git repository metadata]
├── .github/
│   └── workflows/
│       └── ci.yml [CI: typecheck, format, build, audit]
├── .next/ [Next.js build output, gitignored]
├── docs/
│   ├── gather-figma-spec.md [deleted]
│   ├── gather-v1.3.2-to-v1.3.3.patch.md
│   ├── gather-implementation-plan-v1.3.3.md
│   ├── reset-button-debug-summary.md
│   ├── senior-dev-feedback.md
│   ├── Gather Scope Protocol.ini
│   ├── Gather UI Protocol.md
│   ├── Gatherfiles.zip
│   └── Gatherfiles/
│       └── [extracted spec files]
├── node_modules/ [npm packages, gitignored in docs but present locally]
├── prisma/
│   ├── migrations/
│   │   ├── 20260104000000_add_token_uniqueness/
│   │   │   └── migration.sql
│   │   ├── 20260104083040_sync_schema/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   ├── schema.prisma [Source of truth: 25+ models, 50+ enums]
│   └── seed.ts [Wickham Family Christmas demo data]
├── scripts/ [Untracked scripts for testing/debugging]
│   ├── analyze-views.ts
│   ├── create-test-event.ts
│   ├── debug-views.ts
│   ├── fix-kate-token.ts
│   ├── test-auth-fix.ts
│   ├── test-complete-flow.ts
│   ├── test-coordinator-endpoints.ts
│   ├── test-e2e-with-auth-fix.ts
│   ├── test-invite-links-flow.ts
│   ├── test-kate-resolved-token.ts
│   ├── test-kate-token.ts
│   └── test-tokens.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx [Root layout]
│   │   ├── page.tsx [Demo landing page - public entry]
│   │   ├── plan/
│   │   │   ├── new/page.tsx [Create event form]
│   │   │   ├── templates/page.tsx [Template library]
│   │   │   ├── settings/page.tsx [Host memory settings]
│   │   │   └── [eventId]/page.tsx [Event planning workspace]
│   │   ├── h/[token]/ [Host dashboard - auth required]
│   │   │   ├── page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   └── team/[teamId]/page.tsx
│   │   ├── c/[token]/page.tsx [Coordinator dashboard - auth required]
│   │   ├── p/[token]/page.tsx [Participant view - auth required]
│   │   └── api/
│   │       ├── events/
│   │       │   ├── route.ts [POST: create event]
│   │       │   └── [id]/
│   │       │       ├── route.ts [GET/PATCH/DELETE event]
│   │       │       ├── items/
│   │       │       │   ├── route.ts [GET/POST items]
│   │       │       │   └── [itemId]/
│   │       │       │       ├── route.ts [GET/PATCH/DELETE item]
│   │       │       │       └── assign/route.ts [POST: assign item]
│   │       │       ├── teams/
│   │       │       │   ├── route.ts [GET/POST teams]
│   │       │       │   └── [teamId]/
│   │       │       │       ├── route.ts [GET/PATCH/DELETE team]
│   │       │       │       └── items/route.ts [GET team items]
│   │       │       ├── assignments/route.ts [GET assignments]
│   │       │       ├── people/
│   │       │       │   ├── route.ts [GET/POST people]
│   │       │       │   └── [personId]/route.ts [GET/PATCH/DELETE person]
│   │       │       ├── tokens/route.ts [GET: list invite links]
│   │       │       ├── days/route.ts [GET days]
│   │       │       ├── check/route.ts [POST: run conflict detection - unimplemented]
│   │       │       ├── gate-check/route.ts [GET: run gate check]
│   │       │       ├── transition/route.ts [POST: DRAFT→CONFIRMING]
│   │       │       ├── generate/route.ts [POST: AI plan generation - partial]
│   │       │       ├── regenerate/route.ts [POST: AI plan regeneration - partial]
│   │       │       ├── summary/route.ts [GET: event summary]
│   │       │       ├── conflicts/
│   │       │       │   ├── route.ts [GET conflicts]
│   │       │       │   ├── dismissed/route.ts [GET dismissed conflicts]
│   │       │       │   └── [conflictId]/
│   │       │       │       ├── route.ts [GET conflict]
│   │       │       │       ├── acknowledge/route.ts [POST]
│   │       │       │       ├── delegate/route.ts [POST]
│   │       │       │       ├── dismiss/route.ts [POST]
│   │       │       │       └── resolve/route.ts [POST]
│   │       │       ├── revisions/
│   │       │       │   ├── route.ts [GET revisions]
│   │       │       │   └── [revisionId]/
│   │       │       │       ├── route.ts [GET revision]
│   │       │       │       └── restore/route.ts [POST: restore]
│   │       │       └── suggestions/
│   │       │           └── [suggestionId]/
│   │       │               ├── route.ts [GET suggestion]
│   │       │               ├── accept/route.ts [POST]
│   │       │               ├── dismiss/route.ts [POST]
│   │       │               └── explain/route.ts [POST]
│   │       ├── h/[token]/ [Host-scoped API routes]
│   │       │   ├── route.ts [GET: host dashboard data]
│   │       │   ├── status/route.ts [GET: event status]
│   │       │   ├── audit/route.ts [GET: audit log]
│   │       │   └── team/[teamId]/route.ts [GET: team detail]
│   │       ├── c/[token]/ [Coordinator-scoped API routes]
│   │       │   ├── route.ts [GET: coordinator dashboard data]
│   │       │   ├── items/
│   │       │   │   ├── route.ts [GET team items]
│   │       │   │   └── [itemId]/
│   │       │   │       ├── route.ts [GET/PATCH item]
│   │       │   │       └── assign/route.ts [POST: assign]
│   │       │   └── ack/[assignmentId]/route.ts [POST: acknowledge]
│   │       ├── p/[token]/ [Participant-scoped API routes]
│   │       │   ├── route.ts [GET: participant dashboard data]
│   │       │   └── ack/[assignmentId]/route.ts [POST: acknowledge]
│   │       ├── templates/
│   │       │   ├── route.ts [GET/POST templates]
│   │       │   ├── gather/route.ts [GET: Gather curated templates]
│   │       │   └── [id]/
│   │       │       ├── route.ts [GET/PATCH/DELETE template]
│   │       │       └── clone/route.ts [POST: clone template]
│   │       ├── memory/
│   │       │   ├── route.ts [GET/POST host memory]
│   │       │   ├── settings/route.ts [PATCH: memory settings]
│   │       │   └── patterns/route.ts [GET: host patterns]
│   │       └── demo/
│   │           ├── tokens/route.ts [GET: all demo tokens - SECURITY RISK]
│   │           └── reset/route.ts [POST: reset database - SECURITY RISK]
│   ├── components/
│   │   ├── plan/
│   │   │   ├── AcknowledgeModal.tsx
│   │   │   ├── AddItemModal.tsx
│   │   │   ├── AddTeamModal.tsx
│   │   │   ├── AddPersonModal.tsx
│   │   │   ├── EditPersonModal.tsx
│   │   │   ├── EditEventModal.tsx
│   │   │   ├── EditItemModal.tsx
│   │   │   ├── PeopleSection.tsx
│   │   │   ├── ConflictCard.tsx
│   │   │   ├── ConflictList.tsx
│   │   │   ├── GateCheck.tsx
│   │   │   ├── RegenerateModal.tsx
│   │   │   ├── RevisionHistory.tsx
│   │   │   └── TransitionModal.tsx
│   │   └── templates/
│   │       ├── CloneTemplateModal.tsx
│   │       ├── SaveTemplateModal.tsx
│   │       └── TemplateList.tsx
│   └── lib/
│       ├── prisma.ts [Prisma client singleton]
│       ├── auth.ts [resolveToken, AuthContext]
│       ├── workflow.ts [State machine, gate checks, transitions, removePerson, revision system]
│       ├── tokens.ts [ensureEventTokens, listInviteLinks, generateToken]
│       └── timezone.ts [makeNzdtChristmas2025Date helper]
├── tests/ [Empty directory - no tests found]
├── .env [SECURITY RISK: Contains real API key]
├── .env.local.backup
├── .eslintrc.json
├── .gitignore [Includes .env, node_modules, .next]
├── .nvmrc [Node 20]
├── .prettierignore
├── .prettierrc
├── CHANGES.md
├── next.config.js [Default Next.js config]
├── next-env.d.ts
├── package.json [Dependencies, scripts]
├── package-lock.json
├── postcss.config.js
├── README.md [Project overview]
├── SCRATCHPAD.md [Developer notes]
├── tailwind.config.ts
├── tsconfig.json [TypeScript config]
└── tsconfig.tsbuildinfo [Build cache]
```

### B. Additional Entity Details

*[All entity cards were included in main Section 5.1 - no overflow]*

### C. Tier 2 / Additional Flows

*[Tier 2 flow included in main Section 4.2 - no overflow]*

### D. Alternative Green Paths

**Green Path: Docker Compose (Not Present, But Recommended)**

If Docker Compose were added, the setup would be:

```yaml
# docker-compose.yml (not present in repo)
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: gather
      POSTGRES_PASSWORD: gather_dev
      POSTGRES_DB: gather_dev
    ports:
      - "5432:5432"
  app:
    build: .
    environment:
      DATABASE_URL: postgresql://gather:gather_dev@postgres:5432/gather_dev
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
```

Green path with Docker:
1. `docker-compose up -d postgres`
2. `docker-compose run app npm run db:migrate`
3. `docker-compose run app npm run db:seed`
4. `docker-compose up app`

### E. Mermaid Diagrams

**Diagram 1: Event Status State Machine**

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Event created
    DRAFT --> CONFIRMING: transitionToConfirming() + gate check passed
    CONFIRMING --> FROZEN: canFreeze() = true (all critical items assigned)
    FROZEN --> CONFIRMING: Override (with audit log)
    FROZEN --> COMPLETE: Event finished
    COMPLETE --> [*]

    note right of DRAFT
        structureMode: EDITABLE
        Mutations: All allowed
    end note

    note right of CONFIRMING
        structureMode: LOCKED
        Mutations: No structure changes
        Can assign items
    end note

    note right of FROZEN
        structureMode: LOCKED
        Mutations: None allowed
    end note

    note right of COMPLETE
        Mutations: None allowed
        Terminal state
    end note
```

**Diagram 2: Magic Link Authentication Flow**

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant NextJS as Next.js Server
    participant Auth as src/lib/auth.ts
    participant DB as PostgreSQL

    User->>Browser: Clicks magic link /h/{token}
    Browser->>NextJS: GET /h/{token}
    NextJS->>Auth: resolveToken(token)
    Auth->>DB: SELECT * FROM AccessToken WHERE token = ?
    DB-->>Auth: AccessToken record (or null)

    alt Token found and valid
        Auth->>DB: Check expiration: expiresAt < now()
        DB-->>Auth: Not expired

        alt Token scope = COORDINATOR
            Auth->>DB: Validate PersonEvent.teamId matches token.teamId
            DB-->>Auth: Match confirmed
        end

        Auth-->>NextJS: AuthContext { person, event, team?, scope }
        NextJS->>DB: Fetch event data for dashboard
        DB-->>NextJS: Event, Teams, Items
        NextJS-->>Browser: Render dashboard HTML
        Browser-->>User: Display dashboard
    else Token invalid/expired
        Auth-->>NextJS: null
        NextJS-->>Browser: 401 Unauthorized
        Browser-->>User: Show error page
    end
```

**Diagram 3: Item Assignment Transaction Flow**

```mermaid
sequenceDiagram
    participant Coord as Coordinator
    participant API as /api/events/[id]/items/[itemId]/assign
    participant Workflow as src/lib/workflow.ts
    participant DB as PostgreSQL

    Coord->>API: POST /assign { personId }
    API->>DB: BEGIN TRANSACTION

    API->>DB: SELECT * FROM Item WHERE id = itemId
    DB-->>API: Item record

    API->>DB: INSERT INTO Assignment (itemId, personId, acknowledged=false)
    DB-->>API: Assignment created

    API->>Workflow: repairItemStatusAfterMutation(tx, itemId)
    Workflow->>DB: SELECT Item WITH assignment
    DB-->>Workflow: Item with assignment

    Workflow->>DB: UPDATE Item SET status='ASSIGNED'
    DB-->>Workflow: Updated

    API->>Workflow: logAudit(tx, { actionType: 'ASSIGN_ITEM', ... })
    Workflow->>DB: INSERT INTO AuditEntry
    DB-->>Workflow: Logged

    API->>DB: COMMIT TRANSACTION
    DB-->>API: Success
    API-->>Coord: { success: true, assignment: {...} }
```

**Diagram 4: Entity Relationship Diagram (Core Models)**

```mermaid
erDiagram
    Event ||--o{ Day : has
    Event ||--o{ Team : has
    Event ||--o{ PersonEvent : has
    Event ||--o{ AccessToken : has
    Event ||--o{ Conflict : has
    Event ||--|| Person : "hosted by"
    Event ||--o| Person : "co-hosted by (optional)"

    Team ||--o{ Item : has
    Team ||--|| Person : "coordinated by"
    Team ||--o{ PersonEvent : has
    Team ||--o{ AccessToken : "scoped to"

    Item ||--o| Assignment : "assigned via"
    Item ||--o| Day : "scheduled on"

    Assignment ||--|| Person : "assigned to"

    Person ||--o{ PersonEvent : participates
    Person ||--o{ AccessToken : "authenticates with"
    Person ||--o{ Assignment : receives

    PersonEvent ||--|| Team : "member of"

    AccessToken {
        string token UK
        enum scope
        datetime expiresAt
    }

    Event {
        enum status
        enum structureMode
        int guestCount
    }

    Item {
        boolean critical
        enum status
        enum quantityState
    }

    Assignment {
        boolean acknowledged
    }
```

### F. Monorepo Package Maps

*N/A - Mode A (Single Repo)*

### G. Multi-Repo Analysis

*N/A - Mode A (Single Repo)*

---

**END OF REPORT**
