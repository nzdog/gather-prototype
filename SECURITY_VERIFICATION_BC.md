# Security Verification: Conditions B & C

**Generated:** 2026-01-19
**Status:** ✅ AUTOMATED TESTS PASS (8/8)

## Overview

This document provides manual verification procedures for security Conditions B and C:

- **Condition B**: Route protection consistency - all mutation routes must be fail-closed
  - 401 for missing/invalid authentication
  - 403 for insufficient authorization

- **Condition C**: Authorization correctness
  - Wrong scope returns 403
  - Wrong team returns 403
  - Frozen server-side enforcement (coordinator mutations blocked with 403)

## Prerequisites

1. Start dev server: `npm run dev`
2. Generate test fixtures: `npx tsx tests/security-fixtures.ts`
3. Copy the output tokens and IDs for use in curl commands below

## Test Fixtures Reference

After running `npx tsx tests/security-fixtures.ts`, you'll receive:

```
user.sessionCookie: session=<SESSION_TOKEN>
host.token: <HOST_TOKEN>
teamA.coordinator.token: <COORD_A_TOKEN>
teamB.coordinator.token: <COORD_B_TOKEN>
teamA.participant.token: <PART_A_TOKEN>
eventDraft.id: <EVENT_DRAFT_ID>
eventFrozen.id: <EVENT_FROZEN_ID>
teamA.id: <TEAM_A_ID>
teamB.id: <TEAM_B_ID>
teamB.items[0].id: <TEAM_B_ITEM_ID>
```

Replace these placeholders in the curl commands below.

---

## Condition B: Route Protection (Fail-Closed)

### B.1: No Auth Returns 401

#### Test: POST /api/events (session required)
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Event","startDate":"2026-06-01","endDate":"2026-06-03"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized`

#### Test: POST /api/events/:id/teams (session required)
```bash
curl -X POST http://localhost:3000/api/events/<EVENT_DRAFT_ID>/teams \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Team"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized`

#### Test: POST /api/c/:token/items (invalid token)
```bash
curl -X POST http://localhost:3000/api/c/INVALID_TOKEN_12345/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Item","teamId":"<TEAM_A_ID>"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized` or `403 Forbidden`

---

### B.2: Invalid Auth Returns 401

#### Test: Invalid session cookie
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Cookie: session=INVALID_SESSION_TOKEN" \
  -d '{"name":"Test Event","startDate":"2026-06-01","endDate":"2026-06-03"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized`

#### Test: Invalid coordinator token
```bash
curl -X POST http://localhost:3000/api/c/INVALID_COORDINATOR_TOKEN/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Item","teamId":"<TEAM_A_ID>"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized` or `403 Forbidden`

---

## Condition C: Authorization Correctness

### C.1: Wrong Scope Returns 403

#### Test: Participant token used on coordinator endpoint
```bash
curl -X POST http://localhost:3000/api/c/<PART_A_TOKEN>/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Unauthorized Item","teamId":"<TEAM_A_ID>"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `401 Unauthorized` or `403 Forbidden`

**Explanation:** Participant tokens should not work on `/api/c/:token/*` endpoints which require COORDINATOR scope.

---

### C.2: Wrong Team Returns 403

#### Test: Team A coordinator tries to mutate Team B item
```bash
curl -X PATCH http://localhost:3000/api/c/<COORD_A_TOKEN>/items/<TEAM_B_ITEM_ID> \
  -H "Content-Type: application/json" \
  -d '{"name":"Hacked Name"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `403 Forbidden` or `404 Not Found`

**Explanation:** Coordinators are team-scoped. Team A coordinator should not be able to modify Team B items.

---

### C.3: Frozen Enforcement (Server-Side)

#### Test: Coordinator cannot create items when event is FROZEN

**Setup:**
1. The automated test creates a coordinator token for the FROZEN event
2. Manual testing can use the frozen event created by fixtures

```bash
# First, you need a coordinator token for the frozen event
# Run the frozen enforcement test to set this up:
npx tsx tests/security-bc-verification.ts

# Then test creating an item (this will fail with 403)
curl -X POST http://localhost:3000/api/c/<FROZEN_COORDINATOR_TOKEN>/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Should Fail","teamId":"<FROZEN_TEAM_ID>"}' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected:** `403 Forbidden`

**Explanation:** When an event's status is FROZEN, coordinator mutations (create/update/delete items, assignments) must be blocked server-side.

---

## Verification Checklist

Use this checklist to manually verify security conditions:

### Condition B: Route Protection
- [ ] POST /api/events without auth → 401
- [ ] POST /api/events/:id/teams without auth → 401
- [ ] POST /api/c/INVALID/items → 401/403
- [ ] POST /api/events with invalid session → 401
- [ ] POST /api/c/INVALID/items with invalid token → 401/403

### Condition C: Authorization
- [ ] Participant token on coordinator endpoint → 401/403
- [ ] Team A coordinator mutating Team B item → 403/404
- [ ] Coordinator creating items in FROZEN event → 403

---

## Automated Test Suite

Run the full automated test suite:

```bash
npx tsx tests/security-bc-verification.ts
```

**Current Status:** ✅ All 8 tests passing

Test suites:
1. No-Auth Fail-Closed (401) - 3 tests
2. Invalid Auth Fail-Closed (401) - 2 tests
3. Wrong Scope Returns 403 - 1 test
4. Wrong Team Returns 403 - 1 test
5. Frozen Enforcement (403) - 1 test

---

## Additional Security Routes

See `SECURITY_ROUTE_INVENTORY.md` for the complete inventory of 74 routes, including:
- 34 mutation routes
- 11 SESSION auth routes
- 10 TOKEN auth routes
- Frozen enforcement rules

---

## Security Notes

### Fail-Closed Principle
All routes MUST deny access by default. If authentication or authorization fails at any step, the request must be rejected with 401 (auth failed) or 403 (insufficient permissions).

### Team Isolation
Coordinators are scoped to their team. Cross-team mutations must be prevented at the data access layer.

### Frozen State Enforcement
When `event.status === 'FROZEN'`, coordinator mutations are blocked. The `requireNotFrozen()` helper enforces this:
- Used in: `/api/c/:token/items/*` routes
- Used in: `/api/events/:id/items/:itemId/assign` route
- Returns: 403 Forbidden with message "Cannot modify event in FROZEN state"

### Host Override
Some routes allow `requireNotFrozen(event, true)` which permits HOST to override frozen state. Coordinators never have this privilege.

---

## Troubleshooting

### "Server not running" error
Start the dev server: `npm run dev`

### "Unique constraint failed" error
Clean up old fixtures: The fixtures script includes cleanup, but if issues persist:
```bash
# Delete old test data manually via Prisma Studio
npx prisma studio
```

### Token expired
Regenerate fixtures: `npx tsx tests/security-fixtures.ts`

---

## Related Files

- `tests/security-fixtures.ts` - Test data generator
- `tests/security-bc-verification.ts` - Automated test suite
- `SECURITY_ROUTE_INVENTORY.md` - Complete route inventory
- `scripts/analyze-routes.ts` - Route analyzer tool
