> Default template. For complex tickets (multi-actor, unknown root cause,
> Stripe required, brand/trust risk) use BUG-TICKET-TEMPLATE-FULL.md.

# BUG-TICKET-TEMPLATE.md

AI executor preamble: Before starting any ticket —
1. Read GATHER-BUILD-CONSTANTS.md in full
2. Run the Preflight Sanity Sequence and paste results
3. If preflight fails → STOP

---

## [GTC-XXX] — [Area/Flow]: Short description

**Severity:** [ ] Critical [ ] High [ ] Medium [ ] Low
Escalated (brand/trust risk): [ ] Yes [ ] No

---

### Signal

**Expected**
What should happen.

**Actual**
What actually happens. Quote the observed UI text or behaviour exactly.

**Smallest failing case**
Minimum steps to see the bug. One sentence if possible.

---

### Reproduce

**Required state**
- Account type / auth state needed
- Event state needed (DRAFT / CONFIRMING / etc.)
- Multi-actor: [ ] Yes [ ] No — if yes, list roles and session boundaries

**Steps**
1. ...
2. ...
3. ...

**Observe:** [exact broken behaviour]

**Data setup**
If default seed is insufficient, list the minimum UI or DB steps to reach
the required state. Reference KB-004 if DRAFT event is needed.

**Stripe note** (if payment required)
Confirm sk_test_ key and TEST MODE in dashboard before proceeding.
Use test card 4242 4242 4242 4242 only. If not test mode → STOP (Stop Condition 8).

---

### Scope

**Fix here:**
[Specific files, routes, or components allowed to change]

**Do not touch:**
All Do-Not-Touch Zones in GATHER-BUILD-CONSTANTS.md are binding.
[Any additional scope restrictions specific to this ticket]

---

### Acceptance

**Test gate**
- Severity Critical/High: test-first required
  1. Write failing test asserting correct behaviour
  2. Confirm RED — paste output
  3. Fix
  4. Confirm GREEN — paste output
  5. Commit test with fix
- Severity Medium/Low: regression test preferred; post-fix confirmation acceptable

**Assertions**
- [ ] [UI or behavioural assertion 1]
- [ ] [UI or behavioural assertion 2]
- [ ] Adjacent flows unaffected: [list the ones that matter]

**Evidence package**
- RED/GREEN test output (or escape hatch documentation)
- Assertion checklist confirmed
- Commit hash

---

### Unknowns

List anything not known that affects reproduction or fix.
If an unknown blocks progress → STOP and report before writing code.

---

### Stop Conditions

Stop and report (do not proceed) if:
1. GATHER-BUILD-CONSTANTS.md missing
2. Preflight fails
3. Cannot reproduce the bug
4. Cannot write a RED test (Critical/High) — document why and await instruction
5. Fix requires touching Do-Not-Touch zones or expanding scope
6. Real-world side effects possible without safe mode (Stripe live mode, real SMS)
7. DB schema migration required
8. Any required unknown surfaces during investigation

---

### Executor Checklist

[ ] GATHER-BUILD-CONSTANTS.md read
[ ] Preflight passed and results pasted
[ ] Bug reproduced — Observe confirmed
[ ] Plan documented (hypothesis, change set, test strategy, rollback risk)
[ ] RED test confirmed or escape hatch documented (Critical/High)
[ ] Fix implemented within declared scope
[ ] No Do-Not-Touch zones modified
[ ] GREEN confirmed
[ ] Acceptance assertions checked
[ ] Adjacent flows verified
[ ] Evidence package assembled
[ ] Commit hash recorded
[ ] No stop conditions triggered without resolution
