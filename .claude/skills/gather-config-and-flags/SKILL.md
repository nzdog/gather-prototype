---
name: gather-config-and-flags
description: >
  Load when behavior differs between environments or you need to know what an env var
  controls: missing/blank ANTHROPIC_API_KEY producing "mock plan" data, SMS silently not
  sending (TNZ vs Twilio routing, quiet hours), cron endpoints returning 401 or being
  wide open, demo mode broken after reseed, Stripe 402 on event creation, a new event
  type or config option to add, allowlist/validation drift (the GTC-151 class of bug),
  or route-classifications.json being stale. Also the checklist for adding ANY new
  configuration axis without repeating GTC-151.
---

# Gather: Configuration Axes and Behavior Switches

Every way this app's behavior switches — env vars, config-as-data JSON, hardcoded
constants, NODE_ENV guards — plus the single-source-of-truth rule that prevents the
GTC-151 class of data-loss bug. All file paths repo-relative. All line numbers and
values verified against the repo as of 2026-07-09; re-check with the commands in
"Provenance and maintenance" before relying on them.

**Jargon used once, defined once:**

- **Axis** = one independent dimension along which behavior switches (e.g. "is AI
  configured", "which SMS provider").
- **GTC-NNN** = a ticket in `docs/tickets/GTC-NNN.md` (house ticket system; see
  `gather-change-control`).
- **Moment 2** = the V2 "What's the plan?" flow where the host fills an accordion
  brief (Step 1) and AI generates an editable plan (Step 2).
- **EventSetup** = the Prisma model storing the Moment 2 Step 1 brief as JSONB.
- **Config-as-data** = behavior driven by `src/lib/ai/plan-option-tree-config.json`
  instead of code.

## When NOT to use this skill

| Your task | Load instead |
|---|---|
| Changing prompts, token budgets, mock-plan internals, parse failures | `gather-ai-generation` |
| Setting up a machine from scratch, preflight, DB URL, migrations failing | `gather-build-and-env` |
| Starting dev server, seeding, getting tokens/URLs, Stripe CLI, deploying, running the demo | `gather-run-and-operate` |
| Deciding whether a change is allowed, ticket workflow, do-not-touch zones | `gather-change-control` |
| A symptom you can't yet attribute to config (500s, stale UI, auth weirdness) | `gather-debugging-playbook` |
| Schema/migration changes (e.g. adding a real feature-flag column) | `gather-data-model-and-migrations` |

This skill is the map of *what switches behavior and where*; it is not a runbook for
operating or debugging those systems. It is also the **canonical home** for two
volatile shared facts — the AI-call-cap value table (section 4) and the demo-event
name-drift record (section 7); sibling skills deliberately point here instead of
restating them.

---

## 1. Env-guarded behaviors table

There are **no boolean feature flags** in this codebase. Behavior switches on
*presence/absence of env vars*, *NODE_ENV*, *phone-number prefix*, and *data*
(`Event.isDemo`). All env vars are documented in `.env.example` (root) and the env
table in `GATHER-BUILD-CONSTANTS.md` (~line 200) — with one drift, noted below.

| Axis | Guard | When SET / true | When UNSET / false | Prod vs dev notes |
|---|---|---|---|---|
| AI availability | `ANTHROPIC_API_KEY` via `isClaudeAvailable()` (`src/lib/ai/claude.ts:157`) | Real Claude calls (`DEFAULT_MODEL = 'claude-sonnet-4-6'`, `claude.ts:14`) | **Silent mock fallback**: `generate.ts` logs `[AI Generate] Claude API not available` and returns `generateMockPlan()` — plausible-looking fake items whose `reasoning` says "fallback data because Claude API is not available" | Same in both. If plans look generic/wrong, check the reasoning string and server log FIRST before debugging prompts |
| SMS to NZ/AU | `TNZ_AUTH_TOKEN` via `isTnzEnabled()` (`src/lib/sms/tnz-client.ts:23`) | Numbers starting `+64`/`+61` sent via TNZ | `sendSms` returns `blocked: 'SMS_DISABLED'`, error "TNZ not configured" | Required in prod — **Twilio does not deliver to NZ**. NOT listed in `.env.example` (drift; it IS in the constants-file env table) |
| SMS elsewhere | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER` via `isSmsEnabled()` (`src/lib/sms/twilio-client.ts:23`) | Non-+64/+61 numbers sent via Twilio | `blocked: 'SMS_DISABLED'`, console warn suggests email fallback | Optional; NZ-focused product rarely needs it |
| Email | `RESEND_API_KEY` (`src/lib/email.ts:12`, lazy client) | Magic links, nudge emails, welcome emails send | Resend client constructed with `undefined` key → sends fail at call time (no up-front guard) | `EMAIL_FROM` falls back to `'Gather <noreply@gather.app>'` |
| Stripe | `STRIPE_SECRET_KEY` (`src/lib/stripe.ts:4-5`) | Payments work | **Module throws at import time** — any route importing `@/lib/stripe` 500s | Event creation (`POST /api/events`) returns **402** without a paid `stripeSessionId` (`src/app/api/events/route.ts:63-83`). Webhook additionally needs `STRIPE_WEBHOOK_SECRET`; price set by `STRIPE_PRICE_ID` |
| Cron auth | `CRON_SECRET` (`src/app/api/cron/nudges/route.ts:21`, `wrap-up-dispatch/route.ts:15`) | Requests need `?secret=` or `Authorization: Bearer` | **Check is `if (CRON_SECRET && ...)` — unset secret leaves both cron endpoints OPEN to anyone** | Always set in prod. Vercel calls them per `vercel.json`: nudges `*/15 * * * *`, wrap-up-dispatch `*/10 * * * *` |
| Demo mode | `Event.isDemo` (data flag, `prisma/schema.prisma:19`, default false) | Token APIs (`/api/h|c|p/[token]`) include `isDemo` in responses; UI shows demo affordances | Normal event | Set only by `prisma/seed.ts:286`. NOT an env var |
| Demo DB reset | `NODE_ENV` (`src/app/api/demo/reset/route.ts:15`) | dev: `POST /api/demo/reset` force-resets DB (`prisma db push --force-reset` + seed), **no auth** | prod: returns 404 | Dev-only escape hatch |
| Host claim bypass | `NODE_ENV` (`src/app/api/h/[token]/route.ts:28`) | Non-dev: host token route computes `authStatus` unclaimed/requires_signin | Dev: always `'authenticated'` (demo convenience) | Explains "why doesn't sign-in gate fire locally" |
| Link generation | `NEXT_PUBLIC_APP_URL` | Base URL in magic links, share links, nudge SMS/email links, billing return URLs | Falls back to `http://localhost:3000` (e.g. `src/lib/email.ts:18`) | Wrong value in prod = links point at localhost. Consumers: `src/lib/email.ts`, `src/lib/tokens.ts`, `src/lib/sms/nudge-sender.ts`, `src/lib/sms/proxy-nudge-sender.ts`, `src/app/start/[token]/route.ts`, `src/app/api/auth/claim/route.ts`, `src/app/api/events/[id]/shared-link/route.ts`, `src/app/api/billing/{checkout,portal}/route.ts` |
| Dev conflicts page | `NODE_ENV` (`src/app/dev/conflicts/page.tsx:331`) | Dev-only debug page | Hidden outside development | — |

**SMS provider routing is by prefix, not env:** `src/lib/sms/send-sms.ts:11` —
`TNZ_COUNTRY_CODES = ['+64', '+61']`; anything else goes to Twilio. Order of gates in
`sendSms`: E.164 format check → **opt-out check (hard legal gate, runs before provider
config so a missing token never masks OPTED_OUT)** → provider-config check → send.
Do not reorder; opt-out logic is a DO-NOT-TOUCH zone per `GATHER-BUILD-CONSTANTS.md`.

---

## 2. Config-as-data: the option-tree layer

The Moment 2 Step 1 brief (event types, food categories, per-category option trees,
NZ cultural notes) is **data**, not code:

| Piece | Location | Role |
|---|---|---|
| `plan-option-tree-config.json` | `src/lib/ai/plan-option-tree-config.json` | 10 occasion keys: `christmas, birthday_adult, birthday_kids, bbq_casual, wedding_reception, baby_shower, engagement_party, easter, anniversary, farewell`. Each has `label`, `nzNotes`, `defaultCategories`, `categories` (levels with `options`/`dependsOn`/`multiSelect`/`freeText`) |
| `config-loader.ts` | `src/lib/ai/config-loader.ts` | The ONLY module that reads the JSON. Exports (verified): `CONFIG_EVENT_TYPES` (line 86), `LEGACY_EVENT_TYPE_MAP` (line 58), `getConfigKey`, `getAccordionDefaults`, `getNzNotes`, `getDefaultCategories`, `getCategoryLevels`, `getSectionReferenceItems` |
| `OptionTree` component | `src/components/shared/OptionTree.tsx` | Renders `OptionTreeLevel[]` produced by `getCategoryLevels` |
| UI consumer | `src/components/plan/Moment2Step1Modal.tsx:477` | Event-type chips render from `CONFIG_EVENT_TYPES.map(...)` |
| API validator | `src/app/api/events/[id]/setup/route.ts:137` | Autosave validates `body.eventType` against the imported `CONFIG_EVENT_TYPES` (the GTC-151 fix) and returns it in the 400 payload |
| AI prompts | `getNzNotes` / `getSectionReferenceItems` feed the plan-generation prompt | NZ correctness (ham/lamb, L&P, summer Christmas) comes from `nzNotes` in this JSON |

**`CONFIG_EVENT_TYPES` is the single source of truth for event types** — 11 labels
(`'Casual BBQ', 'Birthday (Kids)', 'Birthday (Adult)', 'Christmas', 'Easter',
'Wedding Reception', 'Baby Shower', 'Engagement Party', 'Anniversary', 'Farewell',
'Other'`, `as const`). Quirks worth knowing:

- `'Other'` is in `CONFIG_EVENT_TYPES` but has **no key in the JSON** and no entry in
  `EVENT_TYPE_TO_CONFIG_KEY`, so `getConfigKey('Other')` → `null` → empty accordion
  defaults and no `nzNotes`. Intentional.
- `LEGACY_EVENT_TYPE_MAP` forward-maps only `BBQ → 'Casual BBQ'` and
  `'Kids party' → 'Birthday (Kids)'` at modal-read time. A stored `Roast dinner` /
  `Potluck` / `Picnic` row would be rejected on next save — accepted risk, zero such
  rows exist (GTC-151 audit).
- `extendedCategoriesData` (extra per-category selections beyond the four accordions)
  lives on EventSetup; the API validates only its *shape* (plain object of objects,
  `setup/route.ts:162-176`), not its keys — keys come from the JSON's category names.
- Accordion food defaults are **unchecked** by default (GTC-126, comment at
  `config-loader.ts:172-176`); user-typed "+ Add your own" items default checked.

### To add a new event type

1. Add the occasion object to `plan-option-tree-config.json` (copy an existing one;
   write real `nzNotes` — NZ correctness is a product gate).
2. Add the label to `CONFIG_EVENT_TYPES` and the label→key entry to
   `EVENT_TYPE_TO_CONFIG_KEY` in `config-loader.ts`.
3. **Change nothing else.** UI chips, API validation, defaults, and AI reference items
   all derive from these two files. If you find yourself editing
   `setup/route.ts` or `Moment2Step1Modal.tsx` to add a type, you are recreating
   the GTC-151 bug.
4. Verify: walk the Step 1 modal in a browser, pick the new type, confirm autosave
   returns 200 and the selection survives a page refresh (that refresh check is
   exactly what GTC-151's silent 400 broke).

---

## 3. The GTC-151 rule: validators import what the UI renders

**Incident (GTC-151, commit ab8678e, ticket `docs/tickets/GTC-151.md`):** the setup
route kept its own hardcoded seven-value event-type allowlist while the modal offered
the 11 `CONFIG_EVENT_TYPES`. Overlap was exactly `Christmas` and `Other`, so **9 of 11
event types got a silent 400 on autosave** — Step 1 data vanished on reload. Severity:
high, silent data loss.

**Design rule (binding):** any server-side validator MUST `import` the same constant
the UI renders from. Never copy the values. Silent 4xx on autosave = data loss.

### Checklist: adding ANY new config axis

- [ ] **Define once.** One exported constant or one JSON file, in one module. No
      second copy anywhere — not in a route, not in a test fixture.
- [ ] **UI reads it.** Render options/choices from the import, never a literal list.
- [ ] **API validates against it.** Import the same symbol in the route; include the
      allowed values in the 400 payload (pattern: `setup/route.ts:137-140`).
- [ ] **Test asserts parity.** Add a tsx test (see `gather-validation-and-evidence`)
      that greps/imports both sides and fails if they diverge — or better, asserts
      the route module literally imports the constant.
- [ ] **Autosave paths surface failures.** If the axis touches an autosave flow, make
      the client surface non-200 responses; a swallowed 400 is how GTC-151 hid.
- [ ] **Document the env var** (if the axis is env-driven) in BOTH `.env.example` and
      the `GATHER-BUILD-CONSTANTS.md` env table (they have already drifted once — see
      TNZ below).
- [ ] Ticket first, per `gather-change-control`. Config axes are cheap to add and
      expensive to un-drift.

---

## 4. AI call caps (values as of 2026-07-09)

**CANONICAL value table** — sibling skills reference this section instead of
restating the numbers; when a cap changes, update it HERE (and re-run the grep in
Provenance).

`Event.aiCallsUsed` (`prisma/schema.prisma:88`, default 0) increments per real AI call;
each route checks a **locally-defined** `AI_CALL_LIMIT` and returns **429** ("AI call
limit reached for this event") at the cap. History: GTC-090 introduced cap 10;
GTC-133 raised four Moment 2 sites to 20; the GTC-145/146 single-call rewrite brought
some back to 10. Current sites:

| Route | `AI_CALL_LIMIT` | Location |
|---|---|---|
| `POST /api/events/[id]/generate` | 10 | `src/app/api/events/[id]/generate/route.ts:43` |
| `POST /api/events/[id]/finalize-plan` (Moment 2 single call) | 10 | `src/app/api/events/[id]/finalize-plan/route.ts:21` |
| `.../conflicts/[conflictId]/suggest-resolution` | 10 | `.../suggest-resolution/route.ts:83` |
| `POST /api/events/[id]/regenerate` | 20 | `src/app/api/events/[id]/regenerate/route.ts:39` |
| `POST /api/events/[id]/regenerate/preview` | 20 (blocks, does **not** increment) | `.../regenerate/preview/route.ts:36` |

The limit is duplicated per route (5 copies) — a known magic-number smell of exactly
the class Section 3 bans. If you touch a cap, consider centralizing, but that is a
ticket of its own, not a drive-by.

Token caps (different axis — response size, not call count): `MAX_TOKENS_FULL_PLAN =
16384` in `src/lib/ai/token-limits.ts:30` (sole export; the file's doc-comment says
do NOT inline literal maxTokens at Moment 2 call sites). V1 paths in
`src/lib/ai/generate.ts` still inline `16384`/`2048`; `claude.ts:15` default 4096.
Cap-hit symptom: `stopReason === 'max_tokens'` → `parseClaudeJSON` throws with a
`callSiteLabel` (GTC-142). Prompt/parsing details: load `gather-ai-generation`.

---

## 5. SMS timing constants

All in `src/lib/sms/` — legal-adjacent (opt-out is a DO-NOT-TOUCH zone); change only
with a ticket.

| Constant | Value | Where |
|---|---|---|
| Quiet hours | 21:00–08:00 Pacific/Auckland; deferred sends go out 08:05 | `quiet-hours.ts:6-8` (`QUIET_START_HOUR = 21`, `QUIET_END_HOUR = 8`, `DEFER_TO_MINUTE = 5`) |
| Nudge ladder | 24h then 48h after anchor, one send each, tracked via `nudge24hSentAt`/`nudge48hSentAt` | `nudge-eligibility.ts:51-52` (inline `24 * 60 * 60 * 1000` etc., no named constants) |
| NOT_SURE forced conversion | RSVP `NOT_SURE` older than 48h gets a follow-up | `nudge-eligibility.ts:218-233` |
| Cron cadence | nudges every 15 min, wrap-up dispatch every 10 min | `vercel.json` |

Quiet hours are enforced in the senders (`nudge-sender.ts:115,235`,
`proxy-nudge-sender.ts:90`), not in the cron route — the cron fires 24/7 and the
sender defers.

---

## 6. route-classifications.json — a manually-maintained config surface

`route-classifications.json` (repo root) is a **hand-maintained** list of API routes
with `authType` one of `SESSION | TOKEN | PUBLIC | CUSTOM | NONE`. As of 2026-07-09:
**74 entries** (45 SESSION, 11 TOKEN, 11 NONE, 6 PUBLIC, 1 CUSTOM) versus **98**
`route.ts` files under `src/app/api/` — it is stale by ~24 routes. Nothing
auto-generates it.

- Consumer: `tests/security-inventory-gate.ts` (reads it from cwd; **not wired** into
  `package.json` scripts — run manually with `npx tsx tests/security-inventory-gate.ts`).
- `scripts/triage-unknown-routes.ts` parses `SECURITY_ROUTE_INVENTORY.md` and expects
  it at the **repo root** (`triage-unknown-routes.ts:193`), but the file actually
  lives at `docs/05_ops/security/SECURITY_ROUTE_INVENTORY.md` — the script errors
  as-is. Fix the path or copy the file before trusting its output.
- If you add an API route, add its classification entry in the same change. Do not
  weaken `tests/security-*` assertions to make the gate pass (doctrine).

---

## 7. Known magic strings and live drift (eliminate via tickets, not drive-bys)

### Demo event name — CONFIRMED LIVE BUG (as of 2026-07-09)

**CANONICAL record of this bug** — sibling skills point here instead of restating
the locations; when the drift is fixed (or a new site appears), update THIS table.

The demo event is found **by name string**, and the string has drifted:

| Location | Value |
|---|---|
| `prisma/seed.ts:282` (creates it; sets `isDemo: true` at :286) | `Henderson Family Christmas **2026**` |
| `src/app/api/demo/tokens/route.ts:6` | `Henderson Family Christmas **2025**` |
| `src/app/api/demo/session/route.ts:6` | `Henderson Family Christmas **2025**` |
| `tests/demo-endpoints-test.ts:44` | `2025` |
| `src/app/demo/page.tsx:143` (display copy) | `2025` |
| `scripts/update-demo-dates.sql` | renames 2025 → 2026 in-place |

Consequences against a fresh seed: `POST /api/demo/session` and `/api/demo/tokens`
404 ("Demo event not found"). Additionally `tests/demo-ui-isolation.ts:70-71` asserts
the *participant API source code* contains the 2025 string, but
`src/app/api/p/[token]/route.ts` now derives `isDemo` from `event.isDemo` and contains
no Henderson string at all — so `npm run test:demo-ui` has a failing assertion
independent of the DB. The fix shape (per Section 3): ONE exported
`DEMO_EVENT_NAME` constant imported by seed, both demo routes, and tests. Open a GTC
ticket; do not patch one site.

### Other duplication to keep on the radar

- `AI_CALL_LIMIT` — five per-route copies (Section 4).
- Inline `maxTokens` literals in `src/lib/ai/generate.ts` vs `token-limits.ts`.
- `.env.example` is missing `TNZ_AUTH_TOKEN` (present in the constants-file env
  table and required for prod NZ SMS).
- V1 prompts and V2 `buildPlanGenerationPrompt` coexist in `src/lib/ai/prompts.ts`
  (duplication risk — see `gather-ai-generation` before touching).

---

## Provenance and maintenance

Verified against the repo 2026-07-09 on branch `feat/moment-one-redesign`. One-liners
to re-verify anything that may drift:

```bash
# Env vars documented vs consumed
grep -c '=' .env.example && grep -n 'TNZ_AUTH_TOKEN' .env.example GATHER-BUILD-CONSTANTS.md

# AI availability guard + model id
grep -n "isClaudeAvailable\|DEFAULT_MODEL" src/lib/ai/claude.ts

# Mock fallback trigger
grep -n "isClaudeAvailable()" src/lib/ai/generate.ts

# AI call caps (all sites + current values)
grep -rn "AI_CALL_LIMIT" src/

# Token caps
grep -n "export const" src/lib/ai/token-limits.ts && grep -rn "maxTokens:" src/lib/ai/generate.ts

# Event-type single source of truth: definition, UI consumer, API validator
grep -rn "CONFIG_EVENT_TYPES" src/

# Occasion keys in the option-tree JSON
python3 -c "import json;print(list(json.load(open('src/lib/ai/plan-option-tree-config.json'))))"

# SMS routing prefixes + provider guards
grep -n "TNZ_COUNTRY_CODES" src/lib/sms/send-sms.ts && grep -n "isTnzEnabled\|isSmsEnabled" src/lib/sms/tnz-client.ts src/lib/sms/twilio-client.ts

# Quiet hours + nudge ladder values
grep -n "QUIET_START_HOUR\|QUIET_END_HOUR\|DEFER_TO_MINUTE" src/lib/sms/quiet-hours.ts && grep -n "HoursAgo" src/lib/sms/nudge-eligibility.ts

# Cron auth (note the `CRON_SECRET &&` open-when-unset pattern) + schedules
grep -n "CRON_SECRET" src/app/api/cron/nudges/route.ts src/app/api/cron/wrap-up-dispatch/route.ts && cat vercel.json

# Stripe import-time throw + payment gate
grep -n "STRIPE_SECRET_KEY" src/lib/stripe.ts && grep -n "402" src/app/api/events/route.ts

# Demo-name drift (fixed when all values match)
grep -rn "Henderson Family Christmas" prisma/seed.ts src/app/api/demo/ tests/demo-endpoints-test.ts

# route-classifications staleness (classified vs actual)
grep -c '"filePath"' route-classifications.json && find src/app/api -name route.ts | wc -l

# NODE_ENV-guarded behaviors
grep -rn "NODE_ENV" src --include="*.ts" --include="*.tsx" | grep -v "secure:"
```

If any command's output disagrees with this file, trust the repo and update this
skill (with a ticket if the underlying behavior — not just the doc — changed).
