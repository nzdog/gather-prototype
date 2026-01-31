# Testing Guide: Ticket 4.3 - Surgical Edit While Frozen

## Prerequisites

You'll need:
1. A running development server (`npm run dev`)
2. A database with test data
3. An event in FROZEN status with at least one item assigned

## Quick Test Setup

### Option 1: Use Existing Demo/Test Event

If you have an existing event, you can manually set it to FROZEN:

```sql
-- Find your test event
SELECT id, name, status FROM "Event" ORDER BY "createdAt" DESC LIMIT 5;

-- Set it to FROZEN (replace EVENT_ID)
UPDATE "Event"
SET status = 'FROZEN',
    "frozenAt" = NOW(),
    "complianceAtFreeze" = 85.0
WHERE id = 'EVENT_ID';
```

### Option 2: Create Fresh Test Event via UI

1. Create a new event through the UI
2. Add teams and items
3. Assign items to people
4. Transition DRAFT → CONFIRMING → FROZEN

## Test Scenarios

### Test 1: Access Control (IMPORTANT - Test First)

**Goal:** Verify only HOST can access frozen edit

**Steps:**
1. Navigate to host view: `/h/[token]/team/[teamId]`
2. Verify "Edit (Surgical Change)" button appears on items
3. Try accessing as coordinator or participant (should not see button)

**Expected:**
- ✅ Button visible to HOST only
- ✅ Button only appears when status === FROZEN
- ✅ API returns 403 for non-HOST users

---

### Test 2: Reassign Item

**Goal:** Move an item from one person to another

**Setup:**
- Item: "Chilly bin"
- Currently assigned to: Jake (status: ACCEPTED)
- Reassign to: Derek

**Steps:**
1. Open host team view for the team containing "Chilly bin"
2. Click "Edit (Surgical Change)" on the item
3. Select "Reassign to someone else"
4. Choose Derek from dropdown
5. Check "Notify Jake that they've been unassigned"
6. Enter reason: "Jake can't make it anymore"
7. Click "Save Change"

**Expected:**
- ✅ Modal closes
- ✅ Item now shows Derek as assignee
- ✅ Derek's assignment status is PENDING
- ✅ Notification logged for Jake (check InviteEvent table)
- ✅ Notification logged for Derek (check InviteEvent table)
- ✅ Audit entry created with reason

**Verify in Database:**
```sql
-- Check assignment changed
SELECT i.name, a.response, p.name as assignee
FROM "Item" i
JOIN "Assignment" a ON i.id = a."itemId"
JOIN "Person" p ON a."personId" = p.id
WHERE i.name = 'Chilly bin';

-- Check audit trail
SELECT type, metadata
FROM "InviteEvent"
WHERE metadata->>'auditType' = 'FROZEN_EDIT'
ORDER BY "createdAt" DESC
LIMIT 3;
```

---

### Test 3: Toggle Critical Flag

**Goal:** Change an item's critical status

**Steps:**
1. Find a non-critical item
2. Click "Edit (Surgical Change)"
3. Select "Change critical status"
4. Check "Mark as critical (must-have item)"
5. Enter reason: "This is now essential for the event"
6. Click "Save Change"

**Expected:**
- ✅ Modal closes
- ✅ Item now shows CRITICAL badge
- ✅ No notifications sent (this action doesn't notify)
- ✅ Audit entry created with before/after state

**Verify in Database:**
```sql
-- Check critical flag updated
SELECT name, critical, "criticalSource", "criticalOverride"
FROM "Item"
WHERE name = 'YOUR_ITEM_NAME';

-- Check audit
SELECT metadata->'before' as before, metadata->'after' as after
FROM "InviteEvent"
WHERE metadata->>'action' = 'toggle_critical'
ORDER BY "createdAt" DESC
LIMIT 1;
```

---

### Test 4: Edit Item Details

**Goal:** Update item name, quantity, or description

**Setup:**
- Item with ACCEPTED assignment

**Steps:**
1. Click "Edit (Surgical Change)" on an item with accepted assignment
2. Select "Edit item details"
3. Change quantity from "1 bag" to "2 bags"
4. Note the warning about resetting confirmation
5. Enter reason: "Need more quantity based on final headcount"
6. Click "Save Change"

**Expected:**
- ✅ Modal closes
- ✅ Item quantity updated to "2 bags"
- ✅ Assignment status reset from ACCEPTED to PENDING
- ✅ Notification logged for assignee to re-confirm
- ✅ Audit entry with before/after values

**Verify in Database:**
```sql
-- Check item updated and assignment reset
SELECT i.name, i.quantity, a.response
FROM "Item" i
JOIN "Assignment" a ON i.id = a."itemId"
WHERE i.name = 'YOUR_ITEM_NAME';

-- Check notification logged
SELECT type, metadata
FROM "InviteEvent"
WHERE metadata->>'action' = 'frozen_edit_item_updated'
ORDER BY "createdAt" DESC
LIMIT 1;
```

---

### Test 5: Validation Errors

**Goal:** Verify proper error handling

**Test 5a: Missing Reason**
1. Open frozen edit modal
2. Select any action
3. Leave reason field empty
4. Try to submit

**Expected:** Alert: "Please provide a reason for this change"

**Test 5b: Edit on Non-Frozen Event**
1. Set event status to CONFIRMING
2. Try to access the edit button

**Expected:** Button not visible

**Test 5c: Unassign Item**
1. Open reassign modal
2. Select "Unassigned (remove current assignment)"
3. Check notify checkbox
4. Enter reason
5. Submit

**Expected:**
- ✅ Assignment removed
- ✅ Item shows as unassigned
- ✅ Notification logged if checkbox was checked

---

## API Testing (Optional - For Advanced Users)

### Direct API Test with cURL

First, get your event ID and item ID from the database:

```sql
SELECT e.id as event_id, i.id as item_id, i.name
FROM "Event" e
JOIN "Team" t ON t."eventId" = e.id
JOIN "Item" i ON i."teamId" = t.id
WHERE e.status = 'FROZEN'
LIMIT 1;
```

Then test the endpoint (requires authentication):

```bash
# Reassign action
curl -X POST http://localhost:3000/api/events/EVENT_ID/frozen-edit \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_AUTH_COOKIE" \
  -d '{
    "action": "reassign",
    "itemId": "ITEM_ID",
    "reason": "Testing reassignment",
    "payload": {
      "newPersonId": "PERSON_ID",
      "notifyRemoved": true
    }
  }'

# Expected response:
# {
#   "success": true,
#   "action": "reassign",
#   "itemId": "...",
#   "auditId": "...",
#   "notifications": {
#     "sent": ["person1", "person2"],
#     "failed": []
#   }
# }
```

---

## Audit Trail Verification

After each test, verify the audit trail is working:

```sql
-- View all frozen edit audit entries
SELECT
  ie."createdAt",
  p.name as actor,
  ie.metadata->>'action' as action,
  ie.metadata->>'itemName' as item,
  ie.metadata->>'reason' as reason
FROM "InviteEvent" ie
JOIN "Person" p ON ie."personId" = p.id
WHERE ie.metadata->>'auditType' = 'FROZEN_EDIT'
ORDER BY ie."createdAt" DESC;
```

---

## Common Issues & Troubleshooting

### Modal doesn't open
- Check browser console for errors
- Verify ModalContext is working
- Check that `data.people` is populated

### Button not visible
- Confirm event status is exactly 'FROZEN' (not 'CONFIRMING')
- Check you're logged in as HOST
- Verify you're on the team detail page, not main host view

### API returns 403
- Ensure you're authenticated as HOST
- Check EventRole table has HOST role for your user

### Changes not saving
- Check browser console for API errors
- Verify database connection
- Check transaction isn't rolling back due to validation errors

---

## Quick Verification Checklist

After running tests, verify:

- [ ] TypeScript compiles without errors
- [ ] No console errors in browser
- [ ] All three actions work (reassign, toggle critical, edit item)
- [ ] Audit trail entries created for each action
- [ ] Notifications logged (visible in InviteEvent table)
- [ ] Assignment status properly updated
- [ ] Modal opens and closes smoothly
- [ ] Only HOST can see edit button
- [ ] Button only appears when status === FROZEN
- [ ] Reason field is required and enforced

---

## Need Help?

If something isn't working:
1. Check browser console for errors
2. Check server logs (terminal running `npm run dev`)
3. Verify database state with SQL queries above
4. Ensure event is truly FROZEN status
5. Confirm you have HOST role for the event
