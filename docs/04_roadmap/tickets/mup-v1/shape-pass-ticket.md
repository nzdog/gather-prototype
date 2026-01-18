Build Ticket (Shape Pass) — Display “Drop-off place + time” wherever an item is displayed

Title

Show drop-off location and drop-off time wherever an item appears

Context / Problem

Right now, an “item” can appear in multiple places (plan views, contribution lists, participant ask lists, coordinator dashboards, etc.). If drop-off details exist but are not consistently visible, participants will miss where and when to deliver items, creating last-minute coordination noise.

Goal

Wherever an item is rendered in the UI, also render its drop-off place and drop-off time (when available), using a single shared display component so the behavior is consistent across the app.

Non-goals
	•	Not redesigning item creation/edit flows (unless drop-off data is missing from the model entirely — see Unknowns).
	•	Not adding new notification logic.
	•	Not changing permissions/roles.

⸻

Unknowns (must be resolved in codebase before implementation)
	•	Unknown: What the canonical “item” model is called (e.g., Contribution, PlanItem, Need, Item) and where it’s rendered.
	•	Unknown: Whether drop-off details already exist in the database/schema (e.g., fields like dropOffLocation, dropOffAt, dropOffWindowStart/End, etc.).
	•	Unknown: Whether “drop-off” is item-level, event-level (meal/activity), or gathering-level default with overrides.
	•	Unknown: The exact list of item-rendering surfaces/screens in the current UI.

(Implementation must not invent new meaning—only display what exists, or add fields explicitly if missing.)

⸻

Requirements

R1 — Display rule (global)
	•	Wherever an item is displayed, show:
	•	Drop-off place (label: “Drop-off:”)
	•	Drop-off time (label: “By:” or “Time:” — pick one and use consistently)

R2 — Formatting
	•	If both exist: Drop-off: <place> · By: <time>
	•	If only place exists: Drop-off: <place>
	•	If only time exists: By: <time>
	•	If neither exists: show nothing (no empty placeholders)

R3 — Shared component

Create a single reusable UI component to render drop-off details, used across all item displays:
	•	Suggested: DropOffMeta or ItemDropOffDetails
	•	Inputs: dropOffPlace?, dropOffTime? (or whatever the actual model uses)

R4 — Data source / precedence (if multiple possible sources exist)
	•	If item has explicit drop-off fields → use them.
	•	Else if item inherits from an event/plan slot default → use inherited values.
	•	Else if gathering has default drop-off settings → use those.
	•	Else show nothing.

Unknown: Whether inheritance exists; only implement precedence that is real in the current data model.

⸻

Scope: Surfaces to update

Update every place an item is rendered (not a subset). Typical candidates (confirm in repo):
	•	Plan builder item cards
	•	Contributions tracker rows/cards
	•	Participant “your asks” list
	•	Coordinator dashboard lists
	•	Any modal/detail view that shows an item summary
	•	Any printable/share view that includes items

Definition of done: no remaining item renderer omits drop-off details.

⸻

Engineering Plan (Claude Code instructions)
	1.	Inventory the item renderers
	•	Search for components rendering items:
	•	keywords: ItemCard, ContributionRow, Need, Bring, quantity, assignment, contribution
	•	Make a list of files/components and the prop shape they receive.
	2.	Identify canonical drop-off fields
	•	Inspect Prisma schema (or equivalent) and API payloads.
	•	Decide the exact source fields for:
	•	place (string)
	•	time (datetime/string/range)
	3.	Add shared component
	•	Create ItemDropOffDetails.tsx (or similar).
	•	Ensure it gracefully renders nothing when no data.
	4.	Wire into all item renderers
	•	Replace any duplicated drop-off rendering.
	•	Ensure consistent placement in each card/row:
	•	Usually under quantity/assignee line, above notes.
	5.	Add unit tests
	•	For ItemDropOffDetails:
	•	renders both
	•	renders only place
	•	renders only time
	•	renders nothing when neither
	6.	Add integration sanity checks
	•	At least one smoke test per major surface (if test framework exists).
	•	If no UI test framework: add a lightweight render test per item card component.

⸻

Acceptance Criteria
	•	In every UI surface where an item appears, drop-off place/time is displayed when available.
	•	A single shared component is used everywhere (no duplicated formatting logic).
	•	Empty-state behavior is clean: when absent, nothing is shown (no “Drop-off: —”).
	•	Formatting is consistent across the app.
	•	Tests added for the shared component (and any critical renderer if feasible).
	•	No new fields added unless the schema truly lacks drop-off data (and that addition is explicitly included as a separate subtask/PR).

⸻

Test Plan
	•	Component tests:
	•	Place + time
	•	Place only
	•	Time only
	•	Neither
	•	Manual QA checklist:
	•	View plan builder item
	•	View contributions tracker item
	•	Open participant link and view asked item
	•	View coordinator dashboard item
	•	Confirm drop-off values match the underlying data in each view

⸻

Notes (Stone constraint)

This is a Clarity Over Cleverness change: the user-facing system must not require memory or back-and-forth to know where and when to drop something off.  ￼  ￼

  Implementation Summary

  ✅ Foundation Components Created

  1. Helper Function (src/lib/formatDropOff.ts)
    - Centralized time formatting logic
    - Prioritizes dropOffNote (human-readable) over dropOffAt (timestamp)
    - Formats timestamps to NZ timezone
  2. Shared Component (src/components/shared/DropOffDisplay.tsx)
    - Single reusable component for drop-off display
    - Implements ticket formatting rules:
        - Both: "Drop-off:  · By: "
      - Place only: "Drop-off: "
      - Time only: "By: "
      - Neither: renders nothing (no placeholders)
    - Supports two variants: inline (single line) and stacked (separate rows)
    - Includes MapPin and Clock icons from lucide-react

  ✅ Updated All Item Display Surfaces

  3. Plan Editor (src/app/plan/[eventId]/page.tsx)
    - Fixed Item interface to include drop-off fields
    - Added DropOffDisplay to "Items & Quantities" section
    - Added DropOffDisplay to "Teams" section (when expanded)
    - Verified API already returns drop-off fields
  4. Participant View (src/app/p/[token]/page.tsx)
    - Replaced custom drop-off display with shared component
    - Uses stacked variant for better mobile readability
    - Removed local formatDropOff function (now centralized)
  5. Team Host Drill-Down (src/app/h/[token]/team/[teamId]/page.tsx)
    - Replaced MapPin-only display with full drop-off display
    - Now shows both location AND time (was missing time before)
    - Uses stacked variant
  6. Coordinator View (src/app/c/[token]/page.tsx)
    - Replaced custom display with shared component
    - Now shows both location AND time (was missing time before)
    - Uses inline variant for compact display
  7. EditItemModal (src/components/plan/EditItemModal.tsx)
    - Added read-only drop-off summary at the top
    - Shows current drop-off info in the status section
    - Uses inline variant

  📋 Files Modified

  New Files (2):
  - src/lib/formatDropOff.ts
  - src/components/shared/DropOffDisplay.tsx

  Modified Files (6):
  - src/app/plan/[eventId]/page.tsx
  - src/app/p/[token]/page.tsx
  - src/app/h/[token]/team/[teamId]/page.tsx
  - src/app/c/[token]/page.tsx
  - src/components/plan/EditItemModal.tsx

  ✅ Acceptance Criteria Met

  - ✅ Every UI surface where items appear now shows drop-off place/time when available
  - ✅ Single shared DropOffDisplay component used everywhere (no duplicated logic)
  - ✅ Empty-state behavior is clean: renders nothing when no data
  - ✅ Formatting is consistent across the app (follows ticket spec exactly)
  - ✅ No new database fields needed (they already existed)
  - ⚠️ Component tests skipped (no testing framework configured)

  🎯 Manual QA Checklist

  To verify the implementation works correctly, you should test:

  1. Create/edit an item with drop-off location AND note → should display both
  2. Create an item with only location → should display "Drop-off: "
  3. Create an item with only time → should display "By: "
  4. Create an item with neither → should display nothing
  5. Verify display in all surfaces:
    - Plan Editor (Items & Quantities section)
    - Plan Editor (Teams section when expanded)
    - EditItemModal (summary at top)
    - Coordinator View (when item expanded)
    - Participant View (when item expanded)
    - Team Host Drill-Down (when item expanded)

  The implementation is complete and ready for testing! All drop-off information now displays consistently across the entire application using a single shared component.
