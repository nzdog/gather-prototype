# TICKET 4.3: Surgical Edit While Frozen

## Context

After freezing, sometimes one item needs reassignment. Allow controlled exceptions without requiring full unfreeze.

**Depends on:** Tickets 4.1-4.2 (freeze system with warnings and audit trail)

## File Locations

```
src/app/api/events/[id]/frozen-edit/route.ts  — NEW: Frozen edit endpoint
src/lib/workflow.ts                           — Add frozen edit validation
src/components/plan/ItemCard.tsx              — Add edit option in frozen state
src/components/plan/FrozenEditModal.tsx       — NEW: Modal for frozen edits
```

## Build Spec

### 1. API Endpoint

```typescript
POST /api/events/[id]/frozen-edit

Body: {
  action: 'reassign' | 'toggle_critical' | 'edit_item',
  itemId: string,
  reason: string,  // required - why this edit is needed
  payload: {
    // For 'reassign':
    newPersonId?: string,      // null = unassign
    notifyRemoved?: boolean,   // send "you've been unassigned" to old assignee
    
    // For 'toggle_critical':
    critical?: boolean,
    
    // For 'edit_item':
    name?: string,
    quantity?: string,
    description?: string
  }
}

Response: {
  success: true,
  action: string,
  itemId: string,
  auditId: string,
  notifications: {
    sent: string[],  // personIds notified
    failed: string[]
  }
}
```

### 2. Validation

| Check | Error |
|-------|-------|
| Event not found | 404 `{ error: 'Event not found' }` |
| Event not FROZEN | 400 `{ error: 'Event must be frozen for surgical edits' }` |
| Actor not HOST | 403 `{ error: 'Only host can make frozen edits' }` |
| Item not found | 404 `{ error: 'Item not found' }` |
| Item not in this event | 400 `{ error: 'Item does not belong to this event' }` |
| Missing reason | 400 `{ error: 'Reason required for frozen edits' }` |
| Invalid action | 400 `{ error: 'Invalid action. Must be reassign, toggle_critical, or edit_item' }` |

### 3. Action Logic

**reassign:**
```
1. Find current assignment (if any)
2. If notifyRemoved && current assignee exists:
   - Queue notification: "You've been unassigned from {itemName}"
3. Remove current assignment (or set status = CANCELLED)
4. If newPersonId provided:
   - Create new assignment with status = PENDING
   - Queue notification: "You've been assigned to {itemName}"
5. Log audit entry
```

**toggle_critical:**
```
1. Update item.critical = payload.critical
2. Log audit entry
3. No notifications needed
```

**edit_item:**
```
1. Update item fields (name, quantity, description)
2. If item has ACCEPTED assignment:
   - Reset assignment status to PENDING
   - Queue notification: "{itemName} has been updated, please re-confirm"
3. Log audit entry
```

### 4. Audit Trail

Log to InviteEvent (or similar audit table):

```typescript
{
  eventId: string,
  type: 'FROZEN_EDIT',
  actorId: string,      // host's personId
  itemId: string,
  action: string,       // 'reassign' | 'toggle_critical' | 'edit_item'
  reason: string,       // host-provided reason
  before: JSON,         // previous state
  after: JSON,          // new state
  createdAt: DateTime
}
```

### 5. UI Components

**ItemCard in frozen state:**
- Show "Edit" button (only visible to host)
- Click opens FrozenEditModal

**FrozenEditModal:**
```
┌─────────────────────────────────────────┐
│ Edit While Frozen                       │
├─────────────────────────────────────────┤
│ Item: Chilly bin                        │
│                                         │
│ What do you need to change?             │
│ ○ Reassign to someone else              │
│ ○ Change critical status                │
│ ○ Edit item details                     │
│                                         │
│ [Reassign form / Critical toggle /      │
│  Edit fields - shown based on selection]│
│                                         │
│ Why is this change needed?              │
│ [____________________________________]  │
│                                         │
│ [Cancel]              [Save Change]     │
└─────────────────────────────────────────┘
```

### 6. Notifications

| Action | Recipient | Message |
|--------|-----------|---------|
| Reassign (removed) | Old assignee | "You've been unassigned from {itemName} for {eventName}" |
| Reassign (added) | New assignee | "You've been assigned to bring {itemName} for {eventName}. {link}" |
| Edit item | Current assignee (if ACCEPTED) | "{itemName} details have changed. Please re-confirm. {link}" |

Use existing notification infrastructure (SMS/email based on contactMethod).

## Do Not Touch

- Full unfreeze flow
- Bulk edit capabilities
- Freeze warning logic (Ticket 4.1)
- Freeze reason capture (Ticket 4.2)

## Done When

- [x] `npx prisma migrate dev` succeeds (if schema changes needed)
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] Host can reassign item while event is frozen
- [x] Host can toggle critical flag while frozen
- [x] Host can edit item details while frozen
- [x] Edit item resets assignment to PENDING and notifies assignee
- [x] All frozen edits logged with reason
- [x] Old assignee notified on reassignment (if opted in)
- [x] New assignee notified on reassignment
- [x] Non-hosts cannot access frozen edit

## Verification Steps

```
1. Set up test event:
   - Status: FROZEN
   - Item: "Chilly bin" assigned to Jake (ACCEPTED)
   - Derek exists as guest

2. Test reassignment:
   POST /api/events/[eventId]/frozen-edit
   Body: {
     "action": "reassign",
     "itemId": "[chillyBinId]",
     "reason": "Jake can't make it anymore",
     "payload": {
       "newPersonId": "[derekId]",
       "notifyRemoved": true
     }
   }
   
   Assert: 200 response
   Assert: Jake's assignment removed/cancelled
   Assert: Derek has new PENDING assignment
   Assert: Notification queued for Jake (unassigned)
   Assert: Notification queued for Derek (assigned)
   Assert: Audit entry created with reason

3. Test toggle critical:
   POST /api/events/[eventId]/frozen-edit
   Body: {
     "action": "toggle_critical",
     "itemId": "[itemId]",
     "reason": "This is now essential",
     "payload": { "critical": true }
   }
   
   Assert: Item.critical = true
   Assert: Audit entry created

4. Test edit item:
   - First assign item to someone, set status = ACCEPTED
   POST /api/events/[eventId]/frozen-edit
   Body: {
     "action": "edit_item",
     "itemId": "[itemId]",
     "reason": "Need more quantity",
     "payload": { "quantity": "2 bags" }
   }
   
   Assert: Item.quantity updated
   Assert: Assignment status reset to PENDING
   Assert: Notification queued for assignee
   Assert: Audit entry created

5. Test authorization:
   - Call endpoint as non-host
   Assert: 403 Forbidden

6. Test validation:
   - Call on non-frozen event
   Assert: 400 "Event must be frozen"
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Reassign to same person | No-op, return success |
| Reassign unassigned item | Just create new assignment |
| Unassign (newPersonId = null) | Remove assignment, notify if requested |
| Edit item with no assignment | Update item, no notification needed |
| Edit item with PENDING assignment | Update item, no status change needed |
| Multiple edits to same item | Each logged separately |
| notifyRemoved = false | Skip notification to old assignee |
