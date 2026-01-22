# Security Verification: Routes with NO Authentication

**Date:** 2026-01-19
**Purpose:** Behavioral proof of authentication failures

---

## CONTRADICTION RESOLUTION

### User's Valid Observation
`POST /api/events` returns 401 when unauthenticated ✅ CORRECT

### My Initial Report Error
I reported paths as `/events/:id/generate` instead of `/api/events/:id/generate`
- **Root cause:** Classification script stripped `/src/app/api` → `/` instead of `/src/app` → `/api`
- **Fix applied:** `scripts/classify-routes.ts` line 29
- **Result:** All paths now correctly show `/api/` prefix

### Ground Truth Mapping

| My Report Path | Actual HTTP Endpoint | File Path | Is API Route? |
|----------------|----------------------|-----------|---------------|
| `/events/:id/generate` | `/api/events/:id/generate` | `src/app/api/events/[id]/generate/route.ts` | ✅ YES |
| `/events/:id/regenerate` | `/api/events/:id/regenerate` | `src/app/api/events/[id]/regenerate/route.ts` | ✅ YES |
| `/events/:id/check` | `/api/events/:id/check` | `src/app/api/events/[id]/check/route.ts` | ✅ YES |
| `/events/:id/items/:itemId` | `/api/events/:id/items/:itemId` | `src/app/api/events/[id]/items/[itemId]/route.ts` | ✅ YES |
| `/events/:id/people/:personId` | `/api/events/:id/people/:personId` | `src/app/api/events/[id]/people/[personId]/route.ts` | ✅ YES |

**Conclusion:** All flagged routes ARE API routes. The issue was path reporting, not route identification.

---

## VERIFIED VULNERABILITIES

### Test Setup

Event IDs from test fixtures:
```bash
npx tsx tests/security-fixtures.ts
# Draft Event: cmkkuiwc40006n9yrn91ddh4m
# Frozen Event: cmkkuiwc50008n9yr3mjk5e0b
```

### Vulnerability 1: Unauthenticated AI Generation

**Route:** `POST /api/events/:id/generate`
**File:** `src/app/api/events/[id]/generate/route.ts`
**Risk:** HIGH_COST (AI) + MUTATION

**Auth Check in Code:** NONE
```typescript
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;
    // NO getUser() call
    // NO requireEventRole() call

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      // ...proceeds to AI generation
```

**Behavioral Test:**
```bash
curl -X POST http://localhost:3000/api/events/cmkkuiwc40006n9yrn91ddh4m/generate \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Observed:**
```
HTTP Status: 500
{"error":"Failed to generate plan","details":"Invalid value for argument `domain`..."}
```

**Analysis:**
- ❌ No 401 returned (authentication not checked)
- ❌ AI generation code executed
- ❌ Database write attempted (failed on data validation, not security)
- ✅ **CONFIRMED VULNERABILITY**: Anyone can trigger AI generation on any event

---

### Vulnerability 2: Unauthenticated Item Mutation

**Route:** `PATCH /api/events/:id/items/:itemId`
**File:** `src/app/api/events/[id]/items/[itemId]/route.ts`
**Risk:** MUTATION

**Auth Check in Code:** NONE
```typescript
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: _eventId, itemId } = await context.params;
    const body = await request.json();
    // NO authentication check
```

**Behavioral Test:**
```bash
# Get item ID from event
ITEM_ID=$(curl -s http://localhost:3000/api/events/cmkkuiwc40006n9yrn91ddh4m/items | jq -r '.items[0].id')

# Try to update item without auth
curl -X PATCH http://localhost:3000/api/events/cmkkuiwc40006n9yrn91ddh4m/items/$ITEM_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"HACKED"}' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** 401 Unauthorized
**Observed:** [Run test to confirm]

---

### Vulnerability 3: Unauthenticated People Deletion

**Route:** `DELETE /api/events/:id/people/:personId`
**File:** `src/app/api/events/[id]/people/[personId]/route.ts`
**Risk:** MUTATION + SENSITIVE (PII)

**Auth Check in Code:** NONE
```typescript
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const { id: eventId, personId } = await context.params;
    // NO authentication check
    // Proceeds to delete person
```

**Behavioral Test:**
```bash
curl -X DELETE http://localhost:3000/api/events/cmkkuiwc40006n9yrn91ddh4m/people/cmkkuiwc30004n9yrayvf9dty \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** 401 Unauthorized
**Observed:** [Run test to confirm]

---

### Vulnerability 4: Unauthenticated Conflict Operations

**Routes:**
- `POST /api/events/:id/check` - AI conflict detection
- `POST /api/events/:id/conflicts/:conflictId/acknowledge`
- `POST /api/events/:id/conflicts/:conflictId/delegate`
- `POST /api/events/:id/conflicts/:conflictId/dismiss`
- `POST /api/events/:id/conflicts/:conflictId/execute-resolution`
- `POST /api/events/:id/conflicts/:conflictId/resolve`

**Risk:** HIGH_COST (AI) + MUTATION

**Behavioral Test:**
```bash
# Trigger AI conflict check without auth
curl -X POST http://localhost:3000/api/events/cmkkuiwc40006n9yrn91ddh4m/check \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** 401 Unauthorized
**Observed:** [Run test to confirm]

---

### Vulnerability 5: Unauthenticated Template/Memory Operations

**Routes:**
- `POST /api/templates/:id/clone`
- `PATCH /api/memory/settings`
- `DELETE /api/memory`

**Auth Check:** WEAK_PARAM (hostId query param without session validation)

**Behavioral Test:**
```bash
# Anyone can read any host's memory by guessing hostId
curl "http://localhost:3000/api/memory?hostId=arbitrary-host-id" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** 401 Unauthorized
**Observed:** [Run test to confirm]

---

## AUTH ROUTES (False Positives)

The following routes were flagged as "CRITICAL" but are **intentionally public** (auth flow):

| Route | Purpose | Classification |
|-------|---------|----------------|
| `POST /api/auth/claim` | Claim account via magic link | PUBLIC ✅ |
| `POST /api/auth/magic-link` | Request magic link email | PUBLIC ✅ |
| `POST /api/auth/verify` | Verify magic link token | PUBLIC ✅ |
| `POST /api/auth/logout` | Destroy session | PUBLIC ✅ |

**Fix Required:** Update classifier to detect `/auth/` routes as PUBLIC automatically.

---

## SUMMARY TABLE: All NONE-Auth Routes

| Route | Method | Mutation? | High-Cost? | Sensitive? | Verified Vuln? |
|-------|--------|-----------|------------|------------|----------------|
| `/api/events/:id/archive` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/check` | POST | ✅ | ✅ AI | ❌ | ⏳ TBD |
| `/api/events/:id/conflicts/*` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/generate` | POST | ✅ | ✅ AI | ❌ | ✅ **CONFIRMED** |
| `/api/events/:id/items/:itemId` | PATCH/DELETE | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/items/mark-for-review` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/people/:personId` | PATCH/DELETE | ✅ | ❌ | ✅ PII | ⏳ TBD |
| `/api/events/:id/people/batch-import` | POST | ✅ | ❌ | ✅ PII | ⏳ TBD |
| `/api/events/:id/regenerate` | POST | ✅ | ✅ AI | ❌ | ⏳ TBD |
| `/api/events/:id/regenerate/preview` | POST | ❌ | ✅ AI | ❌ | ⏳ TBD |
| `/api/events/:id/restore` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/review-items` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/suggestions/*` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/teams/:teamId` | DELETE | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/events/:id/teams/:teamId/items` | POST | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/memory` | DELETE | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/memory/settings` | PATCH | ✅ | ❌ | ❌ | ⏳ TBD |
| `/api/templates/:id/clone` | POST | ✅ | ❌ | ❌ | ⏳ TBD |

**Total Routes:** 17+ routes requiring verification
**Confirmed Vulnerable:** 1 (generate)
**Pending Tests:** 16+

---

## NEXT STEPS

1. ✅ Path bug fixed in `scripts/classify-routes.ts`
2. ✅ Classifications regenerated with `/api/` prefix
3. ⏳ Run behavioral tests for all NONE routes above
4. ⏳ Apply auth guards to confirmed vulnerabilities only
5. ⏳ Update classifier to auto-detect auth routes as PUBLIC

---

**Report Status:** IN PROGRESS
**Last Updated:** 2026-01-19
**Confirmed Vulnerabilities:** 1 (POST /api/events/:id/generate)
