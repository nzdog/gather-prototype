---
name: gather-ai-generation
description: >
  Load when working on Gather's AI layer: plan generation, prompts, Claude API calls,
  token limits, AI call caps, JSON parsing/truncation errors, or the finalize-plan /
  generate / regenerate routes. Symptoms that trigger this skill: "AI response truncated",
  500 from finalize-plan, 422 with missingTeamNames, 429 "AI call limit reached",
  0 items generated, duplicate items across categories, wrong item counts, turkey/mulled-wine
  appearing in NZ plans, or any request to edit a prompt in src/lib/ai/.
---

# Gather AI Generation — the domain heart

The AI layer turns a host's Step 1 brief into a coordinated plan (teams + items with
quantities). It is the highest-churn, most-burned part of the codebase: a whole
per-section architecture was built, measured, and deleted here (see History). Read this
before touching anything under `src/lib/ai/` or any route that calls Claude.

**Jargon defined once:**
- **Moment 2** — the V2 host journey step "What's the plan?": Step 1 accordion brief → Step 2 AI-generated editable plan.
- **V1** — the legacy dashboard + wizard at `/plan/[eventId]`. Still live. Uses its own AI route (`/api/events/[id]/generate`).
- **V2** — the Moment flow on the same route via `?setup=true`. Uses `/api/events/[id]/finalize-plan`.
- **Single-call architecture** — one Claude call produces the entire plan (GTC-145/146). Replaced per-section calls.
- **Team** — a group of responsibilities in the plan (e.g. "Mains"). Items belong to teams via `teamName` string matching.
- **EventSetup** — the DB row holding the host's Step 1 selections (JSONB columns).
- **GTC-NNN** — ticket IDs in `docs/tickets/`.

## When NOT to use this skill

| Your task | Load instead |
|---|---|
| Running experiments / deciding whether a prompt change ships | `gather-experiment-methodology` (prompt changes MUST ride this pattern — see protocol below) |
| Adding config axes, event types, option-tree entries | `gather-config-and-flags` |
| Understanding Moments, roles, NZ product rules as concepts | `gather-domain-reference` |
| Schema changes (e.g. Item/Team columns) | `gather-data-model-and-migrations` |
| General symptom triage not obviously AI-related | `gather-debugging-playbook` |
| Writing the regression test for your AI fix | `gather-validation-and-evidence` |
| Ticket lifecycle, commit rules, do-not-touch zones | `gather-change-control` |

## File map (all verified 2026-07-09)

| File | Role |
|---|---|
| `src/lib/ai/claude.ts` | Anthropic SDK wrapper: `callClaude`, `parseClaudeJSON`, `callClaudeForJSON`, `isClaudeAvailable` |
| `src/lib/ai/prompts.ts` | ALL prompts — V1 legacy AND V2 single-call coexist here (see V1-vs-V2 table) |
| `src/lib/ai/generate.ts` | V1 generation orchestration: `generatePlan`, `regeneratePlan`, `generateSelectiveItems`, mock fallbacks, `findMissingTeamNames`, `compileGuidedPrompt` |
| `src/lib/ai/token-limits.ts` | `MAX_TOKENS_FULL_PLAN = 16384` — the only constant left after GTC-152 pruning |
| `src/lib/ai/config-loader.ts` | Reads `plan-option-tree-config.json`; `getNzNotes`, `getDefaultCategories`, `CONFIG_EVENT_TYPES` |
| `src/lib/ai/plan-option-tree-config.json` | Per-occasion option trees + `nzNotes` strings (10 occasions have `nzNotes`) |
| `src/lib/ai/check.ts` | Conflict detection — **deterministic TypeScript, zero LLM calls** (grep it: no `callClaude`) |
| `src/lib/ai/coordinator-assignment.ts` | 17-line helper for generated-team coordinator IDs |
| `src/app/api/events/[id]/finalize-plan/route.ts` | **V2 single-call route** — the current main path |
| `src/app/api/events/[id]/generate/route.ts` | V1 route (initial + selective regeneration) |
| `src/app/api/events/[id]/regenerate/route.ts` + `regenerate/preview/route.ts` | V1 modifier-based regeneration |
| `src/app/api/events/[id]/conflicts/[conflictId]/suggest-resolution/route.ts` | AI conflict-resolution suggestion (inline prompt) |

`src/app/api/events/[id]/generate-section/` **does not exist anymore** — deleted after
GTC-145/146 (per-section era). If a doc references it, the doc is stale
(`docs/moment-1-and-2-build-report.md` and `docs/moment-2-flow-document.md` are known-stale).

## claude.ts anatomy (as of 2026-07-09)

- `DEFAULT_MODEL = 'claude-sonnet-4-6'` — `src/lib/ai/claude.ts:14`
- `DEFAULT_MAX_TOKENS = 4096`, `DEFAULT_TIMEOUT = 30000` (timeout is declared but only surfaced via `getAPIInfo`; it is NOT passed to the SDK call)
- Default temperature is **1.0** (`config.temperature ?? 1.0`, claude.ts:51) — any call site that omits `temperature` gets maximum run-to-run variance. All five current call sites set it explicitly (see the call-site table); the 1.0 default only bites NEW call sites that omit it.
- Missing `ANTHROPIC_API_KEY` → `callClaude` throws immediately ("ANTHROPIC_API_KEY is not configured...").

**Error taxonomy** (claude.ts:85–101, `Anthropic.APIError` mapped to friendlier messages):

| API status | Rethrown as |
|---|---|
| 401 | "Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable." |
| 429 | "Rate limit exceeded. Please try again later." |
| 500 | "Anthropic API server error. Please try again later." |
| anything else | original error rethrown |

**`parseClaudeJSON<T>(response, callSiteLabel?)`** (claude.ts:111):
1. If `response.stopReason === 'max_tokens'` → throws
   `AI response truncated at token limit (label) - increase maxTokens or reduce prompt complexity`.
   The `(label)` attribution exists because of GTC-142: a 17-person event 500'd when a
   (since-deleted) dietary-coverage call truncated at 1,024 tokens and the log identified
   nothing about which call broke. Every call site now passes `callSiteLabel` via
   `ClaudeConfig`; **never add a `callClaudeForJSON` call without one.**
2. Strips markdown ```` ```json ```` fences if present.
3. `JSON.parse` — on failure logs the raw text and throws "Failed to parse Claude response as JSON: ...".

`callClaudeForJSON` = `callClaude` + `parseClaudeJSON`, forwarding `config.callSiteLabel`.

## Every live Claude call site (verified 2026-07-09)

| Call site | callSiteLabel | maxTokens | temperature | Invoked from |
|---|---|---|---|---|
| finalize-plan route (route.ts:233) | `finalize-plan:full` | `MAX_TOKENS_FULL_PLAN` (16384) | 0.8 | V2 Moment 2 "Generate plan" |
| `generatePlan` (generate.ts:108) | `plan-generation` | 16384 (inline literal) | 1.0 | V1 generate route |
| `regeneratePlan` (generate.ts:140) | `plan-regeneration` | 16384 (inline literal) | 1.0 | V1 regenerate + preview routes |
| `generateSelectiveItems` (generate.ts:237) | `selective-regeneration` | 2048 | 1.0 | V1 generate route (keep/regenerate item IDs) |
| suggest-resolution route (route.ts:102) | `conflict-resolution` | 2000 | 0.7 | Conflict UI |

Note the drift: `token-limits.ts` says "do not inline literal maxTokens values" but
generate.ts inlines 16384 twice. If you consolidate, that is a ticket, not a drive-by.

## AI call caps per event (verified in routes, 2026-07-09)

`Event.aiCallsUsed` (schema.prisma:88, default 0) increments **only on success**, after
parse. Cap check happens before the call. Caps are **hardcoded per route** — a known
drift hazard (GTC-133 found 6 divergent sites when it bumped them; GTC-145 later lowered
finalize-plan 20→10, and `regenerate/preview` checks the cap without incrementing). The
values are per-route and drift (10 vs 20 as of 2026-07-09) — the **canonical value table
is `gather-config-and-flags` section 4**; re-check before citing:
`grep -rn "AI_CALL_LIMIT" src/`.

Cap hit → 429 `{ error: 'AI call limit reached for this event' }`. To reset during
testing: `UPDATE "Event" SET "aiCallsUsed" = 0 WHERE id = '<eventId>';` (dev DB only).

All these routes require HOST role (`requireEventRole`); finalize-plan also allows COHOST.

## The V2 path: finalize-plan route anatomy

POST `/api/events/[id]/finalize-plan` (src/app/api/events/[id]/finalize-plan/route.ts):

1. Auth: `requireEventRole(eventId, ['HOST', 'COHOST'])`.
2. Cap check (10).
3. Loads `EventSetup`; 404 if missing.
4. `readDietaryData(setup.dietaryData)` (src/lib/dietary.ts) — GTC-150 three-state model:
   `unanswered | confirmed_none | confirmed_needs`. "Unanswered" is never presented to the
   model as "none"; it gets explicit-uncertainty language + a reminder row in dietaryCoverage.
5. Headcount from Household members (CHILD → kids; plus `littleCount`); falls back to
   `Event.guestCount ?? 10` only if households yield zero. (GTC-136 lesson: never read
   `Event.guestCount` as primary headcount.)
6. Builds `engagedCategories` in `FOOD_CATEGORY_ORDER` (defaults always engaged;
   non-defaults only if the host selected something), attaching reference items from config.
7. `buildPlanGenerationPrompt(...)` (prompts.ts:578) → `{ system, user }`; system prompt
   injects `getNzNotes(eventType)` from `plan-option-tree-config.json`.
8. ONE `callClaudeForJSON<FullPlanResponse>` — 16384 tokens, temp 0.8, label `finalize-plan:full`.
9. Increments `aiCallsUsed`.
10. **Deletes all existing `source: 'GENERATED'` teams** for the event (so re-runs replace,
    not stack; hand-added teams survive), then writes one Team per returned section and
    Items with `quantityUnit: 'CUSTOM'`, `source: 'GENERATED'`, `aiGenerated: true`,
    `generatedBatchId: 'm2-finalize-<timestamp>'`.
11. Returns `{ plan: { categories, dietaryCoverage, thingsToConsider } }` for
    `Moment2Step2Skeleton`.

Expected wall-clock: **~44s** for a 17-person Christmas (measured GTC-145/146). Do not
"fix" the wait without reading GTC-145's ship/revert analysis first.

**No mock fallback here.** If `ANTHROPIC_API_KEY` is unset or the call/parse fails, the
route returns 500 `{ error: 'Failed to finalize plan', details }`. The `details` string
contains the callSiteLabel on truncation — read it.

## The V1 path: generate.ts flow

`generatePlan(params, hostDescription?)` → `buildGenerationPrompt` (guest-scaled item
target 15-25/25-35/35-50/45-60 and team target 3-5..5-8) → `callClaudeForJSON` →
`validatePlanResponse` (teams/items arrays, required fields, backfills missing
`criticalReason` with a default + warning). Called by the V1 generate route, which the
god file invokes (`src/app/plan/[eventId]/page.tsx:889` and `:1018`).

**Mock fallback matrix** (trap-dense — memorize this):

| Function | API key missing | Claude call errors |
|---|---|---|
| `generatePlan` | returns mock plan | **rethrows** (route → 500) |
| `regeneratePlan` | returns mock plan | **silently returns mock plan** |
| `generateSelectiveItems` | returns mock items | **silently returns mock items** |
| finalize-plan route | 500 | 500 |
| suggest-resolution route | 503 | 500 |

The mock plan is V1-era and includes "Roast Turkey" — it violates the NZ product rules
(ham/lamb, L&P). If a plan looks culturally wrong AND generation was suspiciously instant,
check whether you got mock data (`reasoning` field says "fallback data because Claude API
is not available"). A regenerate that "succeeds" with Mushroom Risotto after an API error
is the silent-mock trap.

## The team-name matching contract (GTC-024 / GTC-030)

V1 items attach to teams by **exact string equality** on `teamName`. Claude returning
"Side Dishes" in items but "Sides" in teams used to silently drop every item and return
`{ success: true, items: 0 }`. The fix has three legs — keep all three intact:

1. **Prompt leg** — `PLAN_GENERATION_SYSTEM_PROMPT` "CRITICAL CONSISTENCY RULE — TEAM
   NAMES" (prompts.ts:156-160) and the same rule in `SELECTIVE_REGENERATION_SYSTEM_PROMPT`.
2. **Detection leg** — `findMissingTeamNames(items, existingTeamNames)` (generate.ts:588).
3. **Route leg** — generate route returns **422 with `missingTeamNames`** instead of
   silent success: selective path validates BEFORE any DB write (generate/route.ts:63-75);
   initial path returns 422 if `itemsCreated === 0 && aiResponse.items.length > 0`
   (generate/route.ts:266-280).

Regression tests (pure-function, no DB, no server):
```bash
npm run test:initial-plan-mismatch   # GTC-030
npm run test:regen-all-items         # GTC-024
```
These assert prompt text content — if you reword the team-name rules in prompts.ts, run
them; they are designed to fail on weakened wording.

**TEAM NAMES INSTRUCTION contract** (guided builder): when the host picks categories, the
user prompt appends `TEAM NAMES INSTRUCTION: Use exactly these team names, in this order:
[...]` plus a `CATEGORY RESTRICTION` block, and the system prompt has a matching
"HOST-PROVIDED TEAM NAMES" section (prompts.ts:162-163). TRAP: this instruction text
exists in **two copies** — `compileGuidedPrompt` in `src/lib/ai/generate.ts:495` (currently
has zero importers) and `compilePromptInline` in
`src/components/plan/GuidedPlanBuilder.tsx:182` (the one the UI actually runs, duplicated
client-side to avoid importing the server SDK chain). Editing only generate.ts changes
nothing the user sees. Keep both in sync or ticket the consolidation.

## Prompts: which are V1-legacy vs V2

| Symbol in `src/lib/ai/prompts.ts` | Era | Used by | NZ rules source |
|---|---|---|---|
| `PLAN_GENERATION_SYSTEM_PROMPT` (line 8) | V1 (live) | `generatePlan` → V1 generate route | Hardcoded in prompt text ("NZ CULTURAL OVERRIDE", ham/lamb, L&P, no winter drinks Nov–Mar) |
| `PLAN_REGENERATION_SYSTEM_PROMPT` (line 173) | V1 (live) | `regeneratePlan` | **None — no NZ rules in this prompt** |
| `SELECTIVE_REGENERATION_SYSTEM_PROMPT` (line 235) | V1 (live) | `generateSelectiveItems` | None |
| `buildGenerationPrompt` / `buildRegenerationPrompt` / `buildSelectiveRegenerationPrompt` | V1 (live) | as above | — |
| `buildPlanGenerationPrompt` (line 578) | **V2 — the current main path** | finalize-plan route | Injected per event type via `getNzNotes()` from `plan-option-tree-config.json` |
| `RESOLUTION_SYSTEM_PROMPT` | V1-era (live) | inline in suggest-resolution route | None |

**Trap:** the V1 prompts read like the "main" prompts (they are first in the file, long,
detailed). They are NOT what Moment 2 uses. If the founder says "the plan generation
prompt", confirm which path: V2/Moment 2 = `buildPlanGenerationPrompt`; V1 dashboard =
`PLAN_GENERATION_SYSTEM_PROMPT`. The V1 prompt demands "MINIMUM 25 items" and includes a
mulled-wine example block — deliberately opposite in philosophy to V2's "realism beats
completeness, roughly 15–30 items". Do not cross-pollinate instructions between them.

## History in 5 lines (why single-call — do not re-litigate without data)

1. Apr–May 2026 (GTC-116/121–128): per-section generation — one Claude call per accordion close, plus gap-fill, dietary-coverage, and considerations calls.
2. Result: cross-section duplication (Yule Log in Cake AND Dessert), 86 items / 9 categories for a 17-person Christmas, unit confusion, truncation 500s (GTC-142).
3. GTC-145 `[EXPERIMENTAL]` branch `experiment/single-ai-call`: ONE call generates everything → **86 → 25 items (-71%)**, 6 categories, zero duplication, 43.86s wait, vs Kate's real-spreadsheet ground truth of ~19 items.
4. GTC-146 merged it to `feat/moment-one-redesign` (re-measured: 28 items, "+3 within AI variance at temp 0.8"); GTC-152 deleted the dead per-section code and dropped `EventSetup.generatedData`.
5. Lesson encoded: a coordinated single call beats per-section calls for coherence; **measure item counts before and after any generation change**. Cost of learning it: ~3 weeks.

## Conflict detection is NOT an LLM call

`src/lib/ai/check.ts` (428 lines) lives under `lib/ai/` but is deterministic TypeScript:
oven-capacity math, dietary-gap counting, coverage checks, fingerprinted `ConflictData`
rows. It is called by `/api/events/[id]/check`. Only `suggest-resolution` (a separate
route, invoked per conflict on demand) uses Claude. Debugging "wrong conflicts" is a
logic-reading exercise, not a prompt exercise — and it costs no tokens to test.

## Prompt-change protocol (binding)

Prompt changes are architecture-grade risk here (see History). They ride the experiment
pattern from `gather-experiment-methodology`: hypothesis → predicted numbers written down
FIRST → measure before/after on the same fixture → ship/revert decision in the ticket.

**Runbook:**

1. Open a GTC ticket; work on a branch. Tag `[EXPERIMENTAL]` if the change is structural
   (new response shape, new call, merged/split calls). Never commit/push without explicit
   approval in chat.
2. Seed the benchmark event — the GTC-145/146 baseline was a 17-person Christmas,
   Vegetarian + Gluten-free, all default categories. The closest existing seed is
   `scripts/seed-gtc-133-test-event.ts` (6 Kate-family households, 14 named members +
   `littleCount` extras — count the final headcount it prints; UNVERIFIED whether this is
   the exact GTC-145 fixture, and the script is untracked on `feat/moment-one-redesign`
   as of 2026-07-09):
   ```bash
   npx tsx scripts/seed-gtc-133-test-event.ts
   npm run dev
   # open http://localhost:3000/plan/<eventId>?setup=true and walk Moment 2
   ```
3. Generate BEFORE (current prompt) and AFTER (your change), same event shape. Because
   finalize-plan runs temp 0.8, run at least 2–3 generations per side before trusting a
   delta; V1 paths run temp 1.0 — variance is even higher there.
4. Measure and record in the ticket, per run:

   | Metric | Baseline (GTC-145/146, 17-person Christmas, as of 2026-07-09) | Red flag |
   |---|---|---|
   | Total item count | 25–28 (single-call) vs 86 (per-section, dead) | Drift toward 40+ = over-generation regression; single digits = truncation or dropped items |
   | Category/team count | 6 | New unrequested categories = ENGAGED-CATEGORIES-ONLY rule broken |
   | Cross-section duplicates | 0 | Any (e.g. cake item in Dessert AND Cake) |
   | Dietary coverage | One row per confirmed requirement; reminder row when unanswered (GTC-150 semantics) | Empty array when needs confirmed; "none assumed" when unanswered |
   | NZ markers | Ham/lamb mains, L&P in drinks, pavlova; NO turkey-as-primary, NO mulled wine Nov–Mar | Any violation is a product-taste gate failure |
   | Critical count (V1 path only) | 3–5 max per the V1 prompt | Everything marked critical |
   | Wait time | ~44s | Big increase without quality gain |
   | Server log | no `AI response truncated` lines | Any truncation → raise the specific cap, don't shrink the prompt blindly |
5. If you touched team-name wording: `npm run test:initial-plan-mismatch && npm run test:regen-all-items`.
6. Ship/revert recommendation with numbers goes in the ticket (GTC-145 is the template).

## Traps checklist (learned the hard way)

- [ ] **Silent item drop** — any new code path that skips items on `teamName` mismatch must surface 422 + `missingTeamNames`, never `success: true` with 0 items (pre-GTC-030 behavior).
- [ ] **Truncation without labels** — every new `callClaudeForJSON` gets a `callSiteLabel` (GTC-142).
- [ ] **Editing V1 prompts thinking they're V2** — Moment 2 uses `buildPlanGenerationPrompt` only.
- [ ] **Temperature** — default is 1.0 if omitted (claude.ts:51); V1 calls run 1.0, finalize-plan 0.8, suggest-resolution 0.7. One good/bad run proves nothing.
- [ ] **Silent mock data** — `regeneratePlan`/`generateSelectiveItems` return mock on API errors; check the `reasoning` string before trusting output.
- [ ] **Two copies of the guided prompt** — generate.ts `compileGuidedPrompt` vs GuidedPlanBuilder.tsx `compilePromptInline`; the UI uses the inline one.
- [ ] **Hardcoded per-route caps** — changing `AI_CALL_LIMIT` means grepping all sites, not editing one.
- [ ] **Re-run stacking** — finalize-plan deletes `source: 'GENERATED'` teams before writing; preserve that or re-runs double the plan.
- [ ] **Stale docs** — `docs/moment-1-and-2-build-report.md` / `docs/moment-2-flow-document.md` describe the deleted per-section architecture; trust GTC-145/146/152 tickets and the code.
- [ ] **Headcount** — derive from households, not `Event.guestCount` (GTC-136).
- [ ] Nothing here licenses skipping change control: tickets, approval-before-commit, and do-not-touch zones (GATHER-BUILD-CONSTANTS.md) all apply to prompt edits too.

## Provenance and maintenance

All facts verified against the repo on 2026-07-09 (branch `feat/moment-one-redesign`).
Re-verify in seconds:

```bash
grep -n "DEFAULT_MODEL" src/lib/ai/claude.ts                          # model id + line
grep -n "temperature ?? " src/lib/ai/claude.ts                        # default temperature
grep -rn "AI_CALL_LIMIT" src/                                         # every cap + value
grep -rn "callSiteLabel:" src/                                        # every labeled call site
grep -rn "maxTokens" src/lib/ai src/app/api/events                    # every token cap
grep -n "MAX_TOKENS" src/lib/ai/token-limits.ts                       # surviving constants
grep -rn "callClaude" src/lib/ai/check.ts                             # expect no output (deterministic)
ls 'src/app/api/events/[id]/' | grep -i generate                      # generate exists; generate-section must NOT
grep -n "TEAM NAMES INSTRUCTION" -r src/                              # both prompt copies still in sync?
grep -c nzNotes src/lib/ai/plan-option-tree-config.json               # NZ notes count (10)
npm run test:initial-plan-mismatch && npm run test:regen-all-items    # team-name contract intact
git log --oneline --grep="GTC-145\|GTC-146\|GTC-152"                  # single-call lineage
```
