# Selective Item Regeneration - Implementation Guide

## Overview

This feature allows users to selectively keep or regenerate individual AI-generated items instead of accepting or rejecting the entire plan.

## What's Been Implemented

### Phase 1: Schema Updates ✅

Added two new fields to the `Item` model in `prisma/schema.prisma`:

```prisma
aiGenerated    Boolean   @default(false)  // Created by AI?
userConfirmed  Boolean   @default(false)  // User has confirmed this item?
```

Migration applied using `npx prisma db push`.

### Phase 2: UI Components ✅

Created two new React components:

1. **ItemReviewCard** (`src/components/plan/ItemReviewCard.tsx`)
   - Displays a single item with name, quantity, and assigned person
   - Two action buttons: "Keep" (green) and "Regenerate" (orange)
   - Visual state changes with colored borders

2. **GenerationReviewPanel** (`src/components/plan/GenerationReviewPanel.tsx`)
   - Groups items by team
   - Tracks user decisions (keep/regenerate/pending)
   - **NEW**: Displays orange "NEW" badge with pulse animation on recently regenerated items (created in last 30 seconds)
   - Action buttons:
     - "Keep All" - marks all as keep
     - "Regen All" - marks all as regenerate
     - "Regenerate Selected" - sends marked items for regeneration
     - "Confirm & Continue" - saves kept items, moves to next step
   - Shows live count of items to keep vs regenerate

### Phase 3: AI Logic ✅

Updated AI generation system:

1. **New Prompt Template** (`src/lib/ai/prompts.ts`)
   - `SELECTIVE_REGENERATION_SYSTEM_PROMPT` - instructs AI to only regenerate specific items
   - `buildSelectiveRegenerationPrompt()` - builds context with confirmed items and items to regenerate

2. **New Generation Function** (`src/lib/ai/generate.ts`)
   - `generateSelectiveItems()` - generates replacements for specific items while preserving confirmed ones
   - Fetches event details and item context from database
   - Returns only new items for regenerated slots

3. **API Endpoint Updates** (`src/app/api/events/[id]/generate/route.ts`)
   - Now accepts optional `keepItemIds` and `regenerateItemIds` in request body
   - If provided, performs selective regeneration:
     - Marks kept items as `aiGenerated: true` and `userConfirmed: false` (keeps them in review mode)
     - Deletes items marked for regeneration
     - Creates new AI-generated items with `aiGenerated: true` and `userConfirmed: false`
   - Initial generation marks items as `aiGenerated: true` and `userConfirmed: false`
   - Items are only marked as `userConfirmed: true` when the user clicks "Confirm & Continue"

4. **New Review Endpoints** (`src/app/api/events/[id]/review-items/route.ts`)
   - `GET` - Fetches all AI-generated, unconfirmed items grouped by team
   - `POST` - Marks all AI-generated items as confirmed

### Phase 5: Demo Integration ✅

Created a demo page to showcase the feature:

**Demo Page** (`src/app/demo/review/page.tsx`)
- Complete working example of the review flow
- Navigate to `/demo/review?eventId={eventId}` after generating a plan
- Shows how to integrate the components
- Handles regeneration and confirmation

## How to Use

### Testing the Feature

1. **Generate a Plan**
   ```bash
   # Navigate to plan page
   http://localhost:3000/plan/{eventId}

   # Click "Generate Plan" button
   ```

2. **Review Generated Items**
   ```bash
   # Navigate to review demo page
   http://localhost:3000/demo/review?eventId={eventId}
   ```

3. **Make Decisions**
   - Click "Keep" on items you like
   - Click "Regenerate" on items you want to replace
   - Or use "Keep All" / "Regen All" for quick selection

4. **Regenerate Selected Items**
   - Click "Regenerate Selected"
   - AI generates new items only for regenerated slots
   - Review the new items (repeat as needed)

5. **Confirm and Continue**
   - Click "Confirm & Continue"
   - All items marked as `userConfirmed: true`
   - Navigate to normal plan editing view

### API Usage

#### Selective Regeneration

```typescript
POST /api/events/{eventId}/generate
Content-Type: application/json

{
  "keepItemIds": ["item_id_1", "item_id_2"],
  "regenerateItemIds": ["item_id_3", "item_id_4"]
}
```

Response:
```json
{
  "success": true,
  "message": "Items regenerated successfully",
  "kept": 2,
  "regenerated": 2,
  "reasoning": "AI explanation..."
}
```

#### Fetch Items for Review

```typescript
GET /api/events/{eventId}/review-items
```

Response:
```json
{
  "success": true,
  "teamGroups": [
    {
      "teamName": "Food Team",
      "items": [
        {
          "id": "item_id_1",
          "name": "Caesar Salad",
          "quantityAmount": 5,
          "quantityUnit": "KG",
          "assignedTo": "John Doe",
          "teamName": "Food Team"
        }
      ]
    }
  ],
  "totalItems": 5
}
```

#### Confirm All Items

```typescript
POST /api/events/{eventId}/review-items
```

Response:
```json
{
  "success": true,
  "confirmedCount": 5
}
```

## Integration into Main Plan Page

To integrate this into the main plan page (`src/app/plan/[eventId]/page.tsx`), follow these steps:

### 1. Add State for Review Mode

```typescript
const [reviewMode, setReviewMode] = useState(false);
const [reviewTeamGroups, setReviewTeamGroups] = useState<TeamGroup[]>([]);
```

### 2. Update Generate Handler

```typescript
const handleGeneratePlan = async () => {
  setIsGenerating(true);
  try {
    const response = await fetch(`/api/events/${eventId}/generate`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to generate plan');

    // Load items for review
    const reviewResponse = await fetch(`/api/events/${eventId}/review-items`);
    if (reviewResponse.ok) {
      const reviewData = await reviewResponse.json();
      setReviewTeamGroups(reviewData.teamGroups || []);
      setReviewMode(true); // Enter review mode
    }
  } catch (err: any) {
    console.error('Error generating plan:', err);
    alert('Failed to generate plan');
  } finally {
    setIsGenerating(false);
  }
};
```

**Important**: After regenerating selected items, ALL items (both kept and newly generated) remain visible in the review panel. Items are only marked as confirmed when you click "Confirm & Continue".

### 3. Add Handlers for Review Actions

```typescript
const handleRegenerateSelected = async (keepIds: string[], regenerateIds: string[]) => {
  try {
    const response = await fetch(`/api/events/${eventId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepItemIds: keepIds, regenerateItemIds: regenerateIds }),
    });

    if (!response.ok) throw new Error('Failed to regenerate items');

    // Reload review items
    const reviewResponse = await fetch(`/api/events/${eventId}/review-items`);
    if (reviewResponse.ok) {
      const reviewData = await reviewResponse.json();
      setReviewTeamGroups(reviewData.teamGroups || []);
    }
  } catch (err: any) {
    console.error('Error regenerating items:', err);
    throw err;
  }
};

const handleConfirmAndContinue = async () => {
  try {
    const response = await fetch(`/api/events/${eventId}/review-items`, {
      method: 'POST',
    });

    if (!response.ok) throw new Error('Failed to confirm items');

    // Exit review mode and reload plan
    setReviewMode(false);
    await loadEvent();
    await loadTeams();
    await loadItems();
    await loadConflicts();
  } catch (err: any) {
    console.error('Error confirming items:', err);
    alert('Failed to confirm items');
  }
};
```

### 4. Conditional Rendering

```typescript
// In the JSX, conditionally show either the review panel or normal plan view
{reviewMode ? (
  <GenerationReviewPanel
    teamGroups={reviewTeamGroups}
    eventId={eventId}
    onConfirmAndContinue={handleConfirmAndContinue}
    onRegenerateSelected={handleRegenerateSelected}
  />
) : (
  // Normal plan editing UI
  <div>
    {/* Existing plan UI */}
  </div>
)}
```

### 5. Import Components

```typescript
import GenerationReviewPanel from '@/components/plan/GenerationReviewPanel';
```

## Database Schema

Items now have these fields for tracking AI generation state:

- `aiGenerated: boolean` - Whether the item was created by AI
- `userConfirmed: boolean` - Whether the user has confirmed this item
- `generatedBatchId: string?` - Batch ID for grouping items from the same generation

## UI Flow Diagram

```
[Generate Plan button]
        ↓
[AI generates items]
        ↓
[GenerationReviewPanel]
   ┌────────────────────────────────────────┐
   │ Food Team                              │
   │ ┌────────────────────────────────────┐ │
   │ │ 🥗 Caesar Salad    [Keep] [Regen]  │ │
   │ │ 🍖 Roast Chicken   [Keep] [Regen]  │ │
   │ └────────────────────────────────────┘ │
   │ Drinks Team                            │
   │ ┌────────────────────────────────────┐ │
   │ │ 🍷 Red Wine        [Keep] [Regen]  │ │
   │ │ 🥤 Soft Drinks     [Keep] [Regen]  │ │
   │ └────────────────────────────────────┘ │
   │                                        │
   │ ✓ 3 to keep  ↻ 1 to regenerate        │
   │                                        │
   │ [Keep All] [Regen All] [Regen Selected]│
   │            [Confirm & Continue]        │
   └────────────────────────────────────────┘
        ↓
   [User clicks "Regenerate Selected"]
        ↓
   [AI generates new items for selected slots]
        ↓
   [Review panel updates with new items]
        ↓
   [User clicks "Confirm & Continue"]
        ↓
[Normal plan editing view]
```

## Design Choices

### Color Scheme

- **Green (#22c55e)** - "Keep" action and confirmed items
- **Orange (#f97316)** - "Regenerate" action and items to regenerate
- **Sage** - Neutral/pending state

### State Management

Items can be in one of three states:
- `pending` - No decision made yet
- `keep` - User wants to keep this item
- `regenerate` - User wants to replace this item

### API Design

The selective regeneration uses the same endpoint as initial generation (`POST /api/events/{id}/generate`) but with optional body parameters. This keeps the API simple and reuses existing generation logic.

## Testing Checklist

- [x] Schema migration applied successfully
- [x] UI components render correctly
- [x] Can mark items as keep/regenerate
- [x] Can regenerate selected items
- [x] AI generates appropriate replacements
- [x] Can confirm and continue to normal plan view
- [x] Items are properly marked in database
- [x] Integration into main plan page (complete)
- [ ] E2E testing with real events (ready to test)

## ✅ Main Plan Page Integration Complete

The selective regeneration flow has been fully integrated into the main plan page (`src/app/plan/[eventId]/page.tsx`).

**How it works:**
1. Click "Regenerate Plan" button on the main screen
2. All existing items are loaded into the review panel
3. Select which items to keep and which to regenerate
4. Click "Regenerate Selected" to get AI replacements
5. Review all items (kept + newly generated) again
6. Repeat until satisfied
7. Click "Confirm & Continue" to finalize and return to the plan view

**New Files Created:**
- `/api/events/[id]/items/mark-for-review` - Marks all items as AI-generated/unconfirmed for review

## Next Steps

1. **Test the Integration**
   - Create an event and generate a plan
   - Click "Regenerate Plan" to test the review flow
   - Verify selective regeneration works correctly

2. **Polish UI**
   - Add loading states during regeneration
   - Add error handling and user feedback
   - Consider adding animations for state changes

3. **Enhanced Features**
   - ✅ **NEW Badge**: Newly regenerated items display an orange "NEW" badge with pulse animation
   - Track which items have been regenerated multiple times
   - Allow editing item details in review mode
   - Show AI reasoning for each item
   - Add ability to provide feedback on individual items

## Files Modified/Created

### Modified
- `prisma/schema.prisma` - Added `aiGenerated` and `userConfirmed` fields
- `src/lib/ai/prompts.ts` - Added selective regeneration prompts
- `src/lib/ai/generate.ts` - Added `generateSelectiveItems()` function
- `src/app/api/events/[id]/generate/route.ts` - Added selective regeneration logic
- `src/app/plan/[eventId]/page.tsx` - Integrated review panel into main plan page
- `src/app/api/events/route.ts` - Fixed event creation to include hostId

### Created
- `src/components/plan/ItemReviewCard.tsx` - Item review component
- `src/components/plan/GenerationReviewPanel.tsx` - Review panel component
- `src/app/api/events/[id]/review-items/route.ts` - Review items API
- `src/app/api/events/[id]/items/mark-for-review/route.ts` - Mark items for review API
- `src/app/demo/review/page.tsx` - Demo page
- `SELECTIVE_REGENERATION_GUIDE.md` - This guide

## Support

For questions or issues:
1. Check the demo page at `/demo/review?eventId={eventId}`
2. Review the API endpoint documentation above
3. Check console logs for detailed error messages
