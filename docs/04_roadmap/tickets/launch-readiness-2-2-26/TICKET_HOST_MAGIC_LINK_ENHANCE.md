```
TICKET: Enhance Host Magic Link View (/h/[token])

## Context

The host magic link view at `/h/[token]` is a lightweight status-check page. But hosts arriving via magic link need to actually *manage* their event, not just glance at it. Currently they'd need to log in separately to access `/plan/[eventId]` for key features.

The demo also uses `/h/[token]`, so improving this view directly improves the demo experience.

## Goal

Bring the most important host management features from `/plan/[eventId]` to `/h/[token]`, so a host can do everything they need from their magic link.

## Files to Read First

```
src/app/h/[token]/page.tsx — current host magic link view
src/app/plan/[eventId]/page.tsx — full host dashboard (reference implementation)
src/components/plan/InviteStatusSection.tsx — invite tracking component
src/components/plan/PersonInviteDetailModal.tsx — person detail with manual override
src/components/plan/CopyPlanAsText.tsx — export as text
src/app/api/h/[token]/route.ts — current API response
src/app/api/events/[id]/invite-status/route.ts — invite status data
```

## Features to Add

### 1. Invite Status Summary (HIGH PRIORITY)

Add a visible section showing:
- Counts: Not sent / Sent / Opened / Responded
- Simple progress bar
- "X of Y responded (Z%)"

This should be visible on the main `/h/[token]` page in CONFIRMING status, not hidden behind a click.

Reference: `InviteStatusSection.tsx` — but create a simplified version, not the full component with all its sub-sections.

API change needed: `/api/h/[token]/route.ts` needs to return invite status counts. Either:
- Call the existing invite-status logic and include it in the response
- Or create a lightweight version of the same query

### 2. People List with Status (HIGH PRIORITY)

Below the invite summary, show a list of people with their status:
- Name
- Status icon: 🕐 not sent / 📤 sent / 👁 opened / ✓ responded
- Response: Accepted / Declined / Pending (if they have assignments)
- Clickable to open detail

Reference: The people list in `InviteStatusSection.tsx` lines 609-634.

### 3. Manual Override (HIGH PRIORITY)

When clicking a person in the list, open a modal showing:
- Their assignments and current responses
- "Mark as Confirmed" / "Mark as Declined" buttons for PENDING items
- Reason field (required)

Reference: `PersonInviteDetailModal.tsx`

API: The endpoint already exists at `/api/events/[id]/people/[personId]/manual-override` — just need UI to call it.

### 4. Copy Plan as Text (MEDIUM PRIORITY)

Add a button (perhaps in the header or action bar) to copy/download the plan as formatted text.

Reference: `CopyPlanAsText.tsx`

API: Endpoint exists at `/api/events/[id]/export-text`

### 5. "I've Sent the Invites" Button (HIGH PRIORITY)

In CONFIRMING status, before invites are marked as sent, show a clear button to confirm the host has sent them.

This sets `inviteSendConfirmedAt` and starts the nudge countdown.

Reference: `InviteStatusSection.tsx` lines 577-590

API: Endpoint exists at `/api/events/[id]/confirm-invites-sent`

## What NOT to Add

Keep `/h/[token]` focused on CONFIRMING/FROZEN status management. Don't add:
- Team/item editing (that's DRAFT work, belongs on /plan)
- AI generation
- Setup checklist
- Full revision history
- GateCheck (DRAFT only)

The host magic link is for "invites are out, manage responses" — not "build the plan."

## UI Approach

Don't try to replicate `/plan/[eventId]` layout. Keep the existing `/h/[token]` structure and add sections:

```
[Header — event name, date, status badge]

[Status Banner — critical gaps, same as now]

[NEW: Invite Status Summary]
┌─────────────────────────────────────────┐
│ RESPONSES        28 of 43 (65%)         │
│ ████████████░░░░░░░                     │
│ 12 not sent · 3 sent · 8 opened         │
│                                         │
│ [I've sent the invites]  ← if not yet   │
└─────────────────────────────────────────┘

[NEW: People List]
┌─────────────────────────────────────────┐
│ 👁 Sarah Henderson (host)               │
│ ✓ Uncle Rob — Accepted                  │
│ 📤 Aunty Mei — Sent, not opened         │
│ 🕐 Grandma June — Not sent              │
│ ...                                     │
│ [Show all 43]                           │
└─────────────────────────────────────────┘

[Teams Grid — same as now]

[Action Bar — Freeze button, same as now]

[NEW: Copy as Text button — in header or footer]
```

Clicking a person opens a slide-over or modal with their detail and manual override options.

## API Changes

Modify `GET /api/h/[token]/route.ts` to include:

```typescript
// Add to response
inviteStatus: {
  total: number;
  notSent: number;
  sent: number;
  opened: number;
  responded: number;
  inviteSendConfirmedAt: string | null;
},
people: [
  {
    id: string;
    name: string;
    status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null;
    assignments: [...];
  }
]
```

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] In CONFIRMING status, host sees invite summary with counts
- [ ] Host sees people list with status icons
- [ ] Clicking a person shows their assignments
- [ ] Host can mark PENDING assignments as confirmed/declined
- [ ] "I've sent the invites" button appears before invites are confirmed
- [ ] "Copy as text" produces readable output
- [ ] All features work on mobile (tap targets, responsive layout)
- [ ] Demo walkthrough makes sense with new UI

## Do Not Touch

- `/plan/[eventId]` — leave the full dashboard as-is
- Coordinator view (`/c/[token]`)
- Participant view (`/p/[token]`)
- Any API routes except `/api/h/[token]/route.ts`
- Database schema
```


From CC

                                                                                               
 Here is Claude's plan:                                                                        
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan: Enhance Host Magic Link View (/h/[token])        

 Context

 Hosts arriving via magic link land on /h/[token] — a lightweight team status view. Key
 management features (invite tracking, manual overrides, export) live on /plan/[eventId] which
  requires session auth. Magic link hosts can't reach these. This change brings those features
  to /h/[token] without requiring login.

 Critical finding: requireEventRole (used by all /api/events/... routes) requires a session —
 no dev bypass. Magic link hosts WILL get 401. All new API calls from /h/[token] must use
 /api/h/[token]/... routes that authenticate via resolveToken instead.

 Files to Modify

 - src/app/api/h/[token]/route.ts — add invite status + people to GET response
 - src/app/h/[token]/page.tsx — add UI sections

 Files to Create

 - src/app/api/h/[token]/confirm-invites-sent/route.ts
 - src/app/api/h/[token]/export-text/route.ts
 - src/app/api/h/[token]/people/[personId]/manual-override/route.ts
 - src/components/h/HostPersonModal.tsx

 Do Not Touch

 - /plan/[eventId] page or components
 - /api/events/... routes
 - /c/[token], /p/[token] views

 ---
 1. Modify /api/h/[token]/route.ts

 Add a conditional invite status query when event.status === 'CONFIRMING'. Reuse the same
 query pattern from invite-status/route.ts.

 New query (inside GET handler, after teams query):
 let inviteStatus = null;
 let people = null;

 if (context.event.status === 'CONFIRMING') {
   const eventWithPeople = await prisma.event.findUnique({
     where: { id: context.event.id },
     select: {
       inviteSendConfirmedAt: true,
       people: {
         select: {
           rsvpStatus: true,
           person: {
             select: {
               id: true,
               name: true,
               inviteAnchorAt: true,
               tokens: {
                 where: { scope: 'PARTICIPANT', eventId: context.event.id },
                 select: { openedAt: true },
               },
               assignments: {
                 where: { item: { team: { eventId: context.event.id } } },
                 select: { response: true },
               },
             },
           },
         },
       },
     },
   });

   const peopleStatus = eventWithPeople.people.map((pe) => {
     const person = pe.person;
     const token = person.tokens[0];
     const hasResponded = person.assignments.some((a) => a.response !== 'PENDING');

     let status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
     if (hasResponded) status = 'RESPONDED';
     else if (token?.openedAt) status = 'OPENED';
     else if (person.inviteAnchorAt) status = 'SENT';
     else status = 'NOT_SENT';

     const responses = person.assignments.map((a) => a.response);
     let response: 'PENDING' | 'ACCEPTED' | 'DECLINED' = 'PENDING';
     if (responses.length > 0) {
       if (responses.every((r) => r === 'ACCEPTED')) response = 'ACCEPTED';
       else if (responses.some((r) => r === 'DECLINED')) response = 'DECLINED';
     }

     return { id: person.id, name: person.name, status, response, rsvpStatus: pe.rsvpStatus };
   });

   inviteStatus = {
     total: peopleStatus.length,
     notSent: peopleStatus.filter((p) => p.status === 'NOT_SENT').length,
     sent: peopleStatus.filter((p) => p.status === 'SENT').length,
     opened: peopleStatus.filter((p) => p.status === 'OPENED').length,
     responded: peopleStatus.filter((p) => p.status === 'RESPONDED').length,
     inviteSendConfirmedAt: eventWithPeople.inviteSendConfirmedAt?.toISOString() ?? null,
   };
   people = peopleStatus;
 }

 Add to return value:
 return NextResponse.json({
   // ... existing fields ...
   inviteStatus,
   people,
 });

 ---
 2. Create /api/h/[token]/confirm-invites-sent/route.ts

 Token-authenticated version of confirm-invites-sent. Replicates logic from
 /api/events/[id]/confirm-invites-sent/route.ts but uses resolveToken instead of
 requireEventRole.

 import { NextRequest, NextResponse } from 'next/server';
 import { resolveToken } from '@/lib/auth';
 import { prisma } from '@/lib/prisma';
 import { logInviteEvent } from '@/lib/invite-events';

 export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
   const context = await resolveToken(params.token);
   if (!context || context.scope !== 'HOST') {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
   }

   const eventId = context.event.id;
   const event = await prisma.event.findUnique({
     where: { id: eventId },
     include: { people: { include: { person: { select: { id: true, inviteAnchorAt: true } } }
 } },
   });

   if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (event.status !== 'CONFIRMING') {
     return NextResponse.json({ error: 'Event must be in CONFIRMING status' }, { status: 400
 });
   }

   const now = new Date();
   await prisma.event.update({ where: { id: eventId }, data: { inviteSendConfirmedAt: now }
 });

   const needAnchor = event.people.filter((pe) => !pe.person.inviteAnchorAt).map((pe) =>
 pe.person.id);
   if (needAnchor.length > 0) {
     await prisma.person.updateMany({ where: { id: { in: needAnchor } }, data: {
 inviteAnchorAt: now } });
   }

   await logInviteEvent({
     eventId,
     type: 'INVITE_SEND_CONFIRMED',
     metadata: { totalPeople: event.people.length, newAnchorsSet: needAnchor.length },
   });

   return NextResponse.json({ success: true, confirmedAt: now.toISOString() });
 }

 ---
 3. Create /api/h/[token]/people/[personId]/manual-override/route.ts

 Mirrors /api/events/[id]/people/[personId]/manual-override/route.ts with token auth.

 import { NextRequest, NextResponse } from 'next/server';
 import { resolveToken } from '@/lib/auth';
 import { prisma } from '@/lib/prisma';
 import { logInviteEvent } from '@/lib/invite-events';

 export async function POST(
   request: NextRequest,
   { params }: { params: { token: string; personId: string } }
 ) {
   const context = await resolveToken(params.token);
   if (!context || context.scope !== 'HOST') {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
   }

   const { personId } = params;
   const eventId = context.event.id;

   let response: 'ACCEPTED' | 'DECLINED', reason = '';
   try {
     const body = await request.json();
     response = body.response;
     reason = body.reason || (response === 'ACCEPTED' ? 'Manual confirmation by host' :
 'Manual decline by host');
   } catch {
     return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
   }

   if (!['ACCEPTED', 'DECLINED'].includes(response)) {
     return NextResponse.json({ error: 'response must be ACCEPTED or DECLINED' }, { status:
 400 });
   }

   const person = await prisma.person.findUnique({ where: { id: personId } });
   if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

   const updated = await prisma.assignment.updateMany({
     where: { personId, item: { team: { eventId } }, response: { not: response } },
     data: { response },
   });

   await logInviteEvent({
     eventId, personId, type: 'MANUAL_OVERRIDE_MARKED',
     metadata: { response, reason, assignmentsUpdated: updated.count },
   });

   return NextResponse.json({ success: true, assignmentsUpdated: updated.count });
 }

 ---
 4. Create /api/h/[token]/export-text/route.ts

 Mirrors /api/events/[id]/export-text/route.ts with token auth.

 Same query and formatting logic, returns { eventName, eventDate, people[] } identical to the
 events version. CopyPlanAsText.tsx's formatPlanAsText function can be extracted into a shared
  utility, or inlined — see section 6.

 ---
 5. Create src/components/h/HostPersonModal.tsx

 Simplified person detail modal for the h/ view. Does NOT reuse PersonInviteDetailModal (which
  hardcodes session-auth API URLs).

 Props:
 interface Props {
   token: string;
   person: { id: string; name: string; status: string; response: string };
   onClose: () => void;
   onUpdate: () => void;
 }

 Renders:
 - Person name + current status badge (NOT_SENT / SENT / OPENED / RESPONDED)
 - Current response (PENDING / ACCEPTED / DECLINED)
 - If response is PENDING: shows two-step flow:
   a. "Manual response" button reveals the form
   b. Reason textarea (required)
   c. "Mark as Declined" + "Mark as Confirmed" buttons
 - If ACCEPTED: "✓ Confirmed" label
 - If DECLINED: "✗ Declined" label with option to re-confirm

 API call: POST /api/h/${token}/people/${person.id}/manual-override

 ---
 6. Modify src/app/h/[token]/page.tsx

 New types added to HostData:

 inviteStatus: {
   total: number; notSent: number; sent: number;
   opened: number; responded: number;
   inviteSendConfirmedAt: string | null;
 } | null;
 people: {
   id: string; name: string;
   status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
   response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
   rsvpStatus: string;
 }[] | null;

 New state:

 const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);
 const [confirmingSent, setConfirmingSent] = useState(false);
 const [showAllPeople, setShowAllPeople] = useState(false);
 const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');

 New handler — confirm sent:

 const handleConfirmSent = async () => {
   setConfirmingSent(true);
   await fetch(`/api/h/${token}/confirm-invites-sent`, { method: 'POST' });
   setConfirmingSent(false);
   fetchData(); // refresh
 };

 New handler — copy plan:

 const handleCopyPlan = async () => {
   setCopyState('copying');
   const res = await fetch(`/api/h/${token}/export-text`);
   const planData = await res.json();
   const text = formatPlanAsText(planData); // inline the formatter
   await navigator.clipboard.writeText(text);
   setCopyState('copied');
   setTimeout(() => setCopyState('idle'), 2000);
 };

 formatPlanAsText is inlined from CopyPlanAsText.tsx (not exported there, so must be
 duplicated — this is acceptable given it's 20 lines of formatting logic).

 New UI sections (insertion order in render):

 A. Copy Plan button — in header, next to Audit Log:
 <button onClick={handleCopyPlan} className="px-3 py-1 bg-gray-100 text-gray-700 text-sm
 rounded hover:bg-gray-200">
   {copyState === 'copied' ? '✓ Copied!' : copyState === 'copying' ? '...' : '📋 Copy Plan'}
 </button>

 B. Invite Status Summary — after Status Banner, before Teams list (CONFIRMING only):
 {data.event.status === 'CONFIRMING' && data.inviteStatus && (
   <div className="bg-white border-b px-6 py-4 space-y-3">
     <div className="flex items-center justify-between">
       <h2 className="text-sm font-semibold uppercase tracking-wide
 text-gray-500">Responses</h2>
       <span className="text-2xl font-bold text-gray-900">
         {data.inviteStatus.responded}/{data.inviteStatus.total}
         <span className="text-sm font-normal text-gray-500 ml-1">
           ({pct}%)
         </span>
       </span>
     </div>
     {/* Multi-segment progress bar: responded/opened/sent/not-sent */}
     {/* Count row: X not sent · Y sent · Z opened */}
     {/* "I've sent the invites" button if !inviteSendConfirmedAt */}
   </div>
 )}

 C. People List — after Invite Summary (CONFIRMING only):
 {data.event.status === 'CONFIRMING' && data.people && (
   <div className="bg-white border-b px-6 py-4">
     <div className="flex items-center justify-between mb-3">
       <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">People</h2>
       <button onClick={() => setShowAllPeople(!showAllPeople)}>
         {showAllPeople ? 'Show less' : `Show all ${data.people.length}`}
       </button>
     </div>
     {(showAllPeople ? data.people : data.people.slice(0, 6)).map((person) => (
       <div key={person.id} onClick={() => setSelectedPerson(person)} className="...clickable
 row...">
         <StatusIcon status={person.status} />
         <span>{person.name}</span>
         <ResponseBadge response={person.response} />
       </div>
     ))}
   </div>
 )}

 D. HostPersonModal — at bottom of return (conditional):
 {selectedPerson && (
   <HostPersonModal
     token={token}
     person={selectedPerson}
     onClose={() => setSelectedPerson(null)}
     onUpdate={() => { setSelectedPerson(null); fetchData(); }}
   />
 )}

 ---
 Status Icon and Response Badge helpers

 Inline in page.tsx (below the component):
 - StatusIcon — maps NOT_SENT→Clock, SENT→Send, OPENED→Eye, RESPONDED→CheckCircle
 - ResponseBadge — maps PENDING→gray chip, ACCEPTED→green chip, DECLINED→red chip

 ---
 Verification Steps

 1. npm run typecheck — no errors
 2. npm run build — no build errors
 3. In CONFIRMING status, invite summary visible directly on page (no click required)
 4. Progress bar and counts accurate
 5. "I've sent the invites" button appears before inviteSendConfirmedAt is set; disappears
 after
 6. People list shows with correct status icons and response badges
 7. Clicking a person opens HostPersonModal
 8. Modal shows current status; PENDING shows override buttons + reason textarea
 9. "Mark as Confirmed"/"Mark as Declined" fires and refreshes data
 10. Copy Plan button copies formatted text to clipboard; "Copied!" state shows
 11. All features work on mobile (tested at 375px width)
 12. Demo walkthrough is coherent: host lands on page, sees counts, can take action




 # Host Magic Link View Enhancements

**Date:** 2026-02-21
**Scope:** `/h/[token]` — magic link host view
**Status:** Complete, `npm run typecheck` passes with zero errors

---

## Background

Hosts arriving via magic link land on `/h/[token]`. Key management features (invite tracking, manual response overrides, plan export) previously only existed on `/plan/[eventId]`, which requires a session login that magic link hosts don't have.

This change brings those features directly to `/h/[token]` without requiring login, using token-authenticated API routes (`resolveToken`) instead of session-authenticated ones (`requireEventRole`).

---

## Files Modified

### `src/app/api/h/[token]/route.ts`

The existing GET handler was extended to conditionally fetch invite tracking data when the event is in `CONFIRMING` status.

**Added to the response:**

- `inviteStatus` — summary counts:
  - `total`, `notSent`, `sent`, `opened`, `responded`
  - `inviteSendConfirmedAt` — ISO timestamp if the host has confirmed invites were sent, otherwise `null`
- `people` — per-person array:
  - `id`, `name`
  - `status`: `NOT_SENT | SENT | OPENED | RESPONDED`
  - `response`: `PENDING | ACCEPTED | DECLINED`
  - `rsvpStatus`

Both fields are `null` when the event is not in `CONFIRMING` status — no extra queries on other status states.

---

## Files Created

### `src/app/api/h/[token]/confirm-invites-sent/route.ts`

`POST` — Token-authenticated version of the existing `/api/events/[id]/confirm-invites-sent` route.

- Validates HOST scope via `resolveToken`
- Requires event to be in `CONFIRMING` status
- Sets `inviteSendConfirmedAt` on the event
- Sets `inviteAnchorAt` on any people who don't yet have one (used for nudge scheduling)
- Logs an `INVITE_SEND_CONFIRMED` invite event

---

### `src/app/api/h/[token]/people/[personId]/manual-override/route.ts`

`POST` — Token-authenticated version of the existing `/api/events/[id]/people/[personId]/manual-override` route.

- Validates HOST scope via `resolveToken`
- Accepts `{ response: 'ACCEPTED' | 'DECLINED', reason: string }` in the request body
- Updates all of the person's assignments for this event to the specified response
- Logs a `MANUAL_OVERRIDE_MARKED` invite event

---

### `src/app/api/h/[token]/export-text/route.ts`

`GET` — Token-authenticated version of the existing `/api/events/[id]/export-text` route.

- Validates HOST scope via `resolveToken`
- Returns `{ eventName, eventDate, people[] }` — identical shape to the session-auth version
- Used by the Copy Plan button on the host view

---

### `src/components/h/HostPersonModal.tsx`

A lightweight person detail modal purpose-built for the `/h/[token]` view.

**Does not reuse** `PersonInviteDetailModal` (which hardcodes session-auth API URLs).

**Features:**
- Displays person name, invite status badge, and response badge
- PENDING response: shows "Record manual response" button → expands a form with a required reason textarea + "Mark as Declined" / "Mark as Confirmed" buttons
- Non-PENDING response: shows override option with reason required
- Calls `POST /api/h/${token}/people/${personId}/manual-override`
- Mobile-friendly: slides up from the bottom on small screens, centred modal on larger screens

---

## Files Modified

### `src/app/h/[token]/page.tsx`

The host view page was extended with new types, state, handlers, and UI sections.

**New types added to `HostData`:**
- `inviteStatus: { total, notSent, sent, opened, responded, inviteSendConfirmedAt } | null`
- `people: PersonSummary[] | null`

**New state:**
- `selectedPerson` — person currently open in the modal
- `confirmingSent` — loading state for "I've sent the invites" button
- `showAllPeople` — toggle to show more than 6 people in the list
- `copyState` — `'idle' | 'copying' | 'copied'` for the copy plan button

**New handlers:**
- `handleConfirmSent` — calls `/api/h/${token}/confirm-invites-sent`, then refreshes data
- `handleCopyPlan` — fetches `/api/h/${token}/export-text`, formats the plan as text, writes to clipboard

**`formatPlanAsText`** inlined directly in `page.tsx` (duplicated from `CopyPlanAsText.tsx` — acceptable since the function is 20 lines and not exported from the original).

**New helper components** (inlined below the main export):
- `StatusIcon` — maps `NOT_SENT → Clock`, `SENT → Send`, `OPENED → Eye`, `RESPONDED → CheckCircle`
- `ResponseBadge` — maps `PENDING → gray chip`, `ACCEPTED → green chip`, `DECLINED → red chip`

**New UI sections (in render order):**

| Section | Condition | Location |
|---|---|---|
| Copy Plan button | Always | Header, next to Audit Log |
| Invite Status Summary | `CONFIRMING` + `inviteStatus` present | After status banner |
| People List | `CONFIRMING` + `people` present | After invite summary |
| HostPersonModal | `selectedPerson !== null` | Bottom of render tree |

**Invite Status Summary includes:**
- Responded/total counter with percentage
- Multi-segment progress bar (green = responded, amber = opened, blue = sent, gray = not sent)
- Count row: `X not sent · Y sent · Z opened · N responded`
- "I've sent the invites" button — visible until `inviteSendConfirmedAt` is set, then replaced by a confirmation timestamp

**People List:**
- Shows first 6 people by default
- "Show all N" toggle appears when there are more than 6
- Each row is clickable and opens `HostPersonModal`

---

## Architecture Notes

- All new `/api/h/[token]/...` routes authenticate via `resolveToken` (token in URL) — no session required
- The existing `/api/events/...` routes are untouched
- `/plan/[eventId]` and all its components are untouched
- `/c/[token]` and `/p/[token]` views are untouched
- The `inviteStatus` and `people` query only runs when `event.status === 'CONFIRMING'` — no overhead for other statuses
