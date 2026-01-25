# Ticket 1.3: Tier 3 Shared Link Fallback - Implementation Summary

## ✅ Completed Tasks

### 1. Database Schema Changes

**Updated PersonEvent Model** (`prisma/schema.prisma:213-222`)
- Added `claimedViaSharedLink Boolean @default(false)` field
- Tracks when someone claims their name via shared event link
- Positioned within reachability tracking section alongside:
  - `reachabilityTier`
  - `contactMethod`
  - `proxyPersonEventId`

### 2. Database Migration

✅ Migration created and applied: `20260125074451_add_claimed_via_shared_link`

### 3. Enhanced Existing Endpoints

#### POST /api/join/[token]/claim (MODIFIED)
**Location**: `src/app/api/join/[token]/claim/route.ts:104-143`

**Changes Made**:
- Wrapped token claim in transaction for atomicity
- Added PersonEvent update to set:
  - `reachabilityTier: 'SHARED'`
  - `claimedViaSharedLink: true`
- Pass transaction client to `logInviteEvent` for atomic logging

**Before**: Only updated AccessToken with claim timestamp
**After**: Also updates PersonEvent with Tier 3 reachability tracking

### 4. New API Endpoints

#### PATCH /api/p/[token]/contact-info (NEW)
**Location**: `src/app/api/p/[token]/contact-info/route.ts`

**Purpose**: Allows participants to add contact info and upgrade from Tier 3 (SHARED) to Tier 1 (DIRECT)

**Auth**: PARTICIPANT scope (via token resolution)

**Input**:
```json
{
  "email": "user@example.com",        // Optional
  "phoneNumber": "021 123 4567"       // Optional (at least one required)
}
```

**Process**:
1. Validates participant token
2. Requires at least one contact method (email or phone)
3. Normalizes phone number to E.164 format if provided
4. Updates Person with contact info
5. Updates PersonEvent:
   - `reachabilityTier: 'DIRECT'`
   - `contactMethod: 'EMAIL'` or `'SMS'` (SMS takes precedence if both provided)
6. All updates in transaction for atomicity

**Returns**:
```json
{
  "success": true,
  "reachabilityTier": "DIRECT",
  "contactMethod": "EMAIL" // or "SMS"
}
```

**Error Handling**:
- 400: Missing both email and phone
- 400: Invalid phone number format
- 403: Invalid or non-participant token

### 5. Library Enhancements

#### logInviteEvent Function (MODIFIED)
**Location**: `src/lib/invite-events.ts:13-36`

**Changes Made**:
- Added optional `tx?: PrismaClient` parameter
- Supports Prisma transaction clients for atomic operations
- Maintains backward compatibility (transaction optional)

**Type Addition**:
```typescript
type PrismaClient = typeof prisma | Prisma.TransactionClient;
```

**Usage**:
```typescript
// Without transaction
await logInviteEvent({ eventId, personId, type, metadata });

// Within transaction
await logInviteEvent({ eventId, personId, type, metadata }, tx);
```

## Verification Steps

The ticket specified these verification steps:

1. ✅ Create event with 5 people (no contact info)
2. ✅ Generate shared link via POST /api/events/[id]/shared-link
3. ✅ Open link, select a name, claim
4. ✅ Verify PersonEvent shows `reachabilityTier: SHARED` and `claimedViaSharedLink: true`
5. ✅ Add phone number via PATCH /api/p/[token]/contact-info
6. ✅ Verify upgrade to `reachabilityTier: DIRECT` and `contactMethod: SMS`

### Database Verification Queries

**Check Tier 3 Claims**:
```sql
SELECT pe.id, p.name, pe.reachabilityTier, pe.contactMethod, pe.claimedViaSharedLink
FROM "PersonEvent" pe
JOIN "Person" p ON p.id = pe.personId
WHERE pe.claimedViaSharedLink = true;
```

**Check Tier Upgrades**:
```sql
SELECT pe.id, p.name, p.email, p.phoneNumber, pe.reachabilityTier, pe.contactMethod
FROM "PersonEvent" pe
JOIN "Person" p ON p.id = pe.personId
WHERE pe.claimedViaSharedLink = true AND pe.reachabilityTier = 'DIRECT';
```

## Build Status

- ✅ `npx prisma migrate dev` succeeds
- ✅ `npm run typecheck` passes
- ✅ `npm run build` passes
- ✅ Shared link claim sets reachabilityTier: SHARED
- ✅ Adding contact info upgrades to DIRECT
- ✅ Contact method correctly set based on input

## Files Modified

```
prisma/schema.prisma                                    — Added claimedViaSharedLink field
prisma/migrations/20260125074451_add_claimed_via_shared_link/  — Database migration
src/app/api/join/[token]/claim/route.ts                 — MODIFIED: Transaction + tier tracking
src/app/api/p/[token]/contact-info/route.ts             — NEW: Contact info upgrade endpoint
src/lib/invite-events.ts                                — MODIFIED: Transaction support
```

## Key Implementation Details

### 1. Atomic Operations
All reachability tier changes happen within Prisma transactions to ensure consistency:
- Token claim + PersonEvent update + invite event logging (atomic)
- Person update + PersonEvent tier upgrade (atomic)

### 2. Tier Progression Flow
```
No contact info → Shared link claim → TIER 3 (SHARED)
                                           ↓
                              Add email/phone → TIER 1 (DIRECT)
```

### 3. Contact Method Priority
When both email and phone are provided, SMS takes precedence:
```typescript
if (email) contactMethod = 'EMAIL';
if (phoneNumber) contactMethod = 'SMS'; // Overrides EMAIL
```

### 4. Phone Number Validation
Uses existing `normalizePhoneNumber` utility:
- Converts to E.164 format (+64...)
- Validates NZ number format
- Returns null if invalid (triggers 400 error)

### 5. Backward Compatibility
- Existing shared link flow continues to work
- AccessToken claim tracking unchanged
- Only adds new PersonEvent fields (non-breaking)

### 6. Assignment Access
Tier 3 (SHARED) participants can:
- ✅ View their assignments
- ✅ Respond (ACCEPT/DECLINE)
- ✅ See team and coordinator info
- ✅ Access participant view at /p/[token]

### 7. Reachability Tier Meanings
- **DIRECT** (Tier 1): Host has email or phone, can send invites directly
- **PROXY** (Tier 2): Reached through household proxy (Ticket 1.2)
- **SHARED** (Tier 3): Claimed via shared link, no contact info yet
- **UNTRACKABLE**: No way to reach (legacy or unclaimed)

## What Was NOT Built (As Per Ticket Scope)

- ❌ Dashboard reachability bar (Ticket 1.4)
- ❌ Tier 1 (DIRECT) flow modifications (already existed)
- ❌ Tier 2 (PROXY) flow modifications (Ticket 1.2)
- ❌ Shared link generation UI (already existed)
- ❌ Participant UI for adding contact info (API only)

## Testing Guide

### Manual Test Script

```bash
# 1. Generate shared link
EVENT_ID="your_event_id"
curl -X POST http://localhost:3000/api/events/$EVENT_ID/shared-link

# Response: { "url": "http://localhost:3000/join/abc123...", ... }

# 2. Open URL in browser
# - Search for name
# - Claim it
# - Note participant token from redirect: /p/[PARTICIPANT_TOKEN]

# 3. Verify Tier 3 in database
psql gather_dev -c "SELECT pe.reachabilityTier, pe.claimedViaSharedLink
FROM \"PersonEvent\" pe WHERE pe.claimedViaSharedLink = true LIMIT 1;"

# Expected: reachabilityTier = SHARED, claimedViaSharedLink = true

# 4. Upgrade to Tier 1
PARTICIPANT_TOKEN="from_redirect_url"
curl -X PATCH http://localhost:3000/api/p/$PARTICIPANT_TOKEN/contact-info \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Response: { "success": true, "reachabilityTier": "DIRECT", "contactMethod": "EMAIL" }

# 5. Verify upgrade
psql gather_dev -c "SELECT pe.reachabilityTier, pe.contactMethod, p.email
FROM \"PersonEvent\" pe JOIN \"Person\" p ON p.id = pe.personId
WHERE pe.claimedViaSharedLink = true LIMIT 1;"

# Expected: reachabilityTier = DIRECT, contactMethod = EMAIL, email populated
```

## Next Steps

As noted in the ticket, Ticket 1.4 will add dashboard visibility for reachability tiers (visual reachability bar showing tier distribution).
