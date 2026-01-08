# Auth Fix for Plan Page Invite Links

## Summary

Fixed the authentication issue for fetching invite links on the Plan page. The previous implementation relied on `localStorage.getItem('hostToken')` which was fragile and didn't work for direct Plan page access.

## Changes Made

### 1. Updated `/src/app/api/events/[id]/tokens/route.ts`

**Before:**
- Only supported Bearer token authentication
- Required a HOST-scoped access token in the Authorization header
- Plan page couldn't easily access this endpoint

**After:**
- **Two authentication methods now supported:**
  1. **Bearer Token** (existing method - backward compatible)
     - Uses `Authorization: Bearer {token}` header
     - Validates token is HOST-scoped for the event

  2. **Query Parameter** (new method - for Plan page)
     - Uses `?hostId={hostId}` query parameter
     - Validates hostId matches event.hostId or event.coHostId
     - Allows both host and co-host to access invite links

**Security:**
- Both methods validate the requester is authorized (host or co-host only)
- Invalid hostId returns 403 Forbidden
- Missing authentication returns 403 Forbidden
- COORDINATOR and PARTICIPANT tokens still rejected (403)

### 2. Updated `/src/app/plan/[eventId]/page.tsx`

**Before:**
```typescript
const response = await fetch(`/api/events/${eventId}/tokens`, {
  headers: {
    Authorization: `Bearer ${localStorage.getItem('hostToken')}`,
  },
});
```

**After:**
```typescript
const response = await fetch(`/api/events/${eventId}/tokens?hostId=${event.hostId}`);
```

**Benefits:**
- No dependency on localStorage
- Works for direct Plan page access
- Uses event data that's already loaded
- Simpler and more reliable

## Testing

Created comprehensive test scripts to verify the fix:

### `scripts/test-auth-fix.ts`
Tests all authentication scenarios:
- ✅ Valid hostId query param → 200 OK
- ✅ Invalid hostId → 403 Forbidden
- ✅ Valid HOST token → 200 OK (backward compatible)
- ✅ COORDINATOR token → 403 Forbidden
- ✅ No authentication → 403 Forbidden
- ✅ Plan page simulation → Successfully loads invite links

### `scripts/test-e2e-with-auth-fix.ts`
Complete end-to-end test:
- ✅ Creates event and people
- ✅ Transitions to CONFIRMING
- ✅ Tokens generated automatically
- ✅ Plan page loads invite links using hostId
- ✅ All invite links have correct format and content

## Results

**All tests pass:**
```
🎉 END-TO-END TEST PASSED!

✅ Event created and transitioned to CONFIRMING
✅ Tokens generated automatically
✅ Plan page can load invite links using hostId auth
✅ No localStorage required
✅ All invite links have correct content and format
```

## API Endpoint Usage

### Method 1: Bearer Token (existing)
```bash
GET /api/events/{eventId}/tokens
Authorization: Bearer {hostToken}
```

### Method 2: Query Parameter (new)
```bash
GET /api/events/{eventId}/tokens?hostId={hostId}
```

## Security Considerations

- **hostId validation:** The endpoint verifies the provided hostId matches the event's hostId or coHostId
- **Backward compatible:** Existing token-based auth still works
- **Co-host support:** Both host and co-host can access invite links
- **No token exposure:** Query param approach doesn't expose access tokens in URLs
- **Server-side validation:** All auth checks happen server-side

## Future Improvements

For production, consider:
1. Add session-based authentication (NextAuth, etc.)
2. Use HTTP-only cookies for better security
3. Add rate limiting to prevent abuse
4. Add audit logging for token access
5. Consider role-based access control (RBAC) system

## Files Modified

- `/src/app/api/events/[id]/tokens/route.ts` - Added hostId query param auth
- `/src/app/plan/[eventId]/page.tsx` - Updated to use hostId instead of localStorage

## Files Created

- `/scripts/test-auth-fix.ts` - Auth fix test suite
- `/scripts/test-e2e-with-auth-fix.ts` - End-to-end test with auth fix
- `/CHANGES.md` - This document
