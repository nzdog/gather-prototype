---
name: gather-domain-reference
description: >
  Load when you need to understand WHAT Gather's domain concepts mean before touching code or
  reviewing output: the Moments model (1-4), households/householdRole/littleCount, primary contact
  and proxy coordination, reachability tiers (DIRECT/PROXY/SHARED/UNTRACKABLE), the conflicts
  taxonomy and Acknowledgements, quantity labels (CALCULATED/HEURISTIC/PLACEHOLDER), item
  criticality, RSVP vs Assignment response, NZ cultural product rules (ham/lamb, L&P, summer
  Christmas, TNZ SMS), or "does this generated plan look right?". Symptoms: confusion about two
  different yes/no responses, wrong headcount, un-NZ plan output, or unfamiliar enum values.
---

# Gather Domain Reference

The "what does this concept mean HERE" pack. Gather is a coordination app for host-led family
gatherings (Christmas, reunions, birthdays) in New Zealand. All facts below verified against the
repo as of 2026-07-09; re-verification commands are at the bottom.

## When NOT to use this skill

| You are trying to... | Load instead |
|---|---|
| Change prompts, token budgets, generation code, parsing | `gather-ai-generation` |
| Change the Prisma schema, run/repair migrations, understand cascades | `gather-data-model-and-migrations` |
| Understand tickets, approvals, do-not-touch zones, commit rules | `gather-change-control` |
| Map V1 vs V2 code, the god file, invariants | `gather-architecture-contract` |
| Start the app, seed data, mint tokens, run crons | `gather-run-and-operate` |
| Debug a live symptom | `gather-debugging-playbook` |

This skill defines vocabulary and product requirements. It changes nothing.

## The product and the target user (why tone matters)

- **Target user**: the family coordinator/host — per `docs/***What is Gather.md`, "typically the
  person who ends up organizing every gathering because no one else will. Usually a woman, often
  undervalued for the invisible labor she performs." The V2 generation prompt personifies her as
  **Kate** (`src/lib/ai/prompts.ts`, `buildPlanGenerationPrompt`).
- **Host pain removed**: being the "human sync engine" of group chats — chasing, reconciling,
  holding the plan in her head. Gather turns the plan into an external, confirmable state that can
  **freeze** into shared reality.
- **Consequence for all generated output**: proportionality and realism are product requirements,
  not style. The V1 system prompt (`PLAN_GENERATION_SYSTEM_PROMPT` in `src/lib/ai/prompts.ts`) codifies: *"only say 'must' for
  calculated requirements, use 'suggest' for heuristics"*. The V2 prompt codifies: *"Realism beats
  completeness"* — the plan must look like something a real host would actually shop for.
- **Payment model**: per-event one-time **$12.00 NZD** Stripe checkout —
  `src/app/api/billing/checkout/route.ts` (`mode: 'payment'`, `currency: 'nzd'`,
  `unit_amount: 1200`). The $69/year subscription UI in `src/app/billing/page.tsx` is vestigial;
  do not build on it.

## The Moments model (V2 host journey)

"Moments" are the four steps of the V2 host flow. Labels come verbatim from
`src/components/plan/MomentArc.tsx`:

| # | Label | UI (as of 2026-07-09) | Data written |
|---|---|---|---|
| 1 | "Who's coming?" | `Moment1InputForm` + `Moment1Summary` (rendered from the god file `src/app/plan/[eventId]/page.tsx`, entered via `?setup=true`) | `Household` rows + `PersonEvent` rows with `householdId`/`householdRole`; `Person` find-or-create by email |
| 2 | "What's the plan?" | Step 1 = `Moment2Step1Modal` (accordion brief: event type, food categories via OptionTree, dietary, other jobs) → Step 2 = single finalize-plan AI call → `Moment2PlanView` (editable plan) | Step 1 answers persist to `EventSetup` (JSONB columns per section); generated plan lands as `Team`/`Item` rows |
| 3 | "Who's bringing what?" | **No dedicated V2 component exists.** The label renders in `MomentArc` but assignment/confirmation UX today is the V1 dashboard + participant magic links | `Assignment` rows, `Assignment.response` |
| 4 | "Is everyone sorted?" | **No dedicated V2 component exists.** Today: V1 invite-status/reachability views + freeze | `EventStatus` transitions, `PlanSnapshot`, freeze warnings |

Key facts:

- Moments 1 & 2 are built (GTC-101–131 era); Moments 3 & 4 as V2 experiences are **open roadmap**
  (`docs/BUILD_STATUS.md` Epics 2–6 all unchecked except 1.1).
- Since GTC-145/146, Moment 2 generation is ONE coordinated AI call at "Generate" — the modal
  header comment in `src/components/plan/Moment2Step1Modal.tsx` explicitly says per-section
  incremental generation was removed. Docs describing per-section generation
  (`docs/moment-1-and-2-build-report.md`, `docs/moment-2-flow-document.md`) are STALE.
- Event lifecycle behind the Moments: `EventStatus` = DRAFT → CONFIRMING → FROZEN → COMPLETE
  (`src/lib/workflow.ts`). Frozen = the psychological finish line; participant responses are
  locked while frozen.

## Households (Moment 1 vocabulary)

A **Household** is a group entered together in Moment 1 — one card in the UI, one `Household` row
(`prisma/schema.prisma`). Members are `PersonEvent` rows carrying `householdId` + `householdRole`.

`HouseholdRole` enum (schema): `PRIMARY_CONTACT | PARTNER | GUEST | CHILD`

| UI concept | API field (`POST /api/events/[id]/households`) | householdRole | Rules |
|---|---|---|---|
| Primary contact | `primaryContact` (required) | `PRIMARY_CONTACT` | Name required; the household's reachable anchor |
| Partner | `partner` | `PARTNER` | Optional |
| "Kids with jobs" | `helpers[]` | `CHILD` | Each MUST have a name (they get assignments) |
| Extra adults/guests | `guests[]` | `GUEST` | Optional |
| "Kids without jobs" | `littleCount` (integer on Household, default 0) | — no Person rows at all | Validated 0–20; they exist ONLY as a headcount number |

Traps and obligations:

- **littleCount people are countable but not addressable** — no `Person`/`PersonEvent` rows, so
  they can never receive assignments, nudges, or links. They DO count for quantities.
- **Canonical headcount** (GTC-136 lesson — never read `Event.guestCount` first): aggregate over
  households as `1 + (partner?1:0) + helpers.length + littleCount + guests.length` — see the
  comment-marked block in `src/app/plan/[eventId]/page.tsx` ("Canonical headcount").
  `Event.guestCount` is only a fallback when households aren't loaded.
- **Person dedupe is email-only**: household create finds existing `Person` by email; members
  without email become new `Person` rows. Combined with the household PUT's delete-and-recreate
  strategy (`src/app/api/events/[id]/households/[householdId]/route.ts`), editing a household
  churns no-email members — a KNOWN data-loss risk and the target of
  `gather-v1-v2-reconciliation-campaign`. Do not "fix" it ad hoc; it is deliberate and ticketed.

## Reachability tiers and contact methods

`ReachabilityTier` enum: `DIRECT | PROXY | SHARED | UNTRACKABLE` (default `UNTRACKABLE`).
`ContactMethod` enum: `EMAIL | SMS | NONE` (default `NONE`). Both live on `PersonEvent`.

| Tier | Meaning | Set where (as of 2026-07-09) |
|---|---|---|
| DIRECT | We hold their own email or phone | Household create: phone → `SMS`+`DIRECT`, else email → `EMAIL`+`DIRECT` (phone wins) — `src/app/api/events/[id]/households/route.ts` |
| PROXY | Reached via their household's primary contact | **Schema + UI read it, but NO code path writes `'PROXY'` yet** — Epic 1.2 "Tier 2 Proxy Household Model" is open in `docs/BUILD_STATUS.md`. `PersonEvent.proxyPersonEventId` exists in schema, unused in src |
| SHARED | Claimed their spot via a shared join link | `src/app/api/join/[token]/claim/route.ts` sets `reachabilityTier: 'SHARED'`, `claimedViaSharedLink: true` |
| UNTRACKABLE | No contact info at all | Default; household members with neither email nor phone |

Why tiers matter (not cosmetic):

- **Compliance rate excludes UNTRACKABLE from numerator AND denominator** — "can't measure what
  you can't reach" (`src/lib/workflow.ts`, `checkFreezeReadiness`). Threshold: <80% triggers a
  `LOW_COMPLIANCE` freeze warning.
- **Proxy coordination** = nudging the household `PRIMARY_CONTACT` on behalf of unreachable
  members. Skeleton exists in `src/lib/sms/proxy-nudge-eligibility.ts` /
  `proxy-nudge-sender.ts` (targets primary contacts of households in CONFIRMING events), but its
  own header comment says the tracking fields were dropped in the Moment 1 redesign and
  "scheduling logic needs redesign in a future ticket". Treat proxy nudging as **partially built,
  open roadmap** — do not present it as working.
- `ReachabilityBar.tsx` buckets people DIRECT / PROXY / (SHARED+UNTRACKABLE) for the host.

## RSVP vs Assignment response — two different yes/no axes

Constant confusion source. Disambiguate every time:

| Axis | Question answered | Field | Enum | Written by |
|---|---|---|---|---|
| **RSVP** | "Are you coming?" (attendance) | `PersonEvent.rsvpStatus` | `PENDING \| YES \| NO \| NOT_SURE` | `PATCH /api/p/[token]` (accepts only YES/NO/NOT_SURE) |
| **Assignment response** | "Will you bring THIS item?" (per-item commitment) | `Assignment.response` | `PENDING \| ACCEPTED \| DECLINED` | `POST /api/p/[token]/ack/[assignmentId]` (ACCEPTED/DECLINED; blocked while FROZEN) |

- One `Assignment` per item max (`Assignment.itemId` is `@unique`). An item is a "gap" if it has
  no assignment OR its assignment is DECLINED (`computeTeamStatusFromItems`,
  `src/lib/workflow.ts`).
- A person can RSVP YES yet decline every item, or accept items while `rsvpStatus` is still
  PENDING. Never infer one axis from the other.
- The RSVP layer as a first-class state machine (incl. "Not Sure Forced Conversion") is **Epic 2,
  open**.
- Related but distinct: `ItemStatus` (`ASSIGNED|UNASSIGNED`) is a **cache** of assignment
  existence — never use it for safety gates; query `Assignment` directly (documented at length in
  `src/lib/workflow.ts`).

## Conflicts taxonomy

A **Conflict** is a machine-detected problem with the plan. Detection is **deterministic
TypeScript, not an LLM** — `src/lib/ai/check.ts` runs six detectors: critical placeholder
quantities, oven/equipment timing overlaps, dietary gaps, coverage gaps, teams without
coordinators, unassigned items.

Enums on `Conflict` (`prisma/schema.prisma`):

| Field | Values |
|---|---|
| `type` (ConflictType) | `TIMING`, `DIETARY_GAP`, `STRUCTURAL_IMBALANCE`, `CONSTRAINT_VIOLATION`, `COVERAGE_GAP`, `QUANTITY_MISSING`, `EQUIPMENT_MISMATCH` |
| `severity` (ConflictSeverity) | `CRITICAL`, `SIGNIFICANT`, `ADVISORY` |
| `claimType` (ClaimType) | `CONSTRAINT`, `RISK`, `PATTERN`, `PREFERENCE`, `ASSUMPTION` — epistemic status of the claim |
| `resolutionClass` (ResolutionClass) | `FIX_IN_PLAN`, `DECISION_REQUIRED`, `DELEGATE_ALLOWED`, `INFORMATIONAL` |
| `status` (ConflictStatus) | `OPEN`, `RESOLVED`, `DISMISSED`, `ACKNOWLEDGED`, `DELEGATED` |

**Acknowledgement** = the host formally accepting a conflict instead of fixing it. It is a real
record, not a dismiss-click (`Acknowledgement` model): `impactStatement` (String — the host states
what happens if this goes wrong), `impactUnderstood` (Boolean), `mitigationPlanType`
(`SUBSTITUTE | REASSIGN | COMMUNICATE | ACCEPT_GAP | EXTERNAL_CATERING | BRING_OWN | OTHER`),
`alternativesConsidered` (`NONE | REVIEWED | ATTEMPTED`), visibility flags, and `status`
(`ACTIVE | SUPERSEDED`) with `supersedesAcknowledgementId` chaining.

What conflicts gate (`src/lib/workflow.ts`):

- **DRAFT → CONFIRMING is BLOCKED** while any CRITICAL conflict in OPEN/DELEGATED status has zero
  acknowledgements (`CRITICAL_CONFLICT_UNACKNOWLEDGED`), or any critical item has an
  unacknowledged PLACEHOLDER quantity, or the event has <1 team or <1 item.
- **CONFIRMING → FROZEN is NEVER blocked by unassigned items** (verified 2026-07-09). The
  transition route (`src/app/api/events/[id]/transition/route.ts` — `POST()`, the
  CONFIRMING → FROZEN branch) calls
  `checkFreezeReadiness()`, which returns **warnings only**: `UNASSIGNED_ITEMS`,
  `LOW_COMPLIANCE` (<80%), `CRITICAL_GAPS` (critical item without an ACCEPTED assignment).
  The only hard requirement is a `freezeReason` string when compliance is below 80%.
  This warnings-only behavior is a recorded design decision (2026-07-09), not a gap:
  hosts may freeze with gaps. GTC-154 (2026-07-09) removed the two things that once
  implied a hard block — an unwired `canFreeze()` function and a `runGateCheck` doc
  comment claiming "coverage is enforced at CONFIRMING → FROZEN" — so the code no
  longer contradicts this. See `gather-architecture-contract` section 5.

## Quantity labels — what each obliges

`Item.quantityLabel` enum: `CALCULATED | HEURISTIC | PLACEHOLDER`. Defined for the model in the V1
system prompt (`src/lib/ai/prompts.ts`, "QUANTITY LABELS" section):

| Label | Meaning | Obligation on UI/copy | System consequence |
|---|---|---|---|
| CALCULATED | Formula-derived (e.g. 200g × 40 guests = 8kg) | May use "must"-strength language | None extra |
| HEURISTIC | Rule of thumb ("usually 2–3 desserts") | "Suggest"-strength language only | None extra |
| PLACEHOLDER | Unknown, needs host input | Must visibly demand input | If the item is ALSO `critical: true` with `quantityState: 'PLACEHOLDER'` and `placeholderAcknowledged: false` → raises a CRITICAL `QUANTITY_MISSING` conflict (`check.ts`) AND blocks DRAFT→CONFIRMING (`workflow.ts`) |

Note `quantityState` (`SPECIFIED | PLACEHOLDER | NA`) is the state machine; `quantityLabel` is the
provenance/confidence tag. Both exist on `Item`.

## Item criticality rules

From the V1 system prompt (`src/lib/ai/prompts.ts`, "CRITICAL ITEMS" section) — these are product
rules, enforce them when reviewing generated or edited plans:

- **Only 3–5 items per plan may be critical, maximum.**
- Critical means "the event genuinely fails without this item". Main proteins: yes. Key dietary
  alternatives for restricted guests: yes.
- Sauces, condiments, bread, drinks, setup, cleanup, side dishes, extra desserts: **NEVER**
  critical. When in doubt: NOT critical.
- `critical: true` requires a `criticalReason`.
- Provenance: `criticalSource` (`AI | HOST | RULE`), host overrides in `criticalOverride`
  (`NONE | ADDED | REMOVED`).

What critical gates: placeholder-quantity acknowledgement before CONFIRMING; `CRITICAL_GAPS`
freeze warning when no ACCEPTED assignment; team status `CRITICAL_GAP` in dashboards; plan
regeneration must keep critical items unless explicitly asked to remove them (prompt rule).

## NZ cultural rules — PRODUCT REQUIREMENTS, not flavor text

Gather is NZ-first. These are hard requirements; a plan violating them is a bug. Where encoded:

| Rule | Encoding |
|---|---|
| Glazed ham and roast lamb are the iconic Christmas mains — NOT turkey (turkey secondary only if host-selected); lamb mandatory when 'Traditional roast' or 'NZ summer BBQ' selected | `src/lib/ai/prompts.ts` "NZ CHRISTMAS RULES" (V1 system prompt, top of file) |
| L&P (Lemon & Paeroa) must appear as the first or second non-alcoholic soft drink in EVERY plan | `src/lib/ai/prompts.ts` "NZ DRINKS" |
| No warm/winter drinks (mulled wine, hot cider) for events November–March — NZ Christmas is SUMMER; pavlova, BBQ, seafood, fresh salads | `src/lib/ai/prompts.ts` "NZ SEASONAL DRINKS"; per-event-type `nzNotes` in `src/lib/ai/plan-option-tree-config.json` injected via `getNzNotes()` (`src/lib/ai/config-loader.ts`) into `buildPlanGenerationPrompt` (V2 path) |
| SMS to +64 (NZ) / +61 (AU) routes via TNZ, everything else Twilio (Twilio cannot deliver NZ SMS) | `TNZ_COUNTRY_CODES = ['+64', '+61']` in `src/lib/sms/send-sms.ts`; `src/lib/sms/tnz-client.ts` |
| Phone numbers normalize assuming NZ (+64) | `src/lib/phone.ts` |
| Date helpers are NZDT-specific (UTC+13) | `src/lib/timezone.ts` (its own header warns about reuse) |

Both prompt paths (V1 `PLAN_GENERATION_SYSTEM_PROMPT` and V2 `buildPlanGenerationPrompt`) carry NZ
rules independently — if you edit one, check the other (see `gather-ai-generation`).

## "Does this generated plan look right?" — scoring checklist

Score any V2 (Moment 2) generated plan against this. Numbers come from the V2 system prompt in
`buildPlanGenerationPrompt` — the V1 prompt's "MINIMUM 25 items" philosophy is the OLD
over-generation era (GTC-145 measured 86→25 items); for Moment 2 output, V2 rules win.

- [ ] **Size**: roughly 15–30 items total for a 15–25 person gathering. 80+ items = per-section-era
      regression; 5 vague items = under-detailed.
- [ ] **No duplicates**: every item in exactly ONE category; no near-duplicates across categories
      (the cake/dessert overlap was a real bug class — GTC-138 era).
- [ ] **Category proportionality**: Mains for 20 people ≈ 3–5 items; Table Snacks ≈ 2–3. Engaged
      categories only; still-deciding categories skipped, none invented.
- [ ] **Quantities are portion math against the household-aggregate headcount** (~150–200g
      protein/adult, kids eat less), real-world units, with `servingSize` reasoning — not round
      numbers pulled from air.
- [ ] **Criticality discipline**: ≤5 critical items, each with a reason; nothing from the
      never-critical list flagged.
- [ ] **Dietary three-state handled** (GTC-150): `confirmed_needs` → coverage entry per
      requirement; `confirmed_none` → empty coverage; `unanswered` → NOT treated as none — one
      vegetarian main default + a "not yet confirmed" coverage flag.
- [ ] **NZ pass**: ham/lamb not turkey (Christmas), L&P in the first two soft drinks, zero winter
      drinks for Nov–Mar events, pavlova-not-hot-cocoa seasonality.
- [ ] **Tone**: reads like a real host's list (Kate would buy this), "must" only for calculated
      facts, suggestions phrased as suggestions.

## Provenance and maintenance

All claims verified 2026-07-09 on branch `feat/moment-one-redesign`. Re-verify before relying:

```bash
# Enums (householdRole, reachability, conflicts, quantity, RSVP, assignment):
grep -n "enum " prisma/schema.prisma
# Moment labels:
grep -n "label:" src/components/plan/MomentArc.tsx
# littleCount validation + reachability assignment on household create:
grep -n "littleCount\|reachabilityTier" "src/app/api/events/[id]/households/route.ts"
# PROXY still unwritten by any code path? (expect only type annotations / reads):
grep -rn "'PROXY'" src --include="*.ts" --include="*.tsx"
# Criticality + quantity-label prompt rules:
grep -n "3-5 items\|QUANTITY LABELS\|CRITICAL ITEMS" src/lib/ai/prompts.ts
# NZ rules, both prompt paths:
grep -n "L&P\|roast lamb\|mulled" src/lib/ai/prompts.ts && grep -n "nzNotes" src/lib/ai/config-loader.ts
# SMS routing:
grep -n "TNZ_COUNTRY_CODES" src/lib/sms/send-sms.ts
# $12 NZD per event:
grep -n "unit_amount" src/app/api/billing/checkout/route.ts
# Gates and compliance threshold:
grep -n "CRITICAL_CONFLICT_UNACKNOWLEDGED\|complianceRate < 80" src/lib/workflow.ts
# canFreeze() removed in GTC-154, 2026-07-09 — expect ZERO matches:
grep -rn "canFreeze(" src --include="*.ts" --include="*.tsx"
# Roadmap status of Moments 3/4 machinery (Epics):
head -30 docs/BUILD_STATUS.md
```
