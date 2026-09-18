---
name: gather-v1-v2-reconciliation-campaign
description: >-
  Load this skill when working on V1/V2 reconciliation in the Gather prototype: retiring the
  legacy dashboard, decomposing the src/app/plan/[eventId]/page.tsx god file, fixing the
  household PUT delete-and-recreate data loss, unifying the duplicate AI prompt paths, or
  deciding whether V1 surfaces can be deleted. Trigger keywords/symptoms: "god file",
  "page.tsx too big", "V1 vs V2", "Moment flow vs dashboard", "household edit wipes team
  membership", "Tier 2 prune", "retire legacy generate/regenerate", "reconciliation review".
---

# Gather V1/V2 Reconciliation Campaign

The flagship, decision-gated campaign to finish the V1→V2 transition. This is the hardest
live problem per the founder (2026-07-09). Work the phases IN ORDER, one ticket per step,
never by eye — every gate is a number.

**Definitions (used throughout):**

| Term | Meaning |
|---|---|
| **V1** | Legacy host dashboard + guided wizard + `/generate`/`/regenerate` AI pipeline. Still live. |
| **V2** | The "Moment" flow: Moment 1 households → Moment 2 Step 1 brief → single-call AI plan via `POST /api/events/[id]/finalize-plan`. Entered via `?setup=true` on the SAME route as V1. |
| **God file** | `src/app/plan/[eventId]/page.tsx` — 3,870 lines (as of 2026-07-09) rendering BOTH V1 dashboard and the entire V2 Moment flow via early returns. |
| **EventSetup** | The V2-only Prisma model holding Moment 2 Step 1 answers (JSONB columns). Its PRESENCE is the canonical "this is a V2 event" discriminator (chosen in GTC-148 after auditing 5 candidate signals). |
| **PersonEvent** | Join row linking a Person to an Event; carries `teamId`, `rsvpStatus`, `householdRole`, reachability. Deleting one cascades away its `NudgeLog` rows. |
| **Tier 2 prune** | The set of V1 surfaces GTC-152 deliberately did NOT delete, pending product decisions: `/api/events/[id]/generate` + `src/lib/ai/generate.ts` pipeline + legacy prompt surface, `/regenerate` + `/regenerate/preview`, `src/app/demo/review/page.tsx`, PlanRevision and other half-wired models. |

**Founding documents (read before starting):**
- `gather-v1-v2-brief.md` (repo root) — the founder's diagnostic map. Mostly current, but: its dietary skip-path finding (#4) was FIXED by GTC-150; `EventSetup.generatedData` and `StructureChangeRequest` were dropped by GTC-152; page.tsx has grown from 3,851 to 3,870 lines.
- `docs/tickets/GTC-148.md`, `GTC-149.md`, `GTC-152.md` — the campaign's completed opening moves (hide V1 AI controls on V2 events; Tier 1 safe deletes).
- NOTE: those tickets cite `docs/v1-v2-reconciliation-review.md`. That file is NOT committed to the repo (verified 2026-07-09). The tickets themselves preserve its findings — use them.
- STALE: `docs/moment-1-and-2-build-report.md` and `docs/moment-2-flow-document.md` describe the DELETED per-section generation architecture. Read GTC-146 first; do not implement from those docs.

## When NOT to use this skill

| Situation | Load instead |
|---|---|
| Ticket mechanics, commit format, do-not-touch zone rationale | `gather-change-control` |
| General orientation to invariants / architecture (not executing the campaign) | `gather-architecture-contract` |
| Changing prompts, token caps, or AI parsing outside this campaign | `gather-ai-generation` |
| Writing a migration or understanding cascade semantics generally | `gather-data-model-and-migrations` |
| Running an experiment branch / measuring before-after | `gather-experiment-methodology` |
| Building the evidence (tests, metrics scripts, browser walks) | `gather-validation-and-evidence` |
| A bug symptom you can't yet classify | `gather-debugging-playbook` |
| "Why is the code like this?" history questions | `gather-failure-archaeology` |

## Standing rules (non-negotiable)

1. Every phase step = one GTC ticket (`docs/tickets/GTC-NNN.md`) + one commit `{type}(GTC-NNN): summary`. No commit/push/merge without the founder's explicit approval in chat.
2. Never touch the Do-Not-Touch Zones in `GATHER-BUILD-CONSTANTS.md` §"Do-Not-Touch Zones" (auth/session/middleware, magic-link, AccessToken, Stripe, migrations discipline, security tests, SMS opt-out, no `"type": "commonjs"`).
3. Define success metrics numerically BEFORE starting a step; verify with commands, never by eye.
4. Risky architecture changes go through an `[EXPERIMENTAL]` branch with measured before/after (the GTC-145 → GTC-146 pattern: 86→25 items, then merge).
5. Schema changes NEVER ride along with UI refactors — GTC-152 split code (82544b6) and schema (05bc621) into separate commits; follow that.

---

## Phase 0 — Recon: map and baseline the current split

**Entry criteria:** none. Run this at the start of ANY campaign session; drift since 2026-07-09 is expected.

```bash
# 0.1 God-file size
wc -l "src/app/plan/[eventId]/page.tsx"
# EXPECTED (2026-07-09): 3870

# 0.2 Component imports in the god file (V1 + V2 mixed)
grep -c "from '@/components/plan/" "src/app/plan/[eventId]/page.tsx"
# EXPECTED (2026-07-09): 35

# 0.3 The three render branches (V2 setup / V2 plan view / V1 dashboard)
grep -n "const \[showSetup" "src/app/plan/[eventId]/page.tsx"      # line 376
grep -n "if (showSetup) {" "src/app/plan/[eventId]/page.tsx"       # line 1661
grep -n "if (showMoment2PlanView && event) {" "src/app/plan/[eventId]/page.tsx"  # line 1807
grep -n "^  return (" "src/app/plan/[eventId]/page.tsx"            # line 2037 = V1 dashboard

# 0.4 EventSetup-gated branches (the GTC-148/149 "hide V1 on V2 events" pattern)
grep -cE "event\??\.setup" "src/app/plan/[eventId]/page.tsx"
# EXPECTED (2026-07-09): 13 gate lines

# 0.5 V1-only AI routes still live (post-GTC-152 Tier 2 survivors)
ls "src/app/api/events/[id]/generate" "src/app/api/events/[id]/regenerate" \
   "src/app/api/events/[id]/regenerate/preview" "src/app/api/events/[id]/finalize-plan"
grep -rn "AI_CALL_LIMIT" "src/app/api/events/[id]/generate/route.ts" \
   "src/app/api/events/[id]/regenerate/route.ts" "src/app/api/events/[id]/finalize-plan/route.ts"
# EXPECTED: per-route AI_CALL_LIMIT constants exist; values drift — canonical table: gather-config-and-flags §4

# 0.6 Frontend callers of the V1 pipeline
grep -rn "events/\${eventId}/generate\|/regenerate" "src/app/plan/[eventId]/page.tsx" | grep fetch
# EXPECTED: handleGeneratePlan + handleReviewRegenerateSelected (/generate), executeRegenerate (/regenerate) — all gated behind !event.setup by GTC-148/149
grep -rn "/generate" src/app/demo/review/page.tsx
# EXPECTED: one caller ~line 62 (deliberately unguarded; dies with Tier 2 prune per GTC-149)

# 0.7 Route classification baseline
python3 -c "import json; print(len(json.load(open('route-classifications.json'))))"
# EXPECTED (2026-07-09): 74
```

**If you see instead → branch:**
- God file materially smaller than 3,870 → Phase 3 has progressed; read the newest GTC tickets (`ls -t docs/tickets | head`) before assuming this runbook's line numbers.
- `/generate` or `/regenerate` directories missing → Phase 4 (Tier 2 prune) already executed; skip Phases 2 and 4, confirm via ticket.
- `event.setup` gate count near 0 → GTC-148/149 regressed. STOP, treat as a live bug, open a ticket before anything else.

Record all seven numbers in your ticket as the baseline.

---

## Phase 1 — Household data-loss fix (highest-value independent win)

**STATUS UPDATE (GTC-159, closed, commit `b73f140`; corrected 2026-07-09 per GTC-160's
authoritative source read):** the fix below has LANDED on the server side. The blanket
`personEvent.deleteMany` was removed; non-primary members now reconcile via a diff-based
upsert in `src/lib/households/reconcileMembers.ts` (extracted from the route for
testability), keyed on a client-supplied `personEventId`. RED→GREEN regression test:
`tests/household-edit-preserves-membership-test.ts` (`npm run test:household-edit`).
**Client wiring (the `personEventId` payload plumbing this section calls the "identity
obligation") was completed separately in GTC-160** — see that ticket for the 6 wiring
sites and its own integration test. If you are starting a fresh campaign session and see
this section, do NOT redo Phase 1; jump to Phase 2 or later, confirming the "If you see
instead" branch below.

**Entry criteria:** Phase 0 recorded. No dependency on other phases — do this first.

**The defect, as originally observed (verified 2026-07-09, pre-fix):** `PUT
/api/events/[id]/households/[householdId]` deleted every non-primary `PersonEvent` in the
household (the `personEvent.deleteMany` block) and recreated them via `createMember`.

**Root cause, corrected (GTC-159/GTC-160 finding — the original text below understated
this):** `createMember` ALREADY contained a `(personId,eventId)` upsert branch
(`personEvent.findUnique` → update-in-place if found) — but the blanket `deleteMany` ran
*before* `createMember`, on every edit, for every non-primary member. That ordering is
what defeated the existing upsert branch: by the time `createMember` ran its
`findUnique`, the row it would have matched was already gone, so every non-primary member
fell through to the `create` path regardless of the upsert logic being present. **The fix
was therefore to remove the blanket `deleteMany` and drive reconciliation off client-sent
identity — not to "add" an upsert that didn't exist.** Consequences of the pre-fix
ordering bug, each traceable in the schema:

| Loss | Mechanism | Evidence |
|---|---|---|
| Team membership wiped | The `deleteMany`-then-recreate ordering discarded the row `createMember`'s upsert branch would otherwise have matched, so the new row never inherits `teamId` | `prisma/schema.prisma — PersonEvent.teamId` |
| Nudge history destroyed | `NudgeLog.personEvent` has `onDelete: Cascade`, fired by the `deleteMany` | `prisma/schema.prisma — NudgeLog.personEvent relation` |
| RSVP state reset | `rsvpStatus` defaults back to `PENDING`; `rsvpRespondedAt` etc. lost | `prisma/schema.prisma — PersonEvent.rsvpStatus/rsvpRespondedAt/rsvpFollowupSentAt` |
| Assignments invalidated | `Assignment.personId` points at Person (survives), but the assign guard requires `personEvent.teamId === item.teamId` — now null | `assign/route.ts — the teamId check in POST()` |
| Duplicate Person rows | `createMember` looks Person up ONLY by email (the `person.findUnique({ where: { email } })` lookup in `createMember()`); no-email members (the common case: kids, partners) get a brand-new Person every edit (the `person.create()` fallback) | `route.ts — inside createMember()` |

The build report calls this "simpler than diffing" — it was a deliberate pre-launch trade-off,
now promoted to campaign target.

### 1.1 Reproduce (before touching anything) — historical; the repro this section describes is now encoded as the RED phase of `tests/household-edit-preserves-membership-test.ts`. Kept for future analogous bugs, not because Phase 1 is still open.

```bash
# Seed a realistic event: 6 households, 14 PersonEvent rows (11 adults + 3 kids w/ jobs), 3 littles
npx tsx scripts/seed-gtc-133-test-event.ts
# Copy the printed Event ID and Event URL. Script picks the host User to match your login
# (override with SEED_HOST_EMAIL=you@example.com if the browser session 403s on households).
```

Snapshot state (psql; DB name per your `.env` `DATABASE_URL`, dev default `gather_dev`):

```sql
-- BEFORE counts (substitute <EVENT_ID>)
SELECT count(*) AS person_events FROM "PersonEvent" WHERE "eventId" = '<EVENT_ID>';
SELECT count(*) AS persons FROM "Person";
SELECT count(*) AS nudge_logs FROM "NudgeLog" nl
  JOIN "PersonEvent" pe ON pe.id = nl."personEventId" WHERE pe."eventId" = '<EVENT_ID>';
SELECT pe.id, p.name, pe."teamId", pe."rsvpStatus", pe."householdRole"
  FROM "PersonEvent" pe JOIN "Person" p ON p.id = pe."personId"
  WHERE pe."eventId" = '<EVENT_ID>' ORDER BY p.name;
```

Manufacture the at-risk state: give a non-primary member (e.g. Matt — no email) a team, and
a nudge log row, directly in psql:

```sql
UPDATE "PersonEvent" SET "teamId" = (SELECT id FROM "Team" WHERE "eventId" = '<EVENT_ID>' LIMIT 1)
  WHERE "eventId" = '<EVENT_ID>' AND id = '<MATT_PE_ID>';
INSERT INTO "NudgeLog" (id, "personEventId", "nudgeType", "scheduledFor", status, "createdAt")
  VALUES ('repro-nudge-1', '<MATT_PE_ID>', 'test', now(), 'SENT', now());
```

(No team exists yet on a fresh seed? Create one row: `INSERT INTO "Team" (id, name, "eventId", source, ...)`
or add a team via the dashboard UI first.)

Trigger: with `npm run dev` running, open the printed Event URL, enter Moment 1
(`?setup=true`), edit that household (change ANYTHING, e.g. primary phone), save. The UI
issues the PUT inside `handleEditSave()` in `src/app/plan/[eventId]/page.tsx`.

**EXPECTED observations (this is the bug):** re-run the BEFORE queries —
- Non-primary members have NEW `PersonEvent.id`s; `teamId` is NULL; `rsvpStatus` back to `PENDING`.
- The `NudgeLog` row is gone (count decremented).
- `Person` count grew by the number of no-email members in that household (Matt duplicated).
- `PersonEvent` count for the event is unchanged — which is exactly why this is silent.

**If you see instead:** memberships preserved and ids stable → the fix already landed; find
the ticket, verify its regression test exists, close out.

### 1.2 Solution menu (ranked) and gates — historical; option (a) is what GTC-159/GTC-160 implemented. Kept as the worked rationale, not as an open decision.

**(a) Diff-based upsert — IMPLEMENTED (GTC-159/GTC-160).** Match incoming members to existing `PersonEvent`
rows and update in place; delete only members actually removed; create only genuinely new ones.
- **Identity obligation:** email lookup cannot identify no-email members. The client must send
  each member's `personEventId` (extend the payload shape in
  `src/app/api/events/[id]/households/[householdId]/route.ts` `HouseholdRequestBody` and the
  Moment 1 components `HouseholdCardList.tsx` / `Moment1InputForm.tsx`). Name-matching is
  FORBIDDEN (families share names).
- **Derivation obligation:** enumerate EVERY dependent of PersonEvent before writing code and
  prove each is preserved: `teamId`, `rsvpStatus`/`rsvpRespondedAt`/`rsvpFollowupSentAt`,
  `claimedViaSharedLink`, `proxyPersonEventId` self-relation, `nudgeLogs` (cascade),
  `contactMethod`/`reachabilityTier` (these two SHOULD be recomputed — that's the update's job).
  Grep for consumers: `grep -rn "personEventId\|householdRole" src --include="*.ts" --include="*.tsx" | grep -v test`.
- **Gate (numeric, defined before coding):** run the 1.1 repro after the fix. A no-membership-change
  edit must show ΔPersonEvent rows = 0, same `PersonEvent.id` set, ΔPerson = 0, ΔNudgeLog = 0,
  `teamId` non-null count unchanged, `rsvpStatus` values unchanged. A member-removal edit must
  delete exactly that member's row and nothing else. Encode this as a tsx regression test in
  `tests/` (house pattern: assert() counter, exit 1 on failure) and wire it as `npm run test:<name>`.

**(b) Soft-delete / reparent.** Keep PersonEvent rows forever; mark removed members inactive.
- Requires a schema change (status/`removedAt` field) + auditing every reader of household
  members (nudges, reachability, headcounts, "who's missing") to filter inactive rows.
- Higher blast radius than (a) for the same user-visible result. Choose only if the founder
  wants removal-history semantics. Schema change = its own commit, migration via
  `npm run db:migrate`, per standing rule 5.

**(c) Keep-but-document.** Guard the PUT: refuse (409 with explanation) when any non-primary
member has a `teamId` or an Assignment, telling the host to unassign first.
- Not a fix — a tourniquet. Acceptable only as an interim ticket if (a) is deferred; must be
  recorded as debt in the ticket and in `BUILD_STATUS.md`.

**Fenced off:** "fixing" this by deleting the `NudgeLog` cascade or weakening the assign-route
team check; both are load-bearing elsewhere.

---

## Phase 2 — Prompt-path unification (decision-gated; may collapse into Phase 4)

**Entry criteria:** Phase 1 landed or explicitly deferred by the founder.

**Current state (verified 2026-07-09):** two parallel NZ-rules implementations —
- V1: NZ rules hardcoded inside `PLAN_GENERATION_SYSTEM_PROMPT` (`src/lib/ai/prompts.ts`,
  ham/lamb in the "NZ CHRISTMAS RULES" block, L&P in the "NZ DRINKS" block), consumed by
  `src/lib/ai/generate.ts` via the `/generate` and `/regenerate` routes.
- V2: `buildPlanGenerationPrompt` (`src/lib/ai/prompts.ts`) pulls NZ notes from config via
  `getNzNotes` (`src/lib/ai/config-loader.ts`, backed by `plan-option-tree-config.json`),
  consumed only by `finalize-plan`.

**DECISION GATE (ask the founder first):** if Phase 4 will retire the V1 generate/regenerate
pipeline (the standing Tier 2 intent per GTC-152's "intentional non-deletions"), then Phase 2
is NOT a merge — it is deletion of the V1 prompt surface as part of Phase 4, and you should
skip to Phase 3. Only do unification work here if V1 generation must remain live for a
defined period.

If unifying: single source of truth = the config path (`getNzNotes` /
`plan-option-tree-config.json`) — this follows the GTC-151 lesson (validators/prompts must
share the UI's config source; hardcoded copies drift).

**Gate:** same seeded event generates equivalent plans before/after the change. Equivalence is
measured, not eyeballed (recipes in `gather-validation-and-evidence`): item count within ±3
(the GTC-146 variance band: 25 vs 28 was accepted), category count identical, L&P present in
drinks, ham/lamb present and turkey not primary for NZ Christmas, zero cross-category
duplicates. Record both plans' metrics in the ticket.

---

## Phase 3 — God-file decomposition

**Entry criteria:** Phase 1 landed (do not extract components while the household write path
is still being changed under you). Phase 0 baseline recorded in the ticket.

**Method:** ONE extraction per ticket per commit. Lowest-risk first:

1. **Pure render/helpers** — e.g. the Moment 2 mapper block (`MOMENT2_CATEGORY_EMOJIS` +
   plan-view mapping functions, top of page.tsx) → a `src/lib/` or component-local
   module. No state, no fetch: mechanical move.
2. **Self-contained V2 render branches** — the `if (showSetup)` block and the
   `if (showMoment2PlanView && event)` block in page.tsx into container components,
   passing state down. The bare `return (` V1 dashboard block (last top-level return in
   page.tsx) moves LAST, if ever.
3. **Modal open/close state clusters** — group per-modal useState into hooks.
4. **API client hooks** — the fetch handlers (households: `handleAddHousehold` /
   `handleEditSave` / `handleDeleteHousehold`; generate: `handleGeneratePlan` /
   `handleReviewRegenerateSelected`; regenerate: `executeRegenerate`) into `useXxx` hooks.
   Highest risk: these encode the
   GTC-148/149 `!event.setup` gating — the gate count from Phase 0.4 must be unchanged or
   consciously relocated, never dropped.

**Gate per extraction (all four, every time):**

```bash
npx tsc --noEmit                    # clean
npm run test:security               # exit 0
# targeted test for the touched area (add one if none exists)
# browser walk of BOTH entries against a seeded event:
#   /plan/<id>            → V1 dashboard renders, no V1 AI controls on V2 events
#   /plan/<id>?setup=true → Moment 1 → Moment 2 Step 1 → (plan view if already generated)
wc -l "src/app/plan/[eventId]/page.tsx"   # record the new number in the ticket
```

**FENCED OFF in this phase:**
- NO big-bang rewrite of page.tsx. The GTC-145/146 experience shows rewrites are done as
  measured experiments, not refactors — and this file gates both live products.
- NO touching `middleware.ts`, `src/lib/auth*`, or cookie logic during extraction
  (Do-Not-Touch Zone 1; GTC-001 history).
- NO schema changes bundled with UI extraction (standing rule 5).
- NO behavior changes smuggled into moves. An extraction commit's diff should be
  copy-relocation + imports; if you find a bug mid-extraction, ticket it separately.

---

## Phase 4 — V1 retirement decision gate

**Entry criteria:** Phases 1 and 3 (at least steps 1–2) landed. This phase DELETES the Tier 2
surfaces; it is irreversible in spirit even if git-revertible.

ALL of the following must be true, with evidence pasted into the ticket, before deleting
anything:

1. **V2 covers the flows** — browser-walk evidence on a seeded event: create event →
   Moment 1 households (add/edit/delete) → Moment 2 Step 1 → finalize-plan generation →
   plan view edit/remove items → assignment path works. (The regenerate-equivalent for V2
   is re-running finalize-plan; NOTE its own delete-and-recreate: it drops
   `source: 'GENERATED'` teams via the `team.deleteMany()` call in `finalize-plan/route.ts` `POST()`, cascading items and their
   assignments — founder must accept or fix that before V1 regenerate is deleted.)
2. **No live events depend on V1-only state** — psql check for events with a V1-generated
   plan (GENERATED teams but no EventSetup row):
   ```sql
   SELECT e.id, e.name, e.status FROM "Event" e
   LEFT JOIN "EventSetup" s ON s."eventId" = e.id
   WHERE s.id IS NULL
     AND EXISTS (SELECT 1 FROM "Team" t WHERE t."eventId" = e.id AND t.source = 'GENERATED');
   ```
   Must return 0 rows in production (run against prod data or a fresh prod dump, not just dev).
3. **Founder sign-off recorded in the GTC ticket** — an explicit "approved for deletion" line.
   The scope decisions in GTC-148/149/152 were each confirmed by Nigel by name; match that bar.

**Then delete in dependency order** (mirror GTC-152's method: fresh greps at HEAD for zero
callers before each delete; code and schema in separate commits; browser-verify deleted routes
404):
`/demo/review` page → page.tsx V1 fetch handlers and dashboard-only UI → `/api/events/[id]/generate`,
`/regenerate`, `/regenerate/preview` → `src/lib/ai/generate.ts` pipeline remnants → legacy prompt
surface in `prompts.ts` (`PLAN_GENERATION_SYSTEM_PROMPT`, `PLAN_REGENERATION_SYSTEM_PROMPT`,
`SELECTIVE_REGENERATION_SYSTEM_PROMPT` + their builders) → `GuidedPlanBuilder.tsx` /
`HostDescriptionModal.tsx` (sole importer chain, verified 2026-07-09) → re-run
`scripts/triage-unknown-routes.ts` and update `route-classifications.json` (baseline 74 routes).

**If criterion 2 returns rows:** those events must finish (EventStatus COMPLETE) or be
migrated (an EventSetup row backfilled) first — that is its own ticket, not a reason to relax
the gate.

---

## Known wrong paths (fenced, with history — do not relitigate)

| Wrong path | History | Status |
|---|---|---|
| Per-section / per-accordion AI regeneration | GTC-116/121–128 built it (Apr–May 2026); produced 86-item plans, cross-section duplication (GTC-138/139/140); reverted by GTC-145 experiment (86→25 items, −71%) and GTC-146 merge; dead code pruned in GTC-152 | SETTLED. Single-call `finalize-plan` is canonical. Do not reintroduce per-section calls "for speed". |
| Detecting V2-ness by anything other than EventSetup presence | GTC-148 audited 5 signals (Event field: doesn't exist; Team.source: both pipelines stamp GENERATED; timestamps: fragile; batchId prefix: viable fallback only) | SETTLED: `event.setup` is the discriminator. |
| Silent schema "cleanups" bundled into refactors | GTC-152 shipped schema drops as a separate reviewed `--create-only` migration and separate commit | Follow that pattern; never hand-edit `prisma/migrations/`. |
| Touching auth/session/middleware "while we're in there" | GTC-001 session-collision fix is Do-Not-Touch Zone 1 | Never in this campaign. |
| Keying no-email Person identity by name | Families share names; creates worse corruption than the current bug | Forbidden in Phase 1. |

## Validation-and-promotion protocol (every phase)

1. Open a GTC ticket from the template named in `GATHER-BUILD-CONSTANTS.md`; run the
   compliance check and the preflight sequence (`npm install` → `npm run db:migrate` →
   `npm run dev` shows Ready → `npm run test:security` exits 0).
2. Write the success metrics as numbers in the ticket BEFORE coding (predict-first; see
   `gather-experiment-methodology`).
3. RED→GREEN regression test in `tests/` for any behavior fix; wire it in package.json.
4. Browser walk of both `/plan/<id>` and `/plan/<id>?setup=true` for any page.tsx change.
5. Fix + test + completed ticket in ONE commit; commit hash backfilled into the ticket;
   nothing committed/pushed/merged without founder approval in chat (see
   `gather-change-control`).

## Provenance and maintenance

All facts verified against the repo on 2026-07-09 (branch `feat/moment-one-redesign`).
Re-verify before trusting:

```bash
wc -l "src/app/plan/[eventId]/page.tsx"                                  # was 3870
grep -n "const \[showSetup" "src/app/plan/[eventId]/page.tsx"            # was :376; branches :1661/:1807/:2037
grep -cE "event\??\.setup" "src/app/plan/[eventId]/page.tsx"             # was 13
ls "src/app/api/events/[id]/generate" "src/app/api/events/[id]/regenerate" 2>/dev/null  # Tier 2 still live?
grep -n "deleteMany" "src/app/api/events/[id]/households/[householdId]/route.ts"        # was :45 in DELETE() (correct/intended whole-household cascade — not the bug) and :156 in PUT() (was the bug; PUT no longer calls deleteMany post-GTC-159 — its member-write logic now lives in src/lib/households/reconcileMembers.ts)
grep -n -A10 "model NudgeLog" prisma/schema.prisma | grep Cascade        # NudgeLog.personEvent onDelete: Cascade
grep -n "teamId !== item.teamId" "src/app/api/events/[id]/items/[itemId]/assign/route.ts"  # was :65
grep -rn "AI_CALL_LIMIT" src/app/api --include="*.ts" | grep "= "        # values drift; canonical table: gather-config-and-flags §4
python3 -c "import json;print(len(json.load(open('route-classifications.json'))))"      # was 74
ls -t docs/tickets | head -5                                              # newer than GTC-152? read those first
```

If any expected value differs, the campaign has moved since this skill was written: read the
newest `docs/tickets/GTC-*.md` before executing any phase, and update this file in its own
docs ticket.
