Build Ticket (Shape) — Full-Screen “Expand Section” Modal Overlay

Ticket ID

GATHER-UI-SECTION-EXPAND-001

Title

Allow any major section (Items & Quantities / People / Teams / etc.) to expand into a full-screen modal overlay over the current page.

Problem

On busy event pages, sections become cramped. Editing “People” or “Items & Quantities” inside a constrained panel increases errors, scrolling friction, and cognitive load.

Goal

From the main Draft page, a user can open a section into a full-screen overlay (modal) that:
	•	preserves underlying page state
	•	gives more space for editing/reviewing
	•	closes back to the same scroll position and context

Non-goals
	•	No redesign of section content itself (only the container/presentation).
	•	No new data model changes.
	•	No cross-page navigation replacement (this is an overlay, not a new route) unless already planned (Unknown).

Unknowns (must be resolved elsewhere)
	•	What sections exist today beyond “Items & Quantities”, “People”, “Teams”.
	•	Whether edits are currently autosaved in Draft mode, or require an explicit “Save”.
	•	Existing modal stack rules (e.g., Consult modal, field checks) and whether modal-on-modal is allowed.

Proposed UX

Entry points

Each section header gains an Expand affordance:
	•	icon button (e.g., ⤢) and/or text “Expand”
	•	keyboard accessible

Modal behavior (full-screen overlay)
	•	Covers full viewport (desktop + mobile)
	•	Underlay page is visually dimmed and non-interactive
	•	Close controls:
	•	top-right “X”
	•	ESC key
	•	clicking backdrop (optional; if risky for accidental close, disable)
	•	Scroll lock on body; modal content scrolls independently
	•	Focus trap within modal (accessibility)

Content inside the modal
	•	Same section UI, simply rendered in a larger frame
	•	Section title persists in modal header
	•	Optional sticky actions area (if the section has actions)

Exit and continuity

On close:
	•	returns to the same underlying page and scroll position
	•	if the section was expanded from a specific section, the page should remain anchored to it (no “jump to top”)

Modal stacking policy (Shape decision)

Default: single overlay at a time.
	•	If another modal tries to open, block with a clear message or close current first.
(Interaction with Consult modal is Unknown; must be made explicit as a product decision.)

Acceptance Criteria
	1.	Each target section shows an Expand control in Draft mode.
	2.	Clicking Expand opens a full-screen overlay showing that section.
	3.	Underlying page is not interactive while overlay is open.
	4.	User can close overlay via X and ESC (and optional backdrop if enabled).
	5.	Closing returns user to the same underlying page state and scroll context.
	6.	Overlay supports keyboard navigation + focus trapping.
	7.	Overlay works on mobile and desktop without layout breakage.

Edge Cases
	•	If the section has unsaved changes and close is attempted:
	•	Unknown whether autosave exists.
	•	If no autosave exists, show “Discard changes?” confirmation before closing.
	•	Very long lists (People / Items): modal must remain performant and scrollable.
	•	Deep links / refresh while modal open:
	•	decide whether modal state is URL-driven (Unknown) or transient UI state.

Test Cases
	•	Open/close expanded “People” section; verify scroll and context preserved.
	•	Open/close expanded “Items & Quantities” section; verify list interactions still work.
	•	Keyboard-only: tabbing stays inside modal; ESC closes.
	•	Mobile: full-screen overlay renders correctly; no background scroll.
	•	Attempt to open a second modal while expanded overlay is open: verify stacking rule is enforced.

STOP
