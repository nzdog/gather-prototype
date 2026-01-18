Ticket 1.6 — Host Claim Flow
Type: Feature
Risk: Medium (migration-critical)
Estimated effort: 3-4 hours
Context
This is the migration bridge. When an existing host uses their legacy host token, they're prompted to "claim" their host account by entering an email. This creates a User and links their existing events to it. This preserves the "do not break" constraint.
Acceptance Criteria
When accessing /h/[token], check if host Person has linked User
If no linked User: show claim prompt (email input)
Claim flow sends magic link to entered email
After verification: create User, link to host Person
After linking: redirect back to original host view
If already linked: check if current session user matches
If session user matches linked User: proceed normally
If no session but User exists: prompt to sign in
Schema Addition
// Add to Person model
model Person {
  // ... existing fields
  userId    String?  // Optional link to User account
  user      User?    @relation(fields: [userId], references: [id])
}
Flow Logic
1. User clicks legacy host link /h/[token]
2. Resolve token to Person (existing logic)
3. Check Person.userId:
If null → show claim form
If set → check session
4. Claim form submits email → creates MagicLink → sends email
5. User clicks magic link → verify → create/find User → set Person.userId → create session → redirect to /h/[token]
6. Now Person.userId is set and session exists → proceed to host view
UI Requirements
Claim prompt: "To continue managing your events, enter your email to create an account."
Email input + submit button
Success: "Check your email to complete setup"
After claim complete: seamless redirect to host view
Do Not Break
Legacy host tokens continue to resolve
Existing events remain accessible
Claiming is prompted but not forced (user can dismiss and view read-only? or force claim?)
Decision Required
Should claiming be required to edit, or just prompted? Recommendation: Required for edit actions, but allow read-only view without claiming. This preserves access while encouraging migration.
Verification
Access legacy host link → see claim prompt
Enter email → receive magic link
Click magic link → User created → Person.userId set → session active
Access same host link again → proceed directly to host view
Access from different browser → prompted to sign in



Summary of implementation:

  1. API Route (/api/h/[token]): Added logic to check if Person has userId and compare with current session user. Returns authStatus: 'unclaimed', 'requires_signin', or 'authenticated'.
  2. Claim Endpoint (/api/auth/claim): New endpoint that sends magic link with personId embedded. Includes rate limiting and enumeration prevention.
  3. Verify Endpoint (/api/auth/verify): Updated to handle Person linking when personId is provided in the request.
  4. Frontend (/h/[token]/page.tsx): Added claim form UI that appears when authStatus is 'unclaimed', and sign-in prompt when 'requires_signin'.
  5. Email Library: Exported getResendClient() for custom email sending in claim flow.

  Test Results:
  - ✓ Unclaimed accounts show claim prompt
  - ✓ Claim flow sends magic link with personId
  - ✓ Verification links Person to User
  - ✓ Session created after claiming
  - ✓ Claimed accounts require sign-in without session
  - ✓ Enumeration prevention (returns success even for already-claimed accounts)

  The implementation is ready to be committed.

