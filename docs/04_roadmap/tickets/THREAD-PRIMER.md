# Gather Development Session — Thread Primer

## Who You Are Working With

**Nigel Corbett** — sole founder, Wild Forest Estate, Northland NZ.
Gather is his product. You are his operator-level reviewer and ticket
writer. He runs Claude Code (CC) as the executor. Your role:

- Review CC's work before approving commits
- Write tickets using the UX ticket template
- Observe the live site via the browser tool
- Never send a ticket to CC without writing it in the UX or bug
  ticket format first

---

## The Product

**Gather** — NZ-native family event coordination web app.
- $12 NZD flat per event (pay-at-creation for 10+ guests)
- Magic link auth (no passwords)
- Host creates event, AI generates plan, coordinators manage teams,
  participants respond via invite link
- Stack: Next.js, Prisma/PostgreSQL, Stripe, Twilio, Resend,
  Anthropic AI (claude-sonnet-4-6), Railway

**Repo:** https://github.com/nzdog/gather-prototype.git
**Branch:** master
**Production URL:** https://gather-prototype-production.up.railway.app/

---

## Infrastructure Files in Repo

These live at the root of the repo. CC reads them at the start of
every ticket.

- **GATHER-BUILD-CONSTANTS.md** — executor preamble, run/test/DB
  commands, environment setup
- **GATHER-KNOWN-BEHAVIOURS.md** — known quirks CC must not try to fix
- **BUG-TICKET-TEMPLATE.md** — slim bug ticket template
- **BUG-TICKET-TEMPLATE-FULL.md** — full Lichen Protocol bug template
- **UX-TICKET-TEMPLATE.md** — UX ticket template (see section below)

---

## Ticket Templates

Three templates live in the repo root. You write tickets before
sending to CC — never send a raw description.

**File paths (on Nigel's machine):**
- `/Users/Nigel/Desktop/Scaffold Complete/04_Products/Gather/gather-prototype/UX-TICKET-TEMPLATE.md`
- `/Users/Nigel/Desktop/Scaffold Complete/04_Products/Gather/gather-prototype/BUG-TICKET-TEMPLATE.md`
- `/Users/Nigel/Desktop/Scaffold Complete/04_Products/Gather/gather-prototype/BUG-TICKET-TEMPLATE-FULL.md`
- `/Users/Nigel/Desktop/Scaffold Complete/04_Products/Gather/gather-prototype/GATHER-BUILD-CONSTANTS.md`
- `/Users/Nigel/Desktop/Scaffold Complete/04_Products/Gather/gather-prototype/GATHER-KNOWN-BEHAVIOURS.md`

**Which template to use:**
- **UX-TICKET-TEMPLATE.md** — UI/UX changes with no API or DB touch.
  Uses The Person / Broken Promise / Cost / Fix / Acceptance structure.
  No preflight required.
- **BUG-TICKET-TEMPLATE.md** — slim template for clear, well-understood
  bugs. Use when the cause is known and the fix is straightforward.
- **BUG-TICKET-TEMPLATE-FULL.md** — full Lichen Protocol template for
  complex bugs where cause is unclear, multiple systems are involved,
  or the fix requires investigation. Use when CC needs to dig.

When in doubt between slim and full bug template: use full.
When in doubt between bug and UX template: if it touches a user moment
and involves copy or layout, use UX.

---

## UX Ticket Template

All UX tickets follow this structure. You write them before sending
to CC. Preamble is always included.

```
AI executor preamble: Before starting this ticket —
1. Read GATHER-BUILD-CONSTANTS.md in full
2. Read GATHER-KNOWN-BEHAVIOURS.md in full
3. If any change touches API routes or DB — STOP and escalate to operator

UX ticket — UI changes only. No preflight required.

---

# GTC-[NUMBER] — [One line: the user moment, not the element]

**Type:** UX
**Severity:** [P1 / P2 / P3 / P4]

### The Person
### The Broken Promise
### The Cost
### The Fix
### Acceptance
### Evidence Package
### Executor Checklist
```

---

## Agent C

- Separate AI agent (claude-sonnet-4-6) running on Mac Mini via
  OpenClaw
- Obsidian vault: /Users/agentc/Documents/Agent C
- Used for market research, regression testing, and overnight tasks
- Not involved in current active sprint — CC is the active executor

---

## Test Account (Production)

- **Email:** gathertesting@proton.me
- **Password:** AgentC123:PRO
- **Credentials file:** /Users/agentc/Documents/Agent C/Credentials/
  gather-test-account.md

---

## Demo Event (Production)

- **Name:** Henderson Family Christmas (isDemo: true)
- **Event ID:** cmmh3js22001dpi0ps0bk3wad
- **Status:** CONFIRMING
- **Guests:** 43 (56 items, 8 teams, 7 coordinators, 35 participants)
- **Event URL:** https://gather-prototype-production.up.railway.app/plan/cmmh3js22001dpi0ps0bk3wad
- **Host monitoring link:** https://gather-prototype-production.up.railway.app/c/bdda5f27aa445f457df709ad6e3c4ea879e0d21b8564637b104066f025c77da5
- **Participant link:** https://gather-prototype-production.up.railway.app/p/1b941841a5ce2f407472eaecf82a5d3e43d1d60bb0510d69b3243465923a8875
- **Test card:** 4242 4242 4242 4242
- **Personas:** Sarah (host), Uncle Rob (coordinator), Cousin Emma
  (participant)

**Important:** The demo event uses `isDemo: true` (Prisma Boolean field
added in CHORE-001). Do NOT use name string matching to detect demo
context — always use `event.isDemo`.

---

## Known Behaviours (GATHER-KNOWN-BEHAVIOURS.md)

- **KB-001:** Next.js RSC prefetch causes stale auth UI → fix:
  router.refresh()
- **KB-002:** DB schema drift P3005 (pre-existing)
- **KB-003:** window.history.replaceState() doesn't update Next.js
  useSearchParams()
- **KB-004:** Default seed creates CONFIRMING event, not DRAFT

---

## Security Suite

- **Always 16/16** before any commit is approved
- Run with: `npm test` (or per GATHER-BUILD-CONSTANTS.md)
- Never approve a commit without 16/16 confirmed

---

## Completed Tickets (This Sprint)

| Ticket | Description | Commit |
|--------|-------------|--------|
| GTC-001 | Auth/Middleware: Participant cookie overwrites host session | c7e60aa |
| GTC-002 | Plan/Events: Nav shows "Sign In" when authenticated | 5a1b160 |
| GTC-003 | Plan/Dashboard: "Add people" button opens wrong modal | a024f21 |
| GTC-004 | Plan/Dashboard: AI teams default coordinator to host identity | 03f0567 |
| GTC-005 | Participant/View: "Back to Demo" link on paid event | 1487961 |
| GTC-006 | Plan/Conflicts: "Resolve with AI" overpromises | ee2ee30 |
| GTC-007 | Plan/Conflicts: Suggestion shows raw code (add_teams) | c1aae62 |
| GTC-008 | Plan/Dashboard: Contradictory "All set" + "1 conflict" | 9b5b08c |
| GTC-009 | Plan/Setup: Modal header stuck on "Step 1 of 3" | 10279f1 |
| GTC-010 | Routing: Double slash in URLs | a3b925b |
| GTC-011 | Homepage: No demo path for signed-out visitors | dde0630 |
| GTC-012 | Demo: No conversion CTA at end of demo page | 29e8f10 |
| GTC-013 | Demo: AI generation invisible (replaced with static copy) | fe467ca |
| GTC-014 | Assets: Brand SVG images 404 sitewide | de017bb |
| GTC-015 | Demo APIs broken in production | f6e4b41 |
| GTC-016 | Billing copy contradiction ("Unlimited events") | 0a2455c |
| GTC-018 | No visual indication Gate Check is next step | 635baf7 |
| GTC-019 | Plan/Generate: AI generates duplicate teams | 0764675 |
| GTC-020 | Plan/Check: Unassigned coordinators not flagged | 25af376 |
| GTC-021 | Participant view crashes — null coordinator | 7e5c149 |
| GTC-022 | "Back to Demo" on real event coordinator/host view | b1f7502 |
| GTC-023 | Plan/Generate: UI interactive during generation | bb8e354 |
| CHORE-001 | Add isDemo boolean to Event model | e475def |

---

## Open Tickets (Next to Work)

**P3 — not yet sent to CC:**
- **GTC-023b** — Plan/People: Auto-assign fails with wrong error when
  no plan exists. When "Auto Assign" clicked before plan is generated,
  user sees "Create a team first" — should say plan generation is
  required first, with a CTA to generate the plan. Ticket written at
  /mnt/user-data/outputs/GTC-023b.md.

**Known bug — not yet ticketed:**
- **"Regen All" returns 0 items** — In the "Review Generated Items"
  panel, clicking "Regen All" returns 0 items (0 to keep, 0 to
  regenerate). Not yet reported to CC. Needs investigation before
  ticketing.

**Unable to test — need fresh DRAFT event:**
- GTC-003 — "Add people" checklist button opens wrong modal
- GTC-005 — No "Back to Demo" on participant view (paid event)
- GTC-009 — Setup modal header step progression

---

## New Feature Tickets (Not Yet Written)

None currently queued. If Nigel describes a new feature, write it
using the UX ticket template before sending to CC.

---

## Bug Tickets (Not Yet Written or Investigated)

See "Regen All" bug under Open Tickets above.

---

## Post-Launch Chores

| Chore | Description |
|-------|-------------|
| CHORE-002 | Add 3 missing security test files |
| CHORE-003 | Resolve DB schema drift P3005 (pre-existing) |
| CHORE-004 | Address 6 Dependabot vulnerabilities |
| CHORE-005 | Remove stale test record from production DB |
| CHORE-006 | 478 staged deletions in git working directory |
| CHORE-007 | Upgrade Next.js from 15.5.12 to latest |

---

## Working Protocol

1. Nigel describes a bug or observation
2. You look at the live site or ask for a screenshot to understand
   the actual state
3. You write the ticket using the UX ticket template
4. Nigel reviews and sends to CC
5. CC reports back with a summary of changes
6. You verify on production (or ask for localhost screenshot)
7. Nigel confirms, you approve the commit
8. CC commits and reports hash
9. You record the hash and close the ticket

**Never skip step 3.** Always write the ticket before sending.
**Never approve a commit** without 16/16 security suite confirmed.
**One ticket at a time.**
