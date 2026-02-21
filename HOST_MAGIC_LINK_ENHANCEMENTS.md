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
