# Phase 3: Conflict System - Testing Guide

## Overview

Phase 3 implementation is complete. This guide explains how to test the Conflict System end-to-end.

## Components Built

### 1. API Endpoints (7 routes)
- `GET /api/events/[id]/conflicts` - List active conflicts
- `GET /api/events/[id]/conflicts/dismissed` - List dismissed conflicts
- `GET /api/events/[id]/conflicts/[conflictId]` - Get conflict details
- `POST /api/events/[id]/conflicts/[conflictId]/resolve` - Mark resolved
- `POST /api/events/[id]/conflicts/[conflictId]/dismiss` - Dismiss conflict
- `POST /api/events/[id]/conflicts/[conflictId]/delegate` - Delegate to coordinator
- `POST /api/events/[id]/conflicts/[conflictId]/acknowledge` - Acknowledge (Critical only)

### 2. Acknowledgement Flow with Validation
Located in: `/api/events/[id]/conflicts/[conflictId]/acknowledge/route.ts`

Validates:
- `impactStatement` minimum 10 characters
- `impactStatement` references affected party or mitigation action
- `impactUnderstood` must be `true`
- `mitigationPlanType` must be valid enum value
- Stores `affectedParties` from conflict
- Sets visibility (cohosts: true, coordinators: 'relevant_only', participants: false)
- Supports supersession (new acknowledgement supersedes old)

### 3. Dismissal Reset Logic
Located in: `/src/lib/conflicts/reset.ts`

Features:
- Stores `inputsReferenced` on each conflict
- Compares current values to stored values on Check Plan
- Reopens conflict if inputs changed
- Generates human-readable reason: e.g., "Guest count changed (40 → 55)"

### 4. UI Components
- `ConflictCard.tsx` - Displays conflict with severity badge (critical/significant/advisory)
- `ConflictList.tsx` - Groups conflicts by severity, critical first
- `AcknowledgeModal.tsx` - Form for Critical acknowledgement with validation

### 5. Plan Page Integration
Updated `/src/app/plan/[eventId]/page.tsx`:
- Shows ConflictList after Check Plan
- Wired up resolve/dismiss/acknowledge/delegate actions
- Integrated Check Plan button

## Testing the System

### Manual Testing Flow

#### 1. Create or Open an Event
```bash
# Start the development server
npm run dev

# Navigate to an event's plan page
# http://localhost:3000/plan/[eventId]
```

#### 2. Trigger Check Plan
- Click "Check Plan" button in the header
- System will run conflict detection via `/api/events/[id]/check`
- Conflicts will appear in the "Plan Assessment" section

#### 3. Test Conflict Display
Conflicts should be grouped by severity:
- **CRITICAL** (red) - Appears first
- **SIGNIFICANT** (orange) - Appears second
- **ADVISORY** (blue) - Appears last

Each conflict card shows:
- Severity badge
- Title and description
- Affected parties
- AI suggestion (if available)
- Action buttons

#### 4. Test Resolve Action
- Click "Resolve" button on any conflict
- Conflict should disappear from active list
- Verify via API: `GET /api/events/[id]/conflicts` (status should be RESOLVED)

#### 5. Test Dismiss Action (Non-Critical)
- Click "Dismiss" on a SIGNIFICANT or ADVISORY conflict
- Conflict should disappear from active list
- Verify via API: `GET /api/events/[id]/conflicts/dismissed`

#### 6. Test Acknowledge Action (Critical Only)
**CRITICAL conflicts show "Acknowledge" instead of "Dismiss"**

Steps:
1. Click "Acknowledge" on a CRITICAL conflict
2. Modal should open with:
   - Conflict description
   - Impact statement textarea
   - Mitigation type dropdown
   - Checkbox: "I understand this means affected guests may have an incomplete meal"

3. Test Validation:
   - Try submitting with < 10 characters → Should show error
   - Try submitting without referencing affected party → Should show error
   - Try submitting without checking checkbox → Should show error

4. Valid Submission:
   ```
   Impact Statement: "Vegetarians will eat from sides and salads — confirmed with Sarah and Tom"
   Mitigation Type: "Communicate to guests"
   Checkbox: ✓ checked
   ```

5. Submit → Conflict status changes to ACKNOWLEDGED

#### 7. Test Delegate Action
- Find a conflict with `canDelegate: true`
- Click "Delegate to Coordinator"
- Conflict status changes to DELEGATED

#### 8. Test Dismissal Reset Logic

**Setup:**
1. Create a conflict that references event inputs (e.g., guest count)
2. Dismiss the conflict
3. Change the referenced input (e.g., update guest count)
4. Run Check Plan again

**Expected:**
- Dismissed conflict should be reopened
- Status changes back to OPEN
- Check Plan response includes reopened reason

**Example:**
```json
{
  "resetConflicts": 1,
  "conflicts": [
    {
      "id": "...",
      "title": "No vegetarian main",
      "status": "OPEN",
      "reopenedReason": "Guest count changed (40 → 55)"
    }
  ]
}
```

### API Testing with cURL

#### List Active Conflicts
```bash
curl http://localhost:3000/api/events/[eventId]/conflicts
```

Expected response:
```json
{
  "conflicts": [...],
  "summary": {
    "total": 3,
    "critical": 1,
    "significant": 1,
    "advisory": 1
  }
}
```

#### Acknowledge a Critical Conflict
```bash
curl -X POST http://localhost:3000/api/events/[eventId]/conflicts/[conflictId]/acknowledge \
  -H "Content-Type: application/json" \
  -d '{
    "impactStatement": "Vegetarians will eat from sides and salads — confirmed with Sarah",
    "impactUnderstood": true,
    "mitigationPlanType": "COMMUNICATE",
    "acknowledgedBy": "user-id"
  }'
```

Expected response:
```json
{
  "acknowledgement": {
    "id": "...",
    "conflictId": "...",
    "impactStatement": "Vegetarians will eat from sides and salads — confirmed with Sarah",
    "mitigationPlanType": "COMMUNICATE",
    "status": "ACTIVE"
  },
  "conflict": {
    "id": "...",
    "status": "ACKNOWLEDGED"
  }
}
```

#### Test Validation Errors
```bash
# Too short impact statement
curl -X POST http://localhost:3000/api/events/[eventId]/conflicts/[conflictId]/acknowledge \
  -H "Content-Type: application/json" \
  -d '{
    "impactStatement": "ok",
    "impactUnderstood": true,
    "mitigationPlanType": "COMMUNICATE",
    "acknowledgedBy": "user-id"
  }'
```

Expected error:
```json
{
  "error": "Impact statement must be at least 10 characters"
}
```

## Database Verification

### Check Conflicts Table
```sql
SELECT
  id,
  type,
  severity,
  status,
  title,
  "createdAt"
FROM "Conflict"
WHERE "eventId" = 'your-event-id'
ORDER BY severity, "createdAt" DESC;
```

### Check Acknowledgements
```sql
SELECT
  a.id,
  a."impactStatement",
  a."mitigationPlanType",
  a.status,
  c.title as conflict_title
FROM "Acknowledgement" a
JOIN "Conflict" c ON a."conflictId" = c.id
WHERE a."eventId" = 'your-event-id'
ORDER BY a."acknowledgedAt" DESC;
```

### Check Dismissal Reset
```sql
-- Before reset: conflict is dismissed
UPDATE "Conflict"
SET status = 'DISMISSED', "dismissedAt" = NOW()
WHERE id = 'conflict-id';

-- Change input (e.g., guest count)
UPDATE "Event"
SET "guestCount" = 55
WHERE id = 'event-id';

-- Run Check Plan (triggers reset logic)
-- Verify conflict is reopened:
SELECT status FROM "Conflict" WHERE id = 'conflict-id';
-- Should be 'OPEN'
```

## Success Criteria

✅ All 7 API endpoints respond correctly
✅ ConflictList groups conflicts by severity (Critical first)
✅ Critical conflicts require acknowledgement with validation
✅ Non-critical conflicts can be dismissed
✅ Dismissal reset logic reopens conflicts when inputs change
✅ Acknowledgements support supersession
✅ Visibility settings stored correctly
✅ TypeScript compilation passes with no errors

## Known Limitations / Future Work

1. **User Authentication**: Currently using placeholder "current-user-id" - needs proper auth integration
2. **Optimistic Updates**: UI could benefit from optimistic updates instead of full reload
3. **Real-time Notifications**: Reopened conflicts don't trigger notifications yet
4. **Conflict Creation**: No UI for manually creating conflicts (relies on AI detection)
5. **Audit Trail**: Acknowledgement supersession history could be surfaced in UI

## Next Steps

Phase 3 is complete. Ready for Phase 4: Gate & Transition.
