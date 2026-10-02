# GATHER BUILD CONSTANTS

Reference file for AI executors and developers. Keep this file accurate.
Last updated: 2026-10-02 (GTC-258: `test:security`'s live layer and `test:cron-health` wait on zero
text retries waiting, and the live layer's no-send count includes `OutboundMessage`). Previously
2026-10-01 (GTC-264 / GTC-229: `TNZ_CALLBACK_SECRET` and `TNZ_CALLBACK_SENDER` in
the environment table; `test:security`'s live layer, 15 → 18 without a server). Previously
2026-10-01 (Known failures: `npm run lint` exits 1, recorded at GTC-335 on founder
instruction). Previously 2026-09-30 (cron health, GTC-339: the sending crons fail per channel, the
nudges cron only when it cannot queue; outbound-dispatch in the cron table; production's crons are
called by an outside scheduler; the approved exceptions to "no cron against gather_dev" listed in
full). Previously 2026-09-30 (the security suite's decide-by precondition widened to phone or
email on a live event, GTC-251 slice 251b, on founder ruling 4.5). Previously 2026-09-29
(Live sending, GTC-274's one live switch, on founder ruling of 2026-09-29). Previously
2026-09-27 (Zone 9, email opt-out and block, added on founder ruling D7 at GTC-189 slice 8a).
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
   - Citations, in tickets and in code comments: the Citations section of
     BUG-TICKET-TEMPLATE.md is binding on every ticket type (GTC-222).
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

`feat/moment-one-redesign` — this is the working trunk in practice. As of
2026-08-10 it is 161 commits ahead of `master`, and `master`'s HEAD is exactly
their merge-base — it has not moved since 2026-04-10. Day-to-day work branches
off `feat/moment-one-redesign` and merges back into it; `master` is not the
active integration target.

Superseded (kept for history): the repo was originally set up so all work
branched off `master` and PRs merged back to `master`. That convention is no
longer followed.

Branching convention: feature branches are not enforced by tooling; the repo has
dependabot branches (`dependabot/npm_and_yarn/*`) alongside `master`. Use
descriptive branch names prefixed by ticket ID where applicable (e.g. `GTC-001-fix-session-cookies`).

---

## Deploy

**Railway auto-deploy from `master` is OFF as of 2026-08-10** (changed by
Nigel). Deploys are now manual, triggered from Railway's Deployments tab.
Consequence: merging to `master` no longer deploys anything by itself.

**Caveat — this decouples deploy timing, not the database.** Turning off
auto-deploy only separates code delivery from *when* a deploy happens. It does
NOT separate code from the production database: schema migrations still apply
to the production database the moment code carrying them is deployed and run,
regardless of how that deploy was triggered. Rehearse any migration against a
copy of the production database before triggering a deploy that carries one.

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

### The gate is every `test:*` script
*(Founder ruling, 2026-09-27, GTC-189 slice 8.)* From GTC-189 slice 8b on, a
change is gated on **every `test:*` script in `package.json`**, not a chosen
list. So nothing in that namespace may send a real message: the live TNZ smoke
send is `npm run live:tnz-sms` (was `test:tnz-sms`), outside it.

### Live sending — one switch, production only
*(Founder ruling, 2026-09-29, GTC-274.)* **Gather sends a real text or email only
where `GATHER_LIVE_SENDS` is exactly `on`.** Anywhere else (your Mac, a test, a
script, the dev server) every send stops at its last step before the provider,
whatever keys are present, and the tests still run in full.
- **Production sets it** as a Railway service variable. **The deploy checks it:**
  `scripts/check-live-sends.mjs` is the first step of `npm run build`. Whenever
  `RAILWAY_ENVIRONMENT_NAME` is set it prints one line naming the environment
  and whether live sending is on. On `production` without the setting it refuses
  the build. Confirm that line in the build log at every deploy.
- **Only `on` is on.** Unset, empty, `true` and `1` are all off. It is read at
  every call, never cached.
- **Where it sits:** after the opt-out checks (Zone 7, first and untouched) and
  after provider choice and configuration, at the last step before the network:
  `sendSms`, `sendViaTnz` and `getResendClient`.
- **What a stop does:** a text returns `SMS_DISABLED` with the words "live
  sending is off", and writes no InviteEvent. An email returns `success: false`
  with no provider code. Neither is ever recorded or reported as sent. A text
  stopped by the switch counts as not got out on its sending cron's text channel,
  and a stopped email on its email channel (GTC-339, see *Cron health*). The nudges
  cron does not read the switch: it sends nothing.
- **No exemptions.** Sign-in links stop too. On the founder's Mac, mail to his
  own address worked from 2026-09-27 (GTC-247) and now stops at the switch.
  Local sign-in goes through the founder's own tooling.
- **A deliberate live run** is one named script, with the setting on for that
  one process only, to the founder's own number or address, on the founder's word
  in chat. **Never the dev server, and never a test suite.**
- **Never set it in `.env` or `.env.local`.** `test:live-switch` fails if either
  file does (it checks presence only). In tests, only
  `tests/helpers/provider-trap.ts` may open the gate (`liveBehindTrap`), and only
  behind walls that stop every request from leaving the process.
  `test:live-switch` fails if any other file in `tests/` or `scripts/` sets it.

### Known failures — environment-bound, not regressions
Each fails identically at an unmodified HEAD, and each waits on something
outside the code. Confirm a failure is one of these by re-running at HEAD, never
by assuming.

- `test:gtc280-paid` — waits on `GTC280_PAID_SESSION_ID`, a really-paid Stripe
  test-mode checkout session (GTC-280). Run deliberately, never casually.
- `test:demo-ui` — 1 of 4, *"Participant API identifies demo event by known
  event name"*: the demo event's name drift, GTC-333.
- `npm run lint` — exits 1 at 86c211e with 57 errors and 42 warnings across 46
  files, none from recent tickets (recorded at GTC-335, 2026-10-01, on founder
  instruction; counted then in a scratch worktree at 86c211e). Among the errors
  is a config one: the rule `@typescript-eslint/no-require-imports` has no
  definition. `next build` does not run ESLint at all (`ignoreDuringBuilds: true`
  in `next.config.js`, temporary until GTC-221's findings are cleared), so the
  build stays green whatever lint says. Compare a ticket's lint run with these
  counts; a new finding in a file the ticket touched is that ticket's.

*(Retired at GTC-274, 2026-09-29: `test:email-send-result`'s wait on
`GTC265_PROBE_KEY`, and `test:nudge-provider-gate`'s ambient-provider guard.
Both suites now run green on any machine, with fake credentials behind the
switch.)*

- `tests/sms-validation-test.ts` was **retired at GTC-274** (2026-09-29) without
  being run again. Its five cases are in `test:live-switch`, on a fixture that
  suite creates and removes by id.

### `test:security`'s live layer needs the dev server
*(Founder ruling, 2026-09-28, GTC-337 preflight.)* Without a dev server on
:3000, `test:security` fails its 18 live assertions (15 until GTC-264 / GTC-229 added three:
Suite 15's two refusals at `/api/sms/tnz-webhook` and its 404 at `/api/sms/inbound`; its fourth
live assertion, that nothing was written, passes with or without a server). That is not a
regression.
Start the server with the provider keys blanked for that process only, and never
edit `.env.local`:
`RESEND_API_KEY= TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_PHONE_NUMBER= TNZ_AUTH_TOKEN= npm run dev`.
The live layer drives only two cron routes, and only behind asserted
preconditions (GTC-270):
- `/api/cron/wrap-up-dispatch`, after zero undispatched `WrapUpLink` rows;
- `/api/cron/decide-by-followups`, after zero decide-by candidates: an unstamped maybe with a phone
  or an email, on a sent and live event (widened at GTC-251 slice 251b, when the follow-up gained
  its email leg).
- Both, since GTC-258, also after zero text retries waiting: a "please decide" follow-up or a
  thank-you whose text TNZ reported did not arrive and that has no email retry yet. Both crons now
  send that one retry, so the live layer counts it before driving either.

Since GTC-264 / GTC-229 it also calls `/api/sms/tnz-webhook` twice, with no credential and with
made-up ones, and `GET /api/sms/inbound` once; none is a cron, all are refused or absent, and it
asserts no `SmsDeliveryReport` or `SmsOptOut` row was written.

It never drives `/api/cron/nudges` with a valid secret, and it fails if the
`InviteEvent` count or (since GTC-258, when a text's record became an `OutboundMessage`) the
`OutboundMessage` count moves. Since GTC-274 both drives wait on their own
preconditions, and the dev server is never live, so it cannot send whatever its
keys are. The blanked keys stay as a second wall. Still check both counts
before starting, and stop if either is non-zero.

### The approved exceptions to "no cron against `gather_dev`"
*(Listed in full at GTC-339, 2026-09-30, on founder ruling.)* Three drives of a
cron route, and only these:

1. **`test:security`'s live layer**, over HTTP to the dev server, as above. Its
   preconditions: zero undispatched `WrapUpLink` rows, zero decide-by candidates
   and zero text retries waiting, as above. It fails if the `InviteEvent` or
   `OutboundMessage` count moves.
2. **`tests/nudge-provider-gate-test.ts` layer D**, which imports
   `/api/cron/nudges`'s `GET` and calls it in process, unscoped. The scheduler only
   queues, and every row the run wrote is removed and the `OutboundMessage` count
   asserted restored (founder ruling D1, 2026-09-27).
3. **`test:cron-health`** (`tests/cron-send-health-test.ts`, GTC-339), which calls
   the three sending routes' `GET` in process, on its own fixtures, and opens the
   live gate only through `liveBehindTrap`, behind the trap. Its preconditions,
   counted outside its fixtures before every drive, must all be zero, or it stops
   before driving anything:
   - the drain's rows (`findNeverAttempted`'s and `findDueForRetry`'s where clauses);
   - late arrivals the mini-send sweep would enrol (`enrolMiniSends`'s own predicate);
   - the delivery poll's rows (accepted `EMAIL` rows it has not finished with);
   - undispatched `WrapUpLink` rows, and the decide-by count above;
   - text retries waiting (GTC-258): follow-up or thank-you texts TNZ reported failed, not yet
     retried by email.
   After every case it asserts the `OutboundMessage`, `InviteEvent` and
   `WrapUpLink` counts are as found, and that every fixture is removed by id.

Suites that call a dispatcher directly (`drainOnce`,
`dispatchPendingWrapUpMessages`) rather than a route are **not** on this list
until each is shown to scope or guard its call: GTC-343.

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
> - None currently open. The P3005 schema-drift issue formerly listed here was
>   resolved by baselining (2026-03-14) and re-confirmed clean by a live
>   `prisma migrate status` run on 2026-08-06 (37 migrations found, "Database
>   schema is up to date!"). See GTC-215 for the correction history.

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

To trigger a cron job locally, call the endpoint directly. **`CRON_SECRET` must be
set in the server's environment — GTC-270 made these routes fail closed, so an unset
secret refuses every caller with 401 rather than admitting everyone.** Note that
Next loads `.env.local` and `tsx` does not, so a script and the dev server can
disagree about whether it is set.

```bash
# Via Authorization header (GET or POST both accepted)
curl http://localhost:3000/api/cron/nudges \
  -H "Authorization: Bearer <CRON_SECRET>"

# Via query param
curl "http://localhost:3000/api/cron/nudges?secret=<CRON_SECRET>"
```

**Cron routes in `src/app/api/cron/`:**

**Production's crons are called by an outside scheduler, not by `vercel.json`:
Railway does not read that file** (found at GTC-339's scoping, 2026-09-30). GTC-042
set up cron-job.org for the nudges cron; GTC-220 speaks of EasyCron jobs. What calls
them today is to be confirmed from the platform logs before the deploy (GTC-270).
The schedules below are the ones in `vercel.json`, and that outside scheduler must
match them.

| Route file | Method | HTTP path | Purpose | Intended schedule |
|------------|--------|-----------|---------|-------------------|
| `src/app/api/cron/nudges/route.ts` | GET / POST | `/api/cron/nudges` | Runs the nudge scheduler — queues due reminders as `OutboundMessage` rows; the dispatcher sends them (GTC-189 slice 8b) | Every 15 minutes |
| `src/app/api/cron/outbound-dispatch/route.ts` | GET / POST | `/api/cron/outbound-dispatch` | The press's drain (`drainOnce`): asks, reminders and mini-sends, by text and email; then the delivery poll (GTC-189 slice 5, GTC-289) | Every 2 minutes |
| `src/app/api/cron/wrap-up-dispatch/route.ts` | GET / POST | `/api/cron/wrap-up-dispatch` | Dispatches pending wrap-up thank-you messages (10 min delay after creation). Sends SMS **and email** — email is the fallback when SMS fails, and the primary channel for `channel: 'email'` links | Every 10 minutes |
| `src/app/api/cron/decide-by-followups/route.ts` | GET / POST | `/api/cron/decide-by-followups` | Sends the maybe's single decide-by follow-up, by text or email (GTC-175 / D2, GTC-251) | Every 15 minutes |

### Cron health
*(Founder rulings Q1 and Q2, 2026-09-30, GTC-339.)* A cron's status code and
`success` are its verdict. A failed run answers **500 with `success: false`**.
- **The three sending crons** (outbound-dispatch, wrap-up-dispatch,
  decide-by-followups) fail a run when, **on either channel**, it had sends to make
  and none of them got out (`sendRunHealth` in `src/lib/send-health.ts`). Nothing to
  send is healthy, and so is a partial failure. A text withheld `SMS_DISABLED` (no
  provider, or the live switch off) counts as not got out; a withholding for a reason
  about the guest or the host never counts. The body's `health` field carries each
  channel's counts and `failedChannels`. The delivery poll never fails the
  outbound-dispatch run.
- **The nudges cron** fails only when it cannot line reminders up. It sends nothing,
  so it does not read provider configuration or the live switch.
- The deploy turns on the outside scheduler's failure emails, so a failed run
  reaches the founder (GTC-189's gathered list).

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
| `GATHER_LIVE_SENDS` | **Production only.** Exactly `on` means Gather sends real texts and email; anything else, including unset, stops every send at its last step (GTC-274). Set on Railway production and checked by the build; never in `.env` or `.env.local`. See *Live sending*. | Railway production env only |
| `TNZ_AUTH_TOKEN` | SMS via TNZ for NZ (+64) and AU (+61) — obtain from TNZ Dashboard → Users → API tab → Auth Token. Required for production NZ delivery (Twilio does not deliver to NZ). | `.env` / deployment env |
| `TNZ_CALLBACK_SECRET` | Authenticates TNZ's calls to `/api/sms/tnz-webhook`, the one URL for delivery reports and replies (GTC-264, GTC-229). The webhook APIKey set in the TNZ Dashboard (Users → API User → API → Reporting), sent raw in `Authorization` and echoed as the body's `APIKey`; both are checked. Not `TNZ_AUTH_TOKEN`. **Required, not optional** — unset or empty refuses every caller, following `CRON_SECRET`'s precedent, and TNZ retry a refused call every five minutes for 24 hours. | `.env` / deployment env |
| `TNZ_CALLBACK_SENDER` | The identity half of the same credential: the webhook Sender set on the same Dashboard screen, sent as `X-Sender` and the body's `Sender`; both are checked. **Required, not optional** — refuses every caller when unset, as above. | `.env` / deployment env |
| `TWILIO_ACCOUNT_SID` | SMS via Twilio for non-NZ/AU destinations (OPTIONAL) | `.env` / deployment env |
| `TWILIO_AUTH_TOKEN` | SMS via Twilio for non-NZ/AU destinations (OPTIONAL) | `.env` / deployment env |
| `TWILIO_PHONE_NUMBER` | Twilio sender number (OPTIONAL) | `.env` / deployment env |
| `UNSUBSCRIBE_TOKEN_SECRET` | Signs the per-event email unsubscribe links (GTC-296). **Required, not optional** — fails closed when unset, following `CRON_SECRET`'s precedent: reading a token returns null (404) and minting one throws, so no guest email is sent at all rather than one with no way out. Changing it invalidates links already in mailboxes. | `.env` / deployment env |
| `CRON_SECRET` | Authenticates cron-job HTTP requests. **Required, not optional** — since GTC-270 an unset or empty value refuses every caller rather than admitting them | `.env` / deployment env |

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

### 4. Stripe Integration (`src/app/api/webhooks/stripe/`, `src/app/api/billing/*`, `src/lib/stripe*`, `prisma/schema.prisma` — `Subscription`, `User.billingStatus`)
Webhook signature verification, idempotency, and billing-status transitions are
critical for payment integrity. Changes here affect real money.

> `src/app/api/billing/*` was added by GTC-280, which found the letter and the
> intent of this zone disagreeing: the checkout, portal, cancel and status
> routes are Stripe integration by any reading, and none of them was named. A
> zone that does not name the files it means is a zone that gets walked past
> honestly.

### 5. Prisma Migrations (`prisma/migrations/`)
Never hand-edit migration SQL files. Never delete or reorder migrations. Always
use `prisma migrate dev` to generate new migrations. The production deploy
command (`prisma migrate deploy`) applies them in order.

⚠ **A MIGRATION IS READ BEFORE THE COMMIT, NOT ONLY BEFORE THE APPLY.**
*(Standing rule, added 2026-09-19 on founder ruling, out of GTC-289 phase 3a.)*

The reason is the sentence above it: migrations may not be deleted or reordered.
So the two states are not equally reversible.

- **Uncommitted**, a rejected column is a deleted folder: remove it, edit the
  schema, regenerate. Nothing is lost and nothing is recorded.
- **Committed**, it cannot be removed without rewriting history, so every
  correction arrives as a SECOND migration and a SECOND rehearsal.

**So the sequence is: generate with `--create-only --skip-generate`, surface the
SQL, rehearse against a clone, and hold BOTH the commit and the apply until the
SQL is approved.** Holding only the apply protects the database and leaves the
irreversible half — the commit — already taken.

The rehearsal shape that goes with it, per the Deploy caveat below and the
precedent in GTC-189 slice 4 and GTC-289 phase 3a: clone with
`pg_dump --no-owner --no-acl`, apply to the clone with **`prisma migrate deploy`
and never `migrate dev`** (which can offer to RESET a transferred database),
measure `pg_class.relfilenode` before and after to prove an `ADD COLUMN` was
metadata-only rather than asserting it, probe behaviour in transactions that are
rolled back, then drop the clone. Apply migrations first and regenerate the
client second (KB-005).

### 6. Security Test Suite (`tests/security-*.ts`, `scripts/triage-unknown-routes.ts`)
These tests define the security contract for the API surface. Do not weaken or
skip assertions to make tests pass. If a test fails, fix the underlying issue.

### 7. SMS Opt-Out Logic (`prisma/schema.prisma` — `SmsOptOut`, `Person.smsOptedOut`)
Opt-out state must be respected in all nudge-sending code paths. Bypassing it
could constitute illegal sending under TCPA/spam regulations.

### 8. `package.json` — do not add `"type": "commonjs"`
See CLAUDE.md. This field breaks Turbopack and returns HTTP 500 on all routes.

### 9. Email Opt-Out and Block (`prisma/schema.prisma` — `EmailOptOut`, `EmailBlock`; `src/lib/eligibility/email-opt-out.ts`, `src/lib/eligibility/email-block.ts`)
*(Added 2026-09-27 on founder ruling D7, GTC-189 slice 8a. Mirrors Zone 7.)*

The email twin of Zone 7. `EmailOptOut` is a guest's no to one event (GTC-296);
`EmailBlock` is an address the email provider will not deliver to, for any
host (GTC-324 — spam complaints, hard bounces, suppressions). Both must be
respected in every guest-bound email path: the chooser
(`src/lib/eligibility/channel-chooser.ts`), the dispatcher's fence
(`drainOnce`), the by-hand nudge, and the wrap-up. Their only writers are the
unsubscribe route and the delivery poll (`src/lib/email-delivery/delivery-poll.ts`).

Why it is a zone and not only a rule: an email complaint ignored degrades
delivery for **every host on the platform**, because complaint rate is measured
per sending domain and Gather has one (GTC-324's lead sentence). Zone 7
protects a person; this protects a person and the channel every other person
depends on. Do not weaken a gate, bypass a fence, or add a guest email sender
that does not read both facts. Account mail (`sendMagicLinkEmail`,
`sendWelcomeEmail`) is exempt by GTC-296 ruling 6; the sign-in gap that leaves
is GTC-331.
