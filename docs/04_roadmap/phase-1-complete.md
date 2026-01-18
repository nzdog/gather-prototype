# Phase 1 Complete — Auth System

## What Was Built

### New Tables (Prisma schema)
- `User` — authenticated accounts (email, billingStatus)
- `Session` — 30-day persistent sessions
- `MagicLink` — short-lived email verification tokens
- `EventRole` — User ↔ Event relationship with role (HOST/COHOST/COORDINATOR)
- `Person.userId` — optional link from event-scoped Person to global User

### New Endpoints
- `POST /api/auth/magic-link` — send magic link email
- `GET /auth/verify?token=xxx` — verify magic link, create session
- `POST /api/auth/logout` — clear session
- `GET /auth/signin` — sign-in page

### New Lib Functions
- `src/lib/auth/session.ts` — `getUser()` helper
- `src/lib/email.ts` — Resend integration

### Modified Flows
- `/h/[token]` — shows claim prompt if Person not linked to User
- `/plan/events` — queries events via EventRole (not legacy hostId)
- Event creation — creates EventRole record for host

### Key Behaviors
- Legacy tokens (h/c/p) still work unchanged
- Hosts must claim account to edit (full-page prompt)
- Claimed hosts can sign in via email or use legacy token
- Coordinators/participants don't need accounts

## Environment Variables Added
```
RESEND_API_KEY=re_...
EMAIL_FROM=Gather <noreply@...>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## What's Next
Phase 2: Stripe + Entitlements (see docs/gather-phase2-tickets.docx)