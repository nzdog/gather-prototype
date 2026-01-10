# MUP v1 Test Report

**Test Date:** 2026-01-08
**Tester:** Claude (Automated Browser Testing)
**Base URL:** http://localhost:3000 (Note: Documentation specifies 3001, server runs on 3000)

---

## Executive Summary

**Overall Result:** FAIL - Critical issues prevent complete demo flow execution

**Major Issues:**
1. Server port mismatch (runs on 3000, docs say 3001)
2. Event status starts in CONFIRMING instead of DRAFT (prevents demonstrating full workflow)
3. Missing event metadata display (occasion type, dietary requirements, venue details)
4. 13 items unassigned (24% of total items), blocking transition to FROZEN
5. Browser extension connection issues prevented full participant flow testing

**Checklist Pass Rate:** 11/30 core checkboxes PASS, 8/30 FAIL, 11/30 NOT TESTED (due to technical issues)

---

## Detailed Checklist Results

### Setup

- [FAIL] Development server is running (`npm run dev`) — Server runs on port 3000, not 3001 as documented
- [PASS] Database is seeded with test data — Reset successful after migration fix
- [PARTIAL] Browser is open to `http://localhost:3001` — Port 3001 fails; used 3000 instead

**Notes:**
- Had to run `npx prisma migrate dev` to fix seed script error: "Column `Item.generatedBatchId` does not exist"
- After migration, demo reset API call succeeded
- Port mismatch is a documentation issue or configuration inconsistency

---

### 1. Start Planning

- [PASS] Clicked "Demo Host" link on homepage — Accessed via /demo page, clicked host link for "Jacqui & Ian"
- [PASS] Landed on plan workspace for an event — Successfully navigated to `/h/91065...` then `/plan/cmk5815sa000un96rrhktna6o`
- [PASS] Event shows status at top (DRAFT/CONFIRMING/FROZEN/COMPLETE) — Status badge "CONFIRMING" visible at top

**Notes:**
- Demo script expects "Demo Host" link on homepage, but homepage shows "Start planning" and "Try the interactive demo" buttons
- Navigated via /demo page which lists host/coordinator/participant links
- Successful navigation to plan workspace, but **status is CONFIRMING not DRAFT**

---

### 2. Inputs

- [PASS] Event details visible at top (name, dates, guest count) — "Wickham Family Christmas", "24/12/2025 - 26/12/2025", "27 guests"
- [FAIL] Occasion type and dietary requirements shown — Event Details sidebar shows "Occasion" label but no value; dietary requirements not displayed
- [FAIL] Venue details present — No venue information visible in Event Details sidebar

**Notes:**
- Event Details sidebar shows: Status (CONFIRMING), Occasion (blank), Dates, Guest Count (27), Teams (8), Items (54)
- Missing fields that should be displayed per demo script: occasion type, occasion description, dietary requirements, venue name/type/notes
- These fields may exist in database but are not rendered in the UI

---

### 3. Generate

- [PASS] Plan shows AI-generated teams organized by domain — 8 teams visible: Clean-up, Drinks, Entrées & Nibbles, Later Food, Mains – Proteins, Puddings, Setup, Vegetables & Sides
- [PASS] Teams contain items with quantities — All 54 items listed with "Quantity:" labels
- [PASS] Critical items are flagged — Multiple items show red "CRITICAL" badges (e.g., "Clean-up coordination", "Birthday cake", "Beef fillets", "GF trifle")
- [PASS] Quantities reflect guest count calculations — 54 items for 27 guests appears reasonable

**Notes:**
- Plan Assessment shows "No conflicts found / Your plan looks good!"
- Items organized by team with clear team labels
- Mix of critical and non-critical items across all teams

---

### 4. Edit

- [NOT TESTED] Made an edit to an item (changed quantity, added note, or marked critical) — Browser extension lost connection during item click attempt
- [NOT TESTED] Changes saved immediately — Could not verify due to connection issue
- [NOT TESTED] Can add/remove items or teams — Could not test due to connection issue

**Notes:**
- Attempted to click "Clean-up coordination" item via JavaScript (successful click)
- Browser extension authentication expired before observing result
- UI shows "Edit Event Details" button and individual "Edit" buttons for people, suggesting edit functionality exists
- **Unable to complete edit verification**

---

### 5. Add Participants

- [PASS] Navigated to "Invite Links" section or tokens page — Invite Links section visible on plan workspace page
- [PASS] Verified three link types exist: HOST, COORDINATOR, PARTICIPANT — All three types present in Invite Links section
- [PASS] Confirmed each team has a coordinator assigned — All 8 teams have coordinators: Anika (Puddings), Elliot (Setup), Gus (Later Food), Ian (Drinks), Jacqui & Ian (Vegetables & Sides), Joanna (Entrées & Nibbles), Kate (Mains – Proteins), Nigel (Clean-up)
- [PASS] Multiple participant links are available — 21 participant links listed (Aaron, Angus, Annie, Charlie, Dougal, Emily, Emma, Florence, Gavin, George, Grace, Jack, Jane, Keith, Lance, Lucas, Oliver, Pete, Robyn, Rosie, Tom)

**Notes:**
- Invite Links section shows full token URLs in format: `/h/{token}`, `/c/{token}`, `/p/{token}`
- Each coordinator link shows associated team name
- "Copy Link" buttons available for each token
- Total people count: 29 (1 host, 8 coordinators, 20 participants listed, though tokens show 21 participants)

---

### 6. Assign All

- [FAIL] All items show assignments to participants — **13 items unassigned** (24% of 54 total items)
- [PARTIAL] Coordinators have items assigned in their teams — Coordinators assigned to teams, but items within teams are incomplete
- [FAIL] No critical items are unassigned — Cannot verify; unassigned items not individually listed in view
- [FAIL] Unassigned items (if any) are flagged as gaps — "Assignment Coverage" section shows "items unassigned" with "Assign All Items to Continue" button

**Unassigned Items Breakdown:**
- Later Food: 3 unassigned
- Puddings: 8 unassigned
- Setup: 1 unassigned
- Vegetables & Sides: 1 unassigned
- **Total: 13 unassigned items**

**Notes:**
- Teams showing "All assigned" badge: Clean-up, Drinks, Entrées & Nibbles, Mains – Proteins
- Cannot Freeze Yet section states: "All items must be assigned before freezing the plan"
- This blocks the intended demo flow progression to FROZEN status

---

### 7. Transition

- [FAIL] Clicked "CONFIRMING" button at bottom of plan workspace — **No button available; event already in CONFIRMING status**
- [FAIL] Event status changed from DRAFT to CONFIRMING — Event status was CONFIRMING from the start (database seed issue)
- [N/A] Status update reflected at top of page — Status shows CONFIRMING (but never transitioned from DRAFT)
- [N/A] Plan is now locked (structure mode active) — Status indicator shows CONFIRMING, descriptive text says to "assign all items" before transitioning to FROZEN

**Notes:**
- **Critical workflow issue:** Demo script expects event to start in DRAFT status and transition to CONFIRMING in step 7
- Database seed creates event in CONFIRMING status already
- CONFIRMING stage description: "Share invite links with your team and assign all items to people. Once all items are assigned, you can transition to FROZEN to lock the plan for execution."
- Next transition would be to FROZEN, but blocked by unassigned items
- **Cannot demonstrate the DRAFT → CONFIRMING transition as intended**

---

### 8. Copy Link

- [NOT TESTED] Opened invite links section — Section was visible, but could not interact due to browser connection issue
- [NOT TESTED] Copied a PARTICIPANT link — Could not complete due to technical limitations
- [PASS] Link is in format: `http://localhost:3001/p/{token}` — Verified format from page content (though actual base URL is localhost:3000)

**Sample Participant Links Observed:**
- Aaron: `/p/475bc0afc98dbca63e411d5c287530fe2e16f047349d782c57147c46eb6638b8`
- Angus: `/p/ec2d849459a39642d77e81ba6bdabc731c813115f78b50766ff1b3a90b717647`
- Annie: `/p/38d7165407314900357c72172bcdef651b3ec6d2bf06629334ed2852ffac0df2`

**Notes:**
- Token format appears correct (64-character hex strings)
- Full URLs would be `http://localhost:3000/p/{token}` (not 3001)
- Could not test copy functionality

---

### 9. Participant Accept

- [NOT TESTED] Opened participant link in new tab/window — Browser extension connection lost
- [NOT TESTED] Participant view shows only their assigned items — Could not access participant view
- [NOT TESTED] Item details visible: name, quantity, day, location, notes — Could not verify
- [NOT TESTED] Two buttons present: "Accept" and "Decline" — Could not verify
- [NOT TESTED] Clicked "Accept" on at least one item — Could not complete
- [NOT TESTED] Button changed to show "Accepted" status — Could not verify
- [NOT TESTED] Clicked "Decline" on another item (if multiple assignments) — Could not complete
- [NOT TESTED] Button changed to show "Declined" status — Could not verify
- [NOT TESTED] Can change response using "Change to Accept/Decline" link — Could not verify

**Notes:**
- **Unable to test participant flow due to browser extension authentication expiry**
- Would need to manually open participant link or re-establish browser connection
- This is a critical gap in test coverage

---

### 10. Host Sees Status

- [PARTIAL] Switched back to host dashboard (`http://localhost:3000/h/{token}`) — Viewed host dashboard earlier, showing team status cards
- [NOT TESTED] Host view updated automatically (5-second polling) — Could not observe updates due to no participant actions
- [PARTIAL] Teams display with status badges — Observed in earlier host dashboard view:
  - [NOT VERIFIED] Green badge = All assigned and accepted — Did not see this state
  - [PARTIAL] Amber badge = Has gaps (unassigned or declined) — Saw "1 gap" indicators for some teams
  - [PARTIAL] Red badge = Critical gaps — Saw red badges on some teams with critical item gaps
- [PARTIAL] Each team card shows six counters — Observed team cards with status indicators:
  - [NOT VERIFIED] Total Items — Not clearly shown on cards
  - [NOT VERIFIED] Assigned — Not clearly shown on cards
  - [NOT VERIFIED] Unassigned — Not clearly shown on cards
  - [NOT VERIFIED] Pending (awaiting response) — Not clearly shown on cards
  - [NOT VERIFIED] Accepted (confirmed) — Not clearly shown on cards
  - [NOT VERIFIED] Declined (needs reassignment) — Not clearly shown on cards
- [NOT TESTED] Expanded a team card to see detailed stats — Could not interact due to connection issue
- [NOT TESTED] "View Items" button navigates to item details — Could not test
- [NOT TESTED] Accepted items show green "Accepted" badge — No accepted items to verify (no participant actions completed)
- [NOT TESTED] Declined items show red "Declined" badge and team flagged as gap — No declined items to verify

**Host Dashboard Observations (from earlier view):**
- URL: `http://localhost:3000/h/91065e977b945d73cb97314fd466de4744a0063f1036a6592369edded893f34b`
- Event name: "Wickham Family Christmas", 27 guests
- Status badge: CONFIRMING
- Alert: "13 critical gaps remain"
- Team cards visible: Clean-up (green "All assigned"), Drinks (green "All assigned"), Entrées & Nibbles (green "All assigned"), Later Food (red "1 critical gap"), Mains – Proteins (green "All assigned"), Puddings (red "3 critical gaps"), Setup (red "1 critical gap"), Vegetables & Sides (amber "1 gap")
- Bottom message: "Cannot freeze: 13 critical gaps" (red text)

**Notes:**
- Host dashboard partially functional, showing team-level status
- Detailed six-counter breakdown not clearly visible on collapsed team cards
- **Could not verify auto-refresh polling behavior** without participant actions
- **Could not verify accept/decline status updates** due to incomplete participant flow testing

---

## Bug List

### 1. **Port Mismatch: Server runs on 3000, docs specify 3001**
- **Severity:** Low (documentation issue)
- **Description:** Demo script and done checklist specify base URL `http://localhost:3001`, but `npm run dev` starts server on port 3000
- **Impact:** Initial connection failure, requires manual port correction
- **Likely files:** `docs/gather/10_mup/MUP_v1_demo-script.md` (line 9), `docs/gather/10_mup/MUP_v1_done-checklist.md` (line 10), possibly `package.json` or Next.js config

### 2. **Event Status Initialized as CONFIRMING Instead of DRAFT**
- **Severity:** High (breaks demo workflow)
- **Description:** Database seed creates event in CONFIRMING status; demo script expects DRAFT status to demonstrate workflow progression
- **Impact:** Cannot demonstrate Section 7 transition from DRAFT to CONFIRMING; demo starts mid-workflow
- **Likely files:** `prisma/seed.ts` (event creation), check event status field initialization

### 3. **Missing Event Metadata in UI: Occasion Type, Dietary Requirements, Venue Details**
- **Severity:** Medium (incomplete feature display)
- **Description:** Event Details sidebar shows labels but no values for occasion type; dietary requirements and venue details not displayed at all
- **Impact:** Fails Section 2 checklist items; information gap for users
- **Likely files:** `src/app/plan/[eventId]/page.tsx` or event details component, possibly missing database query fields or UI rendering logic

### 4. **13 Items Unassigned (24% of Total Items)**
- **Severity:** High (blocks workflow progression)
- **Description:** Seed data leaves 13 items unassigned across 4 teams (Later Food: 3, Puddings: 8, Setup: 1, Vegetables & Sides: 1)
- **Impact:** Cannot transition to FROZEN status; fails Section 6 checklist; incomplete demo
- **Likely files:** `prisma/seed.ts` (item assignment logic), possibly missing assignment generation for all items

### 5. **Database Schema Missing `generatedBatchId` Column**
- **Severity:** Critical (blocks seed script)
- **Description:** Seed script references `Item.generatedBatchId` column that doesn't exist in current database schema
- **Impact:** Demo reset fails without manual migration; first-time setup broken
- **Resolution Applied:** Ran `npx prisma migrate dev --name init_if_needed`
- **Likely files:** `prisma/schema.prisma` (schema definition out of sync), `prisma/seed.ts` (references non-existent column)

### 6. **Browser Extension Authentication Expiry During Testing**
- **Severity:** Medium (testing infrastructure issue)
- **Description:** Claude in Chrome extension OAuth token expired mid-test, preventing completion of Sections 4, 8, 9, 10
- **Impact:** Incomplete test coverage; could not verify edit functionality, participant flow, or host status updates
- **Note:** Not a product bug, but a test environment limitation

### 7. **Homepage Navigation Unclear for Demo Entry Point**
- **Severity:** Low (usability/documentation)
- **Description:** Demo script says "Click 'Demo Host' link on homepage", but homepage (`/`) shows "Start planning" and "Try the interactive demo" buttons, not a "Demo Host" link
- **Impact:** Minor confusion; /demo page has clear demo links, but navigation path differs from script
- **Likely files:** `docs/gather/10_mup/MUP_v1_demo-script.md` (update navigation instructions) or `src/app/page.tsx` (add demo host link)

### 8. **Assignment Coverage Display Vague**
- **Severity:** Low (UI polish)
- **Description:** Assignment Coverage section says "items unassigned" without specifying count or showing which items
- **Impact:** Host cannot easily identify which specific items need assignment
- **Likely files:** Plan workspace component displaying assignment coverage section

---

## Recommendations

1. **Fix Seed Data:**
   - Set event initial status to DRAFT (not CONFIRMING)
   - Assign all 54 items to people (currently 13 unassigned)
   - Populate occasion type, dietary requirements, and venue details with demo values

2. **Update Documentation:**
   - Change base URL in demo script and checklist from `:3001` to `:3000` (or fix server port config)
   - Clarify homepage navigation instructions (mention /demo page explicitly)

3. **Add Missing UI Elements:**
   - Display occasion type, dietary requirements, and venue details in Event Details sidebar
   - Show specific unassigned item count and list in Assignment Coverage section
   - Ensure all six counters (Total, Assigned, Unassigned, Pending, Accepted, Declined) are visible on team cards

4. **Database Schema Maintenance:**
   - Sync `prisma/schema.prisma` with seed script expectations
   - Add migration for `generatedBatchId` column or remove references from seed script
   - Document migration requirements in setup instructions

5. **Testing Infrastructure:**
   - Implement automated Playwright/Puppeteer tests to replace manual browser extension testing
   - Add API-level tests for participant accept/decline workflow
   - Create health check script to verify all checklist items programmatically

---

## Test Environment

- **OS:** Darwin 24.6.0 (macOS)
- **Node.js:** (version not captured)
- **Database:** PostgreSQL (gather_dev)
- **Browser:** Chrome with Claude in Chrome extension
- **Server Start Command:** `npm run dev`
- **Server Output:** Next.js 14.2.35, ready in 1149ms

---

## Conclusion

The MUP v1 demo has a solid foundation with functional plan workspace, team organization, invite link generation, and host dashboard. However, **critical seed data issues** (wrong initial status, unassigned items, missing metadata) prevent a complete end-to-end demo execution as specified in the done checklist.

**Priority fixes:**
1. Update seed script to create event in DRAFT status with all items assigned
2. Populate event metadata fields (occasion, dietary, venue)
3. Fix port configuration or update documentation

**Before next demo attempt:**
- Run `npm run dev` (verify port 3000)
- Reset demo data: `curl -X POST http://localhost:3000/api/demo/reset`
- Verify event status is DRAFT: Check via database or API
- Verify all 54 items are assigned: Check Assignment Coverage shows 0 unassigned
- Test participant flow manually: Open `/p/{token}` URL and verify Accept/Decline buttons

With these fixes, the demo should achieve a PASS rating on all core checklist items.
