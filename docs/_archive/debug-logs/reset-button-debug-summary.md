# Reset Demo Data Button - Debug Summary

## The Problem

The "Reset Demo Data" button fails with database errors when clicked after running multiple test events.

**Error Message:**
```
TypeError: Cannot read properties of undefined (reading 'id')
```

**User Impact:**
- Cannot reset the demo to a clean state
- Multiple test events accumulate in the database
- Demo page shows confusing mix of data

---

## Root Cause Analysis

### The Fundamental Issue

The seed script (`prisma/seed.ts`) is designed for a **specific demo event** with hardcoded people, teams, and items. It has two modes:

1. **Fresh Seed** (no people exist): Creates everything from scratch
2. **Incremental Seed** (people exist): Reuses existing people/teams/tokens, only recreates items

The incremental mode **assumes the database already has the correct demo structure**, but after running tests, the database contains:
- Multiple events: "Browser Test Event", "E2E Test Event", "Summer BBQ Party", etc.
- Different people: "Demo Host", "Kate", "Tom" instead of "Jacqui & Ian", etc.
- Different teams with different names

When reset runs:
1. Deletes: items, assignments, days (but keeps people, teams, tokens)
2. Runs seed in incremental mode
3. Tries to find demo people like "Jacqui & Ian" → **undefined**
4. Tries to create event with `jacqui.id` → **crash**

---

## Attempted Fixes

### Fix #1: Filter Teams by EventId ✅ (Partially Fixed)

**Problem:** Seed fetched ALL teams from ALL events, causing name collisions

**Solution Applied:**
```typescript
// Before
const existingTeams = await prisma.team.findMany();

// After
const existingTeams = await prisma.team.findMany({
  where: { eventId: event.id }
});
```

**Result:** Fixed team conflicts but didn't solve the core issue

### Fix #2: Create Teams if Missing ✅ (Partially Fixed)

**Problem:** If no teams exist for event, seed crashes

**Solution Applied:**
```typescript
if (teamByName.size === 0) {
  console.log('No teams found - creating them...');
  // Create teams
}
```

**Result:** Handles missing teams but doesn't help if people are wrong

### Fix #3: Target Specific Demo Event ✅ (Partially Fixed)

**Problem:** Seed was using `findFirst()` and grabbing ANY event

**Solution Applied:**
```typescript
// Before
event = await prisma.event.findFirst();

// After
event = await prisma.event.findFirst({
  where: { name: "Wickham Family Christmas" }
});
```

**Result:** Correctly targets demo event, but event doesn't exist yet

### Fix #4: Create Demo Event if Missing ✅ (Partially Fixed)

**Problem:** Demo event might not exist in database

**Solution Applied:**
```typescript
if (!event) {
  console.log('Demo event not found - creating it...');
  event = await prisma.event.create({
    data: {
      name: "Wickham Family Christmas",
      // ...
      hostId: jacqui.id,  // ❌ FAILS HERE - jacqui is undefined
    }
  });
}
```

**Result:** Crashes because `jacqui` doesn't exist in the database

---

## Current Status

**Still Failing At:** Line 110 - `hostId: jacqui.id`

**Why:** Database has wrong people (test data) not demo people

**Log Evidence:**
```
Found 13 existing people - doing incremental reseed
Fetching existing people...
✓ Fetched 3 existing people
```

Only 3 of 13 people matched the expected demo names.

---

## The Deeper Problem

The seed script's **incremental mode is fundamentally incompatible with a database that has test data**.

### What It Expects:
- Specific people: "Jacqui & Ian", "Kate", "Joanna", etc. (Christmas demo people)
- Specific teams: "Entrées & Nibbles", "Mains – Proteins", etc.
- One demo event: "Wickham Family Christmas"

### What It Gets After Tests:
- Different people: "Demo Host", "Kate" (different person), "Tom", etc.
- Different teams: "Main Dishes Team", "Dessert Team", etc.
- Multiple events: Test events still exist

### Why Incremental Mode Triggers:
```typescript
const existingPeople = await prisma.person.count();
const isIncremental = existingPeople > 0;  // ← Always true after tests
```

---

## Possible Solutions

### Option A: Full Database Reset 🔴 (Loses tokens)
Delete everything including people/teams/tokens, then seed fresh.

**Pros:** Clean slate, guaranteed to work
**Cons:** Breaks all existing invite links (tokens deleted)

### Option B: Smarter Incremental Seed 🟡 (Complex)
Make seed create missing people/teams during incremental mode.

**Pros:** Preserves tokens
**Cons:** Complex logic, potential for data conflicts

### Option C: Separate Demo Event Creation 🟢 (Recommended)
Create a dedicated "New Demo Event" button that:
1. Creates a fresh demo event with new people/teams
2. Generates new tokens for that event
3. Leaves old test data alone

**Pros:** Clean separation, no conflicts
**Cons:** Doesn't "reset" - creates new instead

### Option D: Demo Event Detection 🟢 (Recommended)
Make reset check if demo event exists:
- If yes: Delete items and reseed
- If no: Run full fresh seed (creates people/teams/event)

**Pros:** Handles both cases gracefully
**Cons:** Still needs Option B's complexity for missing people

---

## Recommended Path Forward

**Short-term:** Implement Option D with enhanced logic

1. Check if demo event exists by name
2. If exists: Use existing event, verify people/teams exist
3. If missing people: Create them (even in incremental mode)
4. If missing teams: Create them (already implemented)
5. Then seed items

**Changes needed:**
```typescript
// After fetching event, verify required people exist
const requiredPeople = ["Jacqui & Ian", "Kate", "Joanna", ...];
for (const name of requiredPeople) {
  if (!personByName.has(name)) {
    // Create missing person
    const person = await prisma.person.create({ data: { name } });
    personByName.set(name, person);
  }
}
```

**Long-term:** Consider Option C for cleaner UX

- "Create New Demo" button instead of "Reset"
- Each demo event is self-contained
- No conflicts between test and demo data

---

## Files Involved

- **`/api/demo/reset/route.ts`** - Reset endpoint (deletes data, runs seed)
- **`prisma/seed.ts`** - Seed script (creates demo data)
- **`src/app/page.tsx`** - Demo page with reset button

## Related Issues

- Multiple events from test runs accumulate
- People/teams from tests don't match demo expectations
- Incremental seed mode isn't robust enough for mixed data
- Hardcoded demo data makes seed inflexible
