# Setup Checklist Banner Implementation

## Summary

Implemented a horizontal progress banner that guides new hosts through the initial setup of their event. The banner appears between the Event Stage Progress indicator and the card grid on the plan page, showing 5 clear steps with visual progress tracking.

## Files Created

### 1. `src/hooks/useEventSetupProgress.ts`
**Purpose**: Custom React hook that computes setup progress based on existing event data

**Key features**:
- Derives completion state from existing data (no new DB fields needed)
- Returns 5 setup steps with completion status
- Provides action handlers for each step
- Calculates overall progress (completedCount, totalSteps, allComplete)
- Identifies next incomplete step for highlighting

**Completion logic**:
- Step 1 (Create event): Always true - user is on the page
- Step 2 (Add event details): `guestCount > 0`
- Step 3 (Add people): At least one person beyond the host
- Step 4 (Create your plan): At least one team exists
- Step 5 (Run plan check): `lastCheckPlanAt !== null`

### 2. `src/components/plan/SetupChecklistBanner.tsx`
**Purpose**: React component that renders the horizontal progress banner

**Visual design**:
- Horizontal layout with 5 step indicators connected by lines
- Step circles (32px) with checkmarks (complete) or numbers (incomplete)
- Labels below each step (text-xs)
- Progress counter ("X of 5 complete") or completion message
- Dismiss button when all steps complete

**States**:
- Complete: Sage-600 background, white checkmark, sage-700 label
- Next (first incomplete): White background with accent-300 ring, accent-700 label
- Incomplete: Gray-200 background, gray-400 label

**Interaction**:
- Complete steps: no action (cursor-default)
- Incomplete steps: clickable, triggers associated action
- Dismiss button: hides banner and saves to localStorage

## Files Modified

### 1. `src/app/plan/[eventId]/page.tsx`
**Changes**:
- Added imports for `SetupChecklistBanner` and `useEventSetupProgress`
- Added state variables:
  - `checklistDismissed`: tracks if user dismissed the banner
  - `checklistStepContext`: stores step label to pass to modals
- Added effect to load dismissed state from localStorage
- Added setup progress hook with action handlers:
  - `handleChecklistOpenEditDetails`: Opens EditEventModal with step label
  - `handleChecklistOpenAddPerson`: Expands People section with step label
  - `handleChecklistOpenCreatePlan`: Triggers Generate Plan or opens AddTeamModal
  - `handleChecklistRunPlanCheck`: Triggers plan check
  - `handleChecklistDismiss`: Hides banner and saves to localStorage
- Added `handleEditEventModalClose`: Clears step context when modal closes
- Inserted `<SetupChecklistBanner>` between EventStageProgress and card grid
  - Only renders when `event.status === 'DRAFT'` and `!checklistDismissed`
- Updated EditEventModal to pass `stepLabel` prop
- Updated PeopleSection calls to pass `stepLabel` prop
- Added cleanup of `checklistStepContext` when people section changes

### 2. `src/components/plan/EditEventModal.tsx`
**Changes**:
- Added optional `stepLabel?: string` prop to interface
- Added destructuring of `stepLabel` in component params
- Modified modal header to show step label above title when present
- Step label styled as `text-xs text-gray-400 mb-1`

### 3. `src/components/plan/AddPersonModal.tsx`
**Changes**:
- Added optional `stepLabel?: string` prop to interface
- Added destructuring of `stepLabel` in component params
- Modified modal header to show step label above title when present
- Step label styled as `text-xs text-gray-400 mb-1`

### 4. `src/components/plan/PeopleSection.tsx`
**Changes**:
- Added optional `stepLabel?: string` prop to interface
- Added destructuring of `stepLabel` in component params
- Passed `stepLabel` through to `AddPersonModal` component

## Build Status

✅ **TypeScript Compilation**: Passed (`npm run typecheck`)
✅ **Production Build**: Passed (`npm run build`)

Build output shows:
- Plan page route: 80.4 kB (page) + 171 kB (First Load JS)
- All static generation completed successfully
- No type errors or compilation failures

Pre-existing warnings (not related to this implementation):
- ESLint config deprecation warning
- Dynamic route warnings for API endpoints

## Behavior Summary

### On First Load (New Event in DRAFT Status)
1. Banner appears between EventStageProgress and card grid
2. Step 1 shows as complete (checkmark, sage-green)
3. Step 2 highlighted as next (white with accent ring)
4. Steps 3-5 shown as incomplete (gray)
5. Progress shows "1 of 5 complete"

### User Interaction Flow
1. **Click Step 2**: Opens EditEventModal with "Step 2 of 5: Add event details" label
2. **Save event details**: Step 2 completes, Step 3 becomes next
3. **Click Step 3**: Expands People section, shows "Step 3 of 5: Add people" in AddPersonModal
4. **Add a person**: Step 3 completes, Step 4 becomes next
5. **Click Step 4**: Triggers Generate Plan or opens AddTeamModal
6. **Create team**: Step 4 completes, Step 5 becomes next
7. **Click Step 5**: Runs plan check
8. **Plan check completes**: All 5 steps complete
9. **Banner updates**: Shows "All set — your event is ready to share" with Dismiss button
10. **Click Dismiss**: Banner disappears, state saved to localStorage

### Persistence
- Dismissed state stored in: `localStorage.gather_checklist_dismissed_${eventId}`
- Banner remains hidden after page refresh if dismissed
- Banner does not reappear after transition to CONFIRMING status

### Error Handling
- If localStorage unavailable: Banner always shows (never dismissed)
- If data fetch fails: Banner shows with all steps incomplete except Step 1
- If modal closed without saving: Step stays incomplete, no change

## Design Decisions

### 1. Step Ordering
Follows natural workflow progression:
1. Create event (already done at payment)
2. Add event details (guest count, dates, etc.)
3. Add people (team members)
4. Create plan (teams and items)
5. Run plan check (validate before moving to CONFIRMING)

### 2. Step 3 Interaction
Clicking "Add people" expands the People section rather than directly opening AddPersonModal. This allows users to see existing people and choose between:
- Add Person (manual entry)
- Import CSV (bulk import)
- Auto-Assign (organize existing people)

Step label is passed through PeopleSection to AddPersonModal so it appears when the user clicks "Add Person" button.

### 3. Completion Criteria
- Guest count chosen as minimum requirement for Step 2 (event details)
- Other event fields are optional for setup completion
- At least one person beyond host required for Step 3 (ensures team collaboration)
- Single team sufficient for Step 4 (minimum viable plan)
- Plan check must run at least once for Step 5 (ensures quality)

### 4. Dismissal Behavior
- Only dismissible when all steps complete
- Persists across page refreshes
- No "show again" button needed (data already in place)
- Automatically hidden when event transitions to CONFIRMING

### 5. Modal Context
- Step label only shown when modal opened FROM checklist
- When opened from card grid directly, no step label appears
- Context cleared when modal closes or action completes
- Prevents confusion about where user is in the flow

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Production build succeeds
- [ ] Banner visible on new DRAFT event
- [ ] Step 1 shows as complete on first load
- [ ] Clicking steps opens correct modals/actions
- [ ] Step labels appear in modals when opened from checklist
- [ ] Steps auto-complete when data is added
- [ ] Progress counter updates correctly
- [ ] All complete shows success message
- [ ] Dismiss button works and persists
- [ ] Banner hidden after dismiss + refresh
- [ ] Banner hidden in CONFIRMING status
- [ ] No step label when modals opened from card grid

## Next Steps for Verification

1. Start development server: `npm run dev`
2. Navigate to an existing DRAFT event or create new one
3. Verify banner appears and all interactions work as specified
4. Test edge cases (localStorage disabled, missing data, etc.)
5. Verify responsive behavior on different screen sizes
6. Confirm accessibility (keyboard navigation, ARIA labels)
