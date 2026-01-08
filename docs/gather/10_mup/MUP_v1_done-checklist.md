# MUP v1 Done Checklist

Use this checklist to verify the complete MUP v1 demo workflow is working end-to-end.

## Demo Verification Checklist

### Setup
- [ ] Development server is running (`npm run dev`)
- [ ] Database is seeded with test data
- [ ] Browser is open to `http://localhost:3001`

---

### 1. Start Planning
- [ ] Clicked "Demo Host" link on homepage
- [ ] Landed on plan workspace for an event
- [ ] Event shows status at top (DRAFT/CONFIRMING/FROZEN/COMPLETE)

---

### 2. Inputs
- [ ] Event details visible at top (name, dates, guest count)
- [ ] Occasion type and dietary requirements shown
- [ ] Venue details present

---

### 3. Generate
- [ ] Plan shows AI-generated teams organized by domain
- [ ] Teams contain items with quantities
- [ ] Critical items are flagged
- [ ] Quantities reflect guest count calculations

---

### 4. Edit
- [ ] Made an edit to an item (changed quantity, added note, or marked critical)
- [ ] Changes saved immediately
- [ ] Can add/remove items or teams

---

### 5. Add Participants
- [ ] Navigated to "Invite Links" section or tokens page
- [ ] Verified three link types exist: HOST, COORDINATOR, PARTICIPANT
- [ ] Confirmed each team has a coordinator assigned
- [ ] Multiple participant links are available

---

### 6. Assign All
- [ ] All items show assignments to participants
- [ ] Coordinators have items assigned in their teams
- [ ] No critical items are unassigned
- [ ] Unassigned items (if any) are flagged as gaps

---

### 7. Transition
- [ ] Clicked "CONFIRMING" button at bottom of plan workspace
- [ ] Event status changed from DRAFT to CONFIRMING
- [ ] Status update reflected at top of page
- [ ] Plan is now locked (structure mode active)

---

### 8. Copy Link
- [ ] Opened invite links section
- [ ] Copied a PARTICIPANT link
- [ ] Link is in format: `http://localhost:3001/p/{token}`

---

### 9. Participant Accept
- [ ] Opened participant link in new tab/window
- [ ] Participant view shows only their assigned items
- [ ] Item details visible: name, quantity, day, location, notes
- [ ] Two buttons present: "Accept" and "Decline"
- [ ] Clicked "Accept" on at least one item
- [ ] Button changed to show "Accepted" status
- [ ] Clicked "Decline" on another item (if multiple assignments)
- [ ] Button changed to show "Declined" status
- [ ] Can change response using "Change to Accept/Decline" link

---

### 10. Host Sees Status
- [ ] Switched back to host dashboard (`http://localhost:3001/h/{token}`)
- [ ] Host view updated automatically (5-second polling)
- [ ] Teams display with status badges:
  - [ ] Green badge = All assigned and accepted
  - [ ] Amber badge = Has gaps (unassigned or declined)
  - [ ] Red badge = Critical gaps
- [ ] Each team card shows six counters:
  - [ ] Total Items
  - [ ] Assigned
  - [ ] Unassigned
  - [ ] Pending (awaiting response)
  - [ ] Accepted (confirmed)
  - [ ] Declined (needs reassignment)
- [ ] Expanded a team card to see detailed stats
- [ ] "View Items" button navigates to item details
- [ ] Accepted items show green "Accepted" badge
- [ ] Declined items show red "Declined" badge and team flagged as gap

---

## Verification Complete

All checkboxes marked = MUP v1 demo is fully functional

**Additional Verification (Optional):**
- [ ] Host can freeze event (click "Freeze Event" button when ready)
- [ ] Frozen event prevents further changes
- [ ] Host can unfreeze (with reason logged in audit trail)
- [ ] Host can mark event as COMPLETE
- [ ] Audit log shows all actions taken

---

## Troubleshooting

If any checkbox fails:

**Server not running:** Run `npm run dev` in terminal

**Database empty:** Check if seed data exists or create test event manually

**Links not working:** Verify token in URL matches database records

**Auto-refresh not working:** Check browser console for errors, verify 5-second interval active

**Status not updating:** Manually refresh browser, check API responses in Network tab
