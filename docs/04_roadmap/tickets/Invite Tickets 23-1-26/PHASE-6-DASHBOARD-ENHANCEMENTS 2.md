# PHASE 6: Host Dashboard Enhancements

**Branch name:** `feature/invite-phase-6-dashboard-enhancements`  
**Estimated effort:** 2-3 days  
**Dependencies:** Phases 1-5 should be complete for full functionality

---

## Project Context: What is Gather?

Gather is a coordination app for family gatherings (Christmas dinners, reunions, retreats) that ensures everyone knows what they're responsible for without the host chasing people through group chats.

**The core promise:** "Gather gets everyone to confirm—so you don't have to chase."

**Tech stack:** Next.js 14 (App Router), TypeScript, Prisma, PostgreSQL, Tailwind CSS

**From previous phases, you now have:**
- Invite status tracking (Phase 1-2)
- Shared link mode (Phase 3)
- SMS infrastructure (Phase 4)
- Auto-nudge system (Phase 5)

**What the host dashboard currently shows:**
- Event details and status
- Teams and items
- People section
- Invite links (basic copy functionality)
- Invite status section (from Phase 2)
- SMS summary (from Phase 4)
- Nudge status (from Phase 5)

---

## Why This Phase Matters

The host dashboard is Aroha's command center. All the infrastructure we've built (tracking, nudges, shared links) needs to be **visible and actionable** for the host.

**Current gaps:**
- No consolidated view of the full invite funnel
- No way to see who's stuck at each stage
- No manual override for marking people as confirmed
- Limited visibility into nudge effectiveness
- No "who's missing" summary for event-week panic mode

**This phase makes the invite system visible and controllable.**

---

## Phase 6 Objectives

1. Create consolidated invite funnel visualization
2. Add per-person detail view with full history
3. Implement manual override ("Mark as confirmed")
4. Build "Who's Missing" summary for quick gaps view
5. Add invite audit log visibility
6. Create event-week "panic mode" quick actions
7. Polish existing components for better UX

---

## Sub-Tasks

### Task 6.1: Invite Funnel Visualization

**File:** `src/components/plan/InviteFunnel.tsx` (new file)

A visual funnel showing progression through invite stages:

```typescript
'use client'

import { useMemo } from 'react'
import { Users, Send, Eye, MessageSquare, CheckCircle } from 'lucide-react'

interface FunnelData {
  total: number
  sent: number
  opened: number
  responded: number
  confirmed: number  // ACCEPTED responses
}

interface Props {
  data: FunnelData
}

export function InviteFunnel({ data }: Props) {
  const stages = useMemo(() => [
    {
      name: 'Invited',
      count: data.total,
      icon: Users,
      color: 'bg-gray-100 text-gray-600',
      description: 'Total people'
    },
    {
      name: 'Sent',
      count: data.sent,
      icon: Send,
      color: 'bg-yellow-100 text-yellow-700',
      description: 'Invites marked as sent',
      dropoff: data.total > 0 ? data.total - data.sent : 0
    },
    {
      name: 'Opened',
      count: data.opened,
      icon: Eye,
      color: 'bg-blue-100 text-blue-700',
      description: 'Opened their link',
      dropoff: data.sent > 0 ? data.sent - data.opened : 0
    },
    {
      name: 'Responded',
      count: data.responded,
      icon: MessageSquare,
      color: 'bg-purple-100 text-purple-700',
      description: 'Submitted a response',
      dropoff: data.opened > 0 ? data.opened - data.responded : 0
    },
    {
      name: 'Confirmed',
      count: data.confirmed,
      icon: CheckCircle,
      color: 'bg-green-100 text-green-700',
      description: 'Accepted their items',
      dropoff: data.responded > 0 ? data.responded - data.confirmed : 0
    }
  ], [data])
  
  const maxWidth = 100
  const minWidth = 40
  
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-lg mb-4">Invite Funnel</h3>
      
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          const widthPercent = data.total > 0
            ? minWidth + ((stage.count / data.total) * (maxWidth - minWidth))
            : maxWidth
          
          return (
            <div key={stage.name} className="relative">
              {/* Stage bar */}
              <div
                className={`${stage.color} rounded-lg p-3 transition-all duration-300`}
                style={{ width: `${widthPercent}%` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{stage.name}</span>
                  </div>
                  <span className="font-bold">{stage.count}</span>
                </div>
              </div>
              
              {/* Dropoff indicator */}
              {stage.dropoff !== undefined && stage.dropoff > 0 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2">
                  <span className="text-xs text-red-500">
                    -{stage.dropoff}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Conversion rate */}
      {data.total > 0 && (
        <div className="mt-4 pt-4 border-t text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Overall conversion</span>
            <span className="font-medium">
              {Math.round((data.confirmed / data.total) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Acceptance criteria:**
- [ ] Shows 5 funnel stages with counts
- [ ] Visual width represents proportion
- [ ] Shows dropoff between stages
- [ ] Shows overall conversion rate

---

### Task 6.2: Per-Person Detail Modal

**File:** `src/components/plan/PersonInviteDetailModal.tsx` (new file)

Shows full invite history and status for a single person:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { X, User, Phone, Mail, Clock, CheckCircle, XCircle, Eye, Send, Bell } from 'lucide-react'
import { formatPhoneForDisplay } from '@/lib/phone'

interface PersonDetail {
  id: string
  name: string
  email: string | null
  phoneNumber: string | null
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED'
  inviteAnchorAt: string | null
  openedAt: string | null
  respondedAt: string | null
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null
  hasPhone: boolean
  smsOptedOut: boolean
  canReceiveSms: boolean
  nudge24hSentAt: string | null
  nudge48hSentAt: string | null
  claimedAt: string | null
  inviteEvents: {
    type: string
    createdAt: string
    metadata: Record<string, unknown>
  }[]
}

interface Props {
  eventId: string
  personId: string
  onClose: () => void
  onUpdate: () => void
}

export function PersonInviteDetailModal({ eventId, personId, onClose, onUpdate }: Props) {
  const [person, setPerson] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    fetchPersonDetail()
  }, [personId])
  
  const fetchPersonDetail = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}/invite-detail`)
      if (res.ok) {
        setPerson(await res.json())
      } else {
        setError('Failed to load details')
      }
    } catch (e) {
      setError('Failed to load details')
    } finally {
      setLoading(false)
    }
  }
  
  const handleMarkConfirmed = async () => {
    setMarking(true)
    setError(null)
    
    try {
      const res = await fetch(
        `/api/events/${eventId}/people/${personId}/mark-confirmed`,
        { method: 'POST' }
      )
      
      if (res.ok) {
        await fetchPersonDetail()
        onUpdate()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to mark as confirmed')
      }
    } catch (e) {
      setError('Failed to mark as confirmed')
    } finally {
      setMarking(false)
    }
  }
  
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin w-8 h-8 border-2 border-sage-600 border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }
  
  if (!person) {
    return null
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sage-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-sage-600" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{person.name}</h2>
              <StatusBadge status={person.status} response={person.response} />
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Contact Info */}
          <div className="space-y-2">
            {person.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span>{person.email}</span>
              </div>
            )}
            {person.phoneNumber && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{formatPhoneForDisplay(person.phoneNumber)}</span>
                {person.smsOptedOut && (
                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    Opted out
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Timeline */}
          <div className="border rounded-lg p-3">
            <h3 className="font-medium text-sm text-gray-700 mb-3">Timeline</h3>
            <div className="space-y-3">
              <TimelineItem
                icon={Send}
                label="Invite sent"
                time={person.inviteAnchorAt}
                color="yellow"
              />
              <TimelineItem
                icon={Eye}
                label="Link opened"
                time={person.openedAt}
                color="blue"
              />
              {person.claimedAt && (
                <TimelineItem
                  icon={User}
                  label="Name claimed (shared link)"
                  time={person.claimedAt}
                  color="purple"
                />
              )}
              <TimelineItem
                icon={person.response === 'ACCEPTED' ? CheckCircle : 
                      person.response === 'DECLINED' ? XCircle : Clock}
                label={
                  person.response === 'ACCEPTED' ? 'Accepted' :
                  person.response === 'DECLINED' ? 'Declined' :
                  'Response pending'
                }
                time={person.respondedAt}
                color={
                  person.response === 'ACCEPTED' ? 'green' :
                  person.response === 'DECLINED' ? 'red' :
                  'gray'
                }
              />
            </div>
          </div>
          
          {/* Nudges */}
          {(person.nudge24hSentAt || person.nudge48hSentAt) && (
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Auto-Reminders</h3>
              <div className="space-y-2">
                {person.nudge24hSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-yellow-600" />
                    <span>24h reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.nudge24hSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {person.nudge48hSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <span>48h reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.nudge48hSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
        
        {/* Footer Actions */}
        <div className="p-4 border-t bg-gray-50">
          {person.response !== 'ACCEPTED' && (
            <button
              onClick={handleMarkConfirmed}
              disabled={marking}
              className="w-full py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 font-medium transition-colors"
            >
              {marking ? 'Marking...' : 'Mark as Confirmed (Manual Override)'}
            </button>
          )}
          {person.response === 'ACCEPTED' && (
            <p className="text-center text-green-600 font-medium">
              ✓ Already confirmed
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, response }: { status: string; response: string | null }) {
  if (response === 'ACCEPTED') {
    return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Confirmed</span>
  }
  if (response === 'DECLINED') {
    return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Declined</span>
  }
  
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    'NOT_SENT': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not sent' },
    'SENT': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Sent' },
    'OPENED': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Opened' },
    'RESPONDED': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Responded' }
  }
  
  const config = statusConfig[status] || statusConfig['NOT_SENT']
  
  return (
    <span className={`text-xs ${config.bg} ${config.text} px-2 py-0.5 rounded-full`}>
      {config.label}
    </span>
  )
}

function TimelineItem({ 
  icon: Icon, 
  label, 
  time, 
  color 
}: { 
  icon: React.ElementType
  label: string
  time: string | null
  color: string 
}) {
  const colorClasses: Record<string, string> = {
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-500'
  }
  
  return (
    <div className={`flex items-center gap-3 ${!time ? 'opacity-50' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClasses[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {time && (
          <p className="text-xs text-gray-500">
            {new Date(time).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
```

**Acceptance criteria:**
- [ ] Shows contact info (email, phone, opt-out status)
- [ ] Shows timeline of invite events
- [ ] Shows nudge history
- [ ] "Mark as Confirmed" button works
- [ ] Updates parent when changes made

---

### Task 6.3: Person Invite Detail API

**File:** `src/app/api/events/[id]/people/[personId]/invite-detail/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/guards'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  const { id: eventId, personId } = params
  
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }
  
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      eventId: eventId
    },
    include: {
      accessTokens: {
        where: { scope: 'PARTICIPANT' },
        select: {
          openedAt: true,
          claimedAt: true
        }
      },
      assignments: {
        select: {
          response: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      },
      inviteEvents: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          type: true,
          createdAt: true,
          metadata: true
        }
      }
    }
  })
  
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }
  
  const token = person.accessTokens[0]
  const hasResponded = person.assignments.some(a => a.response !== 'PENDING')
  const respondedAssignment = person.assignments.find(a => a.response !== 'PENDING')
  
  // Determine status
  let status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED'
  if (hasResponded) {
    status = 'RESPONDED'
  } else if (token?.openedAt) {
    status = 'OPENED'
  } else if (person.inviteAnchorAt) {
    status = 'SENT'
  } else {
    status = 'NOT_SENT'
  }
  
  // Get response type
  const response = respondedAssignment?.response || 'PENDING'
  
  // Check opt-out
  const optOut = person.phoneNumber
    ? await prisma.smsOptOut.findFirst({
        where: {
          phoneNumber: person.phoneNumber,
          hostId: (await prisma.event.findUnique({
            where: { id: eventId },
            select: { hostId: true }
          }))?.hostId
        }
      })
    : null
  
  return NextResponse.json({
    id: person.id,
    name: person.name,
    email: person.email,
    phoneNumber: person.phoneNumber,
    status,
    response,
    inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
    openedAt: token?.openedAt?.toISOString() || null,
    claimedAt: token?.claimedAt?.toISOString() || null,
    respondedAt: respondedAssignment?.updatedAt?.toISOString() || null,
    hasPhone: !!person.phoneNumber,
    smsOptedOut: !!optOut,
    canReceiveSms: !!person.phoneNumber && !optOut,
    nudge24hSentAt: person.nudge24hSentAt?.toISOString() || null,
    nudge48hSentAt: person.nudge48hSentAt?.toISOString() || null,
    inviteEvents: person.inviteEvents.map(e => ({
      type: e.type,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata
    }))
  })
}
```

**Acceptance criteria:**
- [ ] Returns full person detail including timeline
- [ ] Includes invite events history
- [ ] Calculates status correctly

---

### Task 6.4: Manual Override API — Mark as Confirmed

**File:** `src/app/api/events/[id]/people/[personId]/mark-confirmed/route.ts` (new file)

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
  
  const authResult = await requireEventAccess(request, eventId, ['HOST'])
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }
  
  // Parse optional reason from body
  let reason = 'Manual confirmation by host'
  try {
    const body = await request.json()
    if (body.reason) {
      reason = body.reason
    }
  } catch {
    // No body provided, use default reason
  }
  
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      eventId: eventId
    },
    include: {
      assignments: true
    }
  })
  
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }
  
  // Update all their assignments to ACCEPTED
  const updatedAssignments = await prisma.assignment.updateMany({
    where: {
      personId: personId,
      response: { not: 'ACCEPTED' }
    },
    data: {
      response: 'ACCEPTED'
    }
  })
  
  // Log the manual override
  await logInviteEvent({
    eventId,
    personId,
    type: 'MANUAL_OVERRIDE_MARKED',
    metadata: {
      reason,
      assignmentsUpdated: updatedAssignments.count,
      previousResponses: person.assignments.map(a => ({
        itemId: a.itemId,
        previousResponse: a.response
      }))
    }
  })
  
  return NextResponse.json({
    success: true,
    assignmentsUpdated: updatedAssignments.count,
    message: `${person.name} marked as confirmed`
  })
}
```

**Acceptance criteria:**
- [ ] Updates all person's assignments to ACCEPTED
- [ ] Logs `MANUAL_OVERRIDE_MARKED` event with audit trail
- [ ] Includes previous responses in metadata
- [ ] Only host can perform this action

---

### Task 6.5: "Who's Missing" Summary Component

**File:** `src/components/plan/WhosMissing.tsx` (new file)

Quick view of gaps for event-week panic mode:

```typescript
'use client'

import { useState } from 'react'
import { AlertTriangle, User, Phone, Clock, ChevronDown, ChevronUp } from 'lucide-react'

interface MissingPerson {
  id: string
  name: string
  status: string
  hasPhone: boolean
  lastAction: string | null
  daysSinceAnchor: number | null
}

interface Props {
  people: MissingPerson[]
  onPersonClick: (personId: string) => void
}

export function WhosMissing({ people, onPersonClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  
  // Filter to people who haven't confirmed
  const missing = people.filter(p => p.status !== 'RESPONDED' || p.lastAction !== 'ACCEPTED')
  
  if (missing.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700">
          <span className="text-xl">🎉</span>
          <span className="font-medium">Everyone has confirmed!</span>
        </div>
      </div>
    )
  }
  
  // Categorize by urgency
  const notOpened = missing.filter(p => p.status === 'NOT_SENT' || p.status === 'SENT')
  const openedNotResponded = missing.filter(p => p.status === 'OPENED')
  const declined = missing.filter(p => p.lastAction === 'DECLINED')
  
  const displayList = expanded ? missing : missing.slice(0, 5)
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <span className="font-semibold text-amber-800">
          {missing.length} {missing.length === 1 ? 'person' : 'people'} still missing
        </span>
      </div>
      
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
        {notOpened.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-amber-700">{notOpened.length} haven't opened</span>
          </div>
        )}
        {openedNotResponded.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-amber-700">{openedNotResponded.length} opened, no response</span>
          </div>
        )}
        {declined.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-red-700">{declined.length} declined</span>
          </div>
        )}
      </div>
      
      {/* Person list */}
      <div className="space-y-2">
        {displayList.map(person => (
          <button
            key={person.id}
            onClick={() => onPersonClick(person.id)}
            className="w-full flex items-center justify-between p-2 bg-white rounded-lg hover:bg-amber-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{person.name}</span>
              {!person.hasPhone && (
                <span className="text-xs text-gray-400">(no phone)</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {person.daysSinceAnchor !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {person.daysSinceAnchor}d ago
                </span>
              )}
              <StatusDot status={person.status} />
            </div>
          </button>
        ))}
      </div>
      
      {/* Expand/collapse */}
      {missing.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 flex items-center justify-center gap-1 text-sm text-amber-700 hover:text-amber-800"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show all {missing.length}
            </>
          )}
        </button>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'NOT_SENT': 'bg-gray-400',
    'SENT': 'bg-yellow-400',
    'OPENED': 'bg-blue-400',
    'RESPONDED': 'bg-purple-400'
  }
  
  return (
    <div 
      className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-400'}`}
      title={status}
    />
  )
}
```

**Acceptance criteria:**
- [ ] Shows count of missing people
- [ ] Categorizes by urgency (not opened, opened, declined)
- [ ] Clickable rows open person detail
- [ ] Shows "Everyone confirmed!" when complete
- [ ] Expand/collapse for long lists

---

### Task 6.6: Copy Plan as Text (Panic Mode Fallback)

**File:** `src/components/plan/CopyPlanAsText.tsx` (new file)

```typescript
'use client'

import { useState } from 'react'
import { Copy, Check, FileText } from 'lucide-react'

interface PlanData {
  eventName: string
  eventDate: string
  people: {
    name: string
    items: string[]
    status: 'confirmed' | 'pending' | 'declined'
    phone?: string
    email?: string
  }[]
}

interface Props {
  eventId: string
}

export function CopyPlanAsText({ eventId }: Props) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const handleCopy = async () => {
    setLoading(true)
    
    try {
      const res = await fetch(`/api/events/${eventId}/export-text`)
      if (!res.ok) throw new Error('Failed to export')
      
      const data: PlanData = await res.json()
      const text = formatPlanAsText(data)
      
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <button
      onClick={handleCopy}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <FileText className="w-4 h-4" />
          <span>{loading ? 'Loading...' : 'Copy plan as text'}</span>
        </>
      )}
    </button>
  )
}

function formatPlanAsText(data: PlanData): string {
  const lines: string[] = []
  
  lines.push(`${data.eventName}`)
  lines.push(`Date: ${data.eventDate}`)
  lines.push('')
  lines.push('─'.repeat(40))
  lines.push('')
  
  // Confirmed
  const confirmed = data.people.filter(p => p.status === 'confirmed')
  if (confirmed.length > 0) {
    lines.push('✓ CONFIRMED:')
    confirmed.forEach(p => {
      lines.push(`  ${p.name}: ${p.items.join(', ')}`)
    })
    lines.push('')
  }
  
  // Pending
  const pending = data.people.filter(p => p.status === 'pending')
  if (pending.length > 0) {
    lines.push('⏳ WAITING FOR RESPONSE:')
    pending.forEach(p => {
      const contact = p.phone || p.email || ''
      lines.push(`  ${p.name}: ${p.items.join(', ')}${contact ? ` — ${contact}` : ''}`)
    })
    lines.push('')
  }
  
  // Declined
  const declined = data.people.filter(p => p.status === 'declined')
  if (declined.length > 0) {
    lines.push('❌ DECLINED (needs reassignment):')
    declined.forEach(p => {
      lines.push(`  ${p.name}: ${p.items.join(', ')}`)
    })
    lines.push('')
  }
  
  lines.push('─'.repeat(40))
  lines.push(`Generated by Gather — ${new Date().toLocaleString()}`)
  
  return lines.join('\n')
}
```

**Acceptance criteria:**
- [ ] Fetches current plan data
- [ ] Formats as readable plain text
- [ ] Groups by status (confirmed, pending, declined)
- [ ] Includes contact info for pending people
- [ ] Copies to clipboard

---

### Task 6.7: Export Plan Text API

**File:** `src/app/api/events/[id]/export-text/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/guards'
import { formatPhoneForDisplay } from '@/lib/phone'

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
    include: {
      days: {
        orderBy: { date: 'asc' },
        take: 1
      },
      people: {
        include: {
          assignments: {
            include: {
              item: {
                select: { name: true, quantity: true }
              }
            }
          }
        }
      }
    }
  })
  
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  
  const people = event.people.map(person => {
    const items = person.assignments.map(a => {
      const qty = a.item.quantity ? ` (${a.item.quantity})` : ''
      return `${a.item.name}${qty}`
    })
    
    // Determine status
    const responses = person.assignments.map(a => a.response)
    let status: 'confirmed' | 'pending' | 'declined'
    
    if (responses.every(r => r === 'ACCEPTED')) {
      status = 'confirmed'
    } else if (responses.some(r => r === 'DECLINED')) {
      status = 'declined'
    } else {
      status = 'pending'
    }
    
    return {
      name: person.name,
      items,
      status,
      phone: person.phoneNumber ? formatPhoneForDisplay(person.phoneNumber) : undefined,
      email: person.email || undefined
    }
  })
  
  return NextResponse.json({
    eventName: event.name,
    eventDate: event.days[0]?.date 
      ? new Date(event.days[0].date).toLocaleDateString('en-NZ', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'Date TBD',
    people
  })
}
```

**Acceptance criteria:**
- [ ] Returns event name and date
- [ ] Returns all people with their assigned items
- [ ] Calculates correct status for each person
- [ ] Includes contact info

---

### Task 6.8: Integrate New Components into Dashboard

**File:** `src/app/plan/[eventId]/page.tsx` (modify)

Add the new components to the host dashboard:

```typescript
import { InviteFunnel } from '@/components/plan/InviteFunnel'
import { WhosMissing } from '@/components/plan/WhosMissing'
import { CopyPlanAsText } from '@/components/plan/CopyPlanAsText'
import { PersonInviteDetailModal } from '@/components/plan/PersonInviteDetailModal'

// Add state for person detail modal
const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

// In the render, add components (positioned appropriately):

{/* Invite Funnel - shown in CONFIRMING status */}
{event.status === 'CONFIRMING' && inviteStatus && (
  <InviteFunnel 
    data={{
      total: inviteStatus.counts.total,
      sent: inviteStatus.counts.total - inviteStatus.counts.notSent,
      opened: inviteStatus.counts.opened + inviteStatus.counts.responded,
      responded: inviteStatus.counts.responded,
      confirmed: inviteStatus.counts.responded // Adjust based on actual data
    }}
  />
)}

{/* Who's Missing - shown in CONFIRMING status */}
{event.status === 'CONFIRMING' && inviteStatus && (
  <WhosMissing
    people={inviteStatus.people.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      hasPhone: p.hasPhone,
      lastAction: p.response,
      daysSinceAnchor: p.inviteAnchorAt 
        ? Math.floor((Date.now() - new Date(p.inviteAnchorAt).getTime()) / (1000 * 60 * 60 * 24))
        : null
    }))}
    onPersonClick={setSelectedPersonId}
  />
)}

{/* Copy Plan as Text - always available */}
<CopyPlanAsText eventId={event.id} />

{/* Person Detail Modal */}
{selectedPersonId && (
  <PersonInviteDetailModal
    eventId={event.id}
    personId={selectedPersonId}
    onClose={() => setSelectedPersonId(null)}
    onUpdate={fetchInviteStatus}
  />
)}
```

**Acceptance criteria:**
- [ ] Funnel visible in CONFIRMING status
- [ ] Who's Missing visible in CONFIRMING status
- [ ] Copy Plan button accessible
- [ ] Person detail modal opens on click

---

### Task 6.9: Clickable Person Names in Existing Lists

Update existing person lists to open the detail modal:

**File:** Update person list components throughout the dashboard

```typescript
// Wherever person names are displayed:
<button
  onClick={() => setSelectedPersonId(person.id)}
  className="text-left hover:text-sage-600 hover:underline"
>
  {person.name}
</button>
```

**Acceptance criteria:**
- [ ] Person names are clickable throughout dashboard
- [ ] Clicking opens the detail modal
- [ ] Visual indication that names are clickable (hover state)

---

### Task 6.10: Polish Invite Status Section

**File:** `src/components/plan/InviteStatusSection.tsx` (modify)

Enhance the existing component:

```typescript
// Add expandable person list
const [showAllPeople, setShowAllPeople] = useState(false)

// Add click handler for people
const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

// In the render, add a people list section:
{data.people && data.people.length > 0 && (
  <div className="border-t pt-4 mt-4">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-sm font-medium text-gray-700">People</h4>
      <button 
        onClick={() => setShowAllPeople(!showAllPeople)}
        className="text-xs text-sage-600 hover:underline"
      >
        {showAllPeople ? 'Show less' : `Show all ${data.people.length}`}
      </button>
    </div>
    
    <div className="space-y-1">
      {(showAllPeople ? data.people : data.people.slice(0, 5)).map(person => (
        <div 
          key={person.id}
          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
          onClick={() => onPersonClick?.(person.id)}
        >
          <div className="flex items-center gap-2">
            <StatusIcon status={person.status} />
            <span className="text-sm">{person.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {person.nudge24hSentAt && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">24h</span>
            )}
            {person.nudge48hSentAt && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">48h</span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

**Acceptance criteria:**
- [ ] People list is expandable
- [ ] Each person row shows status icon
- [ ] Nudge badges visible
- [ ] Rows are clickable

---

## Testing Requirements

### Manual Testing Checklist

**Invite Funnel:**
- [ ] Shows correct counts at each stage
- [ ] Visual widths reflect proportions
- [ ] Dropoff numbers are accurate
- [ ] Conversion rate calculates correctly

**Person Detail Modal:**
- [ ] Opens when clicking person name
- [ ] Shows correct contact info
- [ ] Timeline shows correct events
- [ ] Nudge history displays
- [ ] "Mark as Confirmed" works
- [ ] Modal closes properly

**Who's Missing:**
- [ ] Shows only non-confirmed people
- [ ] Categorizes correctly (not opened, opened, declined)
- [ ] Clicking person opens detail modal
- [ ] Shows "Everyone confirmed!" when appropriate
- [ ] Expand/collapse works

**Copy Plan as Text:**
- [ ] Generates readable text
- [ ] Groups by status correctly
- [ ] Includes contact info for pending
- [ ] Copies to clipboard successfully

**Manual Override:**
- [ ] Updates all assignments to ACCEPTED
- [ ] Logs event with audit trail
- [ ] Dashboard updates after change

### Database Verification

```sql
-- Check manual overrides
SELECT 
  type,
  metadata,
  "createdAt"
FROM "InviteEvent"
WHERE type = 'MANUAL_OVERRIDE_MARKED'
ORDER BY "createdAt" DESC;

-- Verify assignments updated
SELECT 
  p.name,
  a.response,
  a."updatedAt"
FROM "Assignment" a
JOIN "Person" p ON a."personId" = p.id
WHERE p.id = 'person-id-here';
```

---

## Definition of Done

- [ ] Invite funnel visualization displays correctly
- [ ] Person detail modal shows full history
- [ ] Manual override works and logs properly
- [ ] Who's Missing summary shows gaps clearly
- [ ] Copy Plan as Text generates proper output
- [ ] All components integrated into dashboard
- [ ] Person names are clickable throughout
- [ ] Nudge badges visible on person rows
- [ ] All manual tests pass
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Code committed and pushed to `feature/invite-phase-6-dashboard-enhancements`

---

## Files Summary

**New files to create:**
- `src/components/plan/InviteFunnel.tsx`
- `src/components/plan/PersonInviteDetailModal.tsx`
- `src/components/plan/WhosMissing.tsx`
- `src/components/plan/CopyPlanAsText.tsx`
- `src/app/api/events/[id]/people/[personId]/invite-detail/route.ts`
- `src/app/api/events/[id]/people/[personId]/mark-confirmed/route.ts`
- `src/app/api/events/[id]/export-text/route.ts`

**Files to modify:**
- `src/app/plan/[eventId]/page.tsx`
- `src/components/plan/InviteStatusSection.tsx`
- Various person list components

---

## Implementation Notes

1. **Modal state management:** Use React state at the page level to manage which person's detail modal is open. Pass the setter down to child components.

2. **Data fetching:** The person detail API fetches fresh data each time the modal opens. This ensures accuracy even if the dashboard data is slightly stale.

3. **Manual override audit:** Always log the previous state before changing. This creates a complete audit trail for debugging and accountability.

4. **Copy as text UX:** The text format is designed to be paste-friendly for WhatsApp, email, or notes apps. Test on actual devices.

5. **Performance:** The funnel and Who's Missing components derive their data from the invite status API. No additional API calls needed.

6. **Accessibility:** Ensure all clickable elements have proper focus states and keyboard navigation works.



                                                                                       
  ✅ Phase 6: Host Dashboard Enhancements - Complete!                                  
                                                                                       
  New Components Created:                                                              
                                                                                       
  1. InviteFunnel.tsx - Visual 5-stage funnel showing invite progression (Invited →    
  Sent → Opened → Responded → Confirmed) with dropoff indicators and conversion rate   
  2. PersonInviteDetailModal.tsx - Detailed modal showing:                             
    - Full invite timeline with icons                                                  
    - Contact info and opt-out status                                                  
    - Auto-reminder history                                                            
    - Manual "Mark as Confirmed" button                                                
  3. WhosMissing.tsx - Quick summary component showing:                                
    - Who hasn't confirmed yet                                                         
    - Categorization by urgency (not opened, opened, declined)                         
    - Days since invite sent                                                           
    - Clickable rows to open person detail                                             
  4. CopyPlanAsText.tsx - Export button that generates a text summary:                 
    - Confirmed people with their items                                                
    - Pending people with contact info                                                 
    - Declined people needing reassignment                                             
                                                                                       
  New API Endpoints:                                                                   
                                                                                       
  1. GET /api/events/[id]/people/[personId]/invite-detail - Full person invite history 
  2. POST /api/events/[id]/people/[personId]/mark-confirmed - Manual override to mark  
  as confirmed (with audit trail)                                                      
  3. GET /api/events/[id]/export-text - Export plan as formatted text                  
                                                                                       
  Integration Updates:                                                                 
                                                                                       
  - ✅ All new components integrated into Invite Links expansion modal                 
  - ✅ InviteStatusSection enhanced with expandable people list                        
  - ✅ Person names are clickable throughout (opens detail modal)                      
  - ✅ Nudge badges (24h, 48h) visible on person rows                                  
  - ✅ Modal state management with person selection                                    
  - ✅ Full data flow from invite-status API to all components                         
                                                                                       
  TypeScript & Quality:                                                                
                                                                                       
  - ✅ All TypeScript checks pass (npm run typecheck)                                  
  - ✅ Proper auth guards (requireEventRole) on all APIs                               
  - ✅ Correct Prisma schema usage (Person → Event relationships)                      
  - ✅ Manual override logging with MANUAL_OVERRIDE_MARKED event type                  
                                                                                       
  Ready for Testing!                                                                   
                                                                                       
  The dashboard now provides hosts with:                                               
  - Clear visibility into invite funnel progression                                    
  - Quick identification of who's missing                                              
  - Detailed per-person history and manual overrides                                   
  - Exportable text summary for sharing via WhatsApp/email                             
                                                                                       
  All code is on the feature/invite-phase-6-dashboard-enhancements branch. Would you   
  like me to commit these changes to git?  