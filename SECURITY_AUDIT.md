# Security Audit Report — Authentication Vulnerabilities

**Date:** 2026-01-19
**Auditor:** Claude Code Security Analysis
**Scope:** Authentication and authorization across all API routes

---

## Executive Summary

### Critical Findings

🚨 **CRITICAL:** 30+ API routes under `/api/events/[id]/*` have **ZERO authentication**. Anyone with an event ID can read, modify, or delete event data.

### Dual Authentication Systems Detected

The codebase implements TWO separate authentication systems:

1. **Session-based user authentication** (`getUser()`)
   - Used for: Event planning interface (`/plan/*` pages)
   - Implementation: HTTP-only cookies with session tokens
   - File: `src/lib/auth/session.ts`

2. **Token-based role authentication** (`resolveToken()`)
   - Used for: Magic-link shareable views (`/h/[token]`, `/c/[token]`, `/p/[token]`)
   - Implementation: AccessToken table with HOST/COORDINATOR/PARTICIPANT scopes
   - File: `src/lib/auth.ts`

### The Problem

Routes under `/api/events/[id]/*` are used by the planning interface but have **NO authentication checks**. Anyone can access these routes directly.

---

## Vulnerability Inventory

### CRITICAL: Unauthenticated Mutation Routes

| Route | Method | Vulnerability | Impact |
|-------|--------|---------------|--------|
| `/api/events/[id]/teams` | POST | No auth | Anyone can create teams |
| `/api/events/[id]/teams/[teamId]` | PATCH, DELETE | No auth | Anyone can modify/delete teams |
| `/api/events/[id]/people` | POST | No auth | Anyone can add people |
| `/api/events/[id]/people/[personId]` | PATCH, DELETE | No auth | Anyone can modify/delete people |
| `/api/events/[id]/items/[itemId]/assign` | POST, DELETE | No auth | Anyone can assign/unassign items |
| `/api/events/[id]/items/[itemId]` | PATCH, DELETE | No auth | Anyone can modify/delete items |
| `/api/events/[id]/generate` | POST | No auth | Anyone can trigger AI generation (cost attack) |
| `/api/events/[id]/check` | POST | No auth | Anyone can trigger AI conflict detection (cost attack) |
| `/api/events/[id]/transition` | POST | No auth | Anyone can change event status |
| `/api/events/[id]/archive` | POST | No auth | Anyone can archive events |
| `/api/events/[id]/restore` | POST | No auth | Anyone can restore events |

### HIGH: Unauthenticated Read Routes

| Route | Method | Vulnerability | Impact |
|-------|--------|---------------|--------|
| `/api/events/[id]` | GET | No auth | Anyone can read any event details |
| `/api/events/[id]/teams` | GET | No auth | Anyone can list all teams |
| `/api/events/[id]/people` | GET | No auth | Anyone can list all people (PII exposure) |
| `/api/events/[id]/items` | GET | No auth | Anyone can list all items |
| `/api/events/[id]/conflicts` | GET | No auth | Anyone can read conflict data |
| `/api/events/[id]/revisions` | GET | No auth | Anyone can read revision history |

### MEDIUM: Missing Server-Side Validation

| Route | Issue | Impact |
|-------|-------|--------|
| `/api/c/[token]/items` | POST | No FROZEN state validation | Frontend hides button, backend allows |
| `/api/c/[token]/items/[itemId]` | PATCH, DELETE | No FROZEN state validation | Coordinator can bypass freeze |
| `/api/c/[token]/items/[itemId]/assign` | POST, DELETE | No FROZEN state validation | Assignments modifiable when frozen |

---

## Properly Protected Routes ✅

These routes **DO** have authentication:

1. **POST /api/events** - Session auth + entitlement check
2. **PATCH /api/events/[id]** - Session auth + `canEditEvent()` check
3. **DELETE /api/events/[id]** - Session auth + `canEditEvent()` check
4. **POST /api/c/[token]/items** - Token auth + COORDINATOR scope validation
5. **All /api/h/[token]/* routes** - Token auth + HOST scope validation
6. **All /api/p/[token]/* routes** - Token auth + PARTICIPANT scope validation

---

## Attack Scenarios

### Scenario 1: Unauthorized Event Access
```bash
# Attacker guesses or observes event ID
curl https://app.gather.com/api/events/cm123456789/teams
# Returns all team data without authentication
```

### Scenario 2: Malicious Modification
```bash
# Attacker creates team in someone else's event
curl -X POST https://app.gather.com/api/events/cm123456789/teams \
  -H "Content-Type: application/json" \
  -d '{"name":"Malicious Team","scope":"Attack","coordinatorId":"cm999999999"}'
# Team created successfully, no auth check
```

### Scenario 3: Cost Attack via AI
```bash
# Attacker triggers expensive AI generation repeatedly
while true; do
  curl -X POST https://app.gather.com/api/events/cm123456789/generate \
    -H "Content-Type: application/json" \
    -d '{"occasionType":"CHRISTMAS","guestCount":50}'
  sleep 1
done
# Racks up Anthropic API costs, no auth or rate limiting
```

### Scenario 4: PII Exposure
```bash
# Attacker enumerates event IDs and harvests participant data
for id in cm{000000000..999999999}; do
  curl https://app.gather.com/api/events/$id/people >> people_data.json
done
# Collects names, emails, phone numbers from all events
```

---

## Root Cause Analysis

### Why This Happened

1. **Dual Auth Pattern Confusion**
   - Session auth (`getUser()`) exists but wasn't applied to `/api/events/[id]/*` routes
   - Token auth (`resolveToken()`) only used for shareable magic-link views
   - No consistent auth middleware or guards

2. **Incomplete Migration**
   - Original spec called for token-based auth only
   - Codebase evolved to add user accounts/sessions
   - `/api/events/[id]/*` routes created without auth checks

3. **No Default-Deny**
   - Routes default to public access
   - No global middleware enforcing authentication
   - Each route must manually add auth checks

---

## Recommended Fix Strategy

### Approach: Fail-Closed Auth Guards

Create reusable guard functions that enforce authentication + authorization:

```typescript
// src/lib/auth/guards.ts

/**
 * Requires authenticated user session + event role.
 * Returns 401 if no session, 403 if no event role.
 */
export async function requireEventRole(
  eventId: string,
  allowedRoles: ('HOST' | 'COHOST' | 'COORDINATOR')[]
): Promise<{ user: User; role: EventRole } | Response>

/**
 * Requires valid access token with specific scope.
 * Returns 401 if invalid token, 403 if wrong scope.
 */
export async function requireTokenScope(
  token: string,
  scope: TokenScope
): Promise<AuthContext | Response>

/**
 * Validates event status allows mutation.
 * Returns 403 if frozen and not allowed.
 */
export function requireNotFrozen(
  event: Event,
  allowOverride?: boolean
): void | Response
```

### Implementation Priority

**Phase 1: Critical Mutations (4 hours)**
- `/api/events/[id]/teams` - POST, PATCH, DELETE
- `/api/events/[id]/people` - POST, PATCH, DELETE
- `/api/events/[id]/items/[itemId]/assign` - POST, DELETE
- `/api/events/[id]/transition` - POST
- `/api/events/[id]/generate` - POST
- `/api/events/[id]/check` - POST

**Phase 2: Read Endpoints (2 hours)**
- `/api/events/[id]` - GET
- `/api/events/[id]/teams` - GET
- `/api/events/[id]/people` - GET
- `/api/events/[id]/items` - GET

**Phase 3: Frozen State Validation (2 hours)**
- `/api/c/[token]/items` - POST
- `/api/c/[token]/items/[itemId]` - PATCH, DELETE
- `/api/c/[token]/items/[itemId]/assign` - POST, DELETE

**Phase 4: Testing (4 hours)**
- Automated tests for each vulnerability
- Manual curl verification
- Load testing for AI cost attacks

---

## Success Criteria

✅ All `/api/events/[id]/*` routes require authentication
✅ Correct authorization level enforced (HOST/COHOST/COORDINATOR)
✅ Frozen state prevents mutations server-side (not just UI)
✅ Tests prove vulnerabilities are fixed
✅ Curl commands verify each protection

---

## Testing Checklist

### Authentication Tests
- [ ] GET /api/events/[id] without session → 401
- [ ] POST /api/events/[id]/teams without session → 401
- [ ] POST /api/events/[id]/teams with wrong user → 403
- [ ] POST /api/events/[id]/teams with valid HOST role → 201

### Authorization Tests
- [ ] COORDINATOR cannot modify other events → 403
- [ ] COHOST can modify event → 200
- [ ] Non-role user cannot access event → 403

### Frozen State Tests
- [ ] POST /api/c/[token]/items when FROZEN → 403
- [ ] PATCH /api/c/[token]/items/[itemId] when FROZEN → 403
- [ ] DELETE /api/c/[token]/items/[itemId] when FROZEN → 403

### Cost Attack Prevention
- [ ] Repeated /generate calls without auth → 401 (not 200)
- [ ] Repeated /check calls without auth → 401 (not 200)

---

## Next Steps

1. Create `src/lib/auth/guards.ts` with reusable guard functions
2. Apply `requireEventRole()` to all `/api/events/[id]/*` mutation routes
3. Apply `requireNotFrozen()` to coordinator mutation routes
4. Write tests proving all vulnerabilities are fixed
5. Document verification steps with curl commands
6. Update API documentation with auth requirements

---

**End of Security Audit**
