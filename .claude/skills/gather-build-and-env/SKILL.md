---
name: gather-build-and-env
description: >
  Load when setting up the Gather prototype from scratch, fixing a broken local environment, or
  pre-empting CI: fresh clone, .env configuration, Node/PostgreSQL prerequisites, install → migrate
  → seed → dev preflight, typecheck/lint/format, husky pre-commit, and build traps (Turbopack
  "type":"commonjs" 500s, Prisma P3005 drift, stale Prisma client, missing migrations). Symptoms:
  "all routes return 500", "prisma migrate reports drift", "CI failed on typecheck/format",
  "types don't match schema after pull", "npm run dev won't start".
---

# Gather: Build & Environment Runbook

Recreate a working Gather dev environment from nothing, and avoid the traps that have
historically broken it. All facts verified against the repo as of 2026-07-09.

**Jargon (defined once):**
- **Turbopack** — Next.js's Rust bundler; `npm run dev` runs `next dev --turbo`.
- **Prisma** — the ORM. "Prisma client" = generated TypeScript code in `node_modules` that must
  match `prisma/schema.prisma`. "Migration" = a SQL file under `prisma/migrations/`.
- **P3005** — Prisma error code: database schema is not empty / not baselined, i.e. the live DB
  diverged from migration history.
- **Preflight Sanity Sequence** — the mandatory boot check defined in `GATHER-BUILD-CONSTANTS.md`
  (repo root) that every executor session runs before touching code.
- **GTC-NNN / KB-NNN** — ticket IDs (`docs/tickets/`) and known-behaviour IDs
  (`GATHER-KNOWN-BEHAVIOURS.md`).

## When NOT to use this skill

| You want to… | Load instead |
|---|---|
| Run the app, get login tokens/URLs, seed per-ticket test events, Stripe CLI, crons, deploy, demo mode | `gather-run-and-operate` |
| Understand the schema, write/repair a migration, reason about cascades | `gather-data-model-and-migrations` |
| Diagnose runtime bugs (stale UI, auth anomalies) rather than build/env failures | `gather-debugging-playbook` |
| Add or change a config axis or env-guarded feature | `gather-config-and-flags` |
| Know what you are allowed to change (tickets, do-not-touch zones) | `gather-change-control` |

## 1. Prerequisites

| Requirement | Detail | Verify |
|---|---|---|
| Node 20 | `.nvmrc` contains `20`. CI pins `node-version: '20'`. **Trap:** `package.json` has NO `engines` field, so npm will NOT stop you from using the wrong Node — check manually. | `node --version` → v20.x |
| npm | Lockfile is `package-lock.json`; CI uses `npm ci`. | `npm --version` |
| PostgreSQL | Local server on `localhost:5432` with a `gather_dev` database. Prisma datasource provider is `postgresql` (`prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`). | `psql -l \| grep gather_dev` |
| No SQLite | The repo was reverted SQLite→PostgreSQL early on (commit 17e7021, 2026-01-02). `prisma/migrations_sqlite_broken_backup/` is dead history kept in git — Prisma ignores it because it is outside `prisma/migrations/`. Never resurrect it. | — |

```bash
nvm use                     # picks up .nvmrc → Node 20
createdb gather_dev         # if the DB does not exist yet
```

## 2. Environment variables (`.env` from `.env.example`)

```bash
cp .env.example .env
```

`.env` is gitignored. Never commit it, never echo real values into chat or files.
Table verified against `.env.example` and code consumers (as of 2026-07-09):

| Variable | Purpose | Required? | How to get a value |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | REQUIRED (everything) | `postgresql://<your-user>@localhost:5432/gather_dev` for local dev |
| `ANTHROPIC_API_KEY` | Claude AI plan generation (`src/lib/ai/claude.ts`) | Optional to boot — `src/lib/ai/generate.ts` falls back to mock plan data with a `[AI Generate] Claude API not available` warning. Required for real generation. | console.anthropic.com |
| `RESEND_API_KEY` | Magic-link login emails (`src/lib/email.ts`) | Required for the login-by-email flow; app boots without it | resend.com/api-keys |
| `EMAIL_FROM` | Sender for transactional email, format `Name <email@domain>` | Required for email flows | Your own domain, or leave the example value in dev |
| `NEXT_PUBLIC_APP_URL` | Base URL used in magic-link emails | REQUIRED | `http://localhost:3000` in dev |
| `STRIPE_SECRET_KEY` | Stripe API access | **Effectively REQUIRED to boot routes that import Stripe**: `src/lib/stripe.ts` — the module-load env guard throws at module load if unset. A dummy `sk_test_...` value is enough to boot (CI does exactly this); a real test key is needed for payment flows. | dashboard.stripe.com/test/apikeys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Required only for webhook testing | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints it |
| `STRIPE_PRICE_ID` | Price for the per-event checkout | Required for the pay-to-create-event flow | Stripe Dashboard → Products (create a price) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS to non-NZ/AU numbers | OPTIONAL — SMS nudges are skipped with a logged warning if unset | twilio.com/console |
| `TNZ_AUTH_TOKEN` | SMS to NZ (+64) / AU (+61) via TNZ (`src/lib/sms/tnz-client.ts` — the module-level `TNZ_AUTH_TOKEN` read / `isTnzEnabled()`) | Optional in dev; required for production NZ delivery (Twilio does not deliver to NZ) | TNZ Dashboard → Users → API tab → Auth Token (per `GATHER-BUILD-CONSTANTS.md`) |
| `CRON_SECRET` | Authenticates `/api/cron/*` requests (nudges, wrap-up dispatch) | Optional in dev — cron routes only enforce it when it is set | `openssl rand -base64 32` |

**Known drift (as of 2026-07-09):** `TNZ_AUTH_TOKEN` is documented in `GATHER-BUILD-CONSTANTS.md`
and consumed in code, but is MISSING from `.env.example`. Add the line to your `.env` by hand.

**`.env` loading gotcha:** `tsx` does NOT auto-load `.env`. The Prisma client loads `.env` itself,
so DB-backed test scripts work; but standalone scripts that read other env vars import `dotenv`
explicitly (e.g. `scripts/test-email.ts`). If a script sees `undefined` env vars, that is why.

## 3. From-scratch setup: the Preflight Sanity Sequence

This is the doctrine boot check from `GATHER-BUILD-CONSTANTS.md` ("Preflight Sanity Sequence"),
extended with seed. Run in order; stop at the first failed signal.

| # | Command | Expected success signal |
|---|---|---|
| 1 | `npm install` | Exits 0, no peer-dep errors. Also auto-runs `prisma generate` (Prisma's postinstall) and `husky` (via the `prepare` script). |
| 2 | `npm run db:migrate` | `All migrations have been successfully applied` — 29 migrations (as of 2026-07-09), `20260119083345_init` → `20260708081323_drop_generated_data_and_structure_change_request`. Also regenerates the Prisma client. |
| 3 | `npm run db:seed` | Prints created counts, magic-link token paths (`/h/…`, `/c/…`, `/p/…`), and ends `✅ Demo ready at /demo`. Seeds the "Henderson Family Christmas 2026" event. |
| 4 | `npm run dev` | Turbopack prints `Ready` on `http://localhost:3000`. Any page returns 200, not 500. |
| 5 | `npm run test:security` | Exits 0. Hits the DB directly via Prisma (no dev server needed), so `DATABASE_URL` must work. **Doctrine: never weaken these assertions to pass.** |

Notes:
- `npm run db:reset` (`prisma migrate reset`) drops everything, re-applies all migrations, and
  re-runs the seed automatically (seed is wired via the `prisma.seed` key in `package.json`).
  Destroys all local data — fine on a scratch DB, never point it at anything shared.
- **KB-004:** the seeded event is in `CONFIRMING` status, not `DRAFT`. Reproduction steps that
  need a DRAFT event will fail against the default seed — see `GATHER-KNOWN-BEHAVIOURS.md`.
- **Live drift bug (confirmed 2026-07-09):** the seed names the event "Henderson Family
  Christmas **2026**" but the demo routes/tests still look for "…**2025**" — demo endpoints
  and `npm run test:demo-endpoints` fail against a fresh seed. Known name-drift bug; the
  canonical six-location table lives in `gather-config-and-flags` section 7. Do not "fix"
  it drive-by — it needs a ticket (see `gather-change-control`).

## 4. The canonical trap: `"type": "commonjs"` in package.json

This is do-not-touch zone #8 in `GATHER-BUILD-CONSTANTS.md` and the top entry in `CLAUDE.md`.

- **Symptom:** `npm run dev` starts, Turbopack reports `Ready`, but EVERY route returns HTTP 500
  with `Specified module format (CommonJs) is not matching the module format of the source code
  (EcmaScript Modules)`.
- **Cause:** `"type": "commonjs"` in `package.json`. Turbopack enforces it strictly and rejects
  ESM `import`/`export` in source files.
- **Fix:** delete the field. Next.js handles module transpilation itself; the field must never
  be set. Incident commit: `17eb4cd` (2026-03-02).
- **Trigger to watch for:** some tools (and some `npm pkg` invocations) add `"type"` silently.
  If you see universal 500s right after any package.json edit, check this FIRST.

## 5. Quality gates: typecheck, lint, format

| Command | What it runs | Notes |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | Run before every commit — nothing else runs it locally. |
| `npm run format:check` | `prettier --check "src/**/*.{ts,tsx,js,jsx}"` | Same check CI runs. `npm run format` fixes. Config: `.prettierrc` (semi, single quotes, width 100). |
| `npm run lint` / `lint:fix` | `next lint` | **Known noise (GTC-130, open):** logs a non-fatal `Converting circular structure to JSON … property 'react' closes the circle` warning because `eslint-config-next@^16` is mismatched with `next@^15`. Commands still exit 0. Do not chase this warning; it has its own ticket. |

**Husky pre-commit** (`.husky/pre-commit` → `npx lint-staged`): runs `prettier --write` on staged
`*.{js,jsx,ts,tsx,json,css,md}` files. That is ALL it does — no typecheck, no lint, no tests. A
commit that passes the hook can still fail CI on typecheck.

## 6. What CI runs (pre-empt it locally)

`.github/workflows/ci.yml` — job `verify`, on every PR and push to `master`, Node 20, 10-min
timeout (as of 2026-07-09):

```bash
npm ci
npm run typecheck
npm run format:check
npx prisma generate
npx next build        # with dummy DATABASE_URL and STRIPE_SECRET_KEY env vars
npm audit --audit-level=high    # continue-on-error: NON-blocking
```

Key facts:
- CI has **no database** and runs **no tests** — `test:security` is a local/preflight gate only.
  Green CI does not mean the security suite passed; run it yourself.
- CI builds with `npx next build`, NOT `npm run build`. The npm script is
  `prisma generate && prisma migrate deploy && next build` — so **running `npm run build`
  locally applies pending migrations to whatever `DATABASE_URL` points at**. Know your target
  before running it.
- To reproduce a CI build failure locally: `npx prisma generate && npx next build` (dummy
  Stripe/DB values are fine — the build does not connect to the DB).
- Two other workflows exist: `claude-review.yml` (automated PR review) and `codeql.yml`.

## 7. Prisma client regeneration (the "stale types" gotcha)

The generated client lives in `node_modules` and does NOT update when `prisma/schema.prisma`
changes. After ANY of: `git pull` / branch switch that touches the schema, resolving a schema
merge conflict, or editing the schema yourself:

```bash
npm run db:generate     # prisma generate — regenerate client only
# or
npm run db:migrate      # prisma migrate dev — applies migrations AND regenerates
```

Symptoms of a stale client: `tsc` errors on model fields that clearly exist in the schema,
`PrismaClientValidationError: Unknown argument`, or enum values "missing" at runtime. If the
schema and your code look right but types disagree, regenerate before debugging anything else.
If regeneration alone doesn't fix it, restart the dev server (it caches the old client).

## 8. P3005 / schema drift — resolved, but learn the pattern (KB-002)

- **History:** for months, `npm run db:migrate` reported drift (schema modified outside migration
  history — P3005 on deploy). Resolved 2026-03-14 by baselining; production `prisma migrate
  status` came back clean. Full entry: `GATHER-KNOWN-BEHAVIOURS.md` KB-002.
- **If you see drift TODAY, it is a new problem.** Diagnostic pattern that remains binding:
  1. `npx prisma migrate status` — read exactly what Prisma thinks diverged.
  2. Do NOT run `prisma migrate reset` on any shared/production DB, do NOT hand-edit, delete,
     or reorder files under `prisma/migrations/` (do-not-touch zone #5).
  3. Drift repair is a chore-level change needing its own ticket with a rollback plan.
- **Most common cause here, historically:** a schema change committed WITHOUT its migration.
  It happened twice — commit `826e3fe` (2026-03-04, missing Stripe payment fields migration) and
  `e475def` (CHORE-001, 2026-03-13, missing `Event.isDemo` migration). The repair each time: a
  dedicated commit adding the missing migration file. Prevention: after every schema edit, run
  `npm run db:migrate` and confirm a new folder appeared under `prisma/migrations/` and is
  staged with your change. Never use `prisma db push` in this repo — it changes the DB without
  writing a migration, which is exactly how drift starts.
  Deeper migration work → load `gather-data-model-and-migrations`.

## 9. Historical build-breaker registry (where builds actually break)

| Trap | Symptom | Fix / rule | Evidence |
|---|---|---|---|
| `"type": "commonjs"` | ALL routes 500 under Turbopack | Remove field; never add it | `17eb4cd`, CLAUDE.md, constants zone #8 |
| Schema/migration divergence | P3005, drift prompt, CI-vs-local schema mismatch | Migration ships in the same commit as the schema edit | `826e3fe`, `e475def`, KB-002 |
| Stale Prisma client | Type errors on valid schema fields after pull | `npm run db:generate` | Section 7 |
| Wrong Node version | Subtle install/build failures; npm won't warn (no `engines`) | `nvm use` (`.nvmrc` = 20) before anything | `.nvmrc`, ci.yml |
| Tailwind config as `.ts` | Dev compile took 267s | Config must remain `tailwind.config.js` — do not "TypeScript-ify" it | `fae0a9d` (2026-02-28) |
| `npm run build` locally | Unexpectedly migrates your `DATABASE_URL` target | Use `npx next build` if you only want a build | package.json `build` script |
| eslint-config-next mismatch | Circular-structure warning in lint/build | Ignore; tracked as GTC-130 (open) | docs/tickets/GTC-130.md |
| Seed/demo name drift | Demo endpoints + `test:demo-endpoints` fail on fresh seed | Known live bug; needs a ticket; see `gather-config-and-flags` §7 | `prisma/seed.ts` — the "Henderson Family Christmas 2026" event `.create()` vs demo routes |

`next.config.js` is intentionally empty (`const nextConfig = {}`). If a build problem tempts you
to add config there, that is a change-control question first (`gather-change-control`).

## 10. Provenance and maintenance

Facts above are volatile. Re-verify in seconds before relying on them:

```bash
node --version && cat .nvmrc                                  # Node pin (expect 20)
grep -c '"engines"' package.json || true                      # still no engines field?
grep -n '"type"' package.json                                 # MUST NOT show "commonjs"
grep -n 'node-version' .github/workflows/ci.yml               # CI Node pin
sed -n '/^jobs:/,$p' .github/workflows/ci.yml                 # exact CI steps
grep -vn '^\s*#' .env.example | grep '='                      # current env var list
grep -rn 'TNZ_AUTH_TOKEN' .env.example src/                   # is the drift fixed yet?
ls -d prisma/migrations/*/ | wc -l                            # migration dirs (29 as of 2026-07-09; plain `ls | wc -l` gives 30 incl. migration_lock.toml)
grep -n 'Henderson Family Christmas' prisma/seed.ts src/app/api/demo/*/route.ts tests/demo-endpoints-test.ts
grep -n '"dev"\|"build"\|"typecheck"\|"format:check"' package.json
cat .husky/pre-commit                                         # pre-commit behavior
grep -n 'status' docs/tickets/GTC-130.md                      # lint-warning ticket still open?
grep -n 'Preflight' GATHER-BUILD-CONSTANTS.md                 # doctrine sequence location
```

Canonical sources of truth, in precedence order: `GATHER-BUILD-CONSTANTS.md` >
`GATHER-KNOWN-BEHAVIOURS.md` > `CLAUDE.md` > this skill. If this skill disagrees with any of
them, trust them and update this file.
