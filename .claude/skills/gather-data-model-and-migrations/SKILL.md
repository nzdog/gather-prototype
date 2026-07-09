---
name: gather-data-model-and-migrations
description: Load when touching prisma/schema.prisma, writing or debugging a Prisma migration, deleting rows (Team/Person/Event/Household), investigating vanished data or FK errors (P2003/P2022/P3005), choosing between db:migrate/db:migrate:deploy/db:reset, or inspecting the gather_dev Postgres database. Keywords - schema, migration, cascade, onDelete, SetNull, AccessToken unique, EventSetup JSONB, seed, psql.
---

# Gather Data Model & Migrations

Guided tour of `prisma/schema.prisma` plus the migration runbook and the scars behind it. All counts and line numbers verified against the repo (as of 2026-07-09).

Jargon, defined once:

- **Prisma** — the ORM. Schema lives in `prisma/schema.prisma`; migrations are timestamped SQL folders under `prisma/migrations/`.
- **Cascade / SetNull / Restrict** — referential actions on foreign keys (FKs). Cascade = deleting the parent deletes children. SetNull = children survive, FK column set to NULL. Restrict = parent delete fails while children exist. Prisma defaults when `onDelete` is omitted: **Restrict** for required relations, **SetNull** for optional ones.
- **GTC-NNN** — a ticket in `docs/tickets/GTC-NNN.md`. Every change needs one (see gather-change-control).
- **V1 / V2** — legacy dashboard vs the "Moments" host journey; both live in the same route (see gather-architecture-contract).
- **JSONB** — Postgres JSON columns, mapped as `Json?` in Prisma.

## When NOT to use this skill

| Your task | Load instead |
|---|---|
| Understanding Moments, roles trichotomy, conflicts, NZ product rules | gather-domain-reference |
| Ticket process, do-not-touch zones, commit discipline | gather-change-control |
| Prompts, token budgets, AI call caps, plan generation | gather-ai-generation |
| Fresh environment setup, preflight, env vars | gather-build-and-env |
| Running the app, seeds-for-tickets, tokens/URLs, Stripe CLI | gather-run-and-operate |
| Symptom-first debugging of app behaviour | gather-debugging-playbook |
| Full incident history with commit hashes | gather-failure-archaeology |

**Hard rule (GATHER-BUILD-CONSTANTS.md, do-not-touch zone 5):** never hand-edit, delete, or reorder migration files. Zone 3 covers the AccessToken/scope system; zone 2 covers MagicLink/Session/User. Schema changes to those models need explicit ticket authorisation.

## Ground facts (as of 2026-07-09)

- **31 models** in `prisma/schema.prisma` (`grep -c '^model ' prisma/schema.prisma`).
- **29 migrations** in `prisma/migrations/` — first `20260119083345_init`, latest `20260708081323_drop_generated_data_and_structure_change_request`.
- Database: **PostgreSQL** via `DATABASE_URL` (dev example: `postgresql://user@localhost:5432/gather_dev` per `.env.example`).
- `prisma/migrations_sqlite_broken_backup/` — SQLite-era migrations parked during the SQLite→PostgreSQL revert (commit 17e7021). Tracked in git as history only; Prisma never reads it. Never move anything back out of it.

## Model inventory (31 models)

### Core event graph

| Model | Purpose | Key relations / uniques |
|---|---|---|
| Event | Root aggregate: status machine (DRAFT→CONFIRMING→FROZEN→COMPLETE), guest counts, dietary, venue, Stripe payment fields, many V1 instrumentation columns | host/coHost → Person; `stripePaymentIntentId` unique; `sharedLinkToken` unique |
| Day | Named day within a multi-day event | event (Cascade); has Items |
| Team | Responsibility bucket ("Mains", "Drinks"); domain enum + coordinator | event (Cascade); coordinator → Person |
| Person | Global person record (email unique, phone, SMS opt-out flags, nudge timestamps) | email unique; may link to User |
| PersonEvent | Person's membership in one event: role (HOST/COORDINATOR/PARTICIPANT), reachabilityTier, rsvpStatus, householdRole, teamId | `@@unique([personId, eventId])`; team is **SetNull** (GTC-147) |
| Household | Groups PersonEvents; littleCount for children | event (Cascade); members = PersonEvent[] |
| Item | A thing to bring/do; source GENERATED/TEMPLATE/MANUAL/HOST_EDITED; quantityLabel CALCULATED/HEURISTIC/PLACEHOLDER; status ASSIGNED/UNASSIGNED is a **cache — never a safety gate** (query Assignment instead, see src/lib/workflow.ts) | team (Cascade); day optional; `@@index([teamId, displayOrder])` |
| Assignment | Who is bringing an Item; response PENDING/ACCEPTED/DECLINED | `itemId` unique (1:1 with Item, Cascade); person → **no cascade (Restrict)** |
| EventSetup | V2 Moment 2 Step 1 brief — one row per event, JSONB per section (see below) | `eventId` unique; event (Cascade) |
| Conflict | Deterministic plan-check finding (type/severity/claimType); status OPEN/RESOLVED/DISMISSED/ACKNOWLEDGED/DELEGATED | event (Cascade); `@@index([eventId, status])` |
| Acknowledgement | Host's recorded acceptance of a Conflict with mitigation plan | conflict + event (both Cascade) |

### Auth & access (do-not-touch zones 2 and 3)

| Model | Purpose | Key relations / uniques |
|---|---|---|
| User | Login identity, billingStatus | email unique |
| Session | Cookie-backed session | token unique; user (Cascade) |
| MagicLink | Email login token | token unique |
| EventRole | User's session-level role per event (HOST/COHOST/COORDINATOR) | `@@unique([userId, eventId])` |
| AccessToken | URL-token access for /h/ /c/ /p/ routes; scope HOST/COORDINATOR/PARTICIPANT | **`@@unique([eventId, personId, scope, teamId])`** (schema.prisma:294); event+person Cascade, team no action |

Caveat on that unique: Postgres unique indexes treat NULLs as distinct, so rows with `teamId = NULL` (host/participant tokens) are not deduplicated by the constraint itself — token-issuing code must find-before-create. (Standard Postgres semantics; stated as a caveat, not an observed bug.)

Note the **three separate role axes** — PersonEvent.role, EventRole.role, AccessToken.scope — a constant confusion source. Full explanation in gather-domain-reference.

### Billing

| Model | Purpose | Status |
|---|---|---|
| Subscription | Stripe subscription mirror per User | **Vestigial.** Live model is per-event payment: `Event.stripePaymentIntentId/paidAt/amountPaid`. The Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) handles only `checkout.session.completed` / `payment_intent.*` — no subscription events. `syncSubscriptionFromStripe` in `src/lib/billing/sync.ts` has no callers; `src/app/api/billing/*` routes still read the table. Do not build on it without a ticket confirming direction. |

### History & audit

| Model | Purpose | Key relations |
|---|---|---|
| PlanRevision | Full JSON snapshot of teams/items/days/conflicts per revision; Event.currentRevisionId points at one | event (Cascade) |
| PlanSnapshot | Phase snapshot (only phase: CONFIRMING) captured at transition | event (Cascade) |
| AuditEntry | Action log per event | event (Cascade); actor → Person, **no cascade (Restrict)** |

### Comms & instrumentation

| Model | Purpose | Key relations |
|---|---|---|
| InviteEvent | Instrumentation log of invite/nudge/SMS lifecycle (18 InviteEventType values) | event (Cascade); person optional |
| SmsOptOut | Legal opt-out registry per phone+host — do-not-touch zone 7 | `@@unique([phoneNumber, hostId])`; host (Cascade) |
| NudgeLog | Scheduled/sent nudges per PersonEvent | personEvent (Cascade) — **this is why PersonEvent deletion erases nudge history** |
| WrapUpLink | Post-event wrap-up message links | event + person **Restrict** (no onDelete) — see trap below |

### Learning & templates (largely unimplemented — do not build on without a ticket)

| Model | Purpose | Reality check (verified by grep) |
|---|---|---|
| HostMemory (+HostPattern, HostDefault, DismissedSuggestion) | Host learning/preferences; learningEnabled defaults false | Referenced only by `src/app/api/memory/*` routes and `src/app/plan/settings/page.tsx`; product surface unshipped |
| DeletionReceipt | GDPR-ish record of memory deletion | Only `src/app/api/memory/route.ts` |
| StructureTemplate | Saved/curated plan templates | Only `src/app/api/templates/*` + `src/components/templates/CloneTemplateModal.tsx` (V1-era surface) |
| QuantitiesProfile | Spec'd quantity-ratio learning | Referenced only from the memory/templates surface; effectively unbuilt |

### Other vestigial ground (verify before building on any of these)

- **Item.displayOrder** — populated (append-to-end logic in `src/app/api/events/[id]/teams/[teamId]/items/route.ts`) and used for sorting, and the PATCH route accepts it, but **no reorder UI exists**. Added in migration `20260418093439_add_item_display_order`.
- **Event.isLegacy** — read only in `src/app/api/events/route.ts`.
- **Event.structureMode** (EDITABLE/LOCKED/CHANGE_REQUESTED) — still read in `src/app/api/events/route.ts` and `src/lib/workflow.ts`, but the StructureChangeRequest model backing CHANGE_REQUESTED was dropped by GTC-152. The enum value is orphaned.
- Many Event columns are V1 funnel instrumentation (checkPlanInvocations, blindAccept, madeAnyEditBeforeCheckPlan, transitionAttempts, …). Check for live readers before extending them.

## Cascade semantics — the scars

### Full onDelete map (grep `onDelete` in prisma/schema.prisma; 28 explicit declarations)

| Deleting a… | Cascades away | SetNull | Restrict blocks (explicit or by default) |
|---|---|---|---|
| Event | Day, Team, PersonEvent, Household, InviteEvent, AccessToken, EventRole, AuditEntry, Conflict, Acknowledgement, PlanRevision, PlanSnapshot, EventSetup — and transitively Items (via Team), Assignments (via Item), NudgeLogs (via PersonEvent) | — | **WrapUpLink (ON DELETE RESTRICT)** |
| Team | **Item** (and each Item's Assignment) | **PersonEvent.teamId → NULL** (GTC-147) | — |
| PersonEvent | **NudgeLog** (nudge history gone) | — | — |
| Person | PersonEvent (→ NudgeLog), AccessToken, SmsOptOut (as host), HostMemory (+children) | — | Assignment.person, AuditEntry.actor, WrapUpLink.person (all Restrict) |
| Item | Assignment | — | — |
| Conflict | Acknowledgement | — | — |
| User | Session, Subscription, EventRole | — | Person.user is optional/no action (Person survives) |
| HostMemory | HostPattern, HostDefault, DismissedSuggestion | — | — |

Optional relations with no `onDelete` (Prisma default SetNull): Item.day, InviteEvent.person, AccessToken.team, PersonEvent.household, PersonEvent.proxy, Team.coordinator, Event.coHost/clonedFrom/currentRevision/planSnapshotAtConfirming.

### Scar 1 — GTC-147: PersonEvent.team was Cascade (the story)

Until 2026-07-08, `PersonEvent.team` declared `onDelete: Cascade`. Deleting any Team therefore deleted the PersonEvent row of everyone placed on it — removing them **from the event entirely**: household membership, RSVP state, and (via the NudgeLog cascade) their whole nudge history. Six team-deletion call sites existed and none relied on the cascade; two were live landmines (V1 delete-team endpoint; regenerate's team deleteMany). RED demo on the seeded DB: deleting one 7-member team dropped the event from 43 → 36 PersonEvents.

Fix: one-line schema change to `onDelete: SetNull` + migration `20260708005434_change_person_event_team_set_null` (single FK constraint swap, generated with `--create-only` and reviewed). Verification script: `tests/verify-personevent-team-setnull.ts` (destructive; dev DB only). Full write-up: `docs/tickets/GTC-147.md`, commit da6c007.

**Lessons encoded:** (1) audit every delete call site before trusting a cascade; (2) generate risky migrations with `--create-only` and read the SQL before applying; (3) `prisma db pull --print` omitting `onDelete` on an optional relation means SetNull — that's Prisma's default, not drift.

### Scar 2 — Household edit is delete-and-recreate (live, known, campaign target)

`PUT /api/events/[id]/households/[householdId]` (`src/app/api/events/[id]/households/[householdId]/route.ts`) **deletes all non-primary PersonEvent rows** (line ~156) and recreates members via find-or-create. Deliberate ("simpler than diffing"), but every household edit:

- wipes each member's `teamId` and role (recreated as PARTICIPANT, no team),
- **cascades their NudgeLog history away**,
- leaves Assignments pointing at Person rows no longer in the event,
- creates a brand-new Person row for any member without an email, every edit.

Do NOT extend or copy this pattern. Do NOT "fix" it ad hoc — it is a flagged phase of the reconciliation campaign (see gather-v1-v2-reconciliation-campaign). If your change touches household editing, raise it in the ticket first.

### Scar 3 — latent Restrict traps (verified in schema/migration SQL, not yet observed live)

- **WrapUpLink.eventId is ON DELETE RESTRICT** (`prisma/migrations/20260407010613_add_wrapup_link_model/migration.sql:48`) and the event-deletion transaction (`src/app/api/events/[id]/route.ts:195-255`) does **not** delete WrapUpLink rows. Deleting an event that has dispatched wrap-up links should fail with a FK error. UNVERIFIED at runtime — if you hit P2003 deleting an event, this is why.
- **Assignment.person is Restrict** — you cannot delete a Person who holds assignments without clearing them first.

## EventSetup JSONB columns (V2 Step 1 brief)

One row per event (`eventId` unique). Columns (schema.prisma:938-964): `eventType`/`eventTypeOther` (strings), then JSONB per accordion section: `mainsData`, `sidesData`, `dessertsData`, `drinksData`, `setupCleanupData`, `dietaryData`, `otherNotes` (string), GTC-133's `setUpData`/`cleanUpData`/`otherJobsOtherData` (shape `{ freeText, stillDeciding }`), and `extendedCategoriesData` (keyed by config category, e.g. `entree_starters`, for the 9 categories without dedicated columns).

**GTC-152 (2026-07-08) dropped** `EventSetup.generatedData` and the entire `StructureChangeRequest` model plus its two enums — migration `20260708081323_drop_generated_data_and_structure_change_request` (5 statements, both objects empty). Older docs (`docs/moment-1-and-2-build-report.md`, `docs/moment-2-flow-document.md`) still describe generatedData and the per-section architecture — they are stale; trust `docs/tickets/GTC-146.md` and `gather-v1-v2-brief.md` instead.

Valid `eventType` values come from `src/lib/ai/plan-option-tree-config.json` via `CONFIG_EVENT_TYPES` — never hardcode an allowlist (GTC-151: a hardcoded list silently 400'd autosave for ~82% of event types and lost Step 1 data).

## Migration runbook

### Commands (package.json, verified)

| Command | Runs | Use when | Danger |
|---|---|---|---|
| `npm run db:migrate` | `prisma migrate dev` | Dev: create + apply a migration after editing schema.prisma; also regenerates the client | Prompts for DB reset if it detects drift — read the prompt, never blind-confirm |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | CI/prod/drifted DBs: apply pending migrations only, no generation, no prompts | Safe; also runs inside `npm run build` |
| `npm run db:generate` | `prisma generate` | Regenerate the Prisma client without touching the DB (e.g. after pull) | None |
| `npm run db:seed` | `tsx prisma/seed.ts` | Re-seed only | Adds rows; doesn't wipe |
| `npm run db:reset` | `prisma migrate reset` | Rebuild dev DB from scratch | **DESTRUCTIVE: drops all data**, re-applies all migrations, re-runs seed. Never against a shared/prod DATABASE_URL |

### Discipline (binding; GATHER-BUILD-CONSTANTS.md zone 5)

1. **Never** hand-edit migration SQL, delete, or reorder migration folders.
2. One migration per schema change, in the same commit as the schema edit and the ticket.
3. For anything risky (FK changes, drops), generate with `npx prisma migrate dev --name <snake_case_name> --create-only`, **read the SQL**, then apply with `npm run db:migrate`. This is the house pattern (GTC-147, GTC-152 both did it).
4. **Never `prisma db push`** in this repo. It changes the DB without a migration file — that exact move caused CHORE-001 (below).
5. State a rollback in the ticket (GTC-147's was "re-alter the constraint back"; GTC-152's was "re-add nullable column / recreate empty table").

### The repair pattern (when schema and migrations diverge)

History, so you recognise it: `Event.isDemo` was added via `db push` with no migration → production `POST /api/events` 500'd with Prisma **P2022** (column does not exist) → fix was a hand-named catch-up migration `20260313000000_add_is_demo` containing just the missing `ALTER TABLE` (commit e475def, "CHORE-001"). Same pattern at 826e3fe for the Stripe payment fields (`20260304000000_add_stripe_payment_fields`). Those two folders have hand-picked `000000` timestamps — an artifact of the repair, **not** a pattern to imitate.

If you find the DB ahead of migration history: **STOP first** — this is Stop Condition 7 / KB-002 territory ("do not attempt to resolve during bug fix tickets unless the ticket explicitly authorises a migration fix with rollback plan"). Get an explicitly authorised chore ticket with a rollback plan, THEN write a catch-up migration that adds exactly the missing DDL, apply with `db:migrate:deploy`, and commit migration + ticket together. Do not reset, do not edit old migrations, do not repair drift mid-bug-ticket.

### P3005 drift — resolved history (KB-002)

From GTC-002 until 2026-03-14, the dev/prod DB had schema applied outside migration history: `prisma migrate deploy` errored **P3005**, `prisma migrate dev` prompted for reset. **Resolved 2026-03-14 by baselining** — `prisma migrate status` clean, `migrate dev` safe since (GATHER-KNOWN-BEHAVIOURS.md, KB-002). GATHER-BUILD-CONSTANTS.md still carries the old warning text in its preflight section — KNOWN-BEHAVIOURS is the newer word. If drift reappears: stop, consult KB-002, and treat it as its own chore ticket with rollback plan. Never `migrate reset` to make drift go away.

## Inspecting the dev DB

Prisma quotes PascalCase table names — always double-quote them in SQL. Substitute your real `DATABASE_URL` (dev default shape: `postgresql://user@localhost:5432/gather_dev`).

```bash
# Migration state (first thing to check on any DB weirdness)
npx prisma migrate status

# GUI browser
npx prisma studio

# Recent events
psql "$DATABASE_URL" -c 'SELECT id, name, status, "isDemo", "guestCount", "createdAt" FROM "Event" ORDER BY "createdAt" DESC LIMIT 10;'

# Tokens for one event (join to person; note the 4-column unique)
psql "$DATABASE_URL" -c 'SELECT t.scope, t."teamId", p.name, t.token FROM "AccessToken" t JOIN "Person" p ON p.id = t."personId" WHERE t."eventId" = '"'"'EVENT_ID'"'"';'

# People in an event with team + household + RSVP (spot GTC-147-class damage)
psql "$DATABASE_URL" -c 'SELECT p.name, pe.role, pe."teamId", pe."householdId", pe."rsvpStatus", pe."reachabilityTier" FROM "PersonEvent" pe JOIN "Person" p ON p.id = pe."personId" WHERE pe."eventId" = '"'"'EVENT_ID'"'"';'

# Verify a live FK's referential action (the GTC-147 verification trick)
psql "$DATABASE_URL" -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'PersonEvent_teamId_fkey';"

# Applied-migration ledger (Prisma's own bookkeeping table)
psql "$DATABASE_URL" -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;'
```

Destructive verification scripts (e.g. `tests/verify-personevent-team-setnull.ts`) run only against a re-seedable dev DB.

### Seed drift trap (live bug, as of 2026-07-09)

`prisma/seed.ts:282` creates event **"Henderson Family Christmas 2026"** but the demo routes/tests still look up **"…2025"** — demo session/token endpoints fail against a fresh seed. Known name-drift bug; the canonical six-location table and fix shape live in `gather-config-and-flags` section 7. If you touch it, fix all sites under one ticket. Also KB-004: the default seed creates a CONFIRMING (not DRAFT) event.

## Provenance and maintenance

Re-verify in seconds before trusting any volatile fact above:

```bash
# Model count (expect 31) and migration count (expect 29) — as of 2026-07-09
grep -c '^model ' prisma/schema.prisma
ls -d prisma/migrations/*/ | wc -l

# Latest migration name
ls prisma/migrations | tail -2

# Full onDelete map
grep -n 'onDelete' prisma/schema.prisma

# AccessToken unique constraint
grep -n '@@unique(\[eventId, personId, scope, teamId\])' prisma/schema.prisma

# EventSetup columns
sed -n '/^model EventSetup/,/^}/p' prisma/schema.prisma

# db:* scripts
grep '"db:' package.json

# Household delete-and-recreate still present?
grep -n 'deleteMany' 'src/app/api/events/[id]/households/[householdId]/route.ts'

# WrapUpLink still Restrict / event-delete tx still skips it?
grep -rn 'ON DELETE' prisma/migrations/20260407010613_add_wrapup_link_model/migration.sql
grep -n 'wrapUpLink' 'src/app/api/events/[id]/route.ts'

# Seed-name drift still live?
grep -rn 'Henderson Family Christmas' prisma/seed.ts src/app/api/demo/

# Subscription still vestigial? (webhook should show no customer.subscription cases)
grep -n 'case ' src/app/api/webhooks/stripe/route.ts
grep -rn 'syncSubscriptionFromStripe' src/ | grep -v 'lib/billing/sync.ts'

# Migration doctrine source of truth
grep -n -A3 'Prisma Migrations' GATHER-BUILD-CONSTANTS.md
grep -n -A12 'KB-002' GATHER-KNOWN-BEHAVIOURS.md
```
