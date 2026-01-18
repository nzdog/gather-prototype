You are working in the Gather repo.

Create a new local branch and implement “Item Status Badges” everywhere items are displayed.

1) Create and switch to a new branch:
   - `git checkout -b feat/item-status-badges`

Goal:
Wherever an item is displayed, show two badges:
- Assignment: "Assigned" or "Unassigned"
- Confirmation: "Confirmed" or "Not confirmed"

Acceptance Criteria:
- Every item display includes Assignment + Confirmation badges.
- Assignment badge logic:
  - assignee exists => "Assigned"
  - no assignee => "Unassigned"
- Confirmation badge logic:
  - accepted/acknowledged/confirmed => "Confirmed"
  - pending/declined/no assignee => "Not confirmed"
- Badges appear at minimum in:
  - Items list in `src/app/plan/[eventId]/page.tsx`
  - `src/components/plan/EditItemModal.tsx`
  - Any team-grouped item list components that exist (find and update them too)
- Badges update correctly after assigning/unassigning and after participant Accept/Decline.

Implementation requirements:
- Create a shared component `src/components/plan/ItemStatusBadges.tsx` and use it everywhere instead of duplicating badge markup.
- Inspect the actual data model:
  - Identify how assignee is represented on an item.
  - Identify how “confirmed” is represented (e.g., `acknowledged: boolean` or ACCEPTED/DECLINED).
  - Do NOT invent fields—use what exists.
- Update all item rendering sites (search the codebase for item row rendering) to include the shared badges.

Copy requirements (use exactly):
- "Assigned" / "Unassigned"
- "Confirmed" / "Not confirmed"

Deliverables:
- Shared badge component
- All item display surfaces updated
- Brief summary of files changed
- Manual test steps + which event/setup you used to verify