---
name: gather-architecture-contract
description: Load before changing any core Gather behavior — routes under src/app/plan or src/app/api, auth/middleware, event status transitions, AI generation entry points, roles/tokens, payments, or households. Explains the load-bearing design decisions (V1/V2 coexistence, single-call AI, session isolation, Item.status cache) and the invariants that MUST hold, with why each exists and what breaks if violated. Also load when confused by "why are there two of these?" symptoms: two prompt paths, three role fields, duplicate dashboards on one route.
---

# Gather Architecture Contract

The load-bearing decisions in this codebase, why they were made, and the invariants
you must not break. Every claim below was re-verified against the repo on 2026-07-09.
Line numbers are "(as of 2026-07-09)" and may drift — re-check with the commands in
"Provenance and maintenance" before relying on them.

**Jargon, defined once:**

| Term | Meaning |
|---|---|
| V1 | Legacy host dashboard + wizard UI at `/plan/[eventId]` (still live) |
| V2 / "Moments" | Redesigned host journey (Moment 1 households → Moment 2 AI plan → …) entered via `?setup=true` on the SAME route |
| God file | `src/app/plan/[eventId]/page.tsx` — one client component rendering both V1 and V2 (3,870 lines as of 2026-07-09) |
| Single-call architecture | One Claude API call generates the entire plan (GTC-145/146); replaced per-section calls |
| GTC-NNN | Ticket in `docs/tickets/GTC-NNN.md` — the unit of change control |
| EventSetup | Per-event row storing V2 Step 1 brief answers (JSONB columns); its existence marks an event as "V2-created" |
| Token routes | `/p/[token]`, `/h/[token]`, `/c/[token]` pages (participant/host/coordinator) authenticated by URL token, not session cookie |

## When NOT to use this skill

| Your task | Load instead |
|---|---|
| Change process, tickets, commits, do-not-touch zones | `gather-change-control` |
| Product concepts (Moments, households, reachability, NZ rules) | `gather-domain-reference` |
| Editing prompts, token budgets, AI parsing/failure modes | `gather-ai-generation` |
| Schema changes, migrations, cascade semantics | `gather-data-model-and-migrations` |
| Environment setup, dev server, seeds, deploy | `gather-build-and-env`, `gather-run-and-operate` |
| Debugging a live symptom | `gather-debugging-playbook` |
| Executing the V1 retirement / god-file decomposition | `gather-v1-v2-reconciliation-campaign` |
| History of past failures with hashes | `gather-failure-archaeology` |

This skill is the contract: read it BEFORE designing a change that touches any area below.

---

## 1. V1/V2 coexistence map (the central mess — deliberate, not accidental)

**Decision:** V2 was built INSIDE the V1 page component rather than as a new route,
so one URL serves both experiences and events created either way keep working.
There is NO clean cutover.

The map (all in `src/app/plan/[eventId]/page.tsx`, 3,870 lines as of 2026-07-09):

| Mechanism | Location | Behavior |
|---|---|---|
| Entry flag | line 376: `useState(searchParams.get('setup') === 'true')` | `?setup=true` → V2 opening screen |
| V2 render chain | line 1661 `if (showSetup)` → `SetupOpeningScreen` → `showMoment1` → `showMoment2Opening` → `showMoment2Step1` → `showMoment2Step2Skeleton` → plan view | Sequential boolean `useState` flags (lines 376–384), not a router |
| URL cleanup | effect at lines 559–564 strips `?setup=true` after mount | KB-003 trap: `window.history.replaceState` does NOT sync `useSearchParams` — see comment at line 1553 |
| V1 dashboard | everything after the V2 branches in the same component | Renders when no V2 flag is set |
| V2-created marker | `event.setup` (`{ id } \| null`, typed line 218) — existence of the EventSetup row | 13 gating sites (lines 866–3814) hide V1-only UI (History tab, "Generate plan" wizard button, host-description modal) when `event.setup` exists |

**Why it matters:** any UI change to `/plan/[eventId]` can silently affect BOTH
experiences. `event.setup` truthiness is the de-facto V1/V2 discriminator for an
event — there is no explicit `version` field.

**Rules:**
- Before editing the god file, grep for `event.setup` and `event?.setup` and decide
  which branch(es) your change belongs to.
- Do not "fix" the duplicated URL-param handling without reading KB-003 in
  `GATHER-KNOWN-BEHAVIOURS.md` first.
- Decomposing this file is a campaign (`gather-v1-v2-reconciliation-campaign`), not
  a drive-by refactor. Do not extract components opportunistically while doing an
  unrelated ticket.

## 2. The single-call AI decision (GTC-145/146) — do not regress

**Decision:** plan generation for V2 Moment 2 is exactly ONE Claude call per
finalize (`src/app/api/events/[id]/finalize-plan/route.ts`, single
`callClaudeForJSON` at line 233 as of 2026-07-09).

**Why per-section failed (Apr–May 2026, ~3 weeks of rework):** the previous
architecture fired one call per accordion-close. Each section was generated in
isolation, so the model never saw the whole plan → cross-section duplication
(same dessert in Cake AND Dessert), category contamination, parallel "dietary
alternatives" bloat, and encyclopedic over-generation (86 items for a 17-person
Christmas). Measured result of the single-call experiment: 86 → 25 items.
Full chronicle: `docs/tickets/GTC-145.md` (experiment, commit `a27f781`),
GTC-146 (merge, `e250f64`/`be66454`/`88adeb6`), GTC-152 (dead-code prune).

**Invariant:** whole-plan coherence requires whole-plan context in ONE call.
- What breaks if violated: item duplication and over-generation return; measured
  regression is 3.4x item count.
- Where enforced: `finalize-plan/route.ts` (one call, comment at line 18 explains
  the 20→10 cap reduction). The old per-section route
  `src/app/api/events/[id]/generate-section/route.ts` was first stubbed to 410
  Gone (GTC-145) and then DELETED entirely in GTC-146 (commit `be66454`) — do not
  resurrect it in any form.

**AI call caps** — `Event.aiCallsUsed` (schema line 88), checked as
`AI_CALL_LIMIT` locally in each route (NOT centralized). Caps are per-route and
drift (10 vs 20 as of 2026-07-09; the god-file UI copy at lines 2092–2143
hardcodes 10 regardless). Canonical value table: `gather-config-and-flags`
section 4. Re-check before citing: `grep -rn "AI_CALL_LIMIT" src/app/api | sort`.

**Known duplication (weak point, do not widen):** two prompt paths coexist in
`src/lib/ai/prompts.ts`:
- V1 path: `PLAN_GENERATION_SYSTEM_PROMPT` (line 8) + `buildGenerationPrompt`
  (line 277) + regeneration variants — NZ rules HARDCODED in the system prompt text
  (lines 10–20). Used by `/api/events/[id]/generate` and `/regenerate` via
  `src/lib/ai/generate.ts`.
- V2 path: `buildPlanGenerationPrompt` (line 578) — NZ rules injected via
  `getNzNotes()` from `src/lib/ai/config-loader.ts`. Used only by `finalize-plan`.

A change to NZ/cultural rules in one path does NOT propagate to the other. If you
touch either, check both. (See `gather-ai-generation` for how to change prompts safely.)

## 3. INVARIANT — session/token auth isolation (`middleware.ts`)

This is DO-NOT-TOUCH ZONE 1 in `GATHER-BUILD-CONSTANTS.md`. Change only with
explicit founder instruction and a full security re-audit.

**Statement:** the host's `session` cookie and the URL-token views must never
share auth state. `middleware.ts` (116 lines) enforces three layers:

1. **Path-scoped token cookies** — for page routes `/p/`, `/h/`, `/c/`, the URL
   token is stored in `gather_p_token` / `gather_h_token` / `gather_c_token`,
   each scoped to its own path (`TOKEN_PAGE_COOKIES`, line 34; 8-hour maxAge).
   These never collide with the global `session` cookie.
2. **Session-cookie stripping** — for `/api/p/` and `/api/c/` requests, the
   `session` cookie is removed from the forwarded headers
   (`SESSION_STRIP_PREFIXES`, line 45). Those handlers authenticate purely via
   `resolveToken()` (`src/lib/auth.ts:25`).
   **`/api/h/` is INTENTIONALLY excluded** — the host token view calls
   `getUser()` (`src/lib/auth/session.ts:5`) and needs the session cookie present.
   Do not "complete the pattern" by adding `/api/h/` to the strip list.
3. **Never write** — middleware never sets or clears the `session` cookie itself.

**Why:** GTC-001 (commit `c7e60aa`) — opening a participant link in the same
browser overwrote the host's dashboard session (the `session` cookie has path `/`
and rides on every request). Hard-won fix.

**What breaks if violated:** host silently logged out / participant identity
bleeding into host APIs; the exact class of bug that cost the GTC-001 incident.

**Where enforced:** `middleware.ts` (matcher at lines 105–116 limits it to the
five prefixes); guards in `src/lib/auth/guards.ts`; security suite
`npm run test:security` (`tests/security-validation.ts`) — never weaken its
assertions to pass.

## 4. The three role axes (constant confusion source)

Three DIFFERENT models each have a field named `role`/`scope`. They answer
different questions. Verified against `prisma/schema.prisma` (as of 2026-07-09):

| Axis | Model / field | Enum + values | Question it answers | Used by |
|---|---|---|---|---|
| Event membership | `PersonEvent.role` (schema line 154) | `PersonRole`: HOST, COORDINATOR, PARTICIPANT | "What is this person's job within this event's plan?" | Plan logic, team membership, nudges |
| Login-account permission | `EventRole.role` (model line 358) | `EventRoleType`: HOST, COHOST, COORDINATOR | "What can this signed-in USER account do to this event?" | Session-auth routes via `requireEventRole` (`src/lib/auth/guards.ts:48`), `canEditEvent` (`src/lib/entitlements.ts`) |
| Link capability | `AccessToken.scope` (model line 278) | `TokenScope`: HOST, COORDINATOR, PARTICIPANT | "What may the holder of this URL do?" | Token routes via `requireTokenScope` (`guards.ts:98`), `resolveToken` |

Disambiguation rules:
- A `Person` is NOT a `User`. `Person` = anyone in a plan (may have no account).
  `User` = a login account. `PersonEvent` joins Person↔Event; `EventRole` joins
  User↔Event.
- COHOST exists ONLY on `EventRole`. HOST/COHOST checks on API routes mean
  "session-authenticated owner", e.g. `requireEventRole(eventId, ['HOST','COHOST'])`.
- `AccessToken` uniqueness `@@unique([eventId, personId, scope, teamId])` is
  DO-NOT-TOUCH ZONE 3 — token issuance depends on it.
- Never infer one axis from another. A person can be `PersonEvent.role=PARTICIPANT`
  while holding a COORDINATOR-scoped token for one team.

Guard inventory (`src/lib/auth/guards.ts`, as of 2026-07-09): `requireEventRole`
(48), `requireTokenScope` (98), `requireNotFrozen` (138), `requireTeamAccess`
(166), `requireSameTeam` (188), `requireEventRoleOrToken` (218).

## 5. EventStatus state machine + canMutate matrix

Source of truth: `src/lib/workflow.ts` (1,037 lines). Enum `EventStatus`:
DRAFT, CONFIRMING, FROZEN, COMPLETE.

**Transitions** (`canTransition`, workflow.ts:243):

| From \ To | DRAFT | CONFIRMING | FROZEN | COMPLETE |
|---|---|---|---|---|
| DRAFT | same=ok | YES | no | no |
| CONFIRMING | no | same=ok | YES (warnings only — never blocked; reason required <80% compliance) | no |
| FROZEN | no | YES (override, logged) | same=ok | YES |
| COMPLETE | no | no | no | same=ok |

COMPLETE is terminal. `fromStatus === toStatus` always returns true.

**Mutation gating** (`canMutate`, workflow.ts:265; actions: createItem, editItem,
deleteItem, assignItem, addPerson, removePerson):

| Status | Allowed |
|---|---|
| DRAFT | everything |
| CONFIRMING | everything EXCEPT `deleteItem` when the item is `critical` |
| FROZEN | nothing (frozen edits go through the dedicated override route `src/app/api/events/[id]/frozen-edit/route.ts` + `requireNotFrozen(event, allowOverride)`) |
| COMPLETE | nothing, ever |

Gate details you will otherwise rediscover the hard way:
- DRAFT→CONFIRMING does NOT require all items assigned (`runGateCheck`,
  workflow.ts:440).
- **DESIGN DECISION (2026-07-09): CONFIRMING→FROZEN never hard-blocks on
  unassigned items.** This is deliberate and final — hosts may freeze a plan
  with gaps. The transition route
  (`src/app/api/events/[id]/transition/route.ts:88–97`) calls
  `checkFreezeReadiness` (workflow.ts:107), whose result type sets
  `canFreeze: true` always and surfaces WARNINGS only (`UNASSIGNED_ITEMS`,
  `LOW_COMPLIANCE` <80%, `CRITICAL_GAPS`); the only hard requirement is a
  `freezeReason` string when compliance < 80%. History: an unwired hard-count
  gate `canFreeze()` and a comment claiming "coverage is enforced at freeze"
  both suggested a block that never existed — both were removed in GTC-154
  (2026-07-09) once the warnings-only behavior was confirmed intended.
- KB-004: the default seed creates a CONFIRMING event, not DRAFT — don't be
  surprised when a seeded event refuses DRAFT-only mutations.

## 6. INVARIANT — Item.status is a cache; Assignment is the truth

**Statement:** `Item.status` (enum `ItemStatus`: ASSIGNED/UNASSIGNED) is a
denormalized cache of "does an Assignment row exist". NEVER use it for safety
gates or status computation. Query the `Assignment` relation directly.

**Why:** the cache can drift (any mutation path that forgets to update it).
Freeze-readiness warnings and team-status badges are what the host reads to
decide whether the plan is actually ready — a stale cache makes them lie.
(Freeze itself is warnings-only and never hard-blocks — see section 5 — so the
risk is a misleading readout, not a wrong gate decision.)

**What breaks if violated:** the host sees "all assigned" when items have real
gaps (or the reverse); team status badges misreport coverage.

**Where enforced** (all in `src/lib/workflow.ts`, comments are explicit):
- `computeTeamStatusFromItems` (line 33): "Does NOT use cached Item.status".
- `checkFreezeReadiness` (line 107): the live freeze check — its
  UNASSIGNED_ITEMS warning queries `assignment: null`, never Item.status.
  (The dead hard gate `canFreeze()`, which modeled this pattern but had zero
  callers, was removed in GTC-154, 2026-07-09; freezing remains warnings-only
  per section 5. Any FUTURE hard freeze gate must query the Assignment
  relation directly, not Item.status.)
- `repairItemStatusAfterMutation` (line 53): the canonical cache-repair helper —
  call it AFTER assignment mutations, inside the same transaction, never in GET
  routes.

Reality check (as of 2026-07-09): many API routes still write `Item.status`
inline next to their Assignment writes (e.g.
`src/app/api/events/[id]/items/[itemId]/assign/route.ts` lines 105/166) instead
of using the repair helper. When you touch any assignment mutation, keep
Assignment + Item.status in the SAME transaction, or use the helper.

## 7. INVARIANT — multi-table mutations use Prisma transactions

**Statement:** any mutation touching more than one table (or a table plus its
cache/audit trail) runs inside `prisma.$transaction(async (tx) => …)`.

**Why:** status transitions write Event + PlanSnapshot + AccessTokens +
AuditEntry together; person removal unlinks assignments and repairs item status.
A partial write leaves the state machine and its evidence out of sync.

**Where enforced:** `src/lib/workflow.ts` transactions at lines 354
(`removePerson`), 710 (`transitionToConfirming`), 798 (`createRevision`), 890
(`restoreFromRevision`); ~16 API routes use `$transaction` (grep below).
`logAudit` (workflow.ts:289) REQUIRES a `tx` — "All audit logging must happen
inside transactions."

**What breaks if violated:** orphaned assignments, events in CONFIRMING with no
snapshot, audit entries describing writes that rolled back.

**Known violator (weak point, not license):** the household PUT route (section 10)
runs sequential awaits with NO transaction.

## 8. Deterministic (non-LLM) conflict detection — keep it that way

**Decision:** conflict detection (timing clashes, dietary gaps, coverage gaps) is
plain TypeScript over Prisma queries in `src/lib/ai/check.ts` (428 lines, zero
Anthropic imports — verified 2026-07-09). Conflicts carry a `fingerprint` for
dedup/acknowledgement. The ONLY LLM involvement in the conflict subsystem is the
optional resolution SUGGESTION route
(`src/app/api/events/[id]/conflicts/[conflictId]/suggest-resolution/route.ts`),
which costs an AI call against the cap.

**Why:** detection must be reproducible, free, instant, and testable — a host
acknowledges a conflict by fingerprint, which requires stable identity across runs.
An LLM detector would produce different conflicts on every run and burn the
per-event call budget.

**What breaks if violated:** flapping conflicts, broken acknowledgements, cap
exhaustion. Do not "upgrade" check.ts to use Claude.

## 9. Payments: per-event Stripe checkout supersedes Subscription

**Decision (as of 2026-07-09):** creating an event requires a PAID Stripe
checkout session. `POST /api/events` (`src/app/api/events/route.ts` lines 60–85)
rejects without `stripeSessionId`, retrieves the session from Stripe, and rejects
unless `payment_status === 'paid'`. Payment facts live on the Event itself
(`paidAt`, `amountPaid` — schema lines 68–69).

**Vestigial but present:** the `Subscription` model (schema line 311),
`User.billingStatus`, and `src/app/api/billing/*` routes still exist.
`src/lib/entitlements.ts` documents the regime: "Subscription status is
deprecated but kept for migration"; `canCreateEvent` always returns true
(payment is the gate at checkout); `canEditEvent` checks `EventRole`
HOST/COHOST, not payment.

**Rules:** do not build new features on `Subscription`/`billingStatus`; do not
delete them either (Stripe integration is DO-NOT-TOUCH ZONE 4 — real money,
webhook signature verification). Entitlement questions go through
`src/lib/entitlements.ts`.

## 10. Known weak points (stated plainly — handle, don't hide)

Ordered roughly by blast radius. "Open" = no ticket has fixed it as of 2026-07-09.

1. **The god file** — `src/app/plan/[eventId]/page.tsx`, 3,870 lines, 75 `useState`
   occurrences, renders V1 AND V2. Every UI ticket risks cross-contamination.
   Decomposition is the flagship campaign (`gather-v1-v2-reconciliation-campaign`).
   Open.
2. **Household edit = delete-and-recreate** —
   `PUT /api/events/[id]/households/[householdId]`
   (`src/app/api/events/[id]/households/[householdId]/route.ts`): deletes all
   non-primary `PersonEvent` rows (line 156) and recreates members. Consequences:
   team membership wiped, nudge history cascaded away, assignments orphaned;
   members without email get a brand-new `Person` row on every edit (find-or-create
   matches on email only, line 206). Also runs with NO transaction. This was a
   deliberate "simpler than diffing" choice — it is a KNOWN data-loss risk and a
   campaign target. Do not copy this pattern elsewhere. Open.
3. **Dual prompt paths** — V1 and V2 prompts duplicate NZ/cultural rules through
   different mechanisms (section 2). Any prompt-rule change must touch both or
   consciously decide not to. Open.
4. **Magic-string demo event name — LIVE DRIFT** — the seed creates
   "Henderson Family Christmas **2026**" while demo routes/tests/UI copy look
   up "…**2025**", so demo endpoints 404 against a fresh seed. Known
   name-drift bug (confirmed 2026-07-09); canonical six-location table and
   fix shape: `gather-config-and-flags` section 7. Open.
5. **EventSetup-gated UI divergence** — 13 `event.setup` truthiness checks in the
   god file decide which of two UIs a host sees; there is no explicit event
   version field, so "is this a V2 event?" is answered by row-existence. Fragile
   under any future backfill/migration of EventSetup. Open.
6. **AI cap constants duplicated per-route** — `AI_CALL_LIMIT` is a local const in
   5 routes with two different values (10 vs 20), and the UI hardcodes 10. Already
   internally inconsistent (section 2). Open.
7. **Item.status cache written ad hoc** — many routes update the cache inline
   rather than via `repairItemStatusAfterMutation` (section 6). Safe today only
   because reads that matter query Assignment. Open.

House themes behind these (from the failure chronicle — see
`gather-failure-archaeology`): hardcoded-allowlist drift (GTC-151), silent 4xx =
data loss, cascade semantics surprises (GTC-147), token-budget truncation
(GTC-142), one-canonical-source for counts (GTC-136). When your change smells
like one of these, stop and check the chronicle.

## Provenance and maintenance

All facts verified against the working tree on branch `feat/moment-one-redesign`,
2026-07-09. Re-verify before relying on any of them:

```bash
# God file size and V1/V2 flags
wc -l "src/app/plan/[eventId]/page.tsx"
grep -n "setup') === 'true'\|if (showSetup)" "src/app/plan/[eventId]/page.tsx"
grep -cn "event.setup\|event?.setup" "src/app/plan/[eventId]/page.tsx"

# Middleware three layers still intact (strip list must NOT contain /api/h/)
grep -n "TOKEN_PAGE_COOKIES\|SESSION_STRIP_PREFIXES" middleware.ts

# Role axes enums
grep -n "enum PersonRole\|enum EventRoleType\|enum TokenScope" -A 4 prisma/schema.prisma

# State machine + cache invariant
grep -n "canTransition\|canMutate\|NOT Item.status\|repairItemStatusAfterMutation" src/lib/workflow.ts
# canFreeze() removed in GTC-154 — expect ZERO matches (the canFreeze: FIELD on FreezeCheckResult is unrelated and lives on)
grep -rn "canFreeze(" src --include="*.ts" --include="*.tsx"

# Single-call architecture + caps
grep -rn "AI_CALL_LIMIT" src/app/api | sort
grep -n "callClaudeForJSON" "src/app/api/events/[id]/finalize-plan/route.ts"
ls "src/app/api/events/[id]/generate-section" 2>/dev/null   # must NOT exist (deleted in GTC-146)

# Conflict detection still deterministic (expect NO matches)
grep -in "anthropic\|callClaude" src/lib/ai/check.ts

# Payment gate + vestigial Subscription
grep -n "payment_status" src/app/api/events/route.ts
grep -n "model Subscription" prisma/schema.prisma

# Demo-name drift (fixed when all four agree)
grep -rn "Henderson Family Christmas" prisma/seed.ts src/app/api/demo tests/demo-endpoints-test.ts

# Household delete-and-recreate still present
grep -n "deleteMany" "src/app/api/events/[id]/households/[householdId]/route.ts"

# Transactions inventory
grep -rln '\$transaction' src | sort
```

If any command's output contradicts this file, trust the repo, then update this
skill (through normal change control — see `gather-change-control`).
