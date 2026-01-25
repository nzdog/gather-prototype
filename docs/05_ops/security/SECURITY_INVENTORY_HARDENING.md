# Security Inventory Hardening Report

**Date:** 2026-01-19
**Mission:** ELIMINATE UNKNOWN auth classification and HARD-GATE critical security vulnerabilities

---

## Executive Summary

### Critical Findings 🚨

**30 CRITICAL SECURITY VIOLATIONS** discovered during automated inventory audit:
- **21 mutation routes** with NO authentication
- **4 AI/high-cost routes** with NO authentication
- **5 sensitive data routes** with NO authentication
- **3 routes with WEAK authentication** (query param without session validation)

### Impact

Anyone on the internet can:
- Mutate event data (create, update, delete items, teams, people)
- Trigger expensive AI operations (generate, regenerate, check)
- Access sensitive PII (people, assignments, tokens)
- Modify templates and AI memory without authorization

---

## Before/After Statistics

### Authentication Classification

| Auth Type | Before (UNKNOWN) | After (Classified) | Change |
|-----------|------------------|---------------------|--------|
| SESSION | 11 | 10 | -1 |
| TOKEN | 10 | 11 | +1 |
| CUSTOM | 0 | 2 | +2 |
| PUBLIC | 2 | 6 | +4 |
| WEAK_PARAM | 0 | 3 | +3 (flagged) |
| NONE | 0 | 42 | +42 🚨 |
| **UNKNOWN** | **51** | **0** | **-51** ✅ |

### Route Risk Classification

| Risk Category | Count | Status |
|--------------|-------|--------|
| **CRITICAL** | 30 | 🚨 Blocked by CI gate |
| High Priority | 8 | ⚠️ Flagged for review |
| Medium Priority | 13 | ⚠️ Weak auth patterns |
| Low Priority | 23 | ℹ️ Properly authenticated |

---

## Critical Routes with NO Authentication

### Mutation Routes (21)

Routes that modify data without any authentication:

1. `POST /events/:id/archive` - Archive events
2. `POST /events/:id/check` - Run AI conflict check (HIGH_COST)
3. `POST /events/:id/conflicts/:conflictId/acknowledge` - Acknowledge conflicts
4. `POST /events/:id/conflicts/:conflictId/delegate` - Delegate conflicts
5. `POST /events/:id/conflicts/:conflictId/dismiss` - Dismiss conflicts
6. `POST /events/:id/conflicts/:conflictId/execute-resolution` - Execute resolutions
7. `POST /events/:id/conflicts/:conflictId/resolve` - Resolve conflicts
8. `POST /events/:id/generate` - Generate plan with AI (HIGH_COST)
9. `PATCH /events/:id/items/:itemId` - Update items
10. `DELETE /events/:id/items/:itemId` - Delete items
11. `POST /events/:id/items/mark-for-review` - Mark items for review
12. `PATCH /events/:id/people/:personId` - Update people (SENSITIVE)
13. `DELETE /events/:id/people/:personId` - Delete people (SENSITIVE)
14. `POST /events/:id/people/batch-import` - Batch import people (SENSITIVE)
15. `POST /events/:id/regenerate` - Regenerate plan with AI (HIGH_COST)
16. `POST /events/:id/restore` - Restore archived events
17. `POST /events/:id/review-items` - Submit item reviews
18. `POST /events/:id/suggestions/:suggestionId/accept` - Accept AI suggestions
19. `POST /events/:id/suggestions/:suggestionId/dismiss` - Dismiss AI suggestions
20. `DELETE /events/:id/teams/:teamId` - Delete teams
21. `POST /events/:id/teams/:teamId/items` - Create team items
22. `PATCH /memory/settings` - Update AI memory settings
23. `POST /templates/:id/clone` - Clone templates

### AI/High-Cost Routes (4)

Routes that trigger expensive AI operations without auth:

1. `POST /events/:id/check` - AI conflict detection
2. `POST /events/:id/generate` - AI plan generation
3. `POST /events/:id/regenerate` - AI plan regeneration
4. `POST /events/:id/regenerate/preview` - AI regeneration preview

**Cost Impact:** Unlimited AI usage for any attacker

### Sensitive Data Routes (5)

Routes that expose PII without authentication:

1. `PATCH /events/:id/people/:personId` - Exposes name, email, phone
2. `POST /events/:id/people/batch-import` - Batch PII operations
3. `GET /demo/tokens` - Exposes access tokens
4. `GET /events/:id/assignments` - Exposes who-has-what data
5. `POST /events/:id/people/auto-assign` - Automated people assignment

---

## Weak Authentication Patterns

### WEAK_PARAM Routes (3)

Routes using query parameters without session validation:

1. `GET /memory?hostId={hostId}` - Anyone can read any host's AI memory
2. `DELETE /memory?hostId={hostId}` - Anyone can delete any host's AI memory
3. `GET /templates/:id?hostId={hostId}` - Anyone can read any host's templates
4. `DELETE /templates/:id?hostId={hostId}` - Anyone can delete any host's templates

**Vulnerability:** Attacker can enumerate hostIds and access/delete data for all users.

---

## Tools Created

### 1. Triage Script
**File:** `scripts/triage-unknown-routes.ts`

Categorizes UNKNOWN routes by risk:
- MUTATION (writes)
- HIGH_COST (AI operations)
- SENSITIVE_READ (PII)
- ADMIN/ACCOUNT (auth, billing, memory)
- LOW_RISK

**Usage:**
```bash
npx tsx scripts/triage-unknown-routes.ts
```

### 2. Classification Script
**File:** `scripts/classify-routes.ts`

Analyzes each route file to determine auth type by code inspection:
- Detects `getUser()`, `requireEventRole()` → SESSION
- Detects `resolveToken()`, `requireTokenScope()` → TOKEN
- Detects hostId/personId query params → WEAK_PARAM
- Detects no auth checks → NONE
- Identifies webhooks/public endpoints → PUBLIC

**Usage:**
```bash
npx tsx scripts/classify-routes.ts
```

**Output:** `route-classifications.json` (programmatic access to all classifications)

### 3. Hard Gate Test
**File:** `tests/security-inventory-gate.ts`

**FAILS CI** if any of these conditions are met:
- Mutation route with NO or WEAK auth
- AI/high-cost route with NO or WEAK auth
- Sensitive data route with NO or WEAK auth

**Usage:**
```bash
npm run test:security:inventory
```

**Exit Codes:**
- `0` - All gates passed
- `1` - Critical violations found (blocks deployment)

---

## NPM Scripts Added

```json
{
  "test:security:bc": "tsx tests/security-bc-verification.ts",
  "test:security:classify": "tsx scripts/classify-routes.ts",
  "test:security:inventory": "tsx scripts/classify-routes.ts && tsx tests/security-inventory-gate.ts",
  "test:security:all": "npm run test:security && npm run test:security:bc && npm run test:security:inventory"
}
```

**Run all security tests:**
```bash
npm run test:security:all
```

---

## CI Integration

### Recommended GitHub Actions Workflow

Add to `.github/workflows/security.yml`:

```yaml
name: Security Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run security tests
        run: npm run test:security:all
```

### Blocking Deployments

The `test:security:inventory` gate will **FAIL CI** if critical vulnerabilities exist:

```bash
$ npm run test:security:inventory

🚨 CRITICAL SECURITY ISSUES:
  - 21 mutation routes with NO authentication
  - 4 AI/high-cost routes with NO authentication
  - 5 sensitive routes with NO authentication

✗ SECURITY GATE FAILED
Cannot deploy: 3 critical security issues found

Exit code: 1
```

---

## Remediation Plan

### Phase 1: Critical Mutations (P0 - Deploy Blocker)

Add SESSION auth to all event mutation routes:

```typescript
import { getUser } from '@/lib/auth/session';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // REQUIRED: Authenticate user
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // REQUIRED: Verify user has HOST role for this event
  const authError = await requireEventRole(user.id, eventId, ['HOST']);
  if (authError) return authError;

  // ... rest of handler
}
```

**Routes to fix:**
- All 21 mutation routes listed above

**Time Estimate:** 1-2 days

### Phase 2: AI/High-Cost Routes (P0 - Cost Risk)

Add SESSION auth to AI routes to prevent abuse:

**Routes to fix:**
- `POST /events/:id/check`
- `POST /events/:id/generate`
- `POST /events/:id/regenerate`
- `POST /events/:id/regenerate/preview`

**Time Estimate:** 4 hours

### Phase 3: Sensitive Data Routes (P1 - Privacy Risk)

Add SESSION auth to PII routes:

**Routes to fix:**
- `GET /events/:id/assignments`
- `POST /events/:id/people/auto-assign`
- `GET /demo/tokens` (or disable in production)

**Time Estimate:** 2 hours

### Phase 4: Weak Auth Routes (P1 - Enumeration Risk)

Replace query param auth with session validation:

**Before:**
```typescript
const hostId = searchParams.get('hostId');
// Anyone can pass any hostId!
```

**After:**
```typescript
const user = await getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Use authenticated user's ID, not query param
const hostId = user.id;
```

**Routes to fix:**
- `GET /memory`
- `DELETE /memory`
- `GET /templates/:id`
- `DELETE /templates/:id`
- `GET /memory/patterns`
- `PATCH /memory/settings`

**Time Estimate:** 3 hours

---

## Verification Commands

### Run All Security Tests
```bash
npm run test:security:all
```

### Individual Test Suites
```bash
# Existing security validation (16 tests)
npm run test:security

# BC verification (8 tests)
npm run test:security:bc

# Inventory classification + gate
npm run test:security:inventory
```

### Regenerate Classifications
```bash
npx tsx scripts/classify-routes.ts > /dev/null
cat route-classifications.json | jq '.[] | select(.securityIssues | length > 0)'
```

---

## Remaining UNKNOWN Routes

### Status: ✅ ZERO UNKNOWN ROUTES

All 74 routes have been classified:
- **SESSION:** 10 routes
- **TOKEN:** 11 routes
- **CUSTOM:** 2 routes
- **PUBLIC:** 6 routes
- **WEAK_PARAM:** 3 routes (flagged)
- **NONE:** 42 routes (blocked by CI gate)

No routes remain with UNKNOWN classification.

---

## Files Created/Modified

### Created Files

1. `scripts/triage-unknown-routes.ts` - Risk categorization tool
2. `scripts/classify-routes.ts` - Automated auth detection
3. `tests/security-inventory-gate.ts` - CI hard gate
4. `route-classifications.json` - Machine-readable classifications
5. `SECURITY_INVENTORY_HARDENING.md` - This report

### Modified Files

1. `package.json` - Added 5 new security test scripts
2. `SECURITY_ROUTE_INVENTORY.md` - Ready for classification updates

---

## Summary

### Achievements ✅

- **Eliminated all 51 UNKNOWN routes** through automated classification
- **Identified 30 critical vulnerabilities** (mutations, AI, PII without auth)
- **Created CI hard gate** that blocks deployment of vulnerable code
- **Established systematic process** for security audits

### Current Status 🚨

**CI BLOCKED:** Cannot deploy until critical vulnerabilities are fixed.

**Action Required:**
1. Add authentication to 21 mutation routes
2. Add authentication to 4 AI routes
3. Add authentication to 5 sensitive routes
4. Fix 3 weak auth patterns

### Next Steps

1. **Immediate:** Implement Phase 1 (critical mutations)
2. **Week 1:** Implement Phases 2-3 (AI + sensitive data)
3. **Week 2:** Implement Phase 4 (weak auth)
4. **Ongoing:** Run `npm run test:security:all` in CI for all PRs

---

## Contact & Support

For questions about this security audit:
- Review: `SECURITY_VERIFICATION_REPORT.md` for previous audit results
- Tools: `scripts/classify-routes.ts` for re-running classification
- Tests: `tests/security-inventory-gate.ts` for gate logic

**Critical Security Issues:** Fix immediately before next deployment.

---

**Report Generated:** 2026-01-19
**Tools Version:** 1.0.0
**Status:** 🚨 **DEPLOYMENT BLOCKED**

