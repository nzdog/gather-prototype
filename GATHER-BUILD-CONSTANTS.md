# GATHER BUILD CONSTANTS

Reference file for AI executors and developers. Keep this file accurate.
Last updated: 2026-07-09.
CLAUDE.md reviewed: no conflicts or additions found.

---

## Executor Preamble
Every AI executor must follow these steps in order before touching any code,
regardless of ticket type:

1. Read this file (GATHER-BUILD-CONSTANTS.md) in full
2. Read the relevant ticket template in full:
   - Bug tickets: BUG-TICKET-TEMPLATE.md (complex/multi-actor bugs:
     BUG-TICKET-TEMPLATE-FULL.md)
   - UX tickets: UX-TICKET-TEMPLATE.md
   - Feature, chore, and spike tickets: no dedicated template exists.
     Follow the BUG-TICKET-TEMPLATE.md structure and recent precedents
     in docs/tickets/ (e.g. GTC-152 for a chore).
   - If the ticket involves unexpected platform behaviour, stale UI
     state, auth anomalies, or DB irregularities, also read
     GATHER-KNOWN-BEHAVIOURS.md

3. Perform a ticket compliance check against the relevant template.
   Return a punch-list of any fields that are:
   - Empty or unfilled (placeholders not replaced)
   - Inconsistent with another field in the same ticket
   - Ambiguous in a way that would require interpretation to execute
   - Missing required information for the declared severity level
   - In conflict with this constants file

   Format:
   TICKET COMPLIANCE CHECK — GTC-XXX
   [ ] Issue: [field name] — [what is wrong and what is needed]
   CLEAR — no issues found (if applicable)

   If any issues found → STOP and paste punch-list. Await instruction.
   If CLEAR → state "Compliance check passed — proceeding to preflight"
   and continue.

4. Run the Preflight Sanity Sequence defined in this file
5. Proceed to ticket execution

---

## Executor Output Contract

For every ticket executed, before committing:

1. Fill in the **Evidence (Executor-Completed)** section of the ticket with root cause,
   files changed, test results, assertions checked, and commit hash.
2. Save the completed ticket as `docs/tickets/GTC-XXX.md` (using the ticket number)
   in the repo — create the `docs/tickets/` folder if it doesn't exist.
3. Commit everything together — the fix, the regression test, and the completed
   ticket — in a single commit.

---

## Base Branch

`master` — all work branches off `master` and PRs merge back to `master`.

Branching convention: feature branches are not enforced by tooling; the repo has
dependabot branches (`dependabot/npm_and_yarn/*`) alongside `master`. Use
descriptive branch names prefixed by ticket ID where applicable (e.g. `GTC-001-fix-session-cookies`).

---

## Run Commands

```bash
# Install dependencies
npm install

# Start local dev server (Turbopack)
npm run dev
```

> **Important:** Do NOT set `"type": "commonjs"` in `package.json`. Next.js
> handles module transpilation internally; that field causes Turbopack to reject
> ESM source files with HTTP 500 errors.

---

## Test Commands

No Jest, Vitest, or Playwright config files are present in this repo.
The test suite consists of security-validation scripts run via `tsx`.

```bash
# Security test suite (preflight gate)
npm run test:security
```

---

## Preflight Sanity Sequence

| Step | Command | Expected success signal |
|------|---------|------------------------|
| Install | `npm install` | Exits 0, no peer-dep errors |
| DB migrate | `npm run db:migrate` | `All migrations have been successfully applied` |
| Boot | `npm run dev` | Turbopack prints `Ready` on `http://localhost:3000` |
| Smoke | `npm run test:security` | Exits 0 |
| Security suite | `npm run test:security` | Exits 0 |

> **Pre-existing known issues (do not fix without a dedicated ticket):**
> - DB schema drift (P3005): `gather_dev` schema was applied outside migration
>   history. `prisma migrate dev` detects drift and prompts for reset;
>   `prisma migrate deploy` errors with P3005. The DB is functional — security
>   tests confirm connection. Fix requires baselining the existing schema.

---

## DB Commands

```bash
# Apply pending migrations (dev — also generates Prisma client)
npm run db:migrate

# Apply migrations without prompts (CI / production)
npm run db:migrate:deploy

# Reset database (drops all data, re-applies all migrations, re-runs seed)
npm run db:reset

# Seed database only
npm run db:seed

# Regenerate Prisma client without migrating
npm run db:generate
```

Database: PostgreSQL, configured via `DATABASE_URL`.
Seed file: `prisma/seed.ts` (run via `tsx`).

---

## Async Trigger Methods

### Stripe Webhooks (local)

Use the Stripe CLI to forward webhook events to the local server:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This outputs a `whsec_...` signing secret — use it as `STRIPE_WEBHOOK_SECRET`
in your `.env` for the duration of the local session.

To trigger a specific event manually:

```bash
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

### Stripe Webhooks (staging/production)

Configure the webhook endpoint in **Stripe Dashboard > Developers > Webhooks**.
Point it to `https://<your-domain>/api/webhooks/stripe`. Copy the signing secret
into the `STRIPE_WEBHOOK_SECRET` environment variable on the deployment platform.

### SMS / Twilio (test)

Use Twilio test credentials (Test Account SID and Auth Token from the Twilio
Console). Test credentials accept API calls but do not send real SMS messages.
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` in
`.env` to the test values.

To trigger the auto-nudge cron job locally, call the endpoint directly:

```bash
# Via Authorization header (GET or POST both accepted)
curl http://localhost:3000/api/cron/nudges \
  -H "Authorization: Bearer <CRON_SECRET>"

# Via query param
curl "http://localhost:3000/api/cron/nudges?secret=<CRON_SECRET>"
```

**Cron routes in `src/app/api/cron/`:**

| Route file | Method | HTTP path | Purpose | Intended schedule |
|------------|--------|-----------|---------|-------------------|
| `src/app/api/cron/nudges/route.ts` | GET / POST | `/api/cron/nudges` | Runs the nudge scheduler — sends SMS auto-nudges to event participants | Every 15 minutes |
| `src/app/api/cron/wrap-up-dispatch/route.ts` | GET / POST | `/api/cron/wrap-up-dispatch` | Dispatches pending wrap-up thank-you messages (10 min delay after creation) | Every 10 minutes |

---

## Environment Variables

All variables below are required unless marked OPTIONAL.
Actual values are redacted. Copy `.env.example` to `.env` and fill in real values.

| Variable | Purpose | Location |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `.env` / Railway env |
| `ANTHROPIC_API_KEY` | Claude AI plan generation | `.env` / deployment env |
| `RESEND_API_KEY` | Magic-link transactional email | `.env` / deployment env |
| `EMAIL_FROM` | Sender address for transactional email | `.env` / deployment env |
| `NEXT_PUBLIC_APP_URL` | Base URL for magic-link generation | `.env` / deployment env |
| `STRIPE_SECRET_KEY` | Stripe API access | `.env` / deployment env |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | `.env` / deployment env |
| `STRIPE_PRICE_ID` | Stripe subscription price ID | `.env` / deployment env |
| `TNZ_AUTH_TOKEN` | SMS via TNZ for NZ (+64) and AU (+61) — obtain from TNZ Dashboard → Users → API tab → Auth Token. Required for production NZ delivery (Twilio does not deliver to NZ). | `.env` / deployment env |
| `TWILIO_ACCOUNT_SID` | SMS via Twilio for non-NZ/AU destinations (OPTIONAL) | `.env` / deployment env |
| `TWILIO_AUTH_TOKEN` | SMS via Twilio for non-NZ/AU destinations (OPTIONAL) | `.env` / deployment env |
| `TWILIO_PHONE_NUMBER` | Twilio sender number (OPTIONAL) | `.env` / deployment env |
| `CRON_SECRET` | Authenticates cron-job HTTP requests | `.env` / deployment env |

Template: `.env.example` at repo root.

---

## Do-Not-Touch Zones

The following areas must not be refactored without explicit instruction. They are
high-risk, tightly coupled to security invariants, or carry subtle correctness
requirements verified by the security test suite.

### 1. Session & Cookie Management (`src/lib/auth*`, `middleware.ts` at repo root)
Role-scoped session cookies were a hard-won fix (GTC-001). The cookie naming and
scoping logic that separates host sessions from participant sessions must not be
changed. Breaking this re-introduces session collision bugs.

### 2. Magic-Link Auth Flow (`src/app/api/auth/`, `prisma/schema.prisma` — `MagicLink`, `Session`, `User`)
The tokenised magic-link flow is the sole authentication mechanism. Any change
to token generation, expiry, consumption, or session creation risks locking
users out entirely.

### 3. AccessToken & Scope System (`prisma/schema.prisma` — `AccessToken`, `TokenScope`)
Participant, coordinator, and host access is gated by `AccessToken.scope`. The
uniqueness constraint `[eventId, personId, scope, teamId]` and the scoped cookie
system are interdependent. Do not alter token issuance, validation, or scope
logic without a full security re-audit.

### 4. Stripe Integration (`src/app/api/webhooks/stripe/`, `src/lib/stripe*`, `prisma/schema.prisma` — `Subscription`, `User.billingStatus`)
Webhook signature verification, idempotency, and billing-status transitions are
critical for payment integrity. Changes here affect real money.

### 5. Prisma Migrations (`prisma/migrations/`)
Never hand-edit migration SQL files. Never delete or reorder migrations. Always
use `prisma migrate dev` to generate new migrations. The production deploy
command (`prisma migrate deploy`) applies them in order.

### 6. Security Test Suite (`tests/security-*.ts`, `scripts/triage-unknown-routes.ts`)
These tests define the security contract for the API surface. Do not weaken or
skip assertions to make tests pass. If a test fails, fix the underlying issue.

### 7. SMS Opt-Out Logic (`prisma/schema.prisma` — `SmsOptOut`, `Person.smsOptedOut`)
Opt-out state must be respected in all nudge-sending code paths. Bypassing it
could constitute illegal sending under TCPA/spam regulations.

### 8. `package.json` — do not add `"type": "commonjs"`
See CLAUDE.md. This field breaks Turbopack and returns HTTP 500 on all routes.
