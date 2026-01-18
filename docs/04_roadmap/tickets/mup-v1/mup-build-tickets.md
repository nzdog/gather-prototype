---
title: "Gather — MUP v1 Alignment Build Tickets"
owner: "Nigel"
status: "active"
version: "v1"
last_updated: "2026-01-08"
source: "MUP v1 Step Mapping + alignment decisions"
---

# Gather — Option 2: Build Tickets (MUP v1 Alignment)

These tickets convert the MUP v1 alignment decisions into **10 execution-ready build tickets** designed to minimise drift for Claude Code (or any dev).

Each ticket includes: **Title, Acceptance Criteria, Done When, Where in Repo**.

---

## T1 — Make “Start planning → Create event” the default entry

**Acceptance criteria**
- Public landing has a single primary CTA: **Start planning**.
- CTA routes to event creation (`/plan/new`) and results in a real event the user can continue planning.
- Demo/token links (if kept) are visually secondary.

**Done when**
- A cold user can land on `/`, click **Start planning**, and reach the plan workspace for a newly created event without ambiguity.

**Where in repo**
- `src/app/page.tsx`
- `src/app/plan/new/page.tsx`
- (if needed) `src/app/api/events/route.ts` (create event behavior)

---

## T2 — Add/confirm Plan inputs used for generation (all “YES”)

Inputs locked: **guestCount, occasionType, mealScope, dietaryCounts, style toggle, notes**.

**Acceptance criteria**
- Plan workspace collects and persists:
  - `guestCount`
  - `occasionType`
  - `mealScope`
  - `dietaryCounts` (count-based)
  - `style` (simple/standard/abundant)
  - `notes` (free-text)
- Reloading the plan workspace shows the saved values.
- Inputs are clearly grouped under “Plan” (not scattered across pages).

**Done when**
- A host can fill those fields, refresh the page, and see the same values persisted.

**Where in repo**
- `src/app/plan/[eventId]/page.tsx`
- `src/app/api/events/[id]/route.ts` (PATCH persistence)
- `prisma/schema.prisma` (if any fields are missing)

---

## T3 — Tag AI-generated items + batch ID (schema + write path)

Regenerate Rule A (“overwrite generated only, preserve host-added/edited”) requires generated items to be identifiable.

**Acceptance criteria**
- `Item` can record:
  - `source` (e.g. `GENERATED | HOST_ADDED | HOST_EDITED`) **or equivalent**
  - `generatedBatchId` (string/nullable)
- AI generation writes items with `source=GENERATED` and a batch id.
- Host-added items are `HOST_ADDED`.
- Editing a generated item sets it to `HOST_EDITED` (or preserves a flag that it was edited).

**Done when**
- You can query an event and reliably distinguish which items are safe to overwrite on regenerate.

**Where in repo**
- `prisma/schema.prisma`
- `src/app/api/events/[id]/generate/route.ts` (writes)
- `src/lib/workflow.ts` (if repair/status helpers touched)

---

## T4 — Implement Regenerate Rule A (overwrite generated only)

**Acceptance criteria**
- Regenerate overwrites **only** items with `source=GENERATED` (and/or matching the previous `generatedBatchId`).
- Host-added/host-edited items remain untouched.
- Regenerate creates a new `generatedBatchId`.
- Regenerate is blocked once the event is no longer in a pre-freeze state.

**Done when**
- A host can: generate → edit one generated item → add one new item → regenerate  
  and the edited + added items remain, while untouched generated items refresh.

**Where in repo**
- `src/app/api/events/[id]/generate/route.ts`
- `src/lib/workflow.ts` (enforce status guard if needed)

---

## T5 — Make “Add participants” primary inside Plan workspace

Decision: “Either location allowed, but Plan is primary.”

**Acceptance criteria**
- Plan workspace contains the canonical participant add/edit surface.
- Participants created here show up in assignment dropdowns immediately.
- Host dashboard can still expose participants secondarily, but onboarding/flow points to Plan.

**Done when**
- In `/plan/[eventId]`, host can add 2 participants and then assign items to them without leaving the plan flow.

**Where in repo**
- `src/app/plan/[eventId]/page.tsx`
- `src/app/api/events/[id]/people/route.ts`
- `src/app/api/events/[id]/people/[personId]/route.ts`

---

## T6 — Coverage indicator + gating on “all items assigned”

Freeze gate: **all items assigned**.

**Acceptance criteria**
- Plan workspace shows:
  - Unassigned item count
  - Clear “Coverage complete” indicator when zero
- Transition button (DRAFT→CONFIRMING / CONFIRMING→FROZEN as designed) is disabled until coverage complete.
- Gate-check is the single source of truth (not duplicated client logic).

**Done when**
- With any unassigned items, transition is blocked.
- Assign the last item → transition becomes available immediately.

**Where in repo**
- `src/app/plan/[eventId]/page.tsx`
- `src/app/api/events/[id]/gate-check/route.ts`
- `src/lib/workflow.ts` (gate checks / invariants)
- `src/app/api/events/[id]/transition/route.ts` (enforcement)

---

## T7 — Use backend status names in UI (DRAFT/CONFIRMING/FROZEN)

Decision: “Use backend names.”

**Acceptance criteria**
- UI labels and state displays use **DRAFT / CONFIRMING / FROZEN / COMPLETE** consistently.
- No “Freeze plan” copy is used as a stage name (button label can still be “Move to CONFIRMING” etc).
- Plan workspace and host dashboard show the same status terminology.

**Done when**
- A user sees one coherent language system for state across the app.

**Where in repo**
- `src/app/plan/[eventId]/page.tsx`
- `src/app/h/[token]/page.tsx`
- (optional shared constants) `src/lib/workflow.ts` / UI constants

---

## T8 — Surface Share Links in Plan view (primary) + Host dashboard (secondary)

Decision: “Both, but Plan Frozen is primary.”

**Acceptance criteria**
- In plan workspace when status is CONFIRMING or FROZEN:
  - Show invite links (participant/coordinator/host as applicable)
  - Provide copy buttons
- Host dashboard also shows share links, but plan workspace is the main surface.

**Done when**
- After transitioning, the host can copy a participant link from the plan workspace in one click.

**Where in repo**
- `src/app/plan/[eventId]/page.tsx`
- `src/app/h/[token]/page.tsx`
- `src/app/api/events/[id]/tokens/route.ts`
- `src/lib/tokens.ts` (invite-link generation/listing)

---

## T9 — Participant “Acknowledge = Accept” (copy + UX) + host visibility

Decision: v1 response semantics = **Acknowledge = Accept**, no decline.

**Acceptance criteria**
- Participant UI uses the word **Accept** (not Acknowledge).
- Clicking Accept calls the existing ack endpoint and records the response.
- Host can see response counts: pending vs accepted.

**Done when**
- Participant accepts → host view reflects the change (refresh acceptable for v1 as long as state persists).

**Where in repo**
- `src/app/p/[token]/page.tsx`
- `src/app/api/p/[token]/ack/[assignmentId]/route.ts`
- `src/app/api/c/[token]/ack/[assignmentId]/route.ts` (if coordinators can accept)
- `src/app/h/[token]/page.tsx` (host visibility)

---

## T10 — Add a “MUP v1 Demo Script + Done Checklist” doc (prevents drift)

**Acceptance criteria**
- A short script that matches the stop line:
  - Start planning → inputs → generate → edit → add participants → assign all → transition → copy link → participant accept → host sees status
- A checkbox “done checklist” that maps to those steps.

**Done when**
- You can hand the doc to someone and they can run the demo without you.

**Where in repo**
- `docs/gather/10_mup/MUP_v1_demo-script.md` (new)
- `docs/gather/10_mup/MUP_v1_done-checklist.md` (new)

---
