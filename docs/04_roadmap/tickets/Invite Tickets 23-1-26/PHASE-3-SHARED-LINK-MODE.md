# PHASE 3: Shared Link Mode

**Branch name:** `feature/invite-phase-3-shared-link`  
**Estimated effort:** 3-4 days  
**Dependencies:** Phase 1 and Phase 2 must be complete

---

## Project Context: What is Gather?

Gather is a coordination app for family gatherings (Christmas dinners, reunions, retreats) that ensures everyone knows what they're responsible for without the host chasing people through group chats.

**The core promise:** "Gather gets everyone to confirm—so you don't have to chase."

**How it works:**
1. Host creates event → AI generates plan with teams and items
2. Host adds people, assigns items, resolves conflicts
3. Host transitions to CONFIRMING → magic links are generated
4. Host sends invite links to participants
5. Participants receive links, see their assignments, tap Accept/Decline
6. Host sees real-time dashboard of confirmations
7. Host freezes plan when ready

**Tech stack:** Next.js 14 (App Router), TypeScript, Prisma, PostgreSQL

**From previous phases, you now have:**
- `InviteEvent` model and `logInviteEvent()` function (Phase 1)
- `AccessToken.openedAt` tracking (Phase 1)
- `Person.phoneNumber` field (Phase 1)
- `Event.inviteSendConfirmedAt` and `Person.inviteAnchorAt` (Phase 2)
- Invite status tracking UI (Phase 2)

---

## Why This Phase Matters

**The problem:** When a host has 40 people, sending 40 individual links is unsustainable.

- Each send takes 30+ seconds (copy link, find contact, paste, send)
- 40 sends = 20+ minutes of tedious work
- Different people use different apps (WhatsApp, SMS, Messenger, email)
- **Host tolerance: ≤15 manual sends maximum**

Above 15 people, hosts will abandon Gather and go back to group chat.

**The solution:** Shared link mode for events with 16+ invitees.

- One URL that the host posts to their family group chat
- Everyone clicks the same link
- They select their name from a searchable list
- They confirm their identity
- Then see their personal assignments

**Trade-off accepted:** We lose per-person open tracking for shared links (we don't know WHO opened, only that someone did). We keep per-person response tracking, which is what matters for compliance measurement.

---

## Current State (After Phase 2)

**What exists:**
- Individual `AccessToken` per person with `scope: PARTICIPANT`
- Token validation in `/p/[token]` and `/c/[token]`
- `openedAt` and `claimedAt` fields on AccessToken
- `inviteAnchorAt` on Person
- Invite status tracking

**What's missing:**
- No shared link concept
- No name selection flow
- No claim mechanics (first claim wins)
- No way for host to share one link with everyone
- No duplicate name disambiguation

---

## Phase 3 Objectives

1. Add shared link token field to Event
2. Create shared link generation API
3. Build name selection landing page with search
4. Implement claim mechanics (first claim wins, host can reset)
5. Handle duplicate names with disambiguation
6. Integrate shared link option into host dashboard
7. Support hybrid mode (shared link + individual links for specific people)

---

## Sub-Tasks

### Task 3.1: Schema Changes

**File:** `prisma/schema.prisma`

```prisma
model Event {
  // ... existing fields ...
  
  sharedLinkToken    String?   @unique
  sharedLinkEnabled  Boolean   @default(false)
}
```

The `AccessToken` model already has `claimedAt` and `claimedBy` from Phase 1. Verify these exist:

```prisma
model AccessToken {
  // ... existing fields ...
  
  openedAt    DateTime?
  claimedAt   DateTime?
  claimedBy   String?      // Device/session identifier
}
```

**Acceptance criteria:**
- [ ] `npx prisma migrate dev --name shared_link` succeeds
- [ ] `sharedLinkToken` has unique constraint
- [ ] Fields are nullable (backward compatible)

---

### Task 3.2: Token Generation Utility

**File:** `src/lib/tokens.ts` (modify or verify exists)

Ensure there's a function to generate secure random tokens:

```typescript
import { randomBytes } from 'crypto'

export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url')
}
```

If this already exists with a different name, use that. The shared link token should be URL-safe and unguessable.

**Acceptance criteria:**
- [ ] Function generates cryptographically secure tokens
- [ ] Tokens are URL-safe (no special characters that need encoding)

---

### Task 3.3: Shared Link API

**File:** `src/app/api/events/[id]/shared-link/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/guards'
import { generateSecureToken } from '@/lib/tokens'

// GET - Check shared link status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: eventId } = params
  
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error }, 
      { status: authResult.status }
    )
  }
  
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      sharedLinkToken: true,
      sharedLinkEnabled: true,
      status: true,
      _count: { select: { people: true } }
    }
  })
  
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  return NextResponse.json({
    enabled: event.sharedLinkEnabled,
    token: event.sharedLinkToken,
    url: event.sharedLinkToken 
      ? `${baseUrl}/join/${event.sharedLinkToken}` 
      : null,
    peopleCount: event._count.people,
    recommendSharedLink: event._count.people >= 16
  })
}

// POST - Generate and enable shared link
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: eventId } = params
  
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error }, 
      { status: authResult.status }
    )
  }
  
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, sharedLinkToken: true }
  })
  
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  
  if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
    return NextResponse.json(
      { error: 'Shared link only available after transitioning to CONFIRMING' },
      { status: 400 }
    )
  }
  
  // Generate token if doesn't exist, otherwise reuse
  const token = event.sharedLinkToken || generateSecureToken()
  
  await prisma.event.update({
    where: { id: eventId },
    data: {
      sharedLinkToken: token,
      sharedLinkEnabled: true
    }
  })
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  return NextResponse.json({
    enabled: true,
    token,
    url: `${baseUrl}/join/${token}`
  })
}

// DELETE - Disable shared link (keeps token for potential re-enable)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: eventId } = params
  
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error }, 
      { status: authResult.status }
    )
  }
  
  await prisma.event.update({
    where: { id: eventId },
    data: { sharedLinkEnabled: false }
  })
  
  return NextResponse.json({ enabled: false })
}
```

**Acceptance criteria:**
- [ ] GET returns current shared link status and recommendation
- [ ] POST generates token (if needed) and enables shared link
- [ ] POST only works in CONFIRMING or FROZEN status
- [ ] DELETE disables but doesn't delete the token
- [ ] URL uses correct base domain

---

### Task 3.4: Shared Link Landing Page (Server Component)

**File:** `src/app/join/[token]/page.tsx` (new file)

```typescript
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { NameSelectionClient } from './NameSelectionClient'

interface Props {
  params: { token: string }
}

export default async function SharedLinkPage({ params }: Props) {
  const { token } = params
  
  // Find event by shared link token
  const event = await prisma.event.findFirst({
    where: {
      sharedLinkToken: token,
      sharedLinkEnabled: true
    },
    select: {
      id: true,
      name: true,
      status: true,
      hostId: true,
      host: {
        select: { name: true }
      },
      people: {
        select: {
          id: true,
          name: true,
          accessTokens: {
            where: { scope: 'PARTICIPANT' },
            select: { 
              id: true, 
              token: true, 
              claimedAt: true 
            }
          },
          assignments: {
            take: 1,
            select: {
              item: {
                select: { name: true }
              }
            }
          }
        }
      }
    }
  })
  
  // Invalid or disabled token
  if (!event) {
    notFound()
  }
  
  // Check event status
  if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Event Not Ready
          </h1>
          <p className="text-gray-600">
            This event is not accepting responses yet. Please check back later 
            or contact {event.host?.name || 'the host'}.
          </p>
        </div>
      </div>
    )
  }
  
  // Prepare people data for client component
  const peopleData = event.people.map(p => ({
    id: p.id,
    name: p.name,
    isClaimed: !!p.accessTokens[0]?.claimedAt,
    // Use first assigned item as disambiguator for duplicate names
    firstItem: p.assignments[0]?.item?.name || null
  }))
  
  // Identify duplicate names
  const nameCounts = new Map<string, number>()
  peopleData.forEach(p => {
    const lowerName = p.name.toLowerCase().trim()
    nameCounts.set(lowerName, (nameCounts.get(lowerName) || 0) + 1)
  })
  
  const peopleWithFlags = peopleData.map(p => ({
    ...p,
    hasDuplicate: (nameCounts.get(p.name.toLowerCase().trim()) || 0) > 1
  }))
  
  return (
    <NameSelectionClient 
      eventId={event.id}
      eventName={event.name}
      eventToken={token}
      hostName={event.host?.name || 'the host'}
      people={peopleWithFlags}
    />
  )
}
```

**Acceptance criteria:**
- [ ] Returns 404 for invalid/disabled tokens
- [ ] Shows "not ready" message for DRAFT events
- [ ] Passes prepared people data to client component
- [ ] Identifies duplicate names for disambiguation

---

### Task 3.5: Name Selection Client Component

**File:** `src/app/join/[token]/NameSelectionClient.tsx` (new file)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

interface Person {
  id: string
  name: string
  isClaimed: boolean
  hasDuplicate: boolean
  firstItem: string | null
}

interface Props {
  eventId: string
  eventName: string
  eventToken: string
  hostName: string
  people: Person[]
}

type Screen = 'search' | 'confirm'

export function NameSelectionClient({ 
  eventId, 
  eventName, 
  eventToken, 
  hostName,
  people 
}: Props) {
  const router = useRouter()
  
  const [screen, setScreen] = useState<Screen>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filter people based on search query (fuzzy match)
  const filteredPeople = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (query.length < 2) return []
    
    return people
      .filter(p => p.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prioritize names that START with the query
        const aStarts = a.name.toLowerCase().startsWith(query)
        const bStarts = b.name.toLowerCase().startsWith(query)
        if (aStarts && !bStarts) return -1
        if (!aStarts && bStarts) return 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, 10) // Limit results
  }, [people, searchQuery])
  
  const handleSelectPerson = (person: Person) => {
    if (person.isClaimed) {
      setError(`"${person.name}" has already been claimed. If this is you, contact ${hostName}.`)
      return
    }
    setSelectedPerson(person)
    setError(null)
    setScreen('confirm')
  }
  
  const handleConfirm = async () => {
    if (!selectedPerson) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/join/${eventToken}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: selectedPerson.id })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        if (res.status === 409) {
          // Already claimed - go back to search
          setError(data.error || 'This name was just claimed by someone else.')
          setScreen('search')
          setSelectedPerson(null)
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
        return
      }
      
      // Success - redirect to participant view
      router.push(`/p/${data.participantToken}`)
    } catch (e) {
      setError('Connection error. Please check your internet and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleBack = () => {
    setScreen('search')
    setSelectedPerson(null)
    setError(null)
  }
  
  // ============ CONFIRM SCREEN ============
  if (screen === 'confirm' && selectedPerson) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          {/* Back button */}
          <button
            onClick={handleBack}
            disabled={isSubmitting}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>
          
          {/* Confirmation content */}
          <div className="text-center">
            <div className="w-20 h-20 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-sage-600" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Is this you?
            </h2>
            
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {selectedPerson.name}
            </p>
            
            {selectedPerson.firstItem && (
              <p className="text-gray-500 mb-6">
                Assigned to bring: {selectedPerson.firstItem}
              </p>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 text-left">{error}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                No, go back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-sage-600 text-white rounded-lg font-medium hover:bg-sage-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Confirming...' : "Yes, that's me"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ============ SEARCH SCREEN ============
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {eventName}
          </h1>
          <p className="text-gray-600">
            Find your name to see what you're bringing
          </p>
        </div>
        
        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setError(null)
            }}
            placeholder="Start typing your name..."
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-sage-500 focus:border-sage-500 outline-none transition-shadow"
          />
        </div>
        
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        {/* Results */}
        {searchQuery.length >= 2 && (
          <div className="space-y-2">
            {filteredPeople.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No matching names found.</p>
                <p className="text-sm mt-1">Check spelling or contact {hostName}.</p>
              </div>
            ) : (
              filteredPeople.map(person => (
                <button
                  key={person.id}
                  onClick={() => handleSelectPerson(person)}
                  disabled={person.isClaimed}
                  className={`w-full p-4 text-left rounded-lg border transition-all ${
                    person.isClaimed
                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                      : 'border-gray-200 hover:border-sage-400 hover:bg-sage-50 active:bg-sage-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`font-medium ${person.isClaimed ? 'text-gray-400' : 'text-gray-900'}`}>
                        {person.name}
                      </span>
                      {/* Show disambiguator for duplicate names */}
                      {person.hasDuplicate && person.firstItem && (
                        <span className="text-sm text-gray-500 ml-2">
                          ({person.firstItem})
                        </span>
                      )}
                    </div>
                    {person.isClaimed && (
                      <span className="flex items-center gap-1 text-sm text-gray-400">
                        <CheckCircle className="w-4 h-4" />
                        Claimed
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
        
        {/* Helper text */}
        {searchQuery.length < 2 && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Type at least 2 letters to search
          </p>
        )}
        
        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Can't find your name? Contact {hostName}.
        </p>
      </div>
    </div>
  )
}
```

**Acceptance criteria:**
- [ ] Large, obvious search input (mobile-friendly)
- [ ] Results appear after 2+ characters
- [ ] Results prioritize names starting with query
- [ ] Duplicate names show disambiguation (first item)
- [ ] Claimed names show as disabled with "Claimed" badge
- [ ] Clicking unclaimed name goes to confirm screen
- [ ] Confirm screen shows name and first item
- [ ] "Yes, that's me" calls claim API and redirects
- [ ] "No, go back" returns to search
- [ ] Error handling for already-claimed race condition

---

### Task 3.6: Claim API Endpoint

**File:** `src/app/api/join/[token]/claim/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logInviteEvent } from '@/lib/invite-events'
import { headers } from 'next/headers'

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  
  // Parse request body
  let body: { personId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  
  const { personId } = body
  
  if (!personId) {
    return NextResponse.json({ error: 'Person ID is required' }, { status: 400 })
  }
  
  // Find event by shared link token
  const event = await prisma.event.findFirst({
    where: {
      sharedLinkToken: token,
      sharedLinkEnabled: true
    },
    select: {
      id: true,
      status: true,
      hostId: true
    }
  })
  
  if (!event) {
    return NextResponse.json(
      { error: 'Invalid or disabled invite link' }, 
      { status: 404 }
    )
  }
  
  if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
    return NextResponse.json(
      { error: 'This event is not accepting responses' }, 
      { status: 400 }
    )
  }
  
  // Find person and their participant token
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      eventId: event.id
    },
    include: {
      accessTokens: {
        where: { scope: 'PARTICIPANT' },
        select: {
          id: true,
          token: true,
          claimedAt: true,
          claimedBy: true
        }
      }
    }
  })
  
  if (!person) {
    return NextResponse.json(
      { error: 'Person not found in this event' }, 
      { status: 404 }
    )
  }
  
  const accessToken = person.accessTokens[0]
  
  if (!accessToken) {
    // This shouldn't happen - tokens are created at transition
    return NextResponse.json(
      { error: 'No access token found. Please contact the host.' }, 
      { status: 500 }
    )
  }
  
  // Check if already claimed
  if (accessToken.claimedAt) {
    return NextResponse.json(
      { error: 'This name has already been claimed. If this is you, please contact the host.' },
      { status: 409 } // Conflict
    )
  }
  
  // Generate device identifier for audit
  const headersList = headers()
  const userAgent = headersList.get('user-agent') || ''
  const forwardedFor = headersList.get('x-forwarded-for') || ''
  const deviceId = generateDeviceId(userAgent, forwardedFor)
  
  // Claim the name (update token)
  const now = new Date()
  
  await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: {
      claimedAt: now,
      claimedBy: deviceId,
      openedAt: accessToken.openedAt || now // Also mark as opened if not already
    }
  })
  
  // Log the claim event
  await logInviteEvent({
    eventId: event.id,
    personId: person.id,
    type: 'NAME_CLAIMED',
    metadata: {
      deviceId,
      sharedLinkToken: token,
      personName: person.name
    }
  })
  
  return NextResponse.json({
    success: true,
    participantToken: accessToken.token,
    personName: person.name
  })
}

/**
 * Generate a semi-stable device identifier for audit purposes
 * This is NOT for security - just for tracking claims
 */
function generateDeviceId(userAgent: string, ip: string): string {
  const combined = `${userAgent.substring(0, 100)}-${ip.split(',')[0].trim()}`
  
  // Simple hash
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  return `device_${Math.abs(hash).toString(36)}`
}
```

**Acceptance criteria:**
- [ ] Validates shared link token
- [ ] Validates person belongs to event
- [ ] Returns 409 Conflict if already claimed
- [ ] Sets `claimedAt` and `claimedBy` on AccessToken
- [ ] Sets `openedAt` if not already set
- [ ] Logs `NAME_CLAIMED` event
- [ ] Returns participant token for redirect

---

### Task 3.7: Reset Claim API (Host Action)

**File:** `src/app/api/events/[id]/people/[personId]/reset-claim/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/guards'
import { logInviteEvent } from '@/lib/invite-events'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  const { id: eventId, personId } = params
  
  // Verify host access
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error }, 
      { status: authResult.status }
    )
  }
  
  // Find person and their token
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      eventId: eventId
    },
    include: {
      accessTokens: {
        where: { scope: 'PARTICIPANT' },
        select: {
          id: true,
          claimedAt: true,
          claimedBy: true
        }
      }
    }
  })
  
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }
  
  const accessToken = person.accessTokens[0]
  
  if (!accessToken) {
    return NextResponse.json({ error: 'No access token found' }, { status: 404 })
  }
  
  if (!accessToken.claimedAt) {
    return NextResponse.json({ error: 'Name is not claimed' }, { status: 400 })
  }
  
  const previousClaimBy = accessToken.claimedBy
  
  // Reset the claim
  await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: {
      claimedAt: null,
      claimedBy: null
      // Note: Keep openedAt - we know they opened at some point
    }
  })
  
  // Log the reset
  await logInviteEvent({
    eventId,
    personId,
    type: 'CLAIM_RESET',
    metadata: {
      previousClaimBy,
      personName: person.name
    }
  })
  
  return NextResponse.json({
    success: true,
    message: `Claim reset for ${person.name}. They can now claim their name again.`
  })
}
```

**Acceptance criteria:**
- [ ] Only host can reset claims
- [ ] Returns 400 if not claimed
- [ ] Clears `claimedAt` and `claimedBy`
- [ ] Keeps `openedAt` intact
- [ ] Logs `CLAIM_RESET` event

---

### Task 3.8: Shared Link UI Component

**File:** `src/components/plan/SharedLinkSection.tsx` (new file)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Link2, Copy, Check, Users, AlertCircle, ExternalLink } from 'lucide-react'

interface Props {
  eventId: string
  eventStatus: string
}

interface SharedLinkData {
  enabled: boolean
  url: string | null
  peopleCount: number
  recommendSharedLink: boolean
}

export function SharedLinkSection({ eventId, eventStatus }: Props) {
  const [data, setData] = useState<SharedLinkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (eventStatus === 'CONFIRMING' || eventStatus === 'FROZEN') {
      fetchStatus()
    } else {
      setLoading(false)
    }
  }, [eventId, eventStatus])
  
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/shared-link`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch shared link status:', e)
    } finally {
      setLoading(false)
    }
  }
  
  const handleEnable = async () => {
    setEnabling(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/events/${eventId}/shared-link`, {
        method: 'POST'
      })
      
      if (res.ok) {
        const result = await res.json()
        setData(prev => prev ? { ...prev, enabled: true, url: result.url } : null)
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to enable shared link')
      }
    } catch (e) {
      setError('Failed to enable shared link')
    } finally {
      setEnabling(false)
    }
  }
  
  const handleCopy = async () => {
    if (!data?.url) return
    
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = data.url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  // Don't show if not in correct status
  if (eventStatus !== 'CONFIRMING' && eventStatus !== 'FROZEN') {
    return null
  }
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }
  
  if (!data) return null
  
  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-sage-600" />
        <h3 className="font-semibold">Shared Link</h3>
        {data.recommendSharedLink && !data.enabled && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Recommended for {data.peopleCount}+ people
          </span>
        )}
      </div>
      
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      
      {data.enabled && data.url ? (
        // Enabled state
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Share this link with everyone. They'll select their name to see their assignments.
          </p>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={data.url}
              readOnly
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono truncate"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>Post to your family group chat</span>
            </div>
            <a 
              href={data.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sage-600 hover:underline"
            >
              <span>Preview</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ) : (
        // Not enabled state
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Instead of copying {data.peopleCount} individual links, create one link that everyone can use.
            Each person will select their name to see their assignments.
          </p>
          
          <button
            onClick={handleEnable}
            disabled={enabling}
            className="w-full py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 font-medium transition-colors"
          >
            {enabling ? 'Creating...' : 'Create Shared Link'}
          </button>
        </div>
      )}
    </div>
  )
}
```

**Acceptance criteria:**
- [ ] Shows recommendation badge for 16+ people
- [ ] "Create Shared Link" button enables the link
- [ ] Copy button with visual feedback
- [ ] Preview link opens in new tab
- [ ] Only shows in CONFIRMING/FROZEN status

---

### Task 3.9: Add Reset Claim Button to Host Dashboard

Find where people are displayed in the host dashboard and add a reset claim button for claimed people.

**File:** Modify the appropriate component (likely in `src/app/plan/[eventId]/page.tsx` or a related component)

```typescript
// In the people list or invite links section:

interface PersonWithClaim {
  id: string
  name: string
  claimedAt: string | null
  // ... other fields
}

function PersonRow({ person, eventId, onReset }: { 
  person: PersonWithClaim
  eventId: string
  onReset: () => void 
}) {
  const [resetting, setResetting] = useState(false)
  
  const handleResetClaim = async () => {
    if (!confirm(`Reset claim for ${person.name}? They will need to claim their name again.`)) {
      return
    }
    
    setResetting(true)
    try {
      const res = await fetch(
        `/api/events/${eventId}/people/${person.id}/reset-claim`,
        { method: 'POST' }
      )
      if (res.ok) {
        onReset()
      }
    } finally {
      setResetting(false)
    }
  }
  
  return (
    <div className="flex items-center justify-between py-2">
      <span>{person.name}</span>
      {person.claimedAt && (
        <button
          onClick={handleResetClaim}
          disabled={resetting}
          className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
        >
          {resetting ? 'Resetting...' : 'Reset claim'}
        </button>
      )}
    </div>
  )
}
```

**Note:** You'll need to ensure claim status is included in the data fetched for the dashboard. Modify the invite status API or add claim info to the existing people queries.

**Acceptance criteria:**
- [ ] Reset button appears for claimed people only
- [ ] Confirmation dialog before reset
- [ ] UI updates after successful reset

---

### Task 3.10: Update Invite Status API for Claims

**File:** `src/app/api/events/[id]/invite-status/route.ts` (modify)

Add claim information to the response:

```typescript
// In the people query, add claim info:
const event = await prisma.event.findUnique({
  where: { id: eventId },
  include: {
    people: {
      include: {
        accessTokens: {
          where: { scope: 'PARTICIPANT' },
          select: { 
            openedAt: true,
            claimedAt: true,  // Add this
            claimedBy: true   // Add this
          }
        },
        assignments: {
          select: { response: true, updatedAt: true }
        }
      }
    }
  }
})

// In the response mapping:
const peopleStatus = event.people.map(person => {
  const token = person.accessTokens[0]
  // ... existing logic ...
  
  return {
    // ... existing fields ...
    claimedAt: token?.claimedAt?.toISOString() || null,
    claimedBy: token?.claimedBy || null
  }
})

// Add to response:
return NextResponse.json({
  // ... existing fields ...
  sharedLinkEnabled: event.sharedLinkEnabled,
  claimCounts: {
    claimed: peopleStatus.filter(p => p.claimedAt).length,
    unclaimed: peopleStatus.filter(p => !p.claimedAt).length
  }
})
```

**Acceptance criteria:**
- [ ] Response includes `claimedAt` per person
- [ ] Response includes `sharedLinkEnabled`
- [ ] Response includes claim counts

---

### Task 3.11: Integrate SharedLinkSection into Dashboard

**File:** `src/app/plan/[eventId]/page.tsx`

Add the SharedLinkSection component:

```typescript
import { SharedLinkSection } from '@/components/plan/SharedLinkSection'

// In the render, add near the invite links section:
<SharedLinkSection 
  eventId={event.id} 
  eventStatus={event.status}
/>
```

**Acceptance criteria:**
- [ ] Component appears in CONFIRMING status
- [ ] Positioned logically (near individual invite links)

---

## Testing Requirements

### Manual Testing Checklist

**Shared Link Generation:**
- [ ] Enable shared link for event → token generated
- [ ] Copy link works
- [ ] Preview link opens in new tab
- [ ] Disable and re-enable reuses same token

**Name Selection Flow:**
- [ ] Open shared link → see event name and search box
- [ ] Type 2+ characters → see filtered results
- [ ] Names starting with query appear first
- [ ] Click name → go to confirmation screen
- [ ] Click "Yes, that's me" → redirect to participant view
- [ ] Click "No, go back" → return to search

**Claim Mechanics:**
- [ ] First person claims name → success
- [ ] Second person tries same name → error "already claimed"
- [ ] Claimed names show as disabled in search results
- [ ] AccessToken has `claimedAt` and `claimedBy` set

**Reset Claim:**
- [ ] Host sees "Reset claim" button for claimed people
- [ ] Click reset → confirmation dialog
- [ ] After reset, person can claim again
- [ ] `CLAIM_RESET` event logged

**Duplicate Names:**
- [ ] Add two people with same name
- [ ] Both appear in search with disambiguation
- [ ] Each can be claimed separately

**Hybrid Mode:**
- [ ] Enable shared link
- [ ] Individual links still work
- [ ] Person can use either link

**Edge Cases:**
- [ ] Shared link with invalid token → 404
- [ ] Shared link disabled → 404
- [ ] Event in DRAFT → "not ready" message
- [ ] Network error during claim → error message

### Database Verification Queries

```sql
-- Check shared link setup
SELECT id, name, "sharedLinkToken", "sharedLinkEnabled"
FROM "Event"
WHERE "sharedLinkToken" IS NOT NULL;

-- Check claims
SELECT 
  p.name,
  at."claimedAt",
  at."claimedBy"
FROM "AccessToken" at
JOIN "Person" p ON at."personId" = p.id
WHERE at."claimedAt" IS NOT NULL;

-- Check NAME_CLAIMED events
SELECT 
  ie."createdAt",
  ie.metadata,
  p.name
FROM "InviteEvent" ie
LEFT JOIN "Person" p ON ie."personId" = p.id
WHERE ie.type = 'NAME_CLAIMED'
ORDER BY ie."createdAt" DESC;
```

---

## Definition of Done

- [ ] Schema changes migrated
- [ ] Shared link can be generated and copied
- [ ] Name selection page works with fuzzy search
- [ ] Duplicate names are disambiguated
- [ ] Claim flow works and redirects correctly
- [ ] Already-claimed shows clear error message
- [ ] Host can reset claims
- [ ] Hybrid mode works (shared + individual links)
- [ ] All InviteEvents are logged correctly
- [ ] All manual tests pass
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Code committed and pushed to `feature/invite-phase-3-shared-link`

---

## Files Summary

**New files to create:**
- `src/app/join/[token]/page.tsx`
- `src/app/join/[token]/NameSelectionClient.tsx`
- `src/app/api/join/[token]/claim/route.ts`
- `src/app/api/events/[id]/shared-link/route.ts`
- `src/app/api/events/[id]/people/[personId]/reset-claim/route.ts`
- `src/components/plan/SharedLinkSection.tsx`

**Files to modify:**
- `prisma/schema.prisma`
- `src/app/api/events/[id]/invite-status/route.ts`
- `src/app/plan/[eventId]/page.tsx`
- `src/lib/tokens.ts` (verify secure token generation exists)

---

## Implementation Notes

1. **Mobile-first design:** The `/join/[token]` page will be opened from group chats on phones. Test on mobile! Large tap targets (48px+), large text, clear buttons.

2. **Search UX:** Use `includes()` for MVP fuzzy matching. Consider Fuse.js later if needed. Prioritize names that START with query.

3. **Device ID:** The `claimedBy` device ID is for audit purposes only, not security. Don't over-engineer it.

4. **Race condition:** Two people clicking the same name simultaneously is handled by the database - the second one gets a 409 error. The UI handles this gracefully.

5. **Hybrid mode:** Individual links still work when shared link is enabled. This lets hosts send personal links to specific people (Grandma June) while using the shared link for everyone else.

6. **Token reuse:** When disabling and re-enabling, we keep the same token. This prevents breaking links that were already shared.



⏺ Perfect! TypeScript compilation successful with no errors! ✅                        
                                                                                       
  Phase 3 Implementation Complete! 🎉                                                  
                                                                                       
  All 11 sub-tasks have been successfully implemented:                                 
                                                                                       
  ✅ Task 3.1: Schema Changes                                                          
                                                                                       
  - Added sharedLinkToken (String?, unique) to Event model                             
  - Added sharedLinkEnabled (Boolean, default false) to Event model                    
  - Verified AccessToken has openedAt, claimedAt, claimedBy fields                     
  - Migration created and applied successfully                                         
                                                                                       
  ✅ Task 3.2: Token Generation Utility                                                
                                                                                       
  - Added generateSecureToken() function using base64url encoding                      
  - Cryptographically secure with configurable length                                  
                                                                                       
  ✅ Task 3.3: Shared Link API                                                         
                                                                                       
  - GET /api/events/[id]/shared-link - Check status and recommendation                 
  - POST /api/events/[id]/shared-link - Generate and enable link                       
  - DELETE /api/events/[id]/shared-link - Disable link                                 
  - Validates CONFIRMING/FROZEN status requirement                                     
                                                                                       
  ✅ Task 3.4: Shared Link Landing Page                                                
                                                                                       
  - Server component at /app/join/[token]/page.tsx                                     
  - Validates shared link token                                                        
  - Returns 404 for invalid/disabled tokens                                            
  - Shows "not ready" for non-CONFIRMING events                                        
  - Identifies duplicate names for disambiguation                                      
                                                                                       
  ✅ Task 3.5: Name Selection Client Component                                         
                                                                                       
  - Mobile-friendly search with fuzzy matching                                         
  - Results appear after 2+ characters                                                 
  - Duplicate name disambiguation with first item                                      
  - Claimed names shown as disabled                                                    
  - Confirmation screen with name and assignment                                       
  - Error handling for race conditions                                                 
                                                                                       
  ✅ Task 3.6: Claim API Endpoint                                                      
                                                                                       
  - POST /api/join/[token]/claim                                                       
  - Returns 409 Conflict if already claimed                                            
  - Sets claimedAt and claimedBy on AccessToken                                        
  - Logs NAME_CLAIMED event                                                            
  - Returns participant token for redirect                                             
                                                                                       
  ✅ Task 3.7: Reset Claim API                                                         
                                                                                       
  - POST /api/events/[id]/people/[personId]/reset-claim                                
  - Host-only action (auth ready)                                                      
  - Clears claim data but keeps openedAt                                               
  - Logs CLAIM_RESET event                                                             
                                                                                       
  ✅ Task 3.8: Shared Link UI Component                                                
                                                                                       
  - Shows recommendation for 16+ people                                                
  - Create/copy/preview functionality                                                  
  - Only visible in CONFIRMING/FROZEN status                                           
  - Loading states and error handling                                                  
                                                                                       
  ✅ Task 3.9: Reset Claim Button                                                      
                                                                                       
  - Appears for claimed PARTICIPANT tokens only                                        
  - Shows "Claimed" badge                                                              
  - Confirmation dialog before reset                                                   
  - Updates UI after successful reset                                                  
                                                                                       
  ✅ Task 3.10: Invite Status API Updates                                              
                                                                                       
  - Added claimedAt and claimedBy to person data                                       
  - Added sharedLinkEnabled to response                                                
  - Added claimCounts (claimed/unclaimed)                                              
                                                                                       
  ✅ Task 3.11: Dashboard Integration                                                  
                                                                                       
  - SharedLinkSection integrated into plan page                                        
  - Positioned in Invite Links modal                                                   
  - Passes eventId and eventStatus props                                               
                                                                                       
  Summary of New Files Created:                                                        
                                                                                       
  1. src/app/join/[token]/page.tsx - Server component                                  
  2. src/app/join/[token]/NameSelectionClient.tsx - Client component                   
  3. src/app/api/join/[token]/claim/route.ts - Claim API                               
  4. src/app/api/events/[id]/shared-link/route.ts - Shared link management             
  5. src/app/api/events/[id]/people/[personId]/reset-claim/route.ts - Reset claim API  
  6. src/components/plan/SharedLinkSection.tsx - UI component                          
  7. prisma/migrations/20260123140735_shared_link/migration.sql - Database migration   
                                                                                       
  Files Modified:                                                                      
                                                                                       
  1. prisma/schema.prisma - Added shared link fields                                   
  2. src/lib/tokens.ts - Added generateSecureToken()                                   
  3. src/app/api/events/[id]/invite-status/route.ts - Added claim data                 
  4. src/app/plan/[eventId]/page.tsx - Integrated SharedLinkSection and reset claim    
  button                                                                               
                                                                                       
  Ready for testing! All TypeScript checks pass with zero errors.     