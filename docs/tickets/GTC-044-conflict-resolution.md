---
ticket: GTC-044-conflict-resolution
title: "Remove current-user-id hardcode in ConflictList"
status: closed
branch: gtc-042-part1-nudge-schema
commit: 0961344
moment: null
type: build
depends_on: 
  - "[[GTC-043]]"
blocks: []
tags:
  - build
  - conflicts
  - auth
---

# [[GTC-044]] — Remove current-user-id hardcode in ConflictList — CLOSED

**Status:** Complete
**Branch:** gtc-042-part1-nudge-schema
**Commit:** 0961344

### What was found

Three instances of `current-user-id` in the codebase:

1. `src/components/plan/ConflictList.tsx:37` — hardcoded in `resolvedBy` field of conflict resolve API call
2. `src/components/plan/ConflictList.tsx:128` — hardcoded in `acknowledgedBy` field of conflict acknowledge API call
3. `docs/05_ops/testing/phase-3-testing-guide.md:279` — documentation noting it as a known limitation

Root cause: placeholder string was left in during initial conflict resolution implementation. The authenticated user's ID (`event.hostId`) was already available in the parent page component but was never threaded through to `ConflictList`.

### What was changed

**`src/components/plan/ConflictList.tsx`**
- Added `hostId: string` to `ConflictListProps` interface
- Added `hostId` to destructured props
- Replaced `'current-user-id'` with `hostId` in `handleResolve` (line 37)
- Replaced `'current-user-id'` with `hostId` in `handleAcknowledgeSubmit` (line 128)

**`src/app/plan/[eventId]/page.tsx`**
- Added `hostId={event?.hostId ?? ''}` prop to both `<ConflictList>` call sites (lines 1681 and 1878)

**`docs/05_ops/testing/phase-3-testing-guide.md`**
- Updated known limitation entry to reflect this is now resolved ([[GTC-044]])

### Auth / data source used

`event.hostId` — the host's user ID, already loaded from the API in the event page component and used throughout the page for other authenticated operations (tokens, invite status, revision history, etc.). This is the same identity source established in [[GTC-043]].

### Known limitations / follow-up flags

- None. The `hostId` is reliably available whenever `event` is loaded, which is a precondition for the conflict list being rendered.
- A separate [[GTC-044]] ticket (filed as follow-up from [[GTC-043]]) exists for replacing localStorage-based `hostId` lookups in settings/templates pages — that is a distinct issue.

### Assertions met

- [x] No instances of current-user-id remain outside comments or test fixtures
- [x] Conflict resolution passes real authenticated user ID (`event.hostId`)
- [x] Security suite 16/16 passing

### Evidence

- Grep output: zero matches for `current-user-id` across entire codebase
- Security suite: 16/16 passed
- Commit: 0961344
