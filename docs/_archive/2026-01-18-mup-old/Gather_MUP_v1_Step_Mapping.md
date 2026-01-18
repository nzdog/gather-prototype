# Gather — MUP v1 Step Mapping

> **Doc type:** Build-spec mapping  
> **Version:** v1.0  
> **Status:** Draft (ready for ticketing)  
> **Owner:** Nigel (Gather builder)  
> **Last updated:** 2026-01-08 (Pacific/Auckland)  
> **Scope:** Align *Minimum Usable Path v1* (MUP) to the **current Gather codebase**, identifying the smallest changes needed to make the first-time host journey usable end-to-end.  
> **Non-goals (v1):** Marketing, growth, onboarding tours, notification automation, UI polish pass, complex dietary per-person modeling, Accept/Decline (Decline deferred), chat.  
> **Primary success test:** A cold first-time host can complete **Plan → Assign → Transition to CONFIRMING/FROZEN → Share → Participant Acknowledges → Host sees status** without guidance.  
> **Dependencies:** Next.js app + Prisma schema + workflow state machine + token system (already present).  
> **Related docs:** ONBOARDING_REPORT.md; “Gather Minimum Usable Path v1” protocol walk outputs.

---

## Locked decisions (from clarification)

- **Entry:** Public entry defaults to **Start planning → Create event**.
- **Dietary model (v1):** **Count-based**.
- **Generation inputs (all included):** guestCount, occasionType, mealScope, dietaryCounts, style toggle, notes.
- **Regenerate rule:** Overwrite **generated** items only; preserve host-added/edited.
- **Participants:** Addable multiple ways, but **Plan workspace is primary** and onboarding points there.
- **Gate to lock/share:** Block transition until **all items are assigned**.
- **State naming:** Use backend state names (**DRAFT / CONFIRMING / FROZEN / COMPLETE**) in the UI.
- **Participant response (v1):** **Acknowledge = Accept** (no Decline).
- **Share links:** Visible in both places; **Plan workspace “frozen/confirming” view is primary**.

---

## Known implementation surfaces (from onboarding report)

**Key UI routes**
- Public landing: `src/app/page.tsx`
- Plan create: `src/app/plan/new/page.tsx`
- Plan workspace: `src/app/plan/[eventId]/page.tsx`
- Host dashboard: `src/app/h/[token]/page.tsx`
- Coordinator dashboard: `src/app/c/[token]/page.tsx`
- Participant view: `src/app/p/[token]/page.tsx`

**Key API routes / libs**
- Create event: `POST /api/events` → `src/app/api/events/route.ts`
- Transition state: `POST /api/events/[id]/transition` → `src/app/api/events/[id]/transition/route.ts` + `src/lib/workflow.ts`
- Assign item: `POST /api/events/[id]/items/[itemId]/assign` → `src/app/api/events/[id]/items/[itemId]/assign/route.ts`
- Generate/regenerate: `POST /api/events/[id]/generate` / `POST /api/events/[id]/regenerate` (partial)  
- Token plumbing: `src/lib/tokens.ts` + AccessToken model
- Participant acknowledgement: `POST /api/p/[token]/ack/[assignmentId]` (and `/api/c/[token]/ack/[assignmentId]`) sets `Assignment.acknowledged=true`

---

## MUP v1 → Current Build Mapping

| # | MUP v1 step | Current implementation (route / file) | Gap / risk | Minimal fix (v1) |
|---:|---|---|---|---|
| 1 | **Arrive** on “Plan in 3 steps” + CTA | `src/app/page.tsx` (demo landing) + `src/app/plan/new/page.tsx` | Public entry currently demo-token oriented; first-time host may not understand the “start” path | On `src/app/page.tsx`, add a clear **primary CTA**: **Start planning** → `/plan/new` (keep demo links secondary) |
| 2 | Enter **event basics** | `src/app/plan/new/page.tsx` → `POST /api/events` | Confirmed OK | No change (only copy/order if needed) |
| 3 | Capture **dietary counts** | Plan workspace: `src/app/plan/[eventId]/page.tsx` | Need a single, explicit UI surface for count-based dietary inputs; must persist | Add a compact **dietary counts** component in plan workspace and persist in event (or plan metadata) |
| 4 | Select **meal scope + style + notes** (generation inputs) | Plan workspace + `POST /api/events/[id]/generate` | Inputs may not be fully captured or wired into generation; “generate” may be partial | Add a **Generation Inputs panel** storing: guestCount, occasionType, mealScope, dietaryCounts, style, notes; wire to generate endpoint |
| 5 | **Generate items** (AI) then allow host edits | `/api/events/[id]/generate` (partial) + items UI | Generated vs edited items need metadata; otherwise regenerate will destroy work or become impossible | Ensure items created by generation are tagged (e.g., `source=generated`, `generatedBatchId`). Allow host edits/add/remove in plan workspace |
| 6 | **Regenerate** (pre-lock) using rule A | `/api/events/[id]/regenerate` (partial) | Regenerate semantics must be explicit and safe | Implement: regenerate **overwrites generated-only** for current batch; preserve host-added/edited items (or keep edited items as `source=hostEdited`) |
| 7 | Add **participants** (primary in Plan) | People creation currently possible; tokens exist; dashboards exist | If participants are added outside plan, MUP breaks; onboarding must point to plan | Make “Add participants” a first-class step inside `src/app/plan/[eventId]/page.tsx` (dashboards may still allow it, but plan is canonical) |
| 8 | **Assign items** to people + coverage indicator | Assign API exists: `/api/events/[id]/items/[itemId]/assign` | Coverage completeness must be visible (and enforceable) | Add **Unassigned count** + “Coverage complete” state in plan workspace; block transition until zero unassigned |
| 9 | **Lock** plan for sharing (MUP “Freeze”) | Existing button: “Move to Confirming” → `/api/events/[id]/transition` with gate checks in `src/lib/workflow.ts` | Current gate checks focus on conflicts/placeholders; must also block if unassigned items remain | Add a gate check in `runGateCheck()` (or equivalent) to block CONFIRMING unless all items are assigned |
| 10 | **Share** participant links | Tokens generated during confirming (`ensureEventTokens`) + host/coordinator/participant routes | Host needs a single obvious share surface | In plan workspace when status is **CONFIRMING/FROZEN**, show **Share Links panel** (copy buttons per participant; include host/coordinator links as needed) |
| 11 | Participant **Acknowledge (=Accept)** | Participant view `src/app/p/[token]/page.tsx` + `POST /api/p/[token]/ack/[assignmentId]` | Copy must reflect “Accept” without adding Decline; host must see status | Rename UI action to **Accept** (writes `acknowledged=true`). In host view, show pending/accepted counts and per-item ack status |
| 12 | Host sees **status** + gaps | Host dashboard `src/app/h/[token]/page.tsx` and/or plan workspace | Status may be fragmented across surfaces | Make **plan workspace** the primary status surface post-confirming: responses summary + “who hasn’t accepted yet” list |

> Note: This mapping keeps backend state names (DRAFT/CONFIRMING/FROZEN). In MUP language, “Freeze” corresponds to transitioning into **CONFIRMING** (structure locked + tokens generated), with **FROZEN** as the later hardened state if needed.

---

## Top 5 v1 focus items (smallest set that makes it usable)

1. **Primary CTA** on public landing → `/plan/new` (demo links secondary)
2. Plan workspace **Generation Inputs panel** (dietary counts + scope + style + notes)
3. **Generated vs edited item metadata** + regenerate rule A
4. **Coverage indicator** + **gate check**: block CONFIRMING until all items assigned
5. Plan workspace **Share Links + Accept UI copy** + host status summary

---
