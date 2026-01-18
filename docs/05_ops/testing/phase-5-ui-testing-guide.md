# Phase 5 UI Testing Guide

## Overview
This guide provides step-by-step instructions for testing the Phase 5 Templates & Memory UI integration.

---

## Pre-Test Setup

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Ensure database is seeded:**
   - The database should have at least one event in CONFIRMING status
   - Check by visiting http://localhost:3000

---

## Test Flow 1: Create and Save Template

### Step 1: Navigate to an Event
1. Go to http://localhost:3000
2. Click on any Host View link (e.g., "Jacqui & Ian")
3. This should open `/h/[token]` - the Host Overview page

### Step 2: Navigate to Event Details
1. From the Host Overview, click on an event (e.g., "Wickham Family Christmas")
2. You should see the event details page at `/plan/[eventId]`

### Step 3: Save as Template
1. **Verify the button appears:**
   - Look for the "Save as Template" button in the header
   - It should only appear if event status is CONFIRMING, FROZEN, or COMPLETE
   - Button should have a purple background with a Save icon

2. **Click "Save as Template":**
   - A modal should open titled "Save as Template"
   - Modal should show:
     - What's included (teams, items, dietary tags, etc.)
     - What's NOT included (dates, assignments, quantities)
     - Template name input field

3. **Enter a template name:**
   - Type: "My Christmas Template 2026"
   - Click "Save Template"

4. **Verify success:**
   - Modal should close
   - An alert should show: "Template 'My Christmas Template 2026' saved successfully!"

**Expected Result:** ✅ Template saved to database

---

## Test Flow 2: View Templates

### Step 1: Navigate to Templates Page
1. Go to http://localhost:3000
2. Click the "📋 Templates" button in the header
3. Or navigate directly to http://localhost:3000/plan/templates

### Step 2: Verify Template List
1. **Check tabs:**
   - "My Templates" tab should be active
   - "Gather Templates" tab should be visible
   - Count should show (e.g., "My Templates (1)")

2. **Verify template card:**
   - Should show template name: "My Christmas Template 2026"
   - Should show occasion type and team count
   - Should have "Use Template" button
   - Should have "Delete" button

3. **Switch to Gather Templates tab:**
   - Click "Gather Templates" tab
   - Should show empty state or curated templates
   - No delete button should appear

**Expected Result:** ✅ Templates displayed correctly

---

## Test Flow 3: Clone Template

### Step 1: Start Clone Process
1. From the Templates page, click "Use Template" on your saved template
2. CloneTemplateModal should open

### Step 2: Verify Modal Content
1. **Template summary:**
   - Shows template name
   - Shows number of teams and items
   - Shows occasion type

2. **Form fields:**
   - Event Name input (pre-filled with template name)
   - Start Date picker
   - End Date picker
   - Guest Count input (optional)

### Step 3: Fill Clone Form
1. **Enter event details:**
   - Event Name: "Christmas 2026"
   - Start Date: 2026-12-24
   - End Date: 2026-12-26
   - Guest Count: 30

2. **Check quantity scaling option:**
   - Enter guest count
   - Checkbox should appear: "Apply quantity scaling"
   - Check the box

3. **Verify "What will be created" section:**
   - Shows number of teams
   - Shows number of items
   - Mentions scaling if checked

### Step 4: Create Event
1. Click "Create Event from Template"
2. Modal should show "Creating..." state
3. Modal should close on success
4. Should redirect to new event page: `/plan/[newEventId]`

### Step 5: Verify New Event
1. Check event name matches
2. Check teams exist (should match template)
3. Check items exist with source: 'TEMPLATE'
4. All items should be UNASSIGNED
5. If scaling was applied, check quantities

**Expected Result:** ✅ New event created from template

---

## Test Flow 4: Host Memory Settings

### Step 1: Navigate to Settings
1. Go to http://localhost:3000
2. Click the "⚙️ Settings" button
3. Or navigate to http://localhost:3000/plan/settings

### Step 2: Verify Memory Summary
1. **Check stats display:**
   - Completed Events count
   - Templates Saved count (should show 1+)
   - Patterns Learned count
   - Defaults Set count

2. **Verify info box:**
   - Blue info box explaining how Host Memory works
   - Should mention privacy and opt-in

### Step 3: Test Privacy Toggles

**Test "Learn from my events" toggle:**
1. Click the toggle
2. Should turn on (blue) or off (gray)
3. Should save immediately
4. No confirmation needed

**Test "Contribute to Gather patterns" toggle:**
1. Click the toggle to turn ON
2. Should show confirmation dialog:
   - "By enabling this, you consent to Gather using anonymized patterns..."
3. Click OK
4. Toggle should turn blue
5. Click toggle again to turn OFF
6. Should turn gray immediately

**Test "Use my history by default" toggle:**
1. Click the toggle
2. Should turn on/off immediately
3. No confirmation needed

### Step 4: Test Data Deletion
1. Scroll to "Delete My Data" section
2. **Verify warnings:**
   - Red border on the section
   - List of what will be deleted
   - Mention of deletion receipt

3. **Click "Delete All My Data":**
   - First confirmation: "This will permanently delete all your templates..."
   - Click OK
   - Second confirmation: "Are you absolutely sure?..."
   - Click Cancel (to preserve data for other tests)

4. **Optionally test deletion:**
   - Click Delete again
   - Confirm both dialogs
   - Should show alert: "Your data has been deleted..."
   - Stats should reset to 0
   - Templates should be empty

**Expected Result:** ✅ Settings work correctly

---

## Test Flow 5: Full End-to-End

### Complete Workflow
1. **Create Event → Generate → Transition → Save Template → Clone → Verify**

   a. Start at http://localhost:3000

   b. Click "Create New Plan" (if implemented) OR use existing event

   c. Generate plan (if DRAFT)

   d. Transition to CONFIRMING

   e. Click "Save as Template"

   f. Save template with name "E2E Test Template"

   g. Go to Templates page

   h. Clone the template

   i. Verify new event created

   j. Go to Settings

   k. Toggle learning on

   l. Go back to Templates

   m. Verify template count

**Expected Result:** ✅ Full workflow completes without errors

---

## Visual Checks

### Templates Page
- [ ] Tabs switch correctly
- [ ] Template cards display all information
- [ ] Buttons have correct colors (Use=blue, Delete=red)
- [ ] Empty state shows when no templates
- [ ] Hover states work on cards

### SaveTemplateModal
- [ ] Modal backdrop is visible (semi-transparent black)
- [ ] Modal centers on screen
- [ ] "What's included" box has blue background
- [ ] "What's NOT included" box has gray background
- [ ] Cancel button closes modal without saving
- [ ] Template name input has focus on open

### CloneTemplateModal
- [ ] Template summary shows correctly
- [ ] Date pickers work
- [ ] Guest count input accepts numbers only
- [ ] Quantity scaling checkbox appears when guest count entered
- [ ] Green "What will be created" box is visible
- [ ] Create button disabled when fields empty

### Settings Page
- [ ] Stats cards have different colors (blue, purple, green, orange)
- [ ] Toggles animate when clicked
- [ ] Delete section has red theme
- [ ] Info boxes have appropriate styling
- [ ] Back button works

---

## Error Handling Checks

### Save Template Errors
1. Try saving without network connection
2. Try saving with invalid hostId
3. Try saving non-existent event

**Expected:** Error message shown, modal doesn't close

### Clone Template Errors
1. Try creating event with past dates
2. Try cloning without required fields
3. Try cloning with network error

**Expected:** Appropriate error messages, modal stays open

### Settings Errors
1. Try updating settings offline
2. Try deleting data offline

**Expected:** Error alerts shown

---

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## Performance Checks

1. **Template List Loading:**
   - Should load within 500ms
   - No flickering during tab switch

2. **Modal Animations:**
   - Smooth fade-in
   - No layout shifts

3. **Settings Toggles:**
   - Instant visual feedback
   - Save completes within 1s

---

## Accessibility Checks

1. **Keyboard Navigation:**
   - [ ] Tab through all buttons
   - [ ] Enter/Space activates buttons
   - [ ] Escape closes modals

2. **Screen Reader:**
   - [ ] All buttons have labels
   - [ ] Modal announces when opening
   - [ ] Form fields have labels

3. **Focus Management:**
   - [ ] Modal traps focus
   - [ ] Focus returns after closing
   - [ ] Focus indicators visible

---

## Bug Checklist

Common issues to watch for:

- [ ] Modal doesn't open/close
- [ ] Template not saving to database
- [ ] Clone creates event but doesn't redirect
- [ ] Toggles don't update in database
- [ ] Delete doesn't show confirmation
- [ ] Template list doesn't refresh after save
- [ ] Navigation links broken
- [ ] Quantity scaling doesn't apply
- [ ] Event created with wrong dates
- [ ] Stats don't update after actions

---

## Success Criteria

All tests pass when:

✅ Templates can be saved from events
✅ Templates display correctly in list
✅ Templates can be cloned to new events
✅ Cloned events have correct structure
✅ Quantity scaling works when opted-in
✅ Settings page displays memory stats
✅ Privacy toggles work correctly
✅ Data deletion shows confirmations
✅ Navigation links work
✅ No console errors
✅ UI is responsive and accessible

---

## Test Results Log

| Test Flow | Status | Notes | Tested By | Date |
|-----------|--------|-------|-----------|------|
| Create/Save Template | ⏳ | | | |
| View Templates | ⏳ | | | |
| Clone Template | ⏳ | | | |
| Host Memory Settings | ⏳ | | | |
| End-to-End | ⏳ | | | |

**Status Legend:**
- ⏳ Not tested
- ✅ Pass
- ❌ Fail
- ⚠️ Pass with issues

---

## Reporting Issues

When reporting bugs, include:
1. Test flow name
2. Step number where error occurred
3. Expected behavior
4. Actual behavior
5. Browser/device
6. Console errors (if any)
7. Screenshots (if applicable)

---

**Phase 5 UI Integration: Ready for Testing**
