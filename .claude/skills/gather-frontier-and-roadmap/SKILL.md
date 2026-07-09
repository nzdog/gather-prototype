---
name: gather-frontier-and-roadmap
description: >
  Load this when asked "what's next", "pick up the roadmap", "make it better", "what should we
  work on", or when starting open-ended improvement work on Gather with no ticket in hand.
  Covers the recorded roadmap (Epics 1-6), the verified gap between BUILD_STATUS.md and the
  code, the top nearest work items with first steps and done-when milestones, candidate quality
  improvements, and explicit anti-goals. Not for executing the V1/V2 reconciliation itself or
  for experiment methodology.
---

# Gather Frontier and Roadmap

**Posture (founder decision, 2026-07-09):** the frontier of this project is PRAGMATIC —
ship the recorded roadmap at high quality. No research theater, no speculative features.
"Beyond state of the art" here means: every shipped change is ticketed, measured, and
evidenced, and the roadmap ledger tells the truth.

Everything below was verified against the repo on 2026-07-09. Re-verify with the commands
in "Provenance and maintenance" before acting — this codebase moves fast and its status
docs drift (see Section 2, which is itself a worked example of that drift).

## When NOT to use this skill

| If the task is... | Load instead |
|---|---|
| Retiring V1, decomposing the god file, fixing household delete-recreate | `gather-v1-v2-reconciliation-campaign` |
| Running a hunch → experiment → measured-result cycle | `gather-experiment-methodology` |
| Understanding tickets, gates, commit rules, do-not-touch zones | `gather-change-control` |
| Changing AI prompts / generation | `gather-ai-generation` |
| Schema or migration work | `gather-data-model-and-migrations` |

## Jargon (defined once)

| Term | Meaning |
|---|---|
| Moment | A stage of the V2 host journey: M1 "Who's coming?" (households), M2 "What's the plan?" (AI plan), M3 "Who's bringing what?", M4 "Is everyone sorted?" |
| Epic | A numbered workstream in docs/BUILD_STATUS.md (Epics 1-6, Jan 2026 era) |
| GTC ticket | A change ticket at docs/tickets/GTC-NNN.md; every change needs one (see `gather-change-control`) |
| Reachability tier | PersonEvent.reachabilityTier enum: DIRECT / PROXY / SHARED / UNTRACKABLE (prisma/schema.prisma:594) — how the app can reach a guest |
| Nudge | Automated SMS reminder, run by cron GET /api/cron/nudges every 15 min (vercel.json) |
| Proxy nudge | Nudge sent to a household's PRIMARY_CONTACT on behalf of unreachable members |
| Freeze | Event lifecycle transition CONFIRMING → FROZEN (src/lib/workflow.ts) |
| God file | src/app/plan/[eventId]/page.tsx (3,870 lines as of 2026-07-09), renders V1 dashboard AND V2 Moment flow |

## 1. The roadmap as recorded (docs/BUILD_STATUS.md)

BUILD_STATUS.md ("Last Updated: 2026-01-25") records:

- **Epic 1 — Tiered Identity + Reachability:** 1.1 reachability fields ✓ done; 1.2 Proxy
  Household Model, 1.3 Shared Link Fallback, 1.4 Dashboard Reachability Bar, 1.5 Proxy
  Nudge Logic — all shown open.
- **Epic 2 — RSVP Layer:** 2.1 RSVP state machine, 2.2 Not-Sure forced conversion, 2.3 dashboard attendance vs items.
- **Epic 3 — Nudge Infrastructure:** background jobs, scheduling engine, delivery.
- **Epic 4 — Freeze Enhancements:** freeze warnings, sub-80% reason tag, surgical edit while frozen.
- **Epic 5 — Threshold UX:** 80% threshold visual state.
- **Epic 6 — Metric Instrumentation:** frozen-rate metric, repeat-host-rate metric, reachability breakdown logging.

Epic spec + implementation notes live under `docs/04_roadmap/tickets/` (directories
`epic1-reachability 26-1-26` … `epic5-threshold 31-1-26` — note spaces in dir names, quote them).

## 2. CRITICAL: BUILD_STATUS.md is stale — code truth as of 2026-07-09

The checkboxes were last touched 2026-01-25 but implementation docs (e.g.
`docs/04_roadmap/tickets/epic3-nudge 26-1-26/EPIC3_IMPLEMENTATION_SUMMARY.md`, "Status:
Verified Complete", dated 26-31 Jan 2026) and the code show most of Epics 1-5 were built —
then partially broken/orphaned by the Moment 1 redesign (GTC-101+, Apr-Jul 2026). Do not
plan work off the checkboxes. Verified state:

| Item | Ledger says | Code says (verified 2026-07-09) |
|---|---|---|
| 1.1 Reachability fields | done | Done. PersonEvent.reachabilityTier at schema.prisma:155, contactMethod:156 |
| 1.2 Proxy household model | open | Built, then RESHAPED by Moment 1 redesign: households are now PersonEvent.householdId + householdRole (PRIMARY_CONTACT/PARTNER/GUEST/CHILD); proxyPersonEventId self-relation still in schema (:158) |
| 1.3 Shared link fallback | open | Built: /api/join/[token]/claim sets claimedViaSharedLink (route.ts:140) |
| 1.4 Dashboard reachability bar | open | Built: src/components/plan/ReachabilityBar.tsx, rendered by InviteStatusSection.tsx:499, which the god file imports |
| 1.5 Proxy nudge logic | open | Built then BROKEN: sender/eligibility exist but frequency-limiting fields were removed by the Moment 1 redesign — see work item A |
| 2.1-2.3 RSVP layer | open | Largely built: RsvpStatus enum (schema:875, PENDING/YES/NO/NOT_SURE), PATCH /api/p/[token] validates YES/NO/NOT_SURE (route.ts:227), NOT_SURE 48h forced-conversion candidates in src/lib/sms/nudge-eligibility.ts:218+ |
| 3.x Nudge infra | open | Built and LIVE: src/lib/sms/{nudge-scheduler,nudge-eligibility,nudge-sender,nudge-templates}.ts, cron route src/app/api/cron/nudges/route.ts, vercel.json cron */15 |
| 4.x Freeze enhancements | open | Built: "EPIC 4: FREEZE WARNINGS" block in src/lib/workflow.ts:73+ (warnings never block; the dead hard gate canFreeze() was removed in GTC-154, 2026-07-09); /api/events/[id]/frozen-edit route exists |
| 5.1 80% threshold | open | Built: invite-status route computes `thresholdReached = complianceRate >= 0.8` (src/app/api/events/[id]/invite-status/route.ts:371) |
| 6.x Metric instrumentation | open | GENUINELY OPEN. No frozen-rate or repeat-host-rate code exists (grep comes up empty). Substrate exists: InviteEvent table + logInviteEvent (src/lib/invite-events.ts:13), InviteEventType enum with 18 values (schema:882-901) |

## 3. Top nearest work items

Process reminder for ALL of these: read GATHER-BUILD-CONSTANTS.md first, open a GTC ticket
(BUG-TICKET-TEMPLATE.md at root; next number = GTC-153 as of 2026-07-09), never commit/push
without explicit founder approval in chat, and finish with the evidence bar (RED→GREEN test
output + `npm run test:security` exit 0). See `gather-change-control`.

### A. Proxy-nudge frequency limiting (Epic 1.5 rebuild) — highest urgency

**Current state:** `runNudgeScheduler` (src/lib/sms/nudge-scheduler.ts:90-93) calls
`findProxyNudgeCandidates` + `processProxyNudges` on every 15-minute cron run. Both
src/lib/sms/proxy-nudge-eligibility.ts (~line 28-33) and proxy-nudge-sender.ts (lines 21-23)
carry the same comment: the Moment 1 redesign removed the tracking fields
(proxyNudgeCount, lastProxyNudgeAt, claimedAt, escalatedAt) and "nudge scheduling logic
needs redesign in a future ticket." There is NO frequency check in the current path — a
household whose primary contact is SMS-reachable on a CONFIRMING event is re-eligible
every run. Direct nudges are safe (they check Person.nudge24hSentAt/nudge48hSentAt,
nudge-eligibility.ts:168-183); only the proxy path lost its brake.

**Mitigating conditions (why prod hasn't burned yet):** requires TWILIO_* env vars set
(isSmsEnabled, src/lib/sms/twilio-client.ts:23), event status CONFIRMING, primary contact
with valid NZ phone, contactMethod SMS, not opted out. UNVERIFIED whether production
currently has SMS enabled — check before declaring severity.

**Why it's hard:** the old per-HouseholdMember tracking table is gone; you must decide where
frequency state now lives. Candidates already in the codebase: `NudgeLog` (schema:926, keyed
by personEventId with nudgeType/sentAt) or querying `InviteEvent` rows of type
PROXY_NUDGE_SENT (already written on success, proxy-nudge-sender.ts:54-62). SMS opt-out
logic is a do-not-touch zone — gate around it, never through it.

**First three steps:**
1. Read src/lib/sms/proxy-nudge-eligibility.ts, proxy-nudge-sender.ts, nudge-scheduler.ts
   in full, then the original spec: `docs/04_roadmap/tickets/epic1-reachability 26-1-26/# TICKET 1.5- Proxy Nudge Logic.markdown` and `TICKET_1.5_IMPLEMENTATION.md`.
2. Open a GTC ticket proposing the state location (NudgeLog vs InviteEvent lookback) with a
   STOP condition: no schema change without checking `gather-data-model-and-migrations`.
3. Write the failing test FIRST: `tests/proxy-nudge-frequency-test.ts` (tsx script, assert
   counter pattern, DB-direct via Prisma, cleans up its own rows), wire as
   `npm run test:proxy-nudge`.

**You have a result when:** the new test seeds a CONFIRMING event with one SMS-reachable
PRIMARY_CONTACT, calls `findProxyNudgeCandidates` twice inside the limiting window, and
asserts eligible-then-skipped (RED before the fix, GREEN after); `npm run test:security`
still exits 0; and the redesign comment blocks in both proxy files are deleted.

### B. Roadmap ledger reconciliation (make BUILD_STATUS.md true)

**Current state:** the table in Section 2 above — the ledger misstates ~10 items.
BUILD_STATUS.md is a listed doc of record, so every zero-context session that reads it
starts with a false map.

**Why it's hard:** not technically — it's archaeology. Each checkbox needs a code-level
verification, and the Moment 1 redesign means "was built in January" does not imply "still
works in July" (item A is the proof).

**First three steps:**
1. Re-run every command in "Provenance and maintenance" below; record file:line or commit
   hash per epic item.
2. For each "built in Jan" feature, do one browser walk on the seeded dev event to confirm
   it still functions post-redesign (per-ticket seed scripts pattern: scripts/seed-gtc-NNN-test-event.ts).
3. Open a docs-type GTC ticket; rewrite BUILD_STATUS.md so each item is checked with a
   provenance pointer, or explicitly marked `open` / `built-then-broken (see GTC-NNN)`.

**You have a result when:** every line of docs/BUILD_STATUS.md carries a file:line, commit
hash, or GTC reference that a fresh session can verify in under a minute, and the
"Last Updated" date is current.

### C. Epic 6 metric instrumentation (the only genuinely unstarted epic)

**Current state:** nothing computes frozen rate, repeat-host rate, or reachability
breakdown. Substrate exists: `InviteEvent` rows are already logged fail-soft via
`logInviteEvent` (src/lib/invite-events.ts:13 — catches and console.errors, never throws);
Event.status and PersonEvent.reachabilityTier are queryable directly.

**Why it's hard:** definitional, not technical. "Frozen rate" needs a denominator decision
(all events? events that reached CONFIRMING? exclude Event.isDemo?). Decide with the
founder in the ticket BEFORE coding — this is a product-metrics decision, not an
engineering one.

**First three steps:**
1. Read `docs/launch-readiness-section-6-instrumentation-VERIFIED.md` and the Epic 6
   one-liners in BUILD_STATUS.md; list candidate metric definitions in a ticket.
2. Prototype as a READ-ONLY script `scripts/report-event-metrics.ts` (model it on
   scripts/list-recent-events-for-gtc125.ts, which already does event/team/item counts).
   No schema change, no API route yet.
3. Validate output against manual counts on the seeded dev DB; only then propose a
   dashboard surface in a follow-up ticket.

**You have a result when:** `npx tsx scripts/report-event-metrics.ts` prints frozen rate,
repeat-host rate, and a reachability-tier breakdown per event from live tables, and each
number reconciles with a hand-run Prisma/SQL count on the seeded database.

### D. Demo-name drift fix (small, live, verified bug)

**Current state (verified 2026-07-09):** the seed creates event
`'Henderson Family Christmas 2026'` while the demo routes and tests hardcode
`'…2025'` — demo session/token endpoints fail against a fresh seed. Canonical
six-location table: `gather-config-and-flags` section 7.

**Why it matters beyond the bug:** it is the same failure class as GTC-151 (hardcoded
allowlist drifting from the UI's source of truth → silent failure). Fix the class, not the
instance.

**First three steps:**
1. Open a bug ticket citing the locations in `gather-config-and-flags` section 7's table.
2. Extract one shared constant (e.g. a `src/lib/demo-constants.ts` exporting
   DEMO_EVENT_NAME) imported by seed, both demo routes, and the test — or better, key demo
   lookup on `Event.isDemo` instead of name matching (check how each route queries first).
3. RED: run `npm run test:demo-endpoints` against a freshly re-seeded DB
   (`npm run db:reset`) to capture the failure; then fix; then GREEN.

**You have a result when:** `grep -rn "Henderson Family Christmas" src/ prisma/ tests/`
shows the literal in at most one module, and `npm run test:demo-endpoints` passes against
a fresh `npm run db:reset` seed. WARNING: db:reset wipes the dev database — confirm nothing
unseeded matters first.

## 4. Candidate quality improvements (honest labels)

| Candidate | Label | Ground truth |
|---|---|---|
| Plan-quality metrics (item count, category count, duplication rate per generation) | candidate — nothing built | GTC-145 measured 86→25 items (-71%) BY HAND (docs/tickets/GTC-145.md:87-93). No automated capture exists. Nearest ancestor: scripts/list-recent-events-for-gtc125.ts. Value: makes every future prompt change measurable (see `gather-experiment-methodology`). |
| Magic-string extraction | candidate | Demo event name in 6 places (item D; table in `gather-config-and-flags` §7). Audit for siblings before a bulk ticket; GTC-151 is the incident precedent. |
| E2E lifecycle test | open gap — verified | No test walks DRAFT→CONFIRMING→FROZEN→COMPLETE end-to-end (inspected all of tests/, 33 top-level files, 35 including tests/phase-5/ — matching `gather-validation-and-evidence`'s inventory; closest is edit-item-frozen-block-test.ts, one frozen slice). Transitions live in src/lib/workflow.ts (1,037 lines). |
| Stripe webhook integration test | open gap — verified | src/app/api/webhooks/stripe/route.ts has zero test coverage (only "webhook" hit in tests/ is the SMS inbound route, sms-infrastructure-test.ts:275). CAUTION: Stripe is a do-not-touch zone — a test may READ/exercise it with Stripe CLI fixtures but must not weaken signature verification. Ticket + founder sign-off first. |
| Proxy-nudge test coverage | open gap — verified | `grep -rl proxy tests/` returns nothing. Falls out of work item A. |
| God-file decomposition (page.tsx, 3,870 lines) | campaign-owned | Do NOT start from this skill. Load `gather-v1-v2-reconciliation-campaign` — it sequences this behind decision gates. |
| GTC-130 (align eslint-config-next with Next major) | open ticket | Genuinely open (docs/tickets/GTC-130.md, status: open). Non-fatal build warning. |
| Stale ticket frontmatter | open — verified | GTC-137 and GTC-142 frontmatter say `in-progress` but bodies say CLOSED. Cheap docs ticket. |

## 5. Anti-goals (founder-set — do not propose these)

1. **No speculative ML / learning features.** The HostMemory/HostPattern/HostDefault model
   family is dormant scaffolding: verified 2026-07-09, the only code touching it is
   src/app/api/memory/{route,settings/route,patterns/route}.ts and the settings page
   src/app/plan/settings/page.tsx. NOTHING under src/lib/ (including the entire AI
   generation layer) reads it — generation is never personalized by it. Leave it dormant;
   removal would be its own ticketed decision, not a drive-by.
2. **No per-section generation revival.** The per-section AI architecture (GTC-116,
   121-128) was measured, found worse (86 encyclopedic items vs 25 coherent ones), reverted
   by GTC-145/146, and its dead code deleted by GTC-152. Any "generate sections
   independently for speed" idea re-opens a closed, evidenced decision — see
   `gather-experiment-methodology` for the worked example, and require new evidence of the
   same rigor before even proposing it.
3. **No routing around change control.** Nothing in this skill overrides
   GATHER-BUILD-CONSTANTS.md: do-not-touch zones stand, every change gets a ticket, and no
   commit/push/merge happens without explicit founder approval in chat.

## 6. Picking up open-ended "make it better" work — checklist

1. [ ] Read GATHER-BUILD-CONSTANTS.md and GATHER-KNOWN-BEHAVIOURS.md (repo root).
2. [ ] Run preflight: `npm install` → `npm run db:migrate` → `npm run dev` (Turbopack
   "Ready") → `npm run test:security` (exit 0).
3. [ ] Re-verify Section 2's table for your target item (commands below) — five months of
   drift happened once already.
4. [ ] Pick the highest item in Section 3 the founder hasn't vetoed; confirm scope with the
   founder in chat before writing code.
5. [ ] Open the GTC ticket, write the failing test, fix, evidence, await commit approval.

## Provenance and maintenance

Re-verify volatile facts (all from repo root):

```bash
# Ledger staleness + epic checkboxes
grep -n "Last Updated\|\[ \]\|\[x\]" docs/BUILD_STATUS.md
# Proxy-nudge redesign comments still present? (empty output = item A is done)
grep -rn "needs redesign in a future ticket" src/lib/sms/
# Proxy nudges still called from scheduler?
grep -n "processProxyNudges" src/lib/sms/nudge-scheduler.ts
# Demo-name drift still live? (fixed when <=1 defining module)
grep -rn "Henderson Family Christmas" prisma/seed.ts src/app/api/demo/ tests/demo-endpoints-test.ts
# Epic 6 still unbuilt?
grep -rni "frozenRate\|repeat_host\|repeatHost" src/ || echo "Epic 6 still open"
# HostMemory still dormant? (should list only api/memory/* and plan/settings)
grep -rln "hostMemory\|HostPattern\|HostDefault" src/
# God file size trend
wc -l "src/app/plan/[eventId]/page.tsx"
# Test inventory + wiring
ls tests/ && grep -c '"test:' package.json
# Stripe webhook coverage (empty = still untested)
grep -rln "stripe" tests/
# Open tickets / stale frontmatter
grep -l "status: open\|status: in-progress" docs/tickets/*.md
# Highest ticket number (next = +1)
ls docs/tickets/ | grep -o 'GTC-[0-9]*' | sort -t- -k2 -n | tail -1
# Cron schedule
cat vercel.json
```
