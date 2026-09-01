> Use this template for complex tickets: multi-actor, unknown root cause,
> Stripe required, or brand/trust risk. For standard tickets use BUG-TICKET-TEMPLATE.md.

# BUG-TICKET-TEMPLATE.md
# Gather Bug Ticket — AI-Executable Template
# Generated via Lichen Protocol walk — 2026-03-05
# All executors must read GATHER-BUILD-CONSTANTS.md before using this template.

---

## 0. Citations (binding — GTC-222)

**The Citations section of `BUG-TICKET-TEMPLATE.md` is binding on this template
too. Read it before writing a single citation.** In short: cite the symbol
(`onAssignmentReleased` in `src/lib/ledger.ts`), never the line number; use
`// ANCHOR(GTC-nnn): label` where there is no symbol to name; a comment records
WHY, not WHAT; a deliberate temporary state names the ticket that ends it.

Complex tickets cite more code than standard ones, so they rot faster. A
multi-actor reproduction package that addresses ten call sites by line number
is ten silent failures waiting on the next refactor.

---

## 1. Title and Bug Signal Lock

**Title format:** `[Domain Area]: [Symptom]`

**Domain areas:**
Auth | Middleware | Plan/Dashboard | Plan/Events | Participant/View |
Host/View | Coordinator/View | Demo | Billing | API | DB
If none fit: use Other/<descriptive-name> and add it to the Domain Areas list
in BUG-TICKET-TEMPLATE.md.

**Core flows** (used to determine severity):
- Payment — Stripe checkout, event creation gate
- Plan Creation — AI generation, item/team management, conflict detection
- Invite/Join — link generation, participant link resolution, attendance response
- RSVP/Assignment — Accept/Decline items, coordinator assignment
- Host Dashboard — event monitoring, status tracking, freeze flow
- Auth — magic link, session management

**Title**
`[Domain Area]: [Symptom]`

**Expected**
- UI: [What the user should see — one sentence]
- Invariant: [What should be true at the system level — one sentence]

**Actual**
- UI: [What the user sees instead — one sentence]
- Invariant: [What is actually true at the system level — one sentence]

**Impact**
- Role: [ ] Host [ ] Coordinator [ ] Participant [ ] All
- Platform: [ ] Web [ ] Mobile [ ] All
- Environment: [ ] Prod [ ] Staging [ ] Both
- Visibility: [ ] Silent failure [ ] Visible error [ ] Degraded experience

**Severity**
[ ] Critical — breaks a core flow, silent failure, or data risk
[ ] High — degrades a core flow, user notices, workaround exists
[ ] Medium — wrong behaviour in a secondary flow, cosmetic impact on trust
[ ] Low — polish, copy, minor visual, no functional impact
[ ] Escalated — security / privacy / data integrity risk (forces Critical)

**Clean State**
Before beginning reproduction steps, confirm:
[ ] Fresh browser profile OR cookies and localStorage cleared
[ ] No active Gather session
[ ] DB in known state — [ ] default seed [ ] custom (describe below)
[Custom DB state if required:]

**Smallest Failing Case**
[Numbered steps from clean state to observable failure. Minimum steps only.
 Label each step with actor tag if multi-actor.]
1. [Host/Coordinator/Participant/System]
2. [Host/Coordinator/Participant/System]
3. [Host/Coordinator/Participant/System]
Observe: [Exact thing that proves the failure — UI state, network response,
cookie value, redirect destination]

---

## 2. Deterministic Reproduction Package

**Required User State**
- Role: [ ] Host [ ] Coordinator [ ] Participant
- Auth state: [ ] Logged in [ ] Logged out [ ] Token-only (no cookie/session;
  Authorization header only)
- Permissions/conditions: [Any additional state required — e.g. "host has
  completed setup modal", "event in CONFIRMING phase"]

**Multi-actor Reproduction**
[ ] Not required
[ ] Required — each actor must have its own session boundary
    (separate browser profiles or incognito windows)
    Allowed actor tags: [Host] [Coordinator] [Participant] [System]

**Required Data**
Select exactly one method (1–3) as the source of truth for creation:

[ ] 1. Automated — seed script / fixture / test factory:
    `[exact command]`
[ ] 2. UI steps — only if automation doesn't exist:
    [ordered steps to create required data via UI]
[ ] 3. Direct DB insert — only if unavoidable:
```sql
    [exact SQL]
```
    Rollback: `[exact rollback command or SQL]`

**Environment Variables and Feature Flags**
[ ] Default — bug does not touch auth, payments, messaging, external services,
    routing, or environment-dependent behaviour. Confirm defaults apply.
[ ] Explicit declaration required:
    | Variable         | Required value   | Location                     |
    |------------------|------------------|------------------------------|
    | [VAR]            | [value/redacted] | [.env.local / Vercel / etc.] |

**Async / Webhook Trigger**
[ ] Not applicable
[ ] Applicable — specify trigger method (must be executable):
    - Type: [ ] Stripe webhook [ ] SMS reminder [ ] Queue/cron job [ ] Other
    - Environment: [ ] Local [ ] Staging
    - Trigger method:
      - Preferred — CLI/tool command: `[exact command]`
      - Acceptable — provider dashboard/manual replay: [ordered steps]
    - Evidence: Observe: [exact event/log/network call that confirms trigger fired]

**Reproduction Steps**
[Restate Smallest Failing Case from Theme 1 verbatim.
 Label each step with actor tag if multi-actor.]
1. [Host/Coordinator/Participant/System]
2. [Host/Coordinator/Participant/System]
3. [Host/Coordinator/Participant/System]
Observe: [Exact observable failure]

**Full Reproduction Path**
[ ] Not required
[ ] Required — reason: [ ] Multi-actor [ ] Async [ ] Webhook [ ] Race condition
                         [ ] Other: [describe]
    [Full ordered steps. Label each step with actor tag if multi-actor.]
    1. [Host/Coordinator/Participant/System]
    2. [Host/Coordinator/Participant/System]
    3. [Host/Coordinator/Participant/System]
    Observe: [Exact observable failure]

---

## 3. Environment and Execution Constraints

**Constants File**
Before writing any code:
1. Locate GATHER-BUILD-CONSTANTS.md in the repo root
2. Read it in full
Status: [ ] Exists and read [ ] Missing
If missing → STOP. Report: "Constants file missing; cannot verify environment."
Do not proceed on assumptions.

**Preflight Sanity Sequence**
Run the Preflight Sanity Sequence as defined in GATHER-BUILD-CONSTANTS.md
and paste results here before making any changes.
If any step fails → STOP. Report the failure and propose a patch to
GATHER-BUILD-CONSTANTS.md if the file is outdated.

**Severity-Linked Execution Latitude**
Derive from severity set in Theme 1:
[ ] Critical — read broadly across all relevant layers, fix the root cause,
    add regression test. If fix requires expanding scope beyond stated scope,
    STOP and report rationale + proposed expanded scope before proceeding.
[ ] High — fix the identified area, regression test required (test-first per
    Theme 4; escape hatch only if documented), do not refactor adjacent code.
[ ] Medium — minimal diff, one file preferred, no refactoring,
    no tests required unless trivially added.
[ ] Low — single targeted change only, no tests required,
    no adjacent changes under any circumstance.

**Scope Constraints**
This ticket covers:
[Explicit list of domain areas / routes / components in scope — derived from
bug signal in Theme 1. CC must not change anything outside this scope
definition without stopping and reporting first.]
If this field is empty or marked Unknown → STOP (triggers Stop Condition 7).

**Do-Not-Touch Zones**
All do-not-touch zones defined in GATHER-BUILD-CONSTANTS.md are binding.
Executor must not refactor, restructure, or optimise any listed zone
unless this ticket explicitly authorises touching that zone below.

**Overrides**
[ ] No overrides — constants apply as written
[ ] Overrides required:
    - Override: [exactly what is being overridden]
    - Reason: [why this ticket requires it]
    - Scope: [how far the override extends — domain area, route, or behaviour]
    Note: overrides must be explicit and minimal. One override per entry.
    Overrides may not bypass Do-Not-Touch zones unless the ticket explicitly
    authorises touching that zone.
    If async/webhook work requires a different preflight (e.g. Stripe CLI),
    declare it here, not by duplicating the base sequence.

---

## 4. Proof of Fix and Acceptance Criteria

**Red/Green Gate Order**
Derive from severity set in Theme 1:

[ ] Critical / High — test-first required:
    1. Implement or select the regression test
    2. Run it and confirm RED (fails on current base) — paste output
    3. Implement the fix
    4. Run it and confirm GREEN (passes) — paste output
    5. Commit test with fix

    Escape hatch (High only; Critical only in truly constrained cases):
    If test-first is not feasible due to harness limitations (e2e unavailable,
    external dependency cannot be mocked, reproduction non-deterministic in CI):
    STOP and report:
    - Why test-first is infeasible
    - What would be needed to make it feasible
    Document the substitute gate in the ticket under Evidence Package.
    Do not proceed until substitute gate is documented.

[ ] Medium — test-first optional:
    Run declared test command(s) on base and after fix and paste results
    (or state "base run already captured in Preflight output" if identical).
    No new test required.

[ ] Low — no test requirement:
    Assertion checklist sufficient.

**Acceptance Assertions**
Checkboxes written as observable assertions — not "the bug is fixed" but
the exact condition that must be true. Each must be independently verifiable
without judgment calls.

Severity-linked minimum:
- Critical / High — minimum 3 assertions, at least one must be an Invariant
- Medium — minimum 2 assertions, UI observable acceptable
- Low — minimum 1 assertion

Assertion types:
- [ ] UI — [exact observable UI state]
- [ ] Invariant — [exact system-level condition that must be true]
- [ ] UI — [exact observable UI state]

**Adjacent Flow Checks**
Flows the executor must verify have not regressed after the fix.
Derive from core flows defined in Theme 1.

[ ] Critical / High — explicitly list and verify each adjacent flow:
    [ ] [Core flow name]: [specific check]
    [ ] [Core flow name]: [specific check]

[ ] Medium / Low — run preflight smoke test only. No additional
    checks required. Paste smoke test results.

**Evidence Package**
The executor must not claim "fixed" without submitting:

[ ] Critical / High:
    - RED test output (before fix)
    - GREEN test output (after fix)
    - Assertion checklist with each item confirmed
    - Adjacent flow check results
    - Commit hash of fix + regression test

[ ] Medium:
    - Test command results on base and after fix
    - Assertion checklist with each item confirmed
    - Smoke test results
    - Commit hash of fix

[ ] Low:
    - Assertion checklist with each item confirmed
    - Commit hash of fix

---

## 5. Ticket Output Contract

### Stop Conditions
Stop and report — do not proceed — when:

1. GATHER-BUILD-CONSTANTS.md is missing
2. Preflight sanity sequence fails
3. Bug cannot be reproduced from the steps as written
4. Red test cannot be confirmed before fix (Critical/High — unless escape
   hatch documented)
5. Fix requires expanding scope beyond Theme 3 scope constraints
6. Plan requires touching a Do-Not-Touch zone not explicitly authorised
7. A required unknown is encountered — information marked Unknown becomes
   necessary to reproduce, test, or implement. Do not guess.
8. Work would trigger real-world side effects (Stripe charges, live SMS/email
   sends, prod webhooks) and the ticket has not explicitly confirmed safe
   environment. Confirmation must be explicit in this ticket — e.g.
   "Stripe test mode confirmed", "SMS stubbed/test provider confirmed",
   "webhooks replayed in staging only".
9. Fix appears to require a DB schema migration or changes to production data
   shape — stop unless the ticket explicitly authorises and includes
   migration + rollback plan.

In all stop cases the executor must:
- State which stop condition was triggered (by number)
- Paste relevant output or evidence
- Propose resolution if possible
- Await instruction before proceeding

### Plan (Executor-Proposed)
The executor produces this section — not the ticket author.

Produce the plan only after:
1. GATHER-BUILD-CONSTANTS.md read in full
2. Preflight sanity sequence passed and results pasted
3. Bug reproduced and Observe confirmed
4. (Critical / High only) RED test confirmed and output pasted

Plan must include:

**Hypothesis** (marked as hypothesis until proven by red test or reproduction)
[Suspected root cause — one paragraph maximum]

**Minimal Change Set**
[Domain areas / routes / components that will be touched — nothing else]

**Test Strategy**
[How GREEN will be achieved — existing test extended, new test written,
or escape hatch invoked with documented substitute gate]

**Rollback Risk**
[What could break if this change is wrong — adjacent flows, sessions,
data integrity, external side effects]

If the plan requires expanding scope beyond Theme 3 scope constraints,
or touching a Do-Not-Touch zone not explicitly authorised:
STOP and report proposed scope expansion before writing any code.

### Unknowns
Mark any information that is missing and not required to proceed as:
`Unknown — not required to proceed`
Mark any information that is missing and required to proceed as:
`Unknown — STOP (triggers Stop Condition 7)`
Do not guess. Do not fill unknowns with assumptions.

### Executor Checklist
Before claiming this ticket complete, confirm:
[ ] GATHER-BUILD-CONSTANTS.md read
[ ] Citations are symbols, not line numbers (§0)
[ ] Preflight passed and results pasted
[ ] Bug reproduced and Observe confirmed
[ ] Plan produced and no unauthorised scope expansion
[ ] (Critical/High) RED confirmed before coding
[ ] Fix implemented within declared scope
[ ] No Do-Not-Touch zones modified (or explicit authorisation recorded
    in Overrides)
[ ] (Critical/High) GREEN confirmed and regression test committed
[ ] Acceptance assertions checked and confirmed
[ ] Adjacent flows verified (Critical/High) or smoke test passed (Medium/Low)
[ ] Evidence Package assembled and pasted
[ ] Commit hash recorded
[ ] No stop conditions triggered without resolution
Then commit with the message:
"chore: add AI-executable bug ticket template (Lichen Protocol walk 2026-03-05)"

Report the commit hash when done. Do not push yet.
