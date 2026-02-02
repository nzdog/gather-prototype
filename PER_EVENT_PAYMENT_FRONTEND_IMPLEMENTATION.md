# Per-Event Payment Frontend Implementation

## Summary

Implemented frontend flow for $12 per-event payment using Stripe Checkout. Users now pay before creating an event, with automatic event creation after successful payment.

## Files Modified

### 1. `/src/app/api/billing/checkout/route.ts`
**Changes:**
- Updated `success_url` from `/events/new` to `/plan/new`
- Updated `cancel_url` from `/events/new` to `/plan/new`

**Reason:** The `/events/new` route doesn't exist. The event creation form is at `/plan/new`.

### 2. `/src/app/plan/new/page.tsx`
**Changes:** Complete rewrite from multi-step form to payment-first flow

**Previous behavior:**
- 3-step form with extensive event details
- Direct event creation without payment
- Entitlement checking

**New behavior:**
- Simple form with name, start date, end date
- "Pay & Create — $12" button redirects to Stripe
- After payment, automatic event creation
- Form data persists across Stripe redirect using sessionStorage

**States implemented:**
1. **Form state** - Initial event creation form
2. **Creating state** - Loading spinner while creating event after payment
3. **Canceled state** - Payment canceled message with retry option
4. **Error state** - Error handling with retry and support options

**Features:**
- Form validation before checkout
- sessionStorage persistence across redirect
- Specific error handling for 402 (payment not completed), 403 (session mismatch), 409 (payment already used)
- Auth guard - redirects to sign-in if not authenticated
- Automatic cleanup of sessionStorage after successful creation

## Build Status

✅ **TypeScript compilation:** Passed
✅ **Next.js build:** Passed
- Bundle size: 3.01 kB for `/plan/new` route
- No TypeScript errors
- No compilation errors

## User Flow

```
1. User visits /plan/new
2. Fills in event name, start date, end date
3. Clicks "Pay & Create — $12"
4. Form data saved to sessionStorage
5. Redirected to Stripe Checkout
6. User completes payment
7. Redirected to /plan/new?session_id={SESSION_ID}
8. Event created automatically with payment verification
9. sessionStorage cleared
10. Redirected to /plan/{eventId}
```

## Error Handling

| Scenario | Status Code | User Message | Action |
|----------|-------------|--------------|--------|
| Payment not completed | 402 | "Payment wasn't completed. Please try again." | Show error with retry |
| Session mismatch | 403 | "Payment session doesn't match your account. Please try again." | Show error with retry |
| Payment already used | 409 | "This payment was already used to create an event." | Show error, redirect to home after 3s |
| Network error | - | "Connection failed. Check your internet and try again." | Show error with retry |
| Unauthenticated | 401 | - | Redirect to sign-in |
| Unknown error | 500 | "Something went wrong. Please try again or contact support." | Show error with retry and support link |

## Payment Canceled Flow

When user cancels payment:
1. Redirected to `/plan/new?canceled=true`
2. Form values restored from sessionStorage
3. Message: "Payment canceled. No charge was made. You can try again whenever you're ready."
4. "Try Again" button shows form

## Form Persistence

**Implementation:**
- `sessionStorage.setItem('gather_new_event', JSON.stringify({ name, startDate, endDate }))`
- Survives Stripe redirect
- Cleared after successful event creation
- Restored on payment cancellation

**Edge case:** If user closes browser during payment, sessionStorage is lost and they start with a fresh form.

## Backend Integration

**Checkout endpoint:** `POST /api/billing/checkout`
- Input: `{ eventName }`
- Output: `{ checkoutUrl, sessionId }`
- Creates Stripe session with $12 NZD one-time payment

**Event creation endpoint:** `POST /api/events`
- Input: `{ name, startDate, endDate, stripeSessionId }`
- Validates payment completion
- Verifies session ownership
- Checks session not already used
- Creates event and sends receipt email
- Output: `{ success, event }`

## Decisions Made

1. **Simplified form:** Removed multi-step form complexity. Users can add detailed info (guest count, dietary, venue) after event creation on the main event page.

2. **No auth middleware:** Used client-side redirect to sign-in on 401 response rather than server-side middleware. Keeps implementation simple.

3. **sessionStorage over query params:** Form data stored in sessionStorage rather than URL params to avoid exposing data in browser history and URL length limits.

4. **Auto-redirect on 409:** When payment already used, show error for 3 seconds then redirect to home. User can see their events list.

5. **Support email:** Hard-coded `support@gather.app` as contact email for error state.

## Testing Verification

### ✅ Type Safety
- No TypeScript errors
- All props typed correctly
- Form state properly typed

### ✅ Build
- Next.js build successful
- No compilation errors
- Route bundle: 3.01 kB

### ⚠️ Manual Testing Required

The following verification steps from the ticket need manual testing:

1. **Auth flow:** Sign out, visit `/plan/new`, verify redirect to sign-in
2. **Form validation:** Try submitting empty form
3. **Stripe checkout:** Complete payment with test card 4242 4242 4242 4242
4. **Event creation:** Verify event created after payment
5. **Receipt email:** Check email received
6. **Cancel flow:** Start checkout, click back, verify return to form
7. **Double-use:** Try reusing same session_id

## Notes

- The old multi-step form is completely replaced. If detailed event setup is needed, consider adding it to the post-creation flow.
- No entitlement checking in new version since payment is required for all events.
- Backend receipt email functionality already exists and is tested.

## Next Steps

1. Manual testing with Stripe test mode
2. Verify email receipt delivery
3. Test edge cases (network failures, concurrent sessions, etc.)
4. Consider adding analytics tracking for payment funnel
