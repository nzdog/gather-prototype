---
name: gather-run-and-operate
description: >
  Day-to-day operation of the Gather prototype: starting the dev server, seeding the
  database, magic-link token URLs (/h/ /c/ /p/), per-ticket seed scripts, the demo
  event and its known name-drift bug, cron endpoints, Stripe CLI webhook forwarding,
  deploy targets, and the operational script inventory. Load this when you need to
  RUN the app, get test data into the DB, find a token URL to open a role's view,
  trigger a cron locally, or reset the demo. Keywords: npm run dev, seed, db:seed,
  Henderson Family Christmas, /demo, CRON_SECRET, stripe listen, railway, fixtures.
---

# Gather — Run and Operate

Runbook for operating an already-working checkout. Assumes `.env` exists, PostgreSQL
is up, and migrations are applied. If any of that is missing, load
**gather-build-and-env** first.

Jargon used below, defined once:

- **Magic-link token**: a 64-char hex string in an `AccessToken` DB row. The URL
  containing it IS the auth — no login needed. Scopes: HOST / COORDINATOR / PARTICIPANT.
- **Demo event**: the single seeded event with `Event.isDemo = true`, surfaced on the
  public `/demo` landing page.
- **GTC ticket**: this repo's change-control unit (`docs/tickets/GTC-NNN.md`). Every
  change needs one — see **gather-change-control**.
- **KB-NNN**: entries in `GATHER-KNOWN-BEHAVIOURS.md` (root), the registry of known
  platform quirks.

## When NOT to use this skill

| Your task | Load instead |
|---|---|
| Environment from scratch, `.env` setup, preflight, install traps | **gather-build-and-env** |
| Understanding/running the test suite, evidence bar, adding tests | **gather-validation-and-evidence** |
| Creating/applying migrations, schema changes | **gather-data-model-and-migrations** |
| A page 500s / behaves weirdly and you need triage | **gather-debugging-playbook** |
| Ticket workflow, commit rules, do-not-touch zones | **gather-change-control** |

## Quick reference card (as of 2026-07-09)

```bash
npm run dev                 # Next.js 15 + Turbopack on http://localhost:3000
npm run db:seed             # tsx prisma/seed.ts  (NOT idempotent — see below)
npm run db:reset            # prisma migrate reset (drops DB, re-migrates, auto-runs seed)
npx tsx scripts/list-events.ts                       # every event + ID + /plan URL
npx tsx scripts/seed-gtc-133-test-event.ts           # fresh Moment-1/2 test event (per-ticket seed)
curl "http://localhost:3000/api/cron/nudges?secret=$CRON_SECRET"   # trigger nudge cron
stripe listen --forward-to localhost:3000/api/webhooks/stripe      # local Stripe webhooks
```

All commands run from the repo root. Scripts use `npx tsx` (tsx is a dependency;
no global install needed) and read `DATABASE_URL` from `.env`.

## 1. Dev server

```bash
npm run dev        # = next dev --turbo
```

- Wait for Turbopack's **"Ready"** line, then open http://localhost:3000.
- "Ready" does NOT guarantee pages work. If every route returns HTTP 500 with
  "Specified module format (CommonJs) is not matching…", someone added
  `"type": "commonjs"` to `package.json`. Remove it (documented in root `CLAUDE.md`
  and it is do-not-touch zone 8 in `GATHER-BUILD-CONSTANTS.md`).
- Host dashboard lives at `/plan/[eventId]` (session-cookie auth). V2 "Moments" flow
  is the SAME route with `?setup=true`.

## 2. Default seed — prisma/seed.ts anatomy

Run with `npm run db:seed` (equivalently `npx tsx prisma/seed.ts`; also wired as
`"prisma": { "seed": ... }` so `prisma migrate reset` runs it automatically).

What one run creates (derived by reading `prisma/seed.ts`, as of 2026-07-09 —
house rule from `gather-docs-and-writing`: never quote seed numbers from a doc,
re-count from `prisma/seed.ts` before citing them in a ticket):

| Entity | Count | Detail |
|---|---|---|
| Person | 43 | 5 families: Hendersons 12, Nguyens 8, Turners 8, Patel-Hendersons 8, O'Briens 7. Host = Sarah Henderson (phone only, no email). 4 people have neither email nor phone (UNTRACKABLE tier). |
| Event | 1 | `Henderson Family Christmas 2026` (`prisma/seed.ts` — the `name` field of the demo `prisma.event.create()`), **status CONFIRMING not DRAFT** (`prisma/seed.ts` — the `status` field of that same event `.create()`, this is KB-004 — do not "fix" it), `isDemo: true`, 24–26 Dec 2026 NZDT via `makeNzdtChristmasDate` from `src/lib/timezone.ts`. |
| Day | 3 | Christmas Eve / Christmas Day / Boxing Day. |
| Team | 8 | Starters & Nibbles, Mains, Salads & Sides, Desserts, Drinks, Kids Zone, Setup & Equipment, Cleanup — each with a coordinator. |
| PersonEvent | 43 | One per person, with role + reachabilityTier + contactMethod derived from phone/email presence. |
| Item | 56 | 42 have an assignee, 14 deliberately unassigned (3 of them critical: snapper, nut roast, chairs). NZ-flavoured on purpose: ham, lamb, pavlova, L&P, Whittaker's — this is a product-taste gate, keep it. |
| Assignment | ~42 | Distribution logic is `Math.random`-based coded intent: 60% ACCEPTED / 20% PENDING / 10% DECLINED of assigned items — **counts vary per run**; this row is the coded distribution, not a verified DB outcome. |
| AccessToken | 44 | 1 HOST (Sarah) + 8 COORDINATOR (one per team) + 35 PARTICIPANT. 90-day expiry. |
| InviteEvent | 9 | 1 send-confirmed, 5 link-opened, 3 response-submitted. |

Behaviour you must know:

- **NOT idempotent.** Every statement is `prisma.*.create` — no upsert, no cleanup.
  Re-running duplicates all 43 people and creates a second identical event. For a
  clean slate use `npm run db:reset` (destroys ALL local data) instead of re-seeding.
- **Prints token URLs** at the end: all HOST and COORDINATOR tokens as `/h/<token>`
  and `/c/<token>`, plus the first 8 PARTICIPANT `/p/<token>` links. Copy them from
  the terminal — that is the normal way to open a role's view locally.
- Ends with "Demo ready at /demo" — but see the drift bug below: `/demo` is
  currently NOT fully ready after a fresh seed.

## 3. LIVE BUG: demo event name drift (confirmed 2026-07-09)

The demo-event name is a magic string that has drifted: the seed creates
`Henderson Family Christmas 2026` while the demo routes, demo-page copy, and tests
still expect `…2025`. The **canonical six-location table and fix shape live in
`gather-config-and-flags` section 7** — check there before touching any site.
Local check: `grep -rn "Henderson Family Christmas 202" src/ tests/ prisma/seed.ts`.

Origin: `scripts/update-demo-dates.sql` (GTC-050) renamed the production demo event
2025 → 2026 and the seed followed, but the route constants and tests never did.

Consequences you will hit:

- Against a fresh local seed, `GET /api/demo/tokens` returns `{ tokens: [] }` and
  `POST /api/demo/session` cannot find the event — the `/demo` persona buttons fail.
- `npm run test:demo-ui` currently FAILS 1 of 4 ("Participant API identifies demo
  event by known event name") because `src/app/api/p/[token]/route.ts` now derives
  `isDemo` from `event.isDemo` instead of the name string. Confirmed by running it
  2026-07-09. Do not "fix" the test by weakening it — this needs a GTC ticket that
  reconciles the magic string everywhere (candidate: a single shared constant).

Until fixed: don't use `/demo` for local verification; use the seed's printed
`/h/` `/c/` `/p/` token URLs directly.

## 3b. NEVER pass a live DATABASE_URL as `--shadow-database-url` (incident, 2026-08-03)

**Prisma resets whatever database it is handed as the shadow: it drops the schema and
replays `prisma/migrations` into it.** So any command given `--shadow-database-url
"$DATABASE_URL"` destroys `gather_dev` — silently, with a success message.

This happened during GTC-168 (A2). A drift check run as

```bash
# DESTRUCTIVE — this wiped gather_dev. Never run this form.
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datasource prisma/schema.prisma --shadow-database-url "$DATABASE_URL"
```

deleted every row in all 31 tables (21 events, the Henderson demo, the security
fixtures) and dropped `_prisma_migrations`. It then reported "empty migration" — the
result looked clean precisely *because* it had just rebuilt the database from the same
migrations it was comparing against. **A drift check that resets its own target cannot
detect drift; a clean result from this form is meaningless, not reassuring.** Recovery
was `prisma migrate resolve --applied` × 29 to rebuild history, then `db:seed` and
`tests/security-fixtures.ts` — the seeded data came back, the ad-hoc test events did not.

Use one of these instead:

- **Read-only, no shadow needed** — diff the live DB against the schema file. This is
  the right tool for "what would my schema edit change?":
  ```bash
  npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma --script
  ```
- **Is the DB in sync with `prisma/migrations`?** — `npx prisma migrate status`. No
  shadow, no writes, and it answers the drift question directly.
- **If you genuinely need a shadow** (some `migrate diff --from-migrations` forms do),
  create a throwaway first and point at *that*, never at `gather_dev`:
  ```bash
  createdb shadow_check
  npx prisma migrate diff --from-migrations prisma/migrations \
    --to-schema-datasource prisma/schema.prisma \
    --shadow-database-url "postgresql://localhost:5432/shadow_check" --script
  dropdb shadow_check
  ```

Related: `prisma migrate reset` and `prisma migrate dev` are interactive and refuse to
run non-interactively — `migrate reset` additionally requires explicit user consent from
Prisma's own AI-agent guardrail. Both refusals are working as intended; route around
them with `migrate resolve --applied` (baseline without dropping), `migrate dev
--create-only` through a pty, and `migrate deploy` (non-interactive apply). **Do not
reach for `migrate reset` to clear a drift problem** — see `gather-data-model-and-migrations`.

## 4. Token URL conventions

| URL prefix | Scope | Resolved by | Notes |
|---|---|---|---|
| `/h/<token>` | HOST | `resolveToken` in `src/lib/auth.ts` | Host action view (client page under `src/app/h/[token]/`). |
| `/c/<token>` | COORDINATOR | same | Team-scoped; token row carries `teamId`. |
| `/p/<token>` | PARTICIPANT | same | Participant view. |
| `/demo` | — | `src/app/demo/page.tsx` | Public landing; fetches `/api/demo/tokens`, `/api/demo/session`, `/api/demo/reset`. Broken vs fresh seed (section 3). |
| `/join/<token>` | — | `src/app/join/[token]/` | Shared-link name-selection flow (event-level shared token, not an AccessToken). |
| `/start/<token>` | — | `src/app/start/[token]/route.ts` | Resolves a WrapUpLink token, redirects to `/plan/new` with prefilled params. Public by design. |

The token IS the credential — never paste real production token URLs into tickets,
commits, or docs. Middleware keeps host/participant cookies isolated (GTC-001,
do-not-touch zone 1).

### 4b. TRAP: `npm run test:security` leaves coordinator tokens teamless (observed 2026-08-04)

**Symptom:** you capture a `/c/<token>` URL for a security fixture, open it, and the page
shows *"Something went wrong loading your page"* (or a 500). The token exists in the
database and looks fine.

**Cause:** running the security suite leaves the SENT fixture's COORDINATOR `AccessToken`
rows with **`teamId = NULL`**. Some route the suite drives deletes and re-issues them via
`ensureEventTokens()`, which does not restore the team scoping the fixture created. A
coordinator token with no `teamId` cannot resolve a team, so `/c/` fails.

**Discriminating check** — compare the two, and note the ordering:

```bash
# tokens are correct straight after a bare fixture build
npx tsx tests/security-fixtures.ts
psql "$DATABASE_URL" -c 'SELECT scope, "teamId" FROM "AccessToken" WHERE scope = '"'"'COORDINATOR'"'"';'
# ...and teamId is NULL for the SENT event's rows after this
npm run test:security
```

**Workaround:** capture coordinator URLs **after** `npx tsx tests/security-fixtures.ts`, not
after `npm run test:security`. If you have already run the suite, rebuild the fixtures.

Cost a careful session fifteen minutes during the GTC-200 merge walk, chasing a 500 that
looked like a regression in the code under review. Filed as a suite-teardown fix on
[[GTC-203]]; this entry stands until that lands.

## 5. Per-ticket seed convention

For browser-walk verification of a ticket, the house pattern is a dedicated script
`scripts/seed-gtc-NNN-test-event.ts` (exemplar: `scripts/seed-gtc-133-test-event.ts`,
uncommitted on branch `feat/moment-one-redesign` as of 2026-07-09).

Anatomy of the exemplar (verify before copying — it's the template):

- Direct Prisma writes, no API calls. Each run creates a fresh event; re-running is
  safe but accumulates duplicate events (clean up with `list-events` + manual delete).
- Creates a DRAFT event (Moment 2 Step 1 is the active flow for DRAFT), 6 households
  with realistic member mixes (PRIMARY_CONTACT / PARTNER / CHILD, `littleCount`).
- **Host-user resolution order** (`scripts/seed-gtc-133-test-event.ts` — the host-user resolution block at the top of `main()`):
  1. `SEED_HOST_EMAIL` env var — creates the User if it doesn't exist;
  2. `nigel@mckorbett.co.nz` (the founder's dev login);
  3. first existing User by `createdAt`;
  4. fallback: creates `test@gtc-133.local`.
- **Trap (documented in the script itself):** the owning User must match whoever is
  logged in to your browser session, or `/api/events/{id}/households` returns 403
  and Moment 1 renders empty. If your local login differs, run:

```bash
SEED_HOST_EMAIL=you@example.com npx tsx scripts/seed-gtc-133-test-event.ts
```

When writing a new per-ticket seed, follow this naming and resolution pattern and
reference it in the ticket's Evidence section.

## 6. Operational script inventory (scripts/, as of 2026-07-09)

"Server?" = needs `npm run dev` running (script does HTTP `fetch`). "DB" = talks to
Postgres directly via Prisma (needs `DATABASE_URL` only).

| Script | Purpose | Server? | Needs |
|---|---|---|---|
| `scripts/list-events.ts` | List every event: ID, status, team/conflict counts, `/plan` URL. First stop when you need an eventId. | no | DB |
| `scripts/list-recent-events-for-gtc125.ts` | Read-only: 10 most recent events with per-team item counts (built for GTC-125 verification; still useful for "did generation over-produce?"). | no | DB |
| `scripts/seed-gtc-133-test-event.ts` | Per-ticket seed exemplar (section 5). | no | DB, optional `SEED_HOST_EMAIL` |
| `scripts/create-test-fixtures.ts` | Creates the 5 permanent `TEST-FIXTURE — *` events (Draft Empty / Draft With People / Confirming With Plan / Confirming Paid / Frozen), host `gathertesting@proton.me`, participant emails `fixture-eN-pM@gather-fixture.invalid`, `isDemo: false`. Intended for production: `railway run tsx scripts/create-test-fixtures.ts`. | no | DB (prod via railway run) |
| `scripts/repopulate-fixture-people.ts` | Repairs the three plan-bearing TEST-FIXTURE events if their people were lost (hardcodes their event IDs — check they still match). | no | DB |
| `scripts/create-gtc-test-event.ts` | Fresh DRAFT event owned by `gathertesting@proton.me` + 5 placeholder participants (`railway run` style). | no | DB |
| `scripts/seed-test-conflicts.ts <eventId>` | Injects CRITICAL / SIGNIFICANT / ADVISORY conflicts into an event to exercise Acknowledge / Delegate / Dismiss. | no | DB |
| `scripts/seed-rsvp-test.ts` | RSVP-flow test data (Ticket 2.2 era). | no | DB |
| `scripts/check-rsvp-eligibility.ts` | Read-only RSVP eligibility diagnostic (48h window logic). | no | DB |
| `scripts/test-generate-plan.ts` | Creates an event and runs `generatePlan` end-to-end through `src/lib/ai/generate.ts`. | no | DB + `ANTHROPIC_API_KEY` (mock fallback without it) |
| `scripts/triage-unknown-routes.ts` | Categorises UNKNOWN-auth routes by risk from `SECURITY_ROUTE_INVENTORY.md`. **Currently broken from a clean run:** it expects the file at repo root (`scripts/triage-unknown-routes.ts` — `main()` joins `SECURITY_ROUTE_INVENTORY.md` onto `projectRoot`) but the doc now lives at `docs/05_ops/security/SECURITY_ROUTE_INVENTORY.md`, so it exits "not found". Fixing the path is a (small) GTC ticket. | no | the inventory file |
| `scripts/update-demo-dates.sql` | GTC-050 one-off SQL: bump prod demo event 2025→2026. Kept as the provenance of the section-3 drift; do not re-run blindly. | no | psql |
| `scripts/test-phase-*.ts`, `test-magic-link-*.ts`, `test-host-claim.ts`, `test-auth-fix.ts` | Older HTTP-level flow checks. | **yes** (fetch localhost:3000) | DB + server |
| `scripts/test-tnz-sms.ts` | Live TNZ SMS send (also `npm run test:tnz-sms`). Sends a REAL SMS — needs `TNZ_AUTH_TOKEN`; don't run casually. | no | TNZ creds |

Note: `route-classifications.json` (repo root, manually maintained auth classification
per route) is a separate artifact from `SECURITY_ROUTE_INVENTORY.md`; the triage
script reads only the latter.

## 7. Cron endpoints

Two cron routes, both accepting GET or POST, both authenticated the same way
(`src/app/api/cron/nudges/route.ts`, `src/app/api/cron/wrap-up-dispatch/route.ts`):

| Route | Purpose | Vercel schedule (`vercel.json`) |
|---|---|---|
| `/api/cron/nudges` | Runs the SMS nudge scheduler | `*/15 * * * *` |
| `/api/cron/wrap-up-dispatch` | Dispatches pending wrap-up messages (10-min delay after creation) | `*/10 * * * *` |

Trigger locally (both auth forms work):

```bash
# Authorization header
curl http://localhost:3000/api/cron/nudges -H "Authorization: Bearer $CRON_SECRET"

# Query param (this is the form vercel.json uses)
curl "http://localhost:3000/api/cron/wrap-up-dispatch?secret=$CRON_SECRET"
```

**Trap:** the guard is `if (CRON_SECRET && providedSecret !== CRON_SECRET)` — if
`CRON_SECRET` is UNSET in the environment, the endpoints accept unauthenticated
requests. Convenient in dev; means `CRON_SECRET` must always be set in production.
Do not "harden" this without a ticket — it touches production cron delivery.

Nudge sends respect the SMS opt-out hard gate and quiet hours (do-not-touch zone 7 —
never bypass opt-out logic to make a local test fire).

## 8. Stripe webhooks locally

From `GATHER-BUILD-CONSTANTS.md` ("Async Trigger Methods", verified as of 2026-07-09):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This prints a `whsec_...` signing secret — put it in `.env` as
`STRIPE_WEBHOOK_SECRET` for the duration of the session. Then trigger events:

```bash
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

Handler: `src/app/api/webhooks/stripe/route.ts`. Stripe integration is do-not-touch
zone 4 (real money) — you may exercise it, not refactor it.

## 9. Deploy story (as of 2026-07-09)

- **Vercel**: `vercel.json` at root defines the two cron schedules (section 7),
  passing auth as `?secret=${CRON_SECRET}`. `npm run build` =
  `prisma generate && prisma migrate deploy && next build`, i.e. migrations apply
  during the platform build.
- **Railway**: `npm run railway:setup` = `prisma migrate deploy && prisma db seed`.
  Production-side scripts are run as `railway run tsx scripts/<name>.ts`
  (see `scripts/create-test-fixtures.ts` header), and `GATHER-BUILD-CONSTANTS.md`
  lists `DATABASE_URL` location as "Railway env" — the Postgres database is hosted
  on Railway.
- Which platform serves production web traffic is not decidable from the repo alone
  — UNVERIFIED; ask the founder before any deploy action. Never deploy or run
  anything against production without explicit approval in chat.

## 10. Demo reset endpoint — read before touching

`POST /api/demo/reset` (`src/app/api/demo/reset/route.ts`):

- Returns 404 when `NODE_ENV === 'production'` — dev-only, and unauthenticated in dev.
- **It does NOT reset just the demo event.** It runs
  `npx prisma db push --force-reset --accept-data-loss --skip-generate` (drops every
  table in the database) and then re-runs `prisma/seed.ts`. Any per-ticket test
  events, fixtures, or in-progress local data are destroyed.
- The `/demo` page's "reset" button calls this. Equivalent CLI: `npm run db:reset`
  (which at least prompts).

## 11. test-data/ CSV fixtures

Four CSVs at `test-data/` for exercising the people batch-import flow by manual
upload in the UI (no code references them — they are operator ammunition):

| File | Header shape | Exercises |
|---|---|---|
| `sample-people.csv` | `Name,Email,Phone` | Happy path (NZ 021 mobiles) |
| `sample-people-first-last.csv` | `First Name,Last Name,Email,Mobile` | Alternate column naming |
| `sample-people-duplicates.csv` | `Name,Email,Phone` | Duplicate names/emails/phones handling |
| `sample-people-errors.csv` | `Name,Email,Phone` | Missing name, invalid email, missing phone |

## Provenance and maintenance

All facts verified against the repo on 2026-07-09 (branch `feat/moment-one-redesign`).
Re-verify in seconds:

```bash
# Seed counts and event name/status
grep -n "Henderson Family Christmas" prisma/seed.ts            # :282, expect 2026
grep -n "status: 'CONFIRMING'" prisma/seed.ts                  # KB-004
grep -c "teamName:" prisma/seed.ts                             # people+items rows sanity

# Demo drift bug — still live?
grep -rn "Henderson Family Christmas 202" src/ tests/ prisma/seed.ts
npx tsx tests/demo-ui-isolation.ts                             # fails 1/4 while drift exists

# Scripts inventory and which need a server
ls scripts/
grep -ln "fetch(" scripts/*.ts

# Cron schedules and auth
cat vercel.json
grep -n "CRON_SECRET" src/app/api/cron/nudges/route.ts

# Stripe CLI commands of record
grep -n "stripe listen\|stripe trigger" GATHER-BUILD-CONSTANTS.md

# Triage script path bug — still broken?
grep -n "SECURITY_ROUTE_INVENTORY" scripts/triage-unknown-routes.ts
ls docs/05_ops/security/SECURITY_ROUTE_INVENTORY.md

# npm entry points
node -e "console.log(Object.keys(require('./package.json').scripts).join('\n'))"
```

If any check disagrees with this file, trust the repo, then update this skill (with
a ticket if the change is more than a doc fix).
