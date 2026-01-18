---
title: "Gather MUP v1 ↔ Current Build Alignment (One-Pager)"
owner: "Nigel"
status: "active"        # active | 
version: "v1"
last_updated: "2026-01-08"
source: "Lichen walk"
related:
  - "../20_onboarding/onboarding_report.md"
  - "../30_workflow/workflow_states.md"
---



Goal

Make the first-time host path unconfusing and end-to-end usable by aligning the existing app’s routes + workflow to the MUP v1 you just defined.

What already exists (so we don’t rebuild fantasies)
	•	Public entry: src/app/page.tsx (demo landing with magic links)
	•	Host planning workspace: src/app/plan/[eventId]/page.tsx (+ create new at src/app/plan/new/page.tsx)
	•	Role access model: magic-link tokens → dashboards
	•	Host: src/app/h/[token]/page.tsx
	•	Coordinator: src/app/c/[token]/page.tsx
	•	Participant: src/app/p/[token]/page.tsx
	•	Workflow state machine: Event status DRAFT | CONFIRMING | FROZEN | COMPLETE (+ structureMode) driven by src/lib/workflow.ts
	•	Key backend endpoints already in place:
	•	Create event: POST /api/events (src/app/api/events/route.ts)
	•	Status transition: /api/events/[id]/transition (driven by src/lib/workflow.ts)
	•	Assign item: POST /api/events/[id]/items/[itemId]/assign/route.ts
	•	Demo tokens: /api/demo/tokens
	•	Participant “response” currently: acknowledged: boolean (not accept/decline)

⸻

MUP v1 Step Mapping (what maps cleanly vs what needs work)

Step 1 — “Plan your event in 3 steps” entry + CTA

MUP: public entry screen → CTA “Start planning”
Current: demo landing (src/app/page.tsx) + public create (/plan/new)
Gap: user doesn’t know where to start; demo links ≠ product onboarding
Minimal change: add a real onboarding entry (can still be demo-friendly) that routes to Create Event and explains the 3 steps.

Step 2 — Event basics

MUP: event name/date/location/headcount
Current: event exists with name, startDate/endDate, guestCount
Gap: none (mostly wiring/UI clarity)

Step 3 — Dietary capture (count-based v1)

MUP: dietary counts drive generation
Current: unclear whether UI captures these explicitly in Plan workspace
Gap: ensure there’s a single place in /plan/[eventId] where dietary inputs live and persist
Minimal change: add/confirm dietaryCounts (or equivalent) in the plan form + persist.

Step 4 — Coverage scope + generation inputs

MUP: meal scope + style toggles → “Generate items”
Current: AI plan generation routes exist inferred/partial
Gap: inputs → generation → editable list must be a tight loop
Minimal change: one “Generate items” action in plan workspace that writes items as source=generated (or equivalent metadata).

Step 5 — AI generates items + regenerate rule (pre-freeze)

MUP: generated list + host edits + optional regenerate
Current: regeneration exists inferred/partial
Gap: regenerate semantics + protecting host edits
Minimal change: implement regenerate-overwrites-generated rule; preserve host-added/edited items (or warn).

Step 6 — Add participants

MUP: add at least 2 participants with contact method
Current: people exist via PersonEvent join; token system exists
Gap: clarify where participant creation happens (Plan workspace vs Host dashboard)
Minimal change: pick ONE location (recommend: Plan workspace) as the canonical “add people” step.

Step 7 — Assign items to people

MUP: assign everything; uncovered items blocked
Current: assignment API is strong + has invariants
Gap: UI needs to make “coverage complete” obvious
Minimal change: add “Unassigned count” + “coverage complete” indicator.

Step 8 — Freeze plan gate

MUP: “Freeze plan” locks structure + generates share bundle
Current: status transitions exist (DRAFT → CONFIRMING, later FROZEN) with gate checks and token generation
Gap: your user-facing language is “Freeze”; code language is “Confirming/Frozen”
Minimal change: in UI, relabel the transition as Freeze Plan (under the hood: transition to CONFIRMING/FROZEN as designed). Keep “Plan Frozen” as the screen label.

Step 9 — Share bundle

MUP: share participant links
Current: token system is core; host can distribute /p/[token] links
Gap: host needs a single place that surfaces “share links” cleanly
Minimal change: on the “Plan Frozen” screen, show Copy links (by role/team/participant).

Step 10 — Participant response (Accept/Decline)

MUP: accept/decline per assignment
Current: only acknowledged: boolean exists
Gap: no “decline,” no gap-creation loop
Minimal change (v1): treat Acknowledge = Accept (rename in UI copy), and defer Decline to v1.1.
(If you insist on Decline in v1, it’s a schema+workflow expansion—bigger than it looks.)

Step 11 — Host sees status

MUP: host sees response state + gaps
Current: host dashboards + audit exist; response state is limited to acknowledged
Gap: needs a simple status panel: pending/acknowledged
Minimal change: show counts + highlight items still unacknowledged.

⸻

The 3 biggest “integration gaps” to close first
	1.	Entry clarity: demo landing vs real onboarding (where do I start?)
	2.	Freeze semantics: align UI language (“Freeze plan”) with workflow status transitions
	3.	Response semantics: ship v1 with Acknowledge = Accept, defer Decline

⸻

What “done” looks like for Option 1

You have a single page that says:
	•	“MUP Step → Existing route/file → Gap → Minimal fix”
	•	And it identifies the three integration gaps above as the next build focus.

If you want, your next move after this one-pager is Option 2 (tickets that reference these exact routes/files).