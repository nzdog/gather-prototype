# Task: Add Manual Decline Option to Person Override

## Context

The Gather app has a manual override feature that lets hosts mark people as "Confirmed" when they confirm through back-channels (phone call, WhatsApp, etc.). 

We need to extend this to also allow marking someone as "Declined" — for when someone tells the host directly they can't make it but never uses the app.

**Why this matters:** Without manual decline, these people stay "pending" forever, clutter the "Who's Missing" list, and their assigned items appear unconfirmed when they actually need reassignment.

## Current State

- `POST /api/events/[id]/people/[personId]/mark-confirmed` exists
- Sets all person's assignments to `ACCEPTED`
- Logs `MANUAL_OVERRIDE_MARKED` event
- `PersonInviteDetailModal.tsx` has a single "Mark as Confirmed" button

## Required Changes

### 1. Rename and extend the API endpoint

**File:** `src/app/api/events/[id]/people/[personId]/mark-confirmed/route.ts`

Rename to: `src/app/api/events/[id]/people/[personId]/manual-override/route.ts`

Modify to accept a `response` parameter:

```typescript
// Parse body
const body = await request.json()
const { response, reason } = body

if (!response || !['ACCEPTED', 'DECLINED'].includes(response)) {
  return NextResponse.json(
    { error: 'response must be ACCEPTED or DECLINED' },
    { status: 400 }
  )
}

// Update assignments to the specified response
const updatedAssignments = await prisma.assignment.updateMany({
  where: {
    personId: personId,
    response: { not: response }
  },
  data: {
    response: response
  }
})

// Log with the response type
await logInviteEvent({
  eventId,
  personId,
  type: 'MANUAL_OVERRIDE_MARKED',
  metadata: {
    response,  // 'ACCEPTED' or 'DECLINED'
    reason: reason || `Manual ${response.toLowerCase()} by host`,
    assignmentsUpdated: updatedAssignments.count,
    // ... rest of metadata
  }
})
```

### 2. Update the PersonInviteDetailModal

**File:** `src/components/plan/PersonInviteDetailModal.tsx`

Replace the single "Mark as Confirmed" button with two buttons:

```typescript
// Update the handler to accept response type
const handleManualOverride = async (responseType: 'ACCEPTED' | 'DECLINED') => {
  setMarking(true)
  setError(null)
  
  try {
    const res = await fetch(
      `/api/events/${eventId}/people/${personId}/manual-override`,
      { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseType })
      }
    )
    
    if (res.ok) {
      await fetchPersonDetail()
      onUpdate()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to update')
    }
  } catch (e) {
    setError('Failed to update')
  } finally {
    setMarking(false)
  }
}

// In the footer, replace the single button with:
{person.response === 'PENDING' && (
  <div className="flex gap-3">
    <button
      onClick={() => handleManualOverride('DECLINED')}
      disabled={marking}
      className="flex-1 py-2.5 px-4 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 font-medium transition-colors"
    >
      {marking ? 'Updating...' : 'Mark as Declined'}
    </button>
    <button
      onClick={() => handleManualOverride('ACCEPTED')}
      disabled={marking}
      className="flex-1 py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 font-medium transition-colors"
    >
      {marking ? 'Updating...' : 'Mark as Confirmed'}
    </button>
  </div>
)}

{person.response === 'ACCEPTED' && (
  <p className="text-center text-green-600 font-medium">
    ✓ Confirmed
  </p>
)}

{person.response === 'DECLINED' && (
  <p className="text-center text-red-600 font-medium">
    ✗ Declined
  </p>
)}
```

### 3. Update any references to the old endpoint

Search for `mark-confirmed` in the codebase and update to `manual-override`.

## Testing

1. Open person detail modal for someone with PENDING status
2. Both "Mark as Declined" and "Mark as Confirmed" buttons should appear
3. Click "Mark as Declined" → person's assignments become DECLINED
4. Check `InviteEvent` table → `MANUAL_OVERRIDE_MARKED` with `response: 'DECLINED'`
5. Modal should now show "✗ Declined" instead of buttons
6. Repeat test for "Mark as Confirmed"

## Definition of Done

- [ ] API accepts `response: 'ACCEPTED' | 'DECLINED'`
- [ ] API validates the response parameter
- [ ] Modal shows both buttons for PENDING people
- [ ] Modal shows status text for already-decided people
- [ ] InviteEvent logs include the response type
- [ ] Old endpoint path updated or redirects to new one
