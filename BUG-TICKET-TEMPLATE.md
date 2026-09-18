> Default template. For complex tickets (multi-actor, unknown root cause,
> Stripe required, brand/trust risk) use BUG-TICKET-TEMPLATE-FULL.md.

# BUG-TICKET-TEMPLATE.md

AI executor preamble: Before starting any ticket —
1. Read GATHER-BUILD-CONSTANTS.md in full
2. Run the Preflight Sanity Sequence and paste results
3. If preflight fails → STOP

---

## Citations (binding — GTC-222)

Applies to every citation in this ticket, and to every comment the ticket
adds to the code. The canonical statement lives here; the FULL and UX
templates point at this section.

**Cite the symbol, not the line.** A citation addresses a named thing —
a function, export, const, type, or enum:

```
`onAssignmentReleased` in `src/lib/ledger.ts`
`sendSms` in `src/lib/sms/send-sms.ts` (as of 7984652)
```

Not `src/lib/ledger.ts:590-596`. Line numbers rot. Any edit above the
reference moves it, and the citation goes on looking correct while
pointing somewhere else — it fails silently, which is why it survives
review. GTC-211 cited `ledger.ts:590-596` for `onAssignmentReleased`;
seventeen lines of drift later those lines hold `onMaterialChange`, a
different hook owned by a different ticket. An executor working from that
number edits the wrong function and the build stays green.

A line number may appear as a parenthetical hint after the symbol. It may
never be the address. Add the short commit hash when precision matters:
a symbol plus a hash is exact and stays exact.

**Verify the name exists at HEAD. Symbol form is not proof.** Cited
symbols and method names must be checked against the current tree, not
merely written in symbol form. GTC-211 names "the PUT team-change"; that
route exports only `PATCH` and `DELETE`. A wrong name, correctly
formatted, is a class the symbol rule does not catch — the convention
makes citations durable, not true. One `grep -n` per cited name before
the ticket is filed.

**When a symbol appears twice in a file**, add a disambiguating cue —
which function, which branch, which section.

**No symbol to cite?** Leave an anchor in the code and cite the anchor:

```js
// ANCHOR(GTC-nnn): short label
```

Grep-shaped on purpose — `grep -rn "ANCHOR(GTC-176)" src/`. Use it for a
branch arm, a bare config literal, or a place where something should go
and does not yet. It is a token, not prose: one line, ticket ID, short
label. Delete it when the ticket that owns it closes.

**A comment may record WHY, or that a state is provisional. It may not
assert WHAT the code does.** Asserting behaviour is a test's job. A
comment that describes behaviour is an unverified claim with nothing
holding it true, so it rots in place — `onAssignmentReleased` carries one
that is already false. Write the assertion as a test and let the comment
carry the reason.

**A deliberate temporary state carries the ticket ID that ends it.**
`eslint.ignoreDuringBuilds: true` in `next.config.js` names GTC-221 as its
end condition. Without that backward link, a temporary state is
indistinguishable from a permanent one, and nothing ever flips it back.

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
[ ] Citations section read; every citation in this ticket is a symbol, not a line number
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

---

## Evidence (Executor-Completed)

> This section is filled in by the executor before committing.
> Do not leave blank. Do not commit without completing this section.

**Root cause confirmed**
[One paragraph — what was actually wrong and where. Address it by symbol,
per the Citations section: `theFunction` in `path/file.ts`, not `file.ts:123`.]

**Files changed**
[List each file and what changed — one line per file, symbol-addressed]

**Test results**
- RED: [paste output or "N/A — Medium/Low severity"]
- GREEN: [paste output]

**Assertions checked**
- [ ] [assertion 1]
- [ ] [assertion 2]
- [ ] Adjacent flows verified: [list]

**Security suite:** [16/16 or note any deviation]

**Commit hash:** [hash]
