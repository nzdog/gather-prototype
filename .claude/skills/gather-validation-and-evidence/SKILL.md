---
name: gather-validation-and-evidence
description: >
  Load when you need to prove a Gather change works: writing or running tests,
  assembling the ticket Evidence package (RED->GREEN, security suite, commit hash),
  measuring plan quality (item/team counts) instead of eyeballing, reproducing a
  silent 4xx, verifying cascade/delete behaviour, detecting token truncation, or
  auditing route auth classifications. Keywords: test, tsx, assert, evidence,
  RED/GREEN, security suite, route-classifications, plan-metrics, measure.
---

# Gather: Validation and Evidence

How to prove things in this repo. "Evidence" means machine-checkable output —
test exit codes, row counts, HTTP status captures, diff stats — pasted into the
ticket. A claim without pasted output does not close a ticket here.

All facts below verified against the repo on 2026-07-09. Re-verification
one-liners are at the bottom.

## When NOT to use this skill

| You are trying to... | Load instead |
|---|---|
| Understand ticket lifecycle, commit rules, do-not-touch zones | `gather-change-control` |
| Triage a symptom you don't understand yet | `gather-debugging-playbook` |
| Run a hunch->measured-result architecture experiment (GTC-145 style) | `gather-experiment-methodology` |
| Change prompts, token budgets, AI parsing | `gather-ai-generation` |
| Start the dev server, seed data, get tokens/URLs | `gather-run-and-operate` |
| Write/repair a migration | `gather-data-model-and-migrations` |

## 1. The test system: tsx scripts, no framework

There is **no Jest, Vitest, or Playwright** — no configs, no deps in
`package.json`. GATHER-BUILD-CONSTANTS.md states this explicitly. Tests are
standalone TypeScript scripts in `tests/` (35 `.ts` files as of 2026-07-09,
including `tests/phase-5/`) executed directly with `tsx` (a TypeScript runner
already in `dependencies`):

```bash
npx tsx tests/<file>.ts        # run any test directly
npm run test:<name>            # 26 of them are wired as npm scripts
```

House convention (every test follows it):

1. `assert(name, condition)` (or `logTest`/`pass`/`fail`) increments
   pass/fail counters.
2. ANSI output: `\x1b[32m✓\x1b[0m` green tick on pass, `\x1b[31m✗\x1b[0m` red
   cross on fail, `\x1b[33m` yellow section headers.
3. Summary block at the end: total / passed / failed.
4. **`process.exit(1)` if any assertion failed, exit 0 otherwise.** The exit
   code is the contract — CI and the preflight gate read nothing else.

### Minimal skeleton for a NEW test (copy this)

```typescript
/**
 * GTC-XXX — <one-line description of what regression this pins>
 * RED state before fix: <which assertion fails and why>
 * Run with: npx tsx tests/<name>-test.ts
 */
import { thingUnderTest } from '../src/lib/<module>';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${name}`);
    failed++;
  }
}

console.log('\x1b[33m=== GTC-XXX: <title> ===\x1b[0m\n');

assert('describes expected behaviour, not implementation', thingUnderTest(...) === expected);

console.log(`\n\x1b[33m=== Summary ===\x1b[0m`);
console.log(`Total: ${passed + failed}  \x1b[32mPassed: ${passed}\x1b[0m  \x1b[31mFailed: ${failed}\x1b[0m`);
process.exit(failed > 0 ? 1 : 0);
```

If the test needs the DB, add `import { PrismaClient } from '@prisma/client'`,
wrap the body in an async `run()`, and follow the cleanup rules in section 4.

Then wire it in `package.json`:
`"test:<name>": "tsx tests/<name>-test.ts"` — every wired test follows this
exact pattern. A doc-comment header naming the GTC ticket and the RED state is
house style (see `tests/regen-all-items-test.ts` for the best exemplar: it
documents three root causes and which assertions were RED before the fix).

## 2. Test inventory, grouped by what each needs

Verified by reading imports of all 35 files. Four dependency classes:

**A. Pure logic — no DB, no server, no key. Run anywhere, instantly.**
Imports functions from `src/` and asserts on return values.

| npm script | File |
|---|---|
| `test:conflict-labels` | tests/conflict-action-labels.ts |
| `test:coordinator-conflict-detection` | tests/coordinator-conflict-detection-test.ts |
| `test:edit-item-frozen-block` | tests/edit-item-frozen-block-test.ts |
| `test:host-nudge` | tests/host-nudge-test.ts |
| `test:moment1-input` | tests/moment1-input-test.ts |
| `test:participant-null-coordinator` | tests/participant-view-null-coordinator-test.ts |
| `test:regen-all-items` | tests/regen-all-items-test.ts |
| `test:setup-modal-header` / `-next-button` / `-dashboard-entry` | tests/setup-modal-*.ts |
| `test:setup-progress-banner` | tests/setup-progress-banner-test.ts |
| `test:unassigned-critical-items` | tests/unassigned-critical-items-test.ts |
| `test:url-no-double-slash` | tests/url-no-double-slash-test.ts |
| `test:vcf-import` | tests/vcf-import-test.ts |
| `test:view-as-host-alert` | tests/view-as-host-alert-test.ts |
| `test:wrap-up` | tests/wrap-up-dispatch-test.ts |
| (unwired) | tests/coordinator-assignment.ts |

**B. Static source-assertion — reads route/component source with
`fs.readFileSync` and asserts on its content** (e.g. "route imports
requireEventRole", "production guard removed"). No server needed. This is the
house pattern for pinning auth wiring without spinning up HTTP.

| npm script | File |
|---|---|
| `test:demo-ui` | tests/demo-ui-isolation.ts |
| `test:batch-import-auth` | tests/batch-import-auth-test.ts |
| `test:invite-status-auth` | tests/invite-status-auth-test.ts |
| `test:host-preview` | tests/host-preview-test.ts |
| `test:initial-plan-mismatch` | tests/initial-plan-mismatch-test.ts (also pure-logic) |
| (unwired) | tests/security-inventory-gate.ts (reads route-classifications.json) |

**C. Needs PostgreSQL (`DATABASE_URL`, usually seeded `gather_dev`).**

| npm script | File | Notes |
|---|---|---|
| `test:security` | tests/security-validation.ts | DB reads + source assertions; THE gate |
| `test:event-setup` | tests/event-setup-test.ts | creates own rows, cleans up (exemplar) |
| `test:auto-assign` | tests/auto-assign-items-host-test.ts | |
| `test:demo-endpoints` | tests/demo-endpoints-test.ts | needs seeded demo event — see drift warning below |
| (unwired) | tests/schema-verification-test.ts, tests/verify-item-display-order.ts, tests/security-fixtures.ts | fixtures script creates rows |
| (unwired, **DESTRUCTIVE**) | tests/verify-personevent-team-setnull.ts | deletes a seeded team — re-seedable dev DB only |

**D. Live side effects or external services — read the header before running.**

| npm script | File | Requires |
|---|---|---|
| `test:tnz-sms` | scripts/test-tnz-sms.ts | **SENDS A REAL SMS.** `TNZ_AUTH_TOKEN` + `TEST_SMS_RECIPIENT=+64...`; refuses to run without recipient |
| (unwired) | tests/sms-validation-test.ts | DB; exercises `sendSms` validation *without* real sends (per its header) |
| (unwired) | tests/sms-infrastructure-test.ts | DB; phone/opt-out infrastructure |

Other notes:
- **No test in `tests/` requires the dev server.** Only `scripts/test-phase-*.ts`
  (legacy phase-validation scripts) fetch `localhost:3000`.
- **No test in `tests/` calls the live Anthropic API.** `scripts/test-generate-plan.ts`
  exercises `generatePlan`, which falls back to mock data when
  `ANTHROPIC_API_KEY` is unset (`src/lib/ai/generate.ts`).
- **Seed drift trap (as of 2026-07-09):** `test:demo-endpoints` fails against
  a fresh seed — the seed creates "Henderson Family Christmas **2026**" but the
  demo routes/tests expect "…**2025**". Known name-drift bug; canonical
  six-location table: `gather-config-and-flags` section 7. Do not "fix" the
  test to 2026 unilaterally — raise a ticket to unify the magic string.

## 3. The security suite is a contract

`npm run test:security` runs `tests/security-validation.ts`: **16 assertions**
covering frozen-state guards, auth-guard imports on sensitive routes, and DB
model accessibility. Verified passing 16/16 on 2026-07-09.

Binding doctrine (GATHER-BUILD-CONSTANTS.md, Do-Not-Touch zone 6): **never
weaken or skip a security assertion to make a test pass.** If it fails, the
code is wrong, not the test. The ticket template's Evidence section literally
asks for "Security suite: [16/16 or note any deviation]" — if the count ever
legitimately changes (new assertions added), note it in the ticket.

It is also the last step of the preflight sequence every executor runs before
any ticket: `npm install` -> `npm run db:migrate` -> `npm run dev` (Ready) ->
`npm run test:security` (exit 0).

## 4. Cleanup discipline for DB tests

Tests run against the shared `gather_dev` database. Rules, from the exemplar
`tests/event-setup-test.ts`:

1. Use a **deterministic, ticket-scoped id** for fixtures
   (e.g. `test-event-setup-116`), never random ids you can't find again.
2. Write a `cleanup(eventId)` that `deleteMany`s **only your own rows**, in
   FK-dependency order (children first: `eventSetup`, `personEvent`,
   `eventRole`, then `event`).
3. Call cleanup **both** at the start (idempotent re-runs after a crash) and
   at the end.
4. Never `deleteMany({})` without a `where` — the seeded demo event and other
   tickets' fixtures share the DB.
5. If your verification is destructive by design (e.g.
   `tests/verify-personevent-team-setnull.ts` deletes a team), say so in the
   header comment and require a re-seedable dev DB. Re-seed with
   `npm run db:seed`.

## 5. Route auth audit loop (state as of 2026-07-09 — partially broken)

`route-classifications.json` (repo root) is a **manually maintained** list of
API routes with `authType` one of `SESSION | TOKEN | PUBLIC | CUSTOM | NONE`,
plus `authEvidence` and `securityIssues` arrays. Current state:

- 74 routes classified in the JSON.
- 98 `route.ts` files exist under `src/app/api/` — **24 routes are
  unclassified.** Closing that gap is open work.
- `tests/security-inventory-gate.ts` (unwired — run with
  `npx tsx tests/security-inventory-gate.ts`) reads the JSON and exits 1 if
  any mutation / AI-cost / sensitive route has NO or WEAK auth.
- **Broken tooling, do not trust references to it:** the gate's failure text
  still mentions `scripts/classify-routes.ts` — it does not exist (the
  constants file's matching stale reference was corrected in GTC-153,
  2026-07-09). `scripts/triage-unknown-routes.ts` exists and parses
  `SECURITY_ROUTE_INVENTORY.md`, but expects it at the **repo root**
  (triage-unknown-routes.ts — `main()`, the `SECURITY_ROUTE_INVENTORY.md` path join) while the doc actually lives at
  `docs/05_ops/security/SECURITY_ROUTE_INVENTORY.md` — so the script errors
  from a clean run today; fix the path or copy the file before trusting its
  output. There is no `npm run test:security:inventory` script despite the
  gate's output claiming there is.

Practical loop when you ADD an API route:
1. Add an entry to `route-classifications.json` by hand (copy an existing
   entry's shape; put the guard call you used in `authEvidence`).
2. Run `npx tsx tests/security-inventory-gate.ts` — must print
   `SECURITY GATE PASSED`.
3. Run `npm run test:security` — must stay 16/16.

Count the gap anytime:
```bash
find src/app/api -name route.ts | wc -l   # routes on disk
python3 -c "import json; print(len(json.load(open('route-classifications.json'))))"
```

## 6. The evidence bar: what closes a ticket

From BUG-TICKET-TEMPLATE.md (default template) — the "Evidence
(Executor-Completed)" section must be filled **before committing**:

| Evidence item | What "done" looks like |
|---|---|
| Root cause confirmed | One paragraph: what was wrong, where |
| Files changed | One line per file |
| RED test output | Pasted output showing the failing assertion BEFORE the fix (Critical/High severity; otherwise "N/A — Medium/Low" or a documented escape hatch) |
| GREEN test output | Same test passing AFTER the fix |
| Assertions checked | Ticket's acceptance assertions ticked, individually |
| Adjacent flows verified | Named flows, actually exercised (GTC-151 walked 8 event types; GTC-145 checked the legacy generate route untouched) |
| Security suite | 16/16 or an explained deviation |
| Commit hash | Recorded in the ticket; house practice backfills it into the closed ticket file with a follow-up `chore(GTC-NNN): backfill commit hash` commit |

RED->GREEN means: write the test first, run it, paste the failure, apply the
fix, run again, paste the pass. If you cannot produce a RED state for a
Critical/High bug, that is Stop Condition 4 — document why and await
instruction; do not skip silently.

**Cite code by symbol, not line number** in every evidence field (root cause,
files changed) — `workflow.ts — canTransition()`, not `workflow.ts:243`. Line
numbers drift between the fix commit and the hash-backfill follow-up, so a line
reference is often stale by the time the ticket closes. Full rule in
`gather-docs-and-writing` House style (added by GTC-158).

## 7. Measure, don't eyeball — recipes with worked history

### 7a. Plan quality = counted items, not vibes (GTC-145 method)

The per-section AI architecture was retired because someone **counted**: 86
items / 9 categories for a 17-person Christmas vs 25 items / 6 categories
after the single-call rewrite (-71%), against a ground truth of ~19 items on
the host's real spreadsheet (docs/tickets/GTC-145.md, comparison table).
That table — not opinion — is what got the experiment merged.

Reproduce the measurement for any event:

```bash
# 1. Find the event id
npx tsx scripts/list-events.ts

# 2. Full metrics (teams, items/team, critical, assigned, dietary, source):
npx tsx .claude/skills/gather-validation-and-evidence/scripts/plan-metrics.ts <eventId>

# 3. Or raw SQL (table names are unmapped Prisma model names, quoted):
psql gather_dev -c "SELECT t.\"name\", count(i.id) FROM \"Team\" t
  LEFT JOIN \"Item\" i ON i.\"teamId\" = t.id
  WHERE t.\"eventId\" = '<eventId>' GROUP BY t.\"name\";"
```

`scripts/plan-metrics.ts` (shipped with this skill, **read-only**, verified
against a live event) also flags drift between the `Item.status` cache and the
`Assignment` relation. Rule from `src/lib/workflow.ts`: `ItemStatus`
(ASSIGNED/UNASSIGNED) is a **cache — never use it for safety gates or
evidence; count the `Assignment` relation directly** (one-to-one on
`itemId`, `response` in PENDING/ACCEPTED/DECLINED).

When changing anything in the generation path, record before/after counts in
the ticket exactly like GTC-145's table.

### 7b. Reproducing a silent 4xx (GTC-151 method)

Symptom class: UI looks fine, data vanishes later. GTC-151: a hardcoded
7-value event-type allowlist in the setup route rejected 9 of the 11 types the
UI offered -> every autosave returned 400 silently -> Step 1 data gone on
reload. Method that found and proved it (docs/tickets/GTC-151.md):

1. **Audit the allowlists first**: grep the validator's list and the UI's
   list, diff them (overlap was exactly `Christmas` and `Other`).
2. Walk the real flow in a browser **per input variant**, capturing the
   autosave request/response status for each (table of type -> 400/200).
3. Prove persistence: reload the page, walk back, confirm the saved state is
   still selected.
4. Fix = make the validator import the UI's source of truth
   (`CONFIG_EVENT_TYPES` from `src/lib/ai/config-loader.ts`), so the drift
   class cannot recur. Evidence = before/after status table, 8/8 PASS.

Generic rule: any 4xx on a background save is data loss. When testing a save
path, assert on the **response status**, not on the UI's optimistic state.

### 7c. Verifying cascade/delete behaviour (GTC-147 method)

Symptom class: deleting a parent silently destroys unrelated child data.
GTC-147: `Team` deletion cascaded to `PersonEvent` — people vanished from the
event and their nudge history went with them. Fixed by an `onDelete: SetNull`
migration. The verification script is the template:
`tests/verify-personevent-team-setnull.ts` —

1. Count child rows BEFORE (`PersonEvent` in event, rows on the team,
   dependent `NudgeLog` rows).
2. Perform the delete.
3. Count AFTER; assert rows preserved and FK nulled, print explicit
   `RESULT: PASS/FAIL`.
4. Run it BEFORE the schema change (RED) and AFTER (GREEN). It is
   destructive — seeded dev DB only, re-seed afterwards.

Before deleting any parent row in new code, read the relation's `onDelete` in
`prisma/schema.prisma` and write this style of before/after count script.

### 7d. Detecting token truncation (GTC-142 method)

Symptom class: AI route 500s or returns partial JSON at larger event sizes.
Cause: response hit the `max_tokens` cap. Detection is built in:
`parseClaudeJSON` in `src/lib/ai/claude.ts` throws when
`stopReason === 'max_tokens'` and logs
`[Claude API] AI response truncated (<callSiteLabel>) - max_tokens reached`.

- Grep server output for `AI response truncated` — the parenthesised label
  tells you which call site.
- Live labels (as of 2026-07-09): `finalize-plan:full`, `conflict-resolution`,
  `plan-generation`, `plan-regeneration`, `selective-regeneration`.
- **Any new `callClaudeForJSON` call must pass `callSiteLabel`** — GTC-142
  cost a debugging session precisely because a truncated dietary-coverage call
  threw with no attribution.
- Caps live in `src/lib/ai/token-limits.ts` (currently a single export,
  `MAX_TOKENS_FULL_PLAN = 16384`); never inline `maxTokens` literals at call
  sites. Raising a cap costs nothing unless emitted — it is an upper bound.

## 8. Diagnostic scripts inventory (read before writing your own)

All run as `npx tsx scripts/<name>.ts`. Verified to exist 2026-07-09.

| Script | Purpose |
|---|---|
| scripts/list-events.ts | All events: id, status, team/conflict counts, plan URL |
| scripts/test-tokens.ts | Token generation + idempotency of `ensureEventTokens()` |
| scripts/create-test-event.ts | Fixture event for invite-links flow |
| scripts/create-gtc-test-event.ts, scripts/gtc-test-event-add-participants.ts | Generic GTC fixture event helpers |
| scripts/seed-gtc-133-test-event.ts | Per-ticket seed (uncommitted on branch); house pattern: `scripts/seed-gtc-NNN-test-event.ts` per UI ticket |
| scripts/seed-test-conflicts.ts, scripts/seed-rsvp-test.ts | Conflict / RSVP fixtures |
| scripts/check-rsvp-eligibility.ts | RSVP eligibility probe |
| scripts/test-generate-plan.ts | Exercises `generatePlan` (mock fallback without API key) |
| scripts/test-phase-*.ts | Legacy phase validations — need `localhost:3000` running |
| scripts/triage-unknown-routes.ts | BROKEN from a clean run — expects SECURITY_ROUTE_INVENTORY.md at repo root; the file lives at docs/05_ops/security/ (see section 5) |

House pattern: a UI ticket that needs specific data gets its own
`scripts/seed-gtc-NNN-test-event.ts` so the browser walk is reproducible.

## 9. Checklist: adding a test for your change

- [ ] File at `tests/<kebab-name>-test.ts`, header comment naming the GTC
      ticket and the RED state
- [ ] Skeleton from section 1: counters, ANSI ticks, summary,
      `process.exit(1)` on failure
- [ ] Prefer class A (pure) or B (source-assertion) — only touch the DB when
      the behaviour lives there
- [ ] DB tests: ticket-scoped fixture ids + `cleanup()` at start AND end
      (section 4)
- [ ] Wire `"test:<name>": "tsx tests/<file>.ts"` in package.json
- [ ] Capture RED output, apply fix, capture GREEN output — both into the
      ticket
- [ ] `npm run test:security` still 16/16; new API routes classified
      (section 5)
- [ ] Adjacent flows named and exercised; measurements (counts/statuses)
      pasted, not described

## Provenance and maintenance

Verified 2026-07-09 on branch `feat/moment-one-redesign`. Re-check volatile
facts in seconds:

```bash
# Still no test framework?
grep -iE '"(jest|vitest|playwright)"' package.json; ls | grep -iE 'jest|vitest|playwright'

# Test file and npm-script counts (35 files / 26 scripts as of 2026-07-09)
find tests -name '*.ts' | wc -l
grep -c '"test:' package.json

# Security suite size and result (16/16 as of 2026-07-09)
npm run test:security

# Route classification gap (74 classified vs 98 on disk as of 2026-07-09)
python3 -c "import json; print(len(json.load(open('route-classifications.json'))))"
find src/app/api -name route.ts | wc -l

# Demo-name seed drift still present? (both greps should agree before trusting test:demo-endpoints)
grep -n "Henderson Family Christmas" prisma/seed.ts src/app/api/demo/tokens/route.ts

# Truncation labels still current?
grep -rn "callSiteLabel:" src/

# Token caps
grep -n "export const" src/lib/ai/token-limits.ts

# plan-metrics still matches schema? (should print metrics, not a Prisma error)
npx tsx .claude/skills/gather-validation-and-evidence/scripts/plan-metrics.ts "$(psql gather_dev -tA -c 'SELECT id FROM "Event" LIMIT 1;')"
```
