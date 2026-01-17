# Phase 1 Dual-Run Validation (Ticket 1.8)

## Overview

This validation script verifies that Phase 1 (Magic Link Authentication) is complete and both authentication paths coexist without conflict:

1. **Legacy path**: Existing host/coordinator/participant token flows (via AccessToken table)
2. **New path**: User accounts with magic link auth + sessions

## Usage

Run the validation script with:

```bash
npx tsx scripts/validate-phase1.ts
```

The script will:
1. Create test data for each scenario
2. Run all validation tests
3. Clean up test data automatically
4. Exit with code 0 if all tests pass, or code 1 if any fail

## Test Matrix

The validation covers all scenarios from ticket 1.8:

### ✓ Legacy Token Flows
- **Test 1**: Legacy host token access (works + unclaimed detection)
- **Test 2**: Legacy coordinator token access (works unchanged)
- **Test 3**: Legacy participant token access (works unchanged)

### ✓ New User Auth Flows
- **Test 4**: New user sign in (magic link → session)
- **Test 5**: Claimed host via session (direct access, no token needed)
- **Test 6**: Claimed host via old token (works, uses session)

### ✓ Session Management
- **Test 7**: Session expiry (logged out after 30 days)
- **Test 8**: Logout (cookie cleared)

### ✓ Event Creation
- **Test 9**: Create new event (claimed user) - EventRole created
- **Test 10**: Create new event (unclaimed user) - works, legacy flow

### ✓ "Do Not Break" Checklist
- Event creation still works
- AccessToken table still works
- Person table unchanged

## Output

The script provides clear console output:

```
✓ Legacy host token access works
✓ Unclaimed host detected (ready for claim prompt)
✓ Legacy coordinator token access works unchanged
...

Validation Summary
Total Tests: 16
Passed: 16 ✓
Failed: 0 ✗

🎉 All validation tests passed! Phase 1 is complete.
```

## Files

- `validate-phase1.ts` - Main validation script with all test scenarios
- `validate-phase1-helpers.ts` - Helper functions for test data creation and cleanup

## Prerequisites Verified

The script first verifies that all dependencies from tickets 1.1-1.7 are in place:

- ✓ User, Session, MagicLink tables exist in schema
- ✓ EventRole table exists in schema
- ✓ Person.userId field exists
- ✓ getUser() function exists in `src/lib/auth/session.ts`
- ✓ Claim flow endpoint exists at `src/app/api/auth/claim/route.ts`
- ✓ resolveToken() exists for legacy token handling

## Test Data

The script:
- Creates unique test data for each run (using timestamps)
- Uses the dev database (not a separate test database)
- Automatically cleans up all test records after completion
- Is idempotent and can be run multiple times

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Next Steps

Once all validation tests pass:
- Phase 1 is complete
- Ready to proceed to Phase 2 (Stripe + Entitlements)
- Both auth paths (legacy and new) are confirmed working
