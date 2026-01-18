  Ticket 1.2 — Resend Integration
Type: Infrastructure
Risk: Low
Estimated effort: 1 hour
Context
Magic link auth requires transactional email. This ticket adds Resend as the email provider with a simple wrapper for sending.
Acceptance Criteria
Resend SDK installed (npm install resend)
RESEND_API_KEY added to .env.example
Email wrapper created at src/lib/email.ts
Wrapper exports sendMagicLinkEmail(to: string, token: string)
Email template is plain text, includes link with token
From address configurable via ENV (default: noreply@gather.app)
Implementation
// src/lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMagicLinkEmail(
  to: string,
  token: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
    to,
    subject: 'Sign in to Gather',
    text: `Click here to sign in to Gather:\n\n${link}\n\nThis link expires in 15 minutes.`,
  });
}
Environment Variables
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=Gather <noreply@yourdomain.com>
NEXT_PUBLIC_APP_URL=http://localhost:3000
Verification
Create test script that sends email to your address
Verify email arrives with correct link format
Verify link includes token parameter
  
  
  Implementation Summary

  ✅ 1. Resend SDK Installed

  npm install resend
  Status: 39 packages added, 0 vulnerabilities

  ✅ 2. Environment Variables Added

  Created: .env.example (new file)
  RESEND_API_KEY="re_..."
  EMAIL_FROM="Gather <noreply@yourdomain.com>"
  NEXT_PUBLIC_APP_URL="http://localhost:3000"

  Updated: .env (existing file)
  - Added RESEND_API_KEY="re_..." (placeholder - you need to add your actual key)
  - Added EMAIL_FROM="Gather <noreply@gather.app>"
  - Added NEXT_PUBLIC_APP_URL="http://localhost:3000"

  ✅ 3. Email Wrapper Created

  File: src/lib/email.ts

  Exports the sendMagicLinkEmail(to: string, token: string) function that:
  - Uses Resend SDK to send emails
  - Generates magic link with format: {baseUrl}/auth/verify?token={token}
  - Plain text email template
  - Configurable "from" address via ENV
  - 15-minute expiry message included

  ✅ 4. Test Script Created

  File: scripts/test-email.ts

  Features:
  - Validates RESEND_API_KEY is configured
  - Validates email format
  - Sends test magic link email
  - Provides verification checklist
  - Error handling with helpful tips

  ✅ 5. TypeScript Compilation

  Status: PASS ✓ - All types are correct

  ---
  Acceptance Criteria Review
  ┌───────────────────────────────────────────────┬─────────┬────────────────────────────────────┐
  │                   Criteria                    │ Status  │               Notes                │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ Resend SDK installed                          │ ✅ PASS │ resend package added               │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ RESEND_API_KEY added to .env.example          │ ✅ PASS │ Includes comments and instructions │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ Email wrapper created at src/lib/email.ts     │ ✅ PASS │ Matches specification exactly      │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ Wrapper exports sendMagicLinkEmail(to, token) │ ✅ PASS │ Function signature correct         │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ Email template is plain text                  │ ✅ PASS │ Uses text field, not HTML          │
  ├───────────────────────────────────────────────┼─────────┼────────────────────────────────────┤
  │ From address configurable via ENV             │ ✅ PASS │ Falls back to default if not set   │
  └───────────────────────────────────────────────┴─────────┴────────────────────────────────────┘
  ---
  Next Steps - USER ACTION REQUIRED ⚠️

  To complete the verification for Ticket 1.2, you need to:

  1. Get a Resend API Key

  1. Go to https://resend.com
  2. Sign up for a free account (100 emails/day)
  3. Go to API Keys: https://resend.com/api-keys
  4. Create a new API key
  5. Copy the key (starts with re_...)

  2. Update Your .env File

  Open .env and replace the placeholder:
  RESEND_API_KEY="re_your_actual_key_here"

  3. Configure Sending Domain (Optional)

  For testing: Resend allows you to send to your own email without domain verification.

  For production: You'll need to verify a domain in the Resend dashboard.

  For now, keep the default:
  EMAIL_FROM="Gather <noreply@gather.app>"

  4. Run the Test Script

  npx tsx scripts/test-email.ts your-email@example.com

  Replace your-email@example.com with your actual email address.

  5. Verify the Email

  Check your inbox (and spam folder) for:
  - Email arrives within 30 seconds
  - Subject: "Sign in to Gather"
  - Link format: http://localhost:3000/auth/verify?token=...
  - Message includes "This link expires in 15 minutes"

  ---
  Example Test Output

  $ npx tsx scripts/test-email.ts nigel@example.com

  🔍 Testing Resend email integration...

  📧 Sending test magic link to: nigel@example.com
  🔗 From: Gather <noreply@gather.app>
  🌐 Base URL: http://localhost:3000

  🔑 Test token: a1b2c3d4e5f6g7h8...

  ✅ Email sent successfully!

  Verification checklist:
    [ ] Email arrived within 30 seconds
    [ ] Subject line is "Sign in to Gather"
    [ ] Link includes token parameter: /auth/verify?token=a1b2c3d4e5f6g7h8...
    [ ] Link format is correct
    [ ] "Expires in 15 minutes" message is present

  📬 Check your inbox (and spam folder) now!

  ---
  Files Created/Modified

  Created:
  - ✅ .env.example - Environment variable template
  - ✅ src/lib/email.ts - Email sending wrapper
  - ✅ scripts/test-email.ts - Test script

  Modified:
  - ✅ .env - Added email environment variables
  - ✅ package.json - Added resend dependency

  ---
  Verification Status
  ┌───────────────────────────────────────────────┬───────────────────────────────────┐
  │               Verification Step               │              Status               │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Create test script that sends email           │ ✅ DONE                           │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Verify email arrives with correct link format │ ⏳ PENDING (requires user action) │
  ├───────────────────────────────────────────────┼───────────────────────────────────┤
  │ Verify link includes token parameter          │ ⏳ PENDING (requires user action) │
  └───────────────────────────────────────────────┴───────────────────────────────────┘
  ---
  Ready to Test!

  Once you:
  1. Add your RESEND_API_KEY to .env
  2. Run the test script
  3. Verify the email arrives correctly

  Then Ticket 1.2 will be COMPLETE and we can move on to Ticket 1.3 (Magic Link Send Flow).

  Would you like me to:
  1. Wait while you test the email functionality?
  2. Proceed to Ticket 1.3 (assuming you'll test later)?
  3. Help with any Resend setup issues?
