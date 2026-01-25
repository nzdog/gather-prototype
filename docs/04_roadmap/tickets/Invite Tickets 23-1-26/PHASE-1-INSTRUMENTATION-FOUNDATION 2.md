# PHASE 1: Instrumentation Foundation

**Branch name:** `feature/invite-phase-1-instrumentation`  
**Estimated effort:** 1-2 days  
**Dependencies:** None (this is the foundation)

---

## Project Context: What is Gather?

Gather is a coordination app for family gatherings (Christmas dinners, reunions, retreats) that ensures everyone knows what they're responsible for without the host chasing people through group chats.

**The core promise:** "Gather gets everyone to confirm—so you don't have to chase."

**How it works:**
1. Host creates event → AI generates plan with teams and items
2. Host adds people, assigns items, resolves conflicts
3. Host transitions to CONFIRMING → magic links are generated
4. Participants receive links, see their assignments, tap Accept/Decline
5. Host sees real-time dashboard of confirmations
6. Host freezes plan when ready

**Tech stack:** Next.js 14 (App Router), TypeScript, Prisma, PostgreSQL, Anthropic Claude, Stripe, Resend

**Repository structure:**
```
src/
├── app/                    # Next.js pages and API routes
│   ├── api/               # API endpoints
│   ├── plan/[eventId]/    # Host dashboard
│   ├── p/[token]/         # Participant magic link view
│   ├── c/[token]/         # Coordinator magic link view
│   └── h/[token]/         # Legacy host token view
├── components/plan/        # UI components for planning
├── lib/                    # Core business logic
│   ├── workflow.ts        # State machine (DRAFT→CONFIRMING→FROZEN)
│   ├── tokens.ts          # Token generation/validation
│   ├── prisma.ts          # Database client
│   └── auth/              # Authentication guards
└── prisma/
    └── schema.prisma      # Data models
```

**Key existing models:**
- `Event` — A gathering with status (DRAFT, CONFIRMING, FROZEN, COMPLETE)
- `Person` — Someone invited to the event
- `AccessToken` — Magic link token with scope (HOST, COORDINATOR, PARTICIPANT)
- `Assignment` — Links Item to Person with response (PENDING, ACCEPTED, DECLINED)

---

## Why This Phase Matters

You can't improve what you can't measure. Before building auto-nudges, shared links, or any invite features, we need to track:
- When links are opened
- When people respond
- Phone numbers for SMS nudges

This phase creates the instrumentation layer that all subsequent phases depend on.

---

## Current State

**What exists:**
- `AccessToken` model with `scope` (HOST, COORDINATOR, PARTICIPANT) and `personId`
- Tokens are generated at transition to CONFIRMING
- Views exist at `/p/[token]`, `/c/[token]`, `/h/[token]`
- `Assignment` model tracks `response` (PENDING, ACCEPTED, DECLINED)

**What's missing:**
- No tracking of when links are opened
- No event log for invite-related activities
- No phone number field on Person
- No SMS opt-out tracking

---

## Phase 1 Objectives

1. Create `InviteEvent` model to log all invite-related activities
2. Add tracking fields to `AccessToken` (openedAt, claimedAt, claimedBy)
3. Add phone/SMS fields to `Person` (phoneNumber, smsOptedOut)
4. Implement link-open tracking when participant/coordinator views load
5. Ensure response submissions are logged as events
6. Add phone number input to AddPersonModal and CSV import

---

## Sub-Tasks

### Task 1.1: Schema Changes

**File:** `prisma/schema.prisma`

**1.1a. Add InviteEventType enum:**

```prisma
enum InviteEventType {
  INVITE_SEND_CONFIRMED
  LINK_OPENED
  NAME_CLAIMED
  RESPONSE_SUBMITTED
  NUDGE_SENT_AUTO
  NUDGE_DEFERRED_QUIET
  SMS_OPT_OUT_RECEIVED
  SMS_BLOCKED_OPT_OUT
  SMS_BLOCKED_INVALID
  SMS_SEND_FAILED
  MANUAL_OVERRIDE_MARKED
  CLAIM_RESET
}
```

**1.1b. Add InviteEvent model:**

```prisma
model InviteEvent {
  id        String          @id @default(cuid())
  eventId   String
  event     Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  personId  String?
  person    Person?         @relation(fields: [personId], references: [id], onDelete: SetNull)
  type      InviteEventType
  metadata  Json?
  createdAt DateTime        @default(now())

  @@index([eventId])
  @@index([personId])
  @@index([type])
  @@index([createdAt])
}
```

**1.1c. Add fields to AccessToken:**

```prisma
model AccessToken {
  // ... existing fields ...
  
  openedAt    DateTime?
  claimedAt   DateTime?
  claimedBy   String?
}
```

**1.1d. Add fields to Person:**

```prisma
model Person {
  // ... existing fields ...
  
  phoneNumber    String?
  smsOptedOut    Boolean   @default(false)
  smsOptedOutAt  DateTime?
  
  inviteEvents   InviteEvent[]
}
```

**1.1e. Add relation to Event:**

```prisma
model Event {
  // ... existing fields ...
  
  inviteEvents   InviteEvent[]
}
```

**Acceptance criteria:**
- [ ] `npx prisma migrate dev --name invite_instrumentation` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] Existing data is preserved (all new fields are nullable or have defaults)

---

### Task 1.2: Create InviteEvent Service

**File:** `src/lib/invite-events.ts` (new file)

```typescript
import { prisma } from './prisma'
import { InviteEventType } from '@prisma/client'

interface LogInviteEventParams {
  eventId: string
  personId?: string
  type: InviteEventType
  metadata?: Record<string, unknown>
}

export async function logInviteEvent({
  eventId,
  personId,
  type,
  metadata
}: LogInviteEventParams): Promise<void> {
  try {
    await prisma.inviteEvent.create({
      data: {
        eventId,
        personId: personId ?? null,
        type,
        metadata: metadata ?? undefined
      }
    })
  } catch (error) {
    // Log but don't throw - instrumentation shouldn't break user flows
    console.error('[InviteEvent] Failed to log event:', { type, eventId, personId, error })
  }
}

export async function getInviteEventsForEvent(eventId: string) {
  return prisma.inviteEvent.findMany({
    where: { eventId },
    include: { person: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getInviteEventsForPerson(personId: string) {
  return prisma.inviteEvent.findMany({
    where: { personId },
    orderBy: { createdAt: 'desc' }
  })
}
```

**Acceptance criteria:**
- [ ] Function creates InviteEvent records
- [ ] Errors are caught and logged (non-blocking)
- [ ] Query functions return expected data

---

### Task 1.3: Track Link Opens — Participant View

**File:** `src/app/p/[token]/page.tsx`

Find where the token is validated and data is loaded. After successful validation, add link-open tracking:

```typescript
import { logInviteEvent } from '@/lib/invite-events'
import { headers } from 'next/headers'

// After token validation and loading person/event data:

// Track first open (non-blocking)
if (!token.openedAt) {
  const headersList = headers()
  const userAgent = headersList.get('user-agent') || 'unknown'
  
  // Fire and forget - don't await, don't block page load
  Promise.all([
    prisma.accessToken.update({
      where: { id: token.id },
      data: { openedAt: new Date() }
    }),
    logInviteEvent({
      eventId: event.id,
      personId: person.id,
      type: 'LINK_OPENED',
      metadata: { 
        tokenScope: token.scope,
        userAgent: userAgent.substring(0, 200) // Truncate for storage
      }
    })
  ]).catch(err => console.error('[LinkOpen] Failed to track:', err))
}
```

**Acceptance criteria:**
- [ ] First page load sets `openedAt` on the AccessToken
- [ ] Subsequent page loads do NOT update `openedAt`
- [ ] `LINK_OPENED` InviteEvent is created
- [ ] Page load speed is not noticeably affected

---

### Task 1.4: Track Link Opens — Coordinator View

**File:** `src/app/c/[token]/page.tsx`

Apply the same pattern as Task 1.3:

```typescript
// After token validation:
if (!token.openedAt) {
  const headersList = headers()
  const userAgent = headersList.get('user-agent') || 'unknown'
  
  Promise.all([
    prisma.accessToken.update({
      where: { id: token.id },
      data: { openedAt: new Date() }
    }),
    logInviteEvent({
      eventId: event.id,
      personId: person.id,
      type: 'LINK_OPENED',
      metadata: { 
        tokenScope: 'COORDINATOR',
        teamId: token.teamId,
        userAgent: userAgent.substring(0, 200)
      }
    })
  ]).catch(err => console.error('[LinkOpen] Failed to track:', err))
}
```

**Acceptance criteria:**
- [ ] First coordinator link open sets `openedAt`
- [ ] `LINK_OPENED` event includes teamId in metadata

---

### Task 1.5: Track Response Submissions

**File:** Find the API route that handles assignment responses. Likely one of:
- `src/app/api/c/[token]/items/[itemId]/assign/route.ts`
- `src/app/api/p/[token]/items/[itemId]/acknowledge/route.ts`

After successfully updating an assignment response, log the event:

```typescript
import { logInviteEvent } from '@/lib/invite-events'

// After the assignment update:
await logInviteEvent({
  eventId: event.id,
  personId: person.id,
  type: 'RESPONSE_SUBMITTED',
  metadata: {
    itemId: item.id,
    itemName: item.name,
    response: newResponse, // 'ACCEPTED' or 'DECLINED'
    previousResponse: previousResponse || 'PENDING'
  }
})
```

**Acceptance criteria:**
- [ ] `RESPONSE_SUBMITTED` logged when participant accepts
- [ ] `RESPONSE_SUBMITTED` logged when participant declines
- [ ] Metadata includes itemId, response value, and previous value

---

### Task 1.6: Phone Number Utilities

**File:** `src/lib/phone.ts` (new file)

```typescript
/**
 * Normalize a phone number to E.164 format for NZ numbers
 * Returns null if the number is invalid
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null
  
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '')
  
  // Handle various NZ formats
  if (cleaned.startsWith('0')) {
    // Local format: 021 123 4567 → +64211234567
    cleaned = '+64' + cleaned.slice(1)
  } else if (cleaned.startsWith('64') && !cleaned.startsWith('+')) {
    // Missing +: 64211234567 → +64211234567
    cleaned = '+' + cleaned
  } else if (/^\d{9,10}$/.test(cleaned)) {
    // Just digits, assume NZ: 211234567 → +64211234567
    cleaned = '+64' + cleaned
  }
  
  // Validate NZ format
  if (!isValidNZNumber(cleaned)) {
    return null
  }
  
  return cleaned
}

/**
 * Check if a phone number is a valid NZ number in E.164 format
 */
export function isValidNZNumber(phone: string): boolean {
  // NZ numbers: +64 followed by 8-10 digits
  // Mobile: +642X XXX XXXX (9 digits after +64)
  // Landline: +64X XXX XXXX (8-9 digits after +64)
  const nzPattern = /^\+64\d{8,10}$/
  return nzPattern.test(phone)
}

/**
 * Check if a number appears to be international (not NZ)
 */
export function isInternationalNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (!cleaned.startsWith('+')) return false
  return !cleaned.startsWith('+64')
}

/**
 * Format E.164 to local display format
 * +64211234567 → 021 123 4567
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return ''
  
  if (phone.startsWith('+64')) {
    const local = '0' + phone.slice(3)
    // Format as 0XX XXX XXXX
    if (local.length === 10) {
      return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
    }
    if (local.length === 11) {
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
    }
    return local
  }
  
  return phone
}
```

**Acceptance criteria:**
- [ ] `normalizePhoneNumber('021 123 4567')` returns `'+64211234567'`
- [ ] `normalizePhoneNumber('64211234567')` returns `'+64211234567'`
- [ ] `normalizePhoneNumber('+64211234567')` returns `'+64211234567'`
- [ ] `normalizePhoneNumber('12345')` returns `null`
- [ ] `isValidNZNumber('+64211234567')` returns `true`
- [ ] `isInternationalNumber('+1234567890')` returns `true`
- [ ] `formatPhoneForDisplay('+64211234567')` returns `'021 123 4567'`

---

### Task 1.7: Update AddPersonModal for Phone Number

**File:** `src/components/plan/AddPersonModal.tsx`

Add phone number field to the form:

```typescript
import { normalizePhoneNumber, isInternationalNumber, formatPhoneForDisplay } from '@/lib/phone'

// Add to component state:
const [phoneNumber, setPhoneNumber] = useState('')
const [phoneError, setPhoneError] = useState('')

// Add validation function:
const validatePhone = (value: string): boolean => {
  if (!value.trim()) {
    setPhoneError('')
    return true // Optional field
  }
  
  if (isInternationalNumber(value)) {
    setPhoneError('International numbers not supported yet. NZ numbers only.')
    return false
  }
  
  const normalized = normalizePhoneNumber(value)
  if (!normalized) {
    setPhoneError('Please enter a valid NZ mobile number (e.g., 021 123 4567)')
    return false
  }
  
  setPhoneError('')
  return true
}

// In the form JSX, add after the email field:
<div className="space-y-1">
  <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
    Phone (optional)
  </label>
  <input
    type="tel"
    id="phoneNumber"
    value={phoneNumber}
    onChange={(e) => setPhoneNumber(e.target.value)}
    onBlur={() => validatePhone(phoneNumber)}
    placeholder="021 123 4567"
    className={`w-full px-3 py-2 border rounded-md ${
      phoneError ? 'border-red-500' : 'border-gray-300'
    }`}
  />
  {phoneError && (
    <p className="text-sm text-red-500">{phoneError}</p>
  )}
  <p className="text-xs text-gray-500">
    Used for automatic reminders. NZ mobile numbers only.
  </p>
</div>

// In the submit handler, normalize before sending:
const handleSubmit = async () => {
  if (!validatePhone(phoneNumber)) return
  
  const normalizedPhone = phoneNumber.trim() 
    ? normalizePhoneNumber(phoneNumber) 
    : null
  
  // Include in API call:
  await fetch(`/api/events/${eventId}/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      phoneNumber: normalizedPhone,
      // ... other fields
    })
  })
}
```

**Acceptance criteria:**
- [ ] Phone field appears in the modal
- [ ] Field is optional (empty is valid)
- [ ] Invalid format shows error on blur
- [ ] International numbers show specific error
- [ ] Valid numbers are normalized before API call

---

### Task 1.8: Update CSV Import for Phone Number

**File:** `src/components/plan/ImportCSVModal.tsx`

Add phone as a mappable column:

```typescript
// In column mapping options:
const columnOptions = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'name', label: 'Full Name' },
  { value: 'email', label: 'Email' },
  { value: 'phoneNumber', label: 'Phone Number' }, // Add this
  { value: 'skip', label: 'Skip this column' }
]

// In the row processing logic:
import { normalizePhoneNumber } from '@/lib/phone'

// When processing each row:
if (columnMapping.phoneNumber !== undefined && columnMapping.phoneNumber !== 'skip') {
  const rawPhone = row[columnMapping.phoneNumber]
  if (rawPhone) {
    const normalized = normalizePhoneNumber(rawPhone)
    if (normalized) {
      person.phoneNumber = normalized
    } else {
      warnings.push(`Row ${rowIndex + 1}: Invalid phone "${rawPhone}" - will be skipped`)
    }
  }
}
```

**Acceptance criteria:**
- [ ] "Phone Number" appears in column mapping dropdown
- [ ] Valid phones are normalized and included
- [ ] Invalid phones generate a warning but don't block import
- [ ] People without phone numbers are still imported successfully

---

### Task 1.9: Update People API Routes

**File:** `src/app/api/events/[id]/people/route.ts` (POST handler)

Accept and store phoneNumber:

```typescript
import { normalizePhoneNumber } from '@/lib/phone'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // ... existing auth and validation ...
  
  const body = await request.json()
  const { name, email, phoneNumber, teamId } = body
  
  // Normalize phone (API should accept raw input and normalize)
  const normalizedPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : null
  
  const person = await prisma.person.create({
    data: {
      name,
      email: email || null,
      phoneNumber: normalizedPhone,
      eventId: params.id,
      teamId: teamId || null
    }
  })
  
  return NextResponse.json(person)
}
```

**File:** `src/app/api/events/[id]/people/[personId]/route.ts` (PATCH handler)

```typescript
export async function PATCH(request: NextRequest, { params }: { params: { id: string; personId: string } }) {
  // ... existing auth and validation ...
  
  const body = await request.json()
  const { name, email, phoneNumber, teamId } = body
  
  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email || null
  if (phoneNumber !== undefined) {
    updateData.phoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null
  }
  if (teamId !== undefined) updateData.teamId = teamId || null
  
  const person = await prisma.person.update({
    where: { id: params.personId },
    data: updateData
  })
  
  return NextResponse.json(person)
}
```

**Acceptance criteria:**
- [ ] POST accepts `phoneNumber` field
- [ ] PATCH accepts `phoneNumber` field
- [ ] Phones are normalized before storage
- [ ] Null/empty phone is stored as null

---

## Testing Requirements

### Manual Testing Checklist

**Schema & Migration:**
- [ ] Run `npx prisma migrate dev` — completes without errors
- [ ] Run `npx prisma generate` — completes without errors
- [ ] Check existing events still load correctly

**Link Open Tracking:**
- [ ] Open a participant link for the first time → check DB: `AccessToken.openedAt` is set
- [ ] Refresh the page → `openedAt` should NOT change
- [ ] Check `InviteEvent` table → `LINK_OPENED` record exists with correct metadata
- [ ] Repeat for coordinator link

**Response Tracking:**
- [ ] As participant, accept an item
- [ ] Check `InviteEvent` table → `RESPONSE_SUBMITTED` with `response: 'ACCEPTED'`
- [ ] Decline a different item
- [ ] Check `InviteEvent` table → `RESPONSE_SUBMITTED` with `response: 'DECLINED'`

**Phone Number - AddPersonModal:**
- [ ] Open Add Person modal
- [ ] Phone field is visible with helper text
- [ ] Enter "021 123 4567" → no error, saves as "+64211234567"
- [ ] Enter "invalid" → shows error message
- [ ] Enter "+1 555 123 4567" → shows international error
- [ ] Leave empty → saves successfully (optional field)

**Phone Number - CSV Import:**
- [ ] Prepare CSV with phone column
- [ ] Import → phone appears in column mapping
- [ ] Valid phones are saved in E.164 format
- [ ] Invalid phones show warning, person still imported

### Database Verification Queries

```sql
-- Check InviteEvents are being logged
SELECT type, COUNT(*) as count 
FROM "InviteEvent" 
GROUP BY type 
ORDER BY count DESC;

-- Check tokens have openedAt
SELECT id, scope, "openedAt", "personId"
FROM "AccessToken" 
WHERE "openedAt" IS NOT NULL
LIMIT 10;

-- Check phone numbers are normalized
SELECT id, name, "phoneNumber" 
FROM "Person" 
WHERE "phoneNumber" IS NOT NULL
LIMIT 10;

-- Verify E.164 format (should all start with +64)
SELECT id, name, "phoneNumber"
FROM "Person"
WHERE "phoneNumber" IS NOT NULL 
  AND "phoneNumber" NOT LIKE '+64%';
-- (Should return 0 rows)
```

---

## Definition of Done

- [ ] Schema changes migrated successfully
- [ ] `logInviteEvent` function works and is tested
- [ ] Participant link opens tracked (first open only)
- [ ] Coordinator link opens tracked (first open only)
- [ ] Response submissions logged with metadata
- [ ] Phone field added to AddPersonModal with validation
- [ ] Phone field added to CSV import
- [ ] Phone numbers normalized to E.164 on save
- [ ] All manual tests pass
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Code committed and pushed to `feature/invite-phase-1-instrumentation`

---

## Files Summary

**New files to create:**
- `src/lib/invite-events.ts`
- `src/lib/phone.ts`

**Files to modify:**
- `prisma/schema.prisma`
- `src/app/p/[token]/page.tsx`
- `src/app/c/[token]/page.tsx`
- `src/app/api/c/[token]/items/[itemId]/assign/route.ts` (or equivalent response handler)
- `src/components/plan/AddPersonModal.tsx`
- `src/components/plan/ImportCSVModal.tsx`
- `src/app/api/events/[id]/people/route.ts`
- `src/app/api/events/[id]/people/[personId]/route.ts`

---

## Implementation Notes

1. **Non-blocking logging:** Always use fire-and-forget pattern (`Promise.then().catch()`) for event logging. Instrumentation should never slow down or break user flows.

2. **Idempotency:** The `if (!token.openedAt)` check prevents duplicate `LINK_OPENED` events on page refreshes.

3. **Phone normalization:** Normalize on input (client-side for UX feedback) AND on storage (server-side for safety). Store in E.164, display in local format.

4. **Backward compatibility:** All new schema fields are nullable or have defaults. Existing data remains valid.

5. **This enables future phases:** The `InviteEvent` table will be used by the nudge system, dashboard metrics, and diagnostic queries in subsequent phases.




⏺ Excellent! All TypeScript checks pass. Let me provide you with a summary of what's   
  been completed.                                                                      
                                                                                       
  Phase 1 Implementation Complete ✅                                                   
                                                                                       
  I've successfully implemented all 9 tasks from the Phase 1 Instrumentation Foundation
   spec. Here's what was done:                                                         
                                                                                       
  Schema Changes (Task 1.1)                                                            
                                                                                       
  - ✅ Added InviteEventType enum with all specified event types                       
  - ✅ Created InviteEvent model with proper indexes                                   
  - ✅ Added tracking fields to AccessToken (openedAt, claimedAt, claimedBy)           
  - ✅ Added phone/SMS fields to Person (phoneNumber, smsOptedOut, smsOptedOutAt)      
  - ✅ Added relations to Event model                                                  
  - ✅ Migration created and applied successfully                                      
                                                                                       
  Core Services (Tasks 1.2 & 1.6)                                                      
                                                                                       
  - ✅ Created src/lib/invite-events.ts with logInviteEvent, getInviteEventsForEvent,  
  getInviteEventsForPerson                                                             
  - ✅ Created src/lib/phone.ts with NZ phone number normalization, validation, and    
  formatting utilities                                                                 
                                                                                       
  Link Open Tracking (Tasks 1.3 & 1.4)                                                 
                                                                                       
  - ✅ Participant view API (/api/p/[token]) now tracks first link open                
  - ✅ Coordinator view API (/api/c/[token]) now tracks first link open                
  - ✅ Both fire-and-forget (non-blocking) for performance                             
  - ✅ Logs LINK_OPENED InviteEvent with metadata (tokenScope, userAgent, teamId)      
                                                                                       
  Response Tracking (Task 1.5)                                                         
                                                                                       
  - ✅ Assignment acknowledgment API tracks response submissions                       
  - ✅ Logs RESPONSE_SUBMITTED with full metadata (itemId, itemName, response,         
  previousResponse)                                                                    
  - ✅ Non-blocking implementation                                                     
                                                                                       
  Phone Number Integration (Tasks 1.7, 1.8, 1.9)                                       
                                                                                       
  - ✅ AddPersonModal: Added validation with error display, NZ-only enforcement, E.164 
  normalization                                                                        
  - ✅ ImportCSVModal: Added phone column mapping, validation warnings for             
  invalid/international numbers                                                        
  - ✅ People API: POST and PATCH routes normalize phone numbers before storage        
                                                                                       
  Code Quality                                                                         
                                                                                       
  - ✅ All TypeScript compilation passes with no errors                                
  - ✅ Non-blocking instrumentation (won't break user flows)                           
  - ✅ Backward compatible (all new fields nullable/defaulted)                         
                                                                                       
  Files Modified/Created                                                               
                                                                                       
  New files:                                                                           
  - src/lib/invite-events.ts                                                           
  - src/lib/phone.ts                                                                   
                                                                                       
  Modified files:                                                                      
  - prisma/schema.prisma                                                               
  - src/app/api/p/[token]/route.ts                                                     
  - src/app/api/c/[token]/route.ts                                                     
  - src/app/api/p/[token]/ack/[assignmentId]/route.ts                                  
  - src/components/plan/AddPersonModal.tsx                                             
  - src/components/plan/ImportCSVModal.tsx                                             
  - src/app/api/events/[id]/people/route.ts                                            
  - src/app/api/events/[id]/people/[personId]/route.ts                                 
                                                                                       
  All changes are on the feature/invite-phase-1-instrumentation branch and ready for   
  testing!      