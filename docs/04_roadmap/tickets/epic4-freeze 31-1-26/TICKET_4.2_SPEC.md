# TICKET 4.2: Sub-80% Reason Tag

## Context

When hosts freeze below 80% compliance, capturing why helps understand patterns and informs product decisions.

**Depends on:** Ticket 4.1 (freeze warnings, compliance calculation)

## File Locations
```
prisma/schema.prisma                      — Add freeze metadata fields to Event
src/lib/workflow.ts                       — Pass reason to freeze transition
src/components/plan/TransitionModal.tsx   — Add reason picker UI
src/app/api/events/[id]/transition/route.ts — Store reason on freeze
```

## Build Spec

### 1. Schema (`prisma/schema.prisma`)

Add to Event model:
```prisma
frozenAt              DateTime?
complianceAtFreeze    Float?
freezeReason          String?
```

### 2. Reason Options
```typescript
const FREEZE_REASONS = [
  { value: 'time_pressure', label: 'Time pressure — event is soon' },
  { value: 'handling_offline', label: 'Handling remaining items offline' },
  { value: 'small_event', label: 'Small event — this is enough' },
  { value: 'other', label: 'Other' }
] as const;
```

### 3. Transition Modal (`src/components/plan/TransitionModal.tsx`)

| Condition | Display |
|-----------|---------|
| Freezing AND compliance < 80% | Show warnings + reason picker (required) |
| Freezing AND compliance >= 80% | Show standard confirmation (no reason picker) |
| Freezing AND compliance < 80% AND no reason selected | "Freeze Anyway" button disabled |

**UI flow:**
```
⚠️ Heads up before you freeze:

- Only 65% of guests have confirmed
  - Tom (pending), Sarah (pending)...

Why are you freezing early?
○ Time pressure — event is soon
○ Handling remaining items offline
○ Small event — this is enough
○ Other

[Cancel]  [Freeze Anyway]  ← disabled until reason selected
```

### 4. Transition API (`src/app/api/events/[id]/transition/route.ts`)

Extend request body for CONFIRMING → FROZEN:
```typescript
POST /api/events/[id]/transition
Body: {
  to: 'FROZEN',
  freezeReason?: string  // required if compliance < 80%
}
```

On freeze:
- Set `frozenAt = now()`
- Set `complianceAtFreeze = [calculated value from checkFreezeReadiness]`
- Set `freezeReason = [provided value]` (null if compliance >= 80%)

### 5. Validation

| Condition | Response |
|-----------|----------|
| Freezing with compliance < 80% AND no reason | 400 `{ error: 'Reason required when freezing below 80% compliance' }` |
| Freezing with compliance >= 80% AND reason provided | Accept (store it anyway, no harm) |
| Invalid reason value | 400 `{ error: 'Invalid freeze reason' }` |

## Do Not Touch

- Warning logic from Ticket 4.1
- Compliance calculation
- Nudge infrastructure

## Done When

- [ ] `npx prisma migrate dev` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Freeze below 80% shows reason picker
- [ ] Cannot freeze below 80% without selecting reason
- [ ] `frozenAt`, `complianceAtFreeze`, `freezeReason` stored on Event
- [ ] Freeze at/above 80% skips reason prompt
- [ ] API validates reason requirement

## Verification Steps
```
1. Set up test event with 50% compliance (use Prisma Studio):
   - 10 assignments total
   - 5 ACCEPTED, 5 PENDING

2. Open host dashboard, click "Freeze Plan"
   Assert: Warning panel shows
   Assert: Reason picker visible
   Assert: "Freeze Anyway" button disabled

3. Select "Time pressure — event is soon"
   Assert: "Freeze Anyway" button now enabled

4. Click "Freeze Anyway"
   Assert: Event status = FROZEN

5. Check database:
   SELECT "frozenAt", "complianceAtFreeze", "freezeReason"
   FROM "Event" WHERE id = '[eventId]'

   Assert: frozenAt is set
   Assert: complianceAtFreeze ≈ 50
   Assert: freezeReason = 'time_pressure'

6. Test high compliance path:
   - Create new event with 90% compliance (9 of 10 ACCEPTED)
   - Click "Freeze Plan"

   Assert: No reason picker shown
   Assert: Standard confirmation only
   Assert: Can freeze without selecting reason
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Exactly 80% compliance | No reason required (threshold is <80%) |
| 79.9% compliance | Reason required |
| User selects reason then changes mind | Can change selection before confirming |
| API call without reason at <80% | 400 error, freeze blocked |
| Unfreeze then refreeze | New frozenAt, complianceAtFreeze, freezeReason (overwrites previous) |
