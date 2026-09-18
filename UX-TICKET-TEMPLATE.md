# UX-TICKET-TEMPLATE.md

AI executor preamble: Before starting any UX ticket —
1. Read GATHER-BUILD-CONSTANTS.md in full
2. Read GATHER-KNOWN-BEHAVIOURS.md in full
3. If any change touches API routes or DB — STOP and escalate to operator

UX tickets are UI changes only. No preflight required.

---

### Citations (binding — GTC-222)

**The Citations section of `BUG-TICKET-TEMPLATE.md` is binding here too.**
Cite the component or handler by name — `PlanHeader` in
`src/components/plan/PlanHeader.tsx` — never by line number. Use
`// ANCHOR(GTC-nnn): label` where there is no symbol to name. A comment
records WHY, not WHAT. A deliberate temporary state names the ticket that
ends it.

UX tickets cite JSX, which moves more than anything else in the repo. A
line number in `The Fix` is stale by the next styling pass.

---

# GTC-[NUMBER] — [One line: the user moment, not the element]

**Type:** UX
**Severity:** [P1 / P2 / P3 / P4]

---

### The Person

Who is the user at this moment — not a user type, but this specific
person at this specific point in their journey with Gather.

What have they just done? What brought them here?

What are they feeling right now — not thinking, feeling?

What do they need to feel next?

---

### The Broken Promise

What did Gather implicitly promise this user — through its design,
copy, or flow — before this moment?

What actually happens instead?

In one sentence, what would the user say about this moment?

What is Gather failing to say here that it already knows?

---

### The Cost

What does the user carry forward when this moment fails — what are
they left holding that Gather should have taken from them?

What does it cost Gather each time this moment fails?

---

### The Fix

What is the smallest true change that restores the broken promise?

What does the user feel when the fix is working?

What does it look like — what element, placed where, saying what?

What makes it feel like Gather specifically?

---

### Acceptance

Felt: [What the user experiences when the fix is working]
Functional: [What can be observed or clicked to verify]

Must never: [The thing that would close the gap technically
while breaking something else]

---

### Evidence Package

- Screenshot: [what to capture that proves the fix is in place]
- Behaviour confirmation: [what to navigate or click to prove
  the underlying flow still works correctly]
- Security suite: 16/16
- Commit hash

---

### Executor Checklist

[ ] GATHER-BUILD-CONSTANTS.md read
[ ] GATHER-KNOWN-BEHAVIOURS.md read
[ ] Citations are symbols, not line numbers
[ ] Fix implemented
[ ] Felt test passed — [specific felt condition]
[ ] Functional test passed — [specific observable condition]
[ ] No existing behaviour broken
[ ] Evidence package complete
[ ] Security suite 16/16
[ ] Commit hash recorded
