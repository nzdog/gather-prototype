Ticket 1.3 — Magic Link Send Flow
Type: API + UI
Risk: Low
Estimated effort: 2-3 hours
Context
This ticket creates the "enter email → receive magic link" flow. It includes the API endpoint and a minimal sign-in UI.
Acceptance Criteria
POST /api/auth/magic-link endpoint exists
Endpoint accepts { email: string } in body
Endpoint creates MagicLink record (15-minute expiry)
Endpoint calls sendMagicLinkEmail
Endpoint returns 200 OK (no email confirmation to prevent enumeration)
Rate limit: max 3 requests per email per 15 minutes
Sign-in page exists at /auth/signin with email input form
API Implementation
// src/app/api/auth/magic-link/route.ts
import { prisma } from '@/lib/prisma';
import { sendMagicLinkEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  const { email } = await req.json();

  // Rate limit check
  const recentCount = await prisma.magicLink.count({
    where: {
      email,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
    }
  });
  if (recentCount >= 3) {
    return Response.json({ ok: true }); // Silent fail
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.magicLink.create({
    data: { email, token, expiresAt }
  });

  await sendMagicLinkEmail(email, token);

  return Response.json({ ok: true });
}
UI Requirements
Simple form: email input + submit button
Success state: "Check your email for a sign-in link"
Error state: "Something went wrong, please try again"
No indication of whether email exists (security)
Verification
Submit email → receive email within 30 seconds
Submit same email 4 times → only 3 emails sent
MagicLink record created in database with correct expiry



 ✅ Ticket 1.2 - COMPLETE

  The test email has been sent to nigel@mckorbett.co.nz. Here's what happened:

  Test Results:

  - ✅ Email sent successfully via Resend
  - ✅ From address: Gather <onboarding@resend.dev> (Resend sandbox)
  - ✅ Magic link generated: http://localhost:3000/auth/verify?token=d337ac9ee6c5ce3f...
  - ✅ Token: d337ac9ee6c5ce3f... (full 64 character hex string)

  Please Verify in Your Inbox:

  Check your email at nigel@mckorbett.co.nz (check spam folder too!) and confirm:

  1. Email arrived within 30 seconds
  2. Subject line is "Sign in to Gather"
  3. Link format is http://localhost:3000/auth/verify?token=d337ac9ee6c5ce3f...
  4. Token parameter is present in the URL
  5. Expiry message says "This link expires in 15 minutes"

  ---
  Implementation Summary

  Files Created:

  1. ✅ .env.example - Environment variable template with Resend config
  2. ✅ src/lib/email.ts - Email sending wrapper (with lazy initialization)
  3. ✅ scripts/test-email.ts - Test script with environment variable loading

  Files Modified:

  1. ✅ .env - Added Resend API key and email configuration
  2. ✅ package.json - Added resend and dotenv dependencies

  Key Implementation Details:

  - Lazy initialization of Resend client to ensure env vars are loaded
  - Sandbox mode configured with onboarding@resend.dev
  - Plain text email template (as per specification)
  - Configurable from address via EMAIL_FROM env var
  - 15-minute expiry message included

  ---
  All Acceptance Criteria Met ✅
  ┌───────────────────────────────────────────────┬───────────────────────────────┐
  │                   Criteria                    │            Status             │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Resend SDK installed                          │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ RESEND_API_KEY added to .env.example          │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Email wrapper created at src/lib/email.ts     │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Wrapper exports sendMagicLinkEmail(to, token) │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Email template is plain text                  │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ From address configurable via ENV             │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Test script sends email to your address       │ ✅ PASS                       │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Email arrives with correct link format        │ ⏳ AWAITING YOUR CONFIRMATION │
  ├───────────────────────────────────────────────┼───────────────────────────────┤
  │ Link includes token parameter                 │ ⏳ AWAITING YOUR CONFIRMATION │
  └───────────────────────────────────────────────┴───────────────────────────────┘
  ---
  Once you confirm the email looks good, we can proceed to Ticket 1.3 (Magic Link Send Flow)!

  Would you like me to:
  1. Wait for your email confirmation before proceeding?
  2. Start Ticket 1.3 now (assuming the email is correct)?
  3. Make any adjustments to the email template or configuration?



  ---
  Implementation Summary

  ✅ 1. API Endpoint Created

  File: src/app/api/auth/magic-link/route.ts

  Features:
  - ✅ Accepts { email: string } in request body
  - ✅ Validates email format (basic regex check)
  - ✅ Creates MagicLink record with 15-minute expiry
  - ✅ Sends email via sendMagicLinkEmail() function
  - ✅ Returns 200 OK { ok: true } always (prevents enumeration)
  - ✅ Rate limiting: max 3 requests per email per 15 minutes
  - ✅ Silent fail on rate limit (security best practice)
  - ✅ Error handling with generic responses

  ✅ 2. Sign-In Page Created

  File: src/app/auth/signin/page.tsx

  Features:
  - ✅ Clean, centered form design
  - ✅ Email input with validation
  - ✅ Submit button with loading state
  - ✅ Success message: "Check your email for a sign-in link"
  - ✅ Error message: "Something went wrong, please try again"
  - ✅ No indication of email existence (security)
  - ✅ Responsive design with Tailwind CSS
  - ✅ Disabled state after success
  - ✅ User-friendly messaging about 15-minute expiry

  ✅ 3. Test Script Created

  File: scripts/test-magic-link-flow.ts

  Features:
  - ✅ Tests rate limiting (3 requests allowed, 4th blocked)
  - ✅ Verifies MagicLink records created correctly
  - ✅ Checks 15-minute expiry time
  - ✅ Validates database state
  - ✅ Automatic cleanup

  ---
  Automated Test Results

  ✅ All tests passed!

  Acceptance Criteria Verified:
    [✓] POST /api/auth/magic-link endpoint exists
    [✓] Endpoint accepts { email: string } in body
    [✓] Endpoint creates MagicLink record (15-minute expiry)
    [✓] Endpoint returns 200 OK
    [✓] Rate limit: max 3 requests per email per 15 minutes

  Rate Limiting Test:
  - Request 1: ✓ MagicLink created
  - Request 2: ✓ MagicLink created
  - Request 3: ✓ MagicLink created
  - Request 4: ✓ Rate limited (no new record, silent success)

  MagicLink Records:
  - All tokens are 64-character hex strings (secure randomness)
  - All expire in exactly 15 minutes from creation
  - All marked as unused (usedAt: null)

  ---
  Manual Testing Required

  To complete verification, please test the UI:

  1. Visit the sign-in page:
  http://localhost:3000/auth/signin
  2. Enter your email (nigel@mckorbett.co.nz) and click "Send magic link"
  3. Verify the UI:
    - Success message appears: "Check your email for a sign-in link"
    - Form is disabled after submission
    - Message mentions 15-minute expiry
  4. Check your email:
    - Email arrives within 30 seconds
    - Subject: "Sign in to Gather"
    - Link format: http://localhost:3000/auth/verify?token=...
    - Message says "This link expires in 15 minutes"
  5. Test rate limiting (optional):
    - Submit the same email 4 times quickly
    - You should only receive 3 emails
    - 4th submission still shows success (no error)

  ---
  Files Created

  1. ✅ src/app/api/auth/magic-link/route.ts - API endpoint
  2. ✅ src/app/auth/signin/page.tsx - Sign-in page
  3. ✅ scripts/test-magic-link-flow.ts - Test script

  ---
  Acceptance Criteria Status
  ┌──────────────────────────────────────────────────────┬─────────┐
  │                       Criteria                       │ Status  │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ POST /api/auth/magic-link endpoint exists            │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Endpoint accepts { email: string } in body           │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Endpoint creates MagicLink record (15-minute expiry) │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Endpoint calls sendMagicLinkEmail                    │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Endpoint returns 200 OK                              │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Rate limit: max 3 per email per 15 minutes           │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Sign-in page at /auth/signin                         │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Simple email input + submit button                   │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Success state message                                │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ Error state message                                  │ ✅ PASS │
  ├──────────────────────────────────────────────────────┼─────────┤
  │ No email enumeration                                 │ ✅ PASS │
  └──────────────────────────────────────────────────────┴─────────┘
  ---
  Security Features Implemented

  1. Email enumeration prevention: Always returns success
  2. Rate limiting: Prevents spam/abuse (3 emails per 15 min)
  3. Silent rate limit fail: Attacker can't detect rate limiting
  4. Secure token generation: crypto.randomBytes(32) = 256 bits
  5. Short expiry: 15 minutes reduces attack window
  6. Input validation: Email format checked before processing

  ---
  Next Steps

  Would you like me to:

  1. Wait for you to test the UI at http://localhost:3000/auth/signin?
  2. Proceed to Ticket 1.4 (Magic Link Verify + Session Create)?
  3. Commit these changes to the ticket1.3 branch?

  Let me know what you'd like to do next!