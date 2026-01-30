# TICKET 4.1: Freeze Warnings

## Context

Hosts can "freeze" the plan when coordination is complete. Freezing with low compliance or critical gaps should trigger warnings (but not block the action).

**Depends on:** Epics 1-3 complete (reachability tracking, RSVP, nudge infrastructure)

## File Locations
```
src/lib/workflow.ts                         — Add checkFreezeReadiness function
src/components/plan/TransitionModal.tsx     — Add warning UI for freeze
src/app/api/events/[id]/transition/route.ts — Return warnings in response
```

## Build Spec

### 1. Freeze Check Function (`src/lib/workflow.ts`)
```typescript
interface FreezeWarning {
  type: 'LOW_COMPLIANCE' | 'CRITICAL_GAPS';
  message: string;
  details: string[];
}

interface FreezeCheckResult {
  canFreeze: boolean;           // always true — warnings don't block
  warnings: FreezeWarning[];
  complianceRate: number;       // 0-100
  criticalGaps: {
    itemId: string;
    itemName: string;
  }[];
}

export async function checkFreezeReadiness(eventId: string): Promise<FreezeCheckResult>
```

**Compliance calculation:**
- Numerator: Assignments with `status = ACCEPTED` where assignee has `reachabilityTier != UNTRACKABLE`
- Denominator: Total assignments where assignee has `reachabilityTier != UNTRACKABLE`
- Exclude untrackable from both — can't measure what you can't reach

**Warning triggers:**

| Condition | Warning |
|-----------|---------|
| `complianceRate < 80` | `{ type: 'LOW_COMPLIANCE', message: 'Only {X}% of guests have confirmed', details: [list of pending names] }` |
| Any item with `isCritical = true` AND no accepted assignment | `{ type: 'CRITICAL_GAPS', message: '{N} critical items have no owner', details: [item names] }` |

### 2. Transition API (`src/app/api/events/[id]/transition/route.ts`)

When transitioning to FROZEN:
```typescript
// Before executing transition
const freezeCheck = await checkFreezeReadiness(eventId);

// Return in response (don't block)
return {
  success: true,
  event: updatedEvent,
  freezeWarnings: freezeCheck.warnings  // empty array if none
}
```

### 3. Transition Modal (`src/components/plan/TransitionModal.tsx`)

| State | Display |
|-------|---------|
| No warnings | Standard "Freeze this plan?" confirmation |
| Has warnings | Warning panel + "Freeze Anyway" button |

**Warning UI:**
```
⚠️ Heads up before you freeze:

- Only 65% of guests have confirmed
  - Tom (pending), Sarah (pending), Mike (not sure)

- 2 critical items have no owner
  - Main dish
  - Venue booking

[Cancel]  [Freeze Anyway]
```

### 4. Error Handling

| Condition | Response |
|-----------|----------|
| Event not in CONFIRMING status | 400 `{ error: 'Can only freeze from CONFIRMING status' }` |
| No assignments exist | complianceRate = 100, no LOW_COMPLIANCE warning |
| No critical items defined | criticalGaps = [], no CRITICAL_GAPS warning |

## Do Not Touch

- Freeze action itself — warnings never block
- DRAFT → CONFIRMING gate checks
- Nudge infrastructure
- RSVP logic

## Done When

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `checkFreezeReadiness` returns correct compliance rate
- [ ] LOW_COMPLIANCE warning triggers at <80%
- [ ] CRITICAL_GAPS warning triggers for unassigned critical items
- [ ] TransitionModal shows warnings before freeze
- [ ] Host can freeze despite warnings
- [ ] Event successfully transitions to FROZEN

## Verification Steps
```
1. Set up test event in CONFIRMING status:
   - 10 trackable guests
   - 5 with ACCEPTED assignments
   - 5 with PENDING assignments
   - 1 critical item with no assignment

2. Call freeze check directly (or via API):
   Assert: complianceRate = 50
   Assert: warnings includes LOW_COMPLIANCE
   Assert: warnings includes CRITICAL_GAPS
   Assert: canFreeze = true

3. Open transition modal in UI:
   http://localhost:3000/plan/[eventId]
   Click "Freeze Plan"

   Assert: Warning panel visible
   Assert: Shows "Only 50% of guests have confirmed"
   Assert: Shows critical gap item name

4. Click "Freeze Anyway"
   Assert: Event status = FROZEN
   Assert: No error thrown

5. Test clean freeze (no warnings):
   - Set all assignments to ACCEPTED
   - Assign all critical items
   - Attempt freeze

   Assert: No warning panel
   Assert: Standard confirmation only
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| 0 assignments | complianceRate = 100, no warning |
| All guests untrackable | complianceRate = 100 (nothing to measure) |
| 80% exactly | No warning (threshold is <80) |
| 79.5% | Warning triggers (rounds down or use exact comparison) |
| Critical item has declined assignment | Counts as gap (not covered) |
