# Ticket 1.1: Extend PersonEvent with Reachability Fields - COMPLETE ✓

## Summary
Successfully added reachability tracking to the PersonEvent model, enabling the system to identify who can be nudged directly (SMS/email), who needs a proxy, and who is untrackable.

## Changes Made

### 1. Schema Updates (`prisma/schema.prisma`)
- ✓ Added `ReachabilityTier` enum: DIRECT, PROXY, SHARED, UNTRACKABLE
- ✓ Added `ContactMethod` enum: EMAIL, SMS, NONE
- ✓ Extended `PersonEvent` model with:
  - `reachabilityTier` (default: UNTRACKABLE)
  - `contactMethod` (default: NONE)
  - `proxyPersonEventId` (nullable, for future Tier 2 proxy support)
  - Self-referential relation for proxy/household members

### 2. Database Migration
- ✓ Created migration: `20260125065705_add_reachability_fields`
- ✓ Applied successfully to development database
- ✓ Backfill script created: `prisma/backfill-reachability.ts`
- ✓ All existing records backfilled (58 records processed)

### 3. API Logic Updates
- ✓ Updated `src/app/api/events/[id]/people/route.ts` (POST):
  - Sets `contactMethod: SMS, reachabilityTier: DIRECT` if person has phone
  - Sets `contactMethod: EMAIL, reachabilityTier: DIRECT` if person has email only
  - Sets `contactMethod: NONE, reachabilityTier: UNTRACKABLE` if no contact info
- ✓ Updated `src/app/api/events/[id]/people/batch-import/route.ts`:
  - Same reachability logic applied during CSV imports

### 4. Seed Script Enhancement
- ✓ Updated `prisma/seed.ts` to include test contact data:
  - Host with phone (SMS/DIRECT)
  - Coordinators with mixed contact methods
  - Participants without contact (NONE/UNTRACKABLE)

## Verification Results

### Test Database Statistics
- Total PersonEvents: 29
- DIRECT reachability: 7 people
- UNTRACKABLE: 22 people
- SMS contact method: 4 people
- EMAIL contact method: 3 people
- NONE contact method: 22 people

### Spot Check Results (All PASS ✓)
1. ✓ Person with phone → SMS/DIRECT
2. ✓ Person with email only → EMAIL/DIRECT
3. ✓ Person with no contact → NONE/UNTRACKABLE
4. ✓ Person with both (phone wins) → SMS/DIRECT

### Build Verification
- ✓ `npm run typecheck` passes
- ✓ `npm run build` succeeds
- ✓ Database migration applies cleanly
- ✓ Seed script runs successfully

## Reachability Logic

```typescript
if (person.phoneNumber || person.phone) {
  contactMethod = 'SMS';
  reachabilityTier = 'DIRECT';
} else if (person.email) {
  contactMethod = 'EMAIL';
  reachabilityTier = 'DIRECT';
} else {
  contactMethod = 'NONE';
  reachabilityTier = 'UNTRACKABLE';
}
```

**Priority**: Phone (SMS) takes precedence over email when both are available.

## Files Modified
1. `prisma/schema.prisma` - Added enums and PersonEvent fields
2. `src/app/api/events/[id]/people/route.ts` - POST endpoint logic
3. `src/app/api/events/[id]/people/batch-import/route.ts` - Batch import logic
4. `prisma/seed.ts` - Enhanced with contact test data

## Files Created
1. `prisma/migrations/20260125065705_add_reachability_fields/migration.sql`
2. `prisma/backfill-reachability.ts` - Backfill script for existing records

## Ready For
- ✓ Ticket 1.2: Tier 2 Proxy Household Model
- ✓ Ticket 1.3: Tier 3 Shared Link Fallback
- ✓ Dashboard integration (Ticket 1.4)

## Notes
- Proxy fields (`proxyPersonEventId`, `householdMembers`) are in place but not yet used
- Will be utilized in Ticket 1.2 for household/proxy relationships
- No UI changes in this ticket (as specified)
- Auth resolution (`resolveToken`) not modified (as specified)
