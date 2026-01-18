# MUP v1 Demo Script

This script walks through the complete MUP (Minimum Usable Product) v1 workflow from planning to participant response.

## Prerequisites

- Development server running: `npm run dev`
- Database seeded with test data
- Browser open to: `http://localhost:3001`

---

## Demo Flow

### 1. Start Planning

**Action:** Click "Demo Host" link on homepage
**What to show:** Landing on the plan workspace for an event

**URL:** `http://localhost:3001/plan/{eventId}`

**Key points:**
- This is where the host plans their event
- Can see all teams and items
- Event status shows at top (DRAFT/CONFIRMING/FROZEN/COMPLETE)

---

### 2. Review Inputs

**Action:** Point out the event details at the top of the page
**What to show:** Event metadata already configured

**Key points:**
- Event name, dates, guest count
- Occasion type and dietary requirements
- Venue details

**Say:** "The host has already provided these inputs during setup"

---

### 3. Generate Plan

**Action:** Explain that the plan was AI-generated based on inputs
**What to show:** Teams organized by domain (Proteins, Sides, Desserts, etc.)

**Key points:**
- Teams are organized by food categories
- Each team has items with quantities
- Critical items are flagged
- Quantities are calculated based on guest count

**Say:** "The AI generated this plan based on the event inputs"

---

### 4. Edit Plan

**Action:** Make a quick edit to demonstrate flexibility
**What to show:** Click into an item, modify quantity or notes

**Example edits:**
- Change quantity of an item
- Add a note to an item
- Mark an item as critical

**Key points:**
- Host can edit any item
- Changes are saved immediately
- Can add/remove items or teams

---

### 5. Add Participants

**Action:** Navigate to event tokens page
**What to show:** Click the "Share Links" button or navigate to tokens

**URL:** `http://localhost:3001/plan/{eventId}` (scroll to "Invite Links" section)

**Key points:**
- Invite links are automatically generated
- Three types: HOST, COORDINATOR, PARTICIPANT
- Each team has a coordinator assigned
- Multiple participant links can be generated

**Say:** "The system has generated secure invite links for each role"

---

### 6. Assign All Items

**Action:** Show that items are assigned to team members
**What to show:** Each item shows who it's assigned to

**Key points:**
- Items are assigned to participants
- Coordinator is assigned items in their team
- Unassigned items show as gaps

**Say:** "All items have been assigned to participants"

---

### 7. Transition to CONFIRMING

**Action:** Click "CONFIRMING" button at bottom of plan workspace
**What to show:** Event status changes from DRAFT to CONFIRMING

**Key points:**
- Status updates at top of page
- Plan is now locked (structure mode)
- Participants can now receive their links

**Say:** "Moving to CONFIRMING sends the event to participants"

---

### 8. Copy Participant Link

**Action:** Open the invite links section and copy a participant link
**What to show:** Copy one of the participant links

**Where to find:**
- Scroll to "Invite Links" section in plan workspace
- Or navigate to `http://localhost:3001/plan/{eventId}` and look for share links
- Copy a PARTICIPANT link

**Say:** "I'll now copy a participant link to show their view"

---

### 9. Participant Accepts Assignment

**Action:** Open participant link in new tab/window
**What to show:** Participant view with their assignments

**URL:** `http://localhost:3001/p/{participant-token}`

**Key points:**
- Participant sees only their assigned items
- Shows item details: name, quantity, day, location, notes
- Two buttons: "Accept" and "Decline"

**Action:** Click "Accept" on one item, "Decline" on another
**What to show:**
- Button changes to show "Accepted" or "Declined"
- Can change response by clicking "Change to Accept/Decline"

**Say:** "Participants can accept or decline each assignment"

---

### 10. Host Sees Status

**Action:** Switch back to host dashboard
**What to show:** Host view updates automatically (5-second polling)

**URL:** `http://localhost:3001/h/{host-token}`

**Key points:**
- Teams show in cards with status badges:
  - Green badge = All assigned and accepted
  - Amber badge = Has gaps (unassigned or declined items)
  - Red badge = Critical gaps
- Each team card shows counts:
  - Total Items
  - Assigned
  - Unassigned
  - Pending (awaiting response)
  - Accepted (confirmed)
  - Declined (needs reassignment)

**Action:** Expand a team card to see detailed stats
**What to show:**
- Click chevron to expand
- Shows all six counters
- "View Items" button to see item details

**Say:** "The host can see real-time status of participant responses. Declined items are flagged as gaps that need attention."

---

## Demo Complete

You've now demonstrated the complete MUP v1 workflow:
- Planning with AI-generated structure
- Editing and customization
- Adding participants via invite links
- Assignment distribution
- Status transition to CONFIRMING
- Participant acceptance/decline
- Host visibility of response status

**Next steps to mention:**
- Host can freeze the event when ready (FROZEN status)
- Frozen events prevent further changes
- Host can mark event as COMPLETE when done
