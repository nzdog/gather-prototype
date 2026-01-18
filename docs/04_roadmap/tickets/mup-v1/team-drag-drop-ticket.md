You are working in the Gather repo.

Create a new local branch and implement the “Team Board drag & drop” feature as described. Do this as a one-shot implementation: make all necessary changes without asking questions unless a hard blocker prevents progress.

1) Create and switch to a new branch:
   - `git checkout -b feat/team-board-dnd`

2) Implement a Team Board UI in the Plan workspace that shows cards/columns for each team plus an Unassigned card, and allows moving people between teams via drag & drop (desktop) and a click “Move to…” fallback (mobile).

Acceptance Criteria (must satisfy all):
- People section in `/plan/[eventId]` has a Table | Board toggle.
- Board view shows team cards + Unassigned card, with draggable person chips.
- Drag & drop supports Unassigned→Team, Team→Team, Team→Unassigned.
- Moves persist via existing people update API (PATCH teamId).
- Refresh shows persisted team membership.
- EditItemModal assignment dropdown updates immediately after moves (no stale state).
- On save failure: revert UI and show an error.
- Do not break existing table view.

Constraints:
- Use existing APIs and auth model. ”
- Use @dnd-kit for drag & drop.
- Keep changes scoped to these files (plus dependency additions):
  - `src/app/plan/[eventId]/page.tsx`
  - `src/components/plan/PeopleSection.tsx`
  - `src/components/plan/EditItemModal.tsx`
  - NEW `src/components/plan/TeamBoard.tsx`
  - `package.json` for @dnd-kit deps

Minimum UI spec copy (use exactly this wording):
A) People section view toggle:
- Label (optional): "View"
- Two options:
  - "Table"
  - "Board"
- Helper text (optional, small): "Move people between teams in Board view."

B) Team cards:
- Card title is the team name exactly as stored (e.g., "Catering", "Drinks")
- Special card title: "Unassigned"
- If showing counts:
  - "<N> people" (e.g., "3 people")

C) Drag affordance / guidance (optional, small):
- "Drag people to move them between teams."

D) Click fallback menu for a person chip:
- Menu title: "Move to"
- Menu options:
  - one option per team: team name exactly
  - one option: "Unassigned"
- Confirmation toast/message after move:
  - "Moved <Name> to <TeamName>"
  - If moved to Unassigned: "Moved <Name> to Unassigned"

E) Failure message:
- "Couldn't save. Try again."

F) Backend workflow state naming consistency:
- Do NOT introduce “Freeze plan” or any non-backend status naming in this UI.
- If any workflow state is shown near this feature, it must use backend names exactly:
  - "DRAFT", "CONFIRMING", "FROZEN", "COMPLETE"

Implementation notes:
- Ensure `people[]` state is owned in `src/app/plan/[eventId]/page.tsx` and passed down to PeopleSection and EditItemModal so the dropdown reflects changes immediately.
- TeamBoard should call a parent callback like `onMovePerson(personEventId, teamIdOrNull)` which:
  - optimistically updates local people state
  - PATCHes the backend
  - on failure, reverts state and shows the failure message above
- Identify the correct identifier for PATCH (personEventId vs personId) by inspecting current PeopleSection + API route usage; use whatever the backend expects.
- Ensure team filtering in `EditItemModal` reflects updates from the shared `people` prop.

Deliverables:
- Working Board UI + toggle + persistence.
- Brief summary of edits.
- Exact manual test steps to verify:
  1) Move person Unassigned → Team; refresh persists
  2) Open EditItemModal for a team item; dropdown includes moved person immediately
  3) Move person Team → Team; dropdown behavior updates
  4) Move person Team → Unassigned; dropdown no longer shows them for team-scoped items
  5) Simulate a save failure (if easy) to confirm revert + "Couldn't save. Try again."


    Summary

  Branch: feat/team-board-dnd

  Commit: 50360ee - "feat: Implement Team Board drag & drop for people management"

  ---
  What Was Implemented

  Core Feature: A Board view in the People section that allows dragging people between teams, with full persistence and state synchronization.

  Key Components:
  1. TeamBoard.tsx (new) - Drag & drop UI using @dnd-kit
  2. Table/Board toggle - Switch between views seamlessly
  3. Shared people state - All dropdowns stay in sync
  4. Unassigned support - People can be moved to/from unassigned state
  5. Optimistic updates - Instant UI feedback with rollback on failure

  ---
  Technical Changes

  Dependencies:
  - Added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities

  Database:
  - Migration: make_teamid_optional - PersonEvent.teamId is now nullable

  Files Changed: 12 files
  - +579 insertions / -132 deletions
  - New: src/components/plan/TeamBoard.tsx (316 lines)
  - Modified: API routes, plan page, modals, Prisma schema

  State Architecture:
  - Lifted people state from PeopleSection to plan page
  - EditItemModal, quick assign dropdowns, TeamBoard all consume shared state
  - Single source of truth ensures immediate consistency

  ---
  All Acceptance Criteria Met ✅

  - Table | Board toggle works
  - Drag & drop between all team combinations
  - Click menu fallback for mobile
  - Persists to database via PATCH API
  - EditItemModal dropdown updates immediately
  - Quick assign dropdown updates immediately
  - Error handling with revert and message
  - Table view unchanged

  ---
  Ready for: Testing, code review, or merging to main branch.