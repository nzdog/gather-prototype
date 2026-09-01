---
name: gather-failure-archaeology
description: >
  Load this when you are about to "improve" or rebuild something in the Gather prototype and want to
  know if that battle was already fought — e.g. you are tempted to add per-section AI generation, touch
  session cookies/middleware, "fix" a 501 endpoint, resolve Prisma drift, re-add reorder UI, or you hit
  a symptom that smells historical (duplicate AI items, "based on 0 guests", people vanishing after team
  delete, Step 1 data disappearing, truncated AI JSON). This is the historical record of every major
  investigation, dead end, revert, and settled decision, with commit hashes and status.
---

# Gather Failure Archaeology — the chronicle

Purpose: no session re-fights a settled battle. Every entry is symptom → root cause → evidence
(commit hashes you can `git show`) → STATUS. Read the entry BEFORE re-investigating or "fixing"
anything it covers. All facts verified against the repo on 2026-07-09.

Jargon used throughout, defined once:
- **GTC-NNN** — a ticket in `docs/tickets/GTC-NNN.md` (the house change-control unit; see
  `gather-change-control`).
- **V1 / V2** — legacy dashboard+wizard vs the "Moments" host journey; both live in
  `src/app/plan/[eventId]/page.tsx`.
- **Moment 2** — the "What's the plan?" flow: Step 1 brief accordion → Step 2 AI-generated plan.
- **finalize-plan** — `POST /api/events/[id]/finalize-plan`, the single AI call that generates the
  whole V2 plan (since GTC-145/146).
- **KB-NNN** — an entry in `GATHER-KNOWN-BEHAVIOURS.md` (repo root): platform behaviours that look
  like bugs but are known.

## When NOT to use this skill

| Your situation | Load instead |
|---|---|
| Actively triaging a live symptom right now | `gather-debugging-playbook` |
| Changing prompts, token caps, or AI call structure | `gather-ai-generation` |
| Planning V1 retirement / god-file decomposition / household delete-recreate fix | `gather-v1-v2-reconciliation-campaign` |
| Writing a migration or touching cascade semantics | `gather-data-model-and-migrations` |
| Deciding whether a change needs a ticket / experiment branch | `gather-change-control` |
| Running your own hunch→measurement experiment | `gather-experiment-methodology` |

This skill is the record of WHAT happened and WHY it is settled. It contains no live runbooks.

## Quick index (chronological)

| Date | Entry | Status |
|---|---|---|
| 2025-12-30 → 2026-01-22 | SQLite → PostgreSQL saga | SETTLED |
| 2026-03-04 → 2026-03-13 | Missing-migration repairs (826e3fe, CHORE-001) | SETTLED (pattern) |
| 2026-03-05 | GTC-001 session cookie collision → middleware isolation | SETTLED — do not revisit |
| ~Feb → 2026-03-14 | KB-002 / P3005 schema drift saga | RESOLVED 2026-03-14 |
| 2026-04-16 → 2026-07-08 | Per-section AI generation era, collapse, and prune | SETTLED — do not rebuild |
| 2026-05-08 | GTC-136 "based on 0 guests" headcount source | SETTLED |
| 2026-05-08 | GTC-142 token truncation + callSiteLabel | SETTLED |
| 2026-05-09 | GTC-141 reorder capability deleted | KNOWN-TRADEOFF |
| 2026-07-08 | GTC-147 PersonEvent.team Cascade → SetNull | SETTLED |
| 2026-07-08 | GTC-151 allowlist silent-400 data loss | SETTLED |
| ongoing | 501-stubbed household claim endpoint | KNOWN-TRADEOFF |
| ongoing | Open/deferred registry (things that look like bugs) | see section |

---

## 1. SQLite → PostgreSQL saga (2025-12-30 → 2026-01-22)

- **Symptom/context:** Prototype started on SQLite (`26e0514`, 2025-12-30). Railway deployment
  required PostgreSQL.
- **Timeline (verify with `git show <hash>`):**
  - `c26d202` (2025-12-31) — Configure PostgreSQL for Railway deployment.
  - `17e7021` (2026-01-02) — "Revert to PostgreSQL for Railway compatibility" (the datasource had
    flipped back to SQLite in between; this 2-line schema.prisma change re-pinned PostgreSQL +
    `DATABASE_URL`).
  - `69108e0` (2026-01-22) — full migration: consolidated PostgreSQL init migration
    `20260119083345_init`; old SQLite migrations parked (still git-tracked) in
    `prisma/migrations_sqlite_broken_backup/`.
- **STATUS: SETTLED.** PostgreSQL is the only database. 29 migrations exist as of 2026-07-09
  (`20260119083345_init` → `20260708081323_drop_generated_data_and_structure_change_request`).
- **If you are tempted to** touch anything in `prisma/migrations_sqlite_broken_backup/`, "clean it
  up", or reason from its contents: don't. It is a dead parking lot, not live migration history.
  Live history starts at `20260119083345_init`.

## 2. Missing-migration repairs — 826e3fe and CHORE-001 (2026-03-04 → 2026-03-13)

- **Symptom:** Production 500s (Prisma P2022 "column does not exist") after schema fields were added
  without a corresponding migration file.
- **Root cause:** Schema changed via `prisma db push` (or hand-edit) in dev; no migration generated;
  `prisma migrate deploy` in prod therefore never created the columns.
- **Evidence:**
  - `826e3fe` (2026-03-04) — repair migration `20260304000000_add_stripe_payment_fields` for
    `stripePaymentIntentId`, `paidAt`, `amountPaid`.
  - `58d5dcd` (2026-03-08, CHORE-001) — added `Event.isDemo` via db push, no migration.
  - `e475def` (2026-03-13, CHORE-001 fix) — prod `POST /api/events` 500'd with P2022; repair
    migration generated for `isDemo`.
- **STATUS: SETTLED (as a repair pattern).** The lesson is codified in do-not-touch zone 5 of
  `GATHER-BUILD-CONSTANTS.md`: never hand-edit/delete/reorder migrations; always `prisma migrate dev`.
- **If you are tempted to** use `prisma db push` "just for now": this exact shortcut caused two
  production incidents. Generate a migration. Full runbook: `gather-data-model-and-migrations`.

## 3. GTC-001 — session cookie collision → middleware isolation (fixed 2026-03-05)

- **Symptom:** Opening a participant/coordinator token link in the same browser as a signed-in host
  could overwrite the host's planning-dashboard session (the global `session` cookie, path `/`, was
  sent on every request including token-view API calls).
- **Fix:** `c7e60aa` (2026-03-05) created `middleware.ts` (116 lines, all new). Three layers:
  1. Token page routes `/p/`, `/h/`, `/c/` store the URL token in path-scoped cookies
     (`gather_p_token` scoped to `/p/`, etc.).
  2. The `session` cookie is STRIPPED from forwarded requests on `/api/p/` and `/api/c/` — but
     deliberately NOT on `/api/h/`, because the host token view calls `getUser()` and needs it.
  3. The `session` cookie itself is never written or cleared by the middleware.
- **STATUS: SETTLED — do not revisit.** This is do-not-touch zone 1 in `GATHER-BUILD-CONSTANTS.md`
  ("Session & cookie management — GTC-001 hard-won fix").
- **If you are tempted to** "simplify" the middleware, add `/api/h/` to the stripping list, or fix an
  auth-UI staleness issue by touching cookies: stop. The `/api/h/` exclusion is intentional (comment
  block at the top of `middleware.ts` explains it). Stale auth UI after navigation is KB-001 — fix is
  `router.refresh()` at the route level, never auth changes.

## 4. KB-002 — P3005 schema drift saga (resolved 2026-03-14)

- **Symptom:** `npm run db:migrate` reported P3005 drift (DB schema ahead of migration history) for
  months. First seen during GTC-002 preflight.
- **Root cause:** Schema had been modified outside the migration system early on (see entry 2).
- **Resolution:** 2026-03-14 — production `npx prisma migrate status` returned clean; all migrations
  applied (15 at the time; 29 now), no drift. `prisma migrate dev` has been safe since. Recorded in
  `GATHER-KNOWN-BEHAVIOURS.md` under "KB-002 ✓ RESOLVED".
- **STATUS: SETTLED.**
- **If you are tempted to** run `prisma migrate reset` or alter migration files because you see drift
  today: that would be a NEW incident, not KB-002 recurring. Treat it as such — file a ticket, do not
  reset. KB-002's "do not" list still binds.

## 5. The per-section AI generation era and its collapse (2026-04-16 → 2026-07-08)

The most expensive lesson in the repo: ~3 weeks of architecture built, then reverted and pruned.

### 5a. The build (Apr 2026)

- `23512ed` (2026-04-16, GTC-116) — Moment 2 schema + setup data storage (incl. the
  `EventSetup.generatedData` column, since dropped).
- `a7dbb55` (2026-04-16, GTC-121) — "progressive AI generation": one Claude call per accordion close.
- GTC-122–128 (through early May) elaborated it: dietary ordering, NZ config, prompt extraction, etc.

### 5b. The symptoms (surfaced during GTC-133 end-to-end verification, May 2026)

Each section was generated by an independent AI call that could not see the others' output:

| Ticket | Symptom |
|---|---|
| GTC-138 | Cake/Dessert cross-category overlap (same pavlova/trifle/Yule Log in both) |
| GTC-139 | Breakfast over-generation |
| GTC-140 | Unit confusion in quantities |
| (GTC-145 findings) | 86 items / 9 categories for a 17-person Christmas; Prosecco under both Entrée and Alcoholic Drinks; parallel "dietary alternatives" instead of integrated items |

GTC-137's dietary-generator removal bought a 27% item reduction but could not fix the architectural
cause: the AI never saw the whole plan at once, so it could not coordinate.

### 5c. The revert — GTC-145 [EXPERIMENTAL] (2026-05-08)

- `a27f781` on branch `experiment/single-ai-call`: single-call generation, tagged [EXPERIMENTAL].
- **Measured before/after on the same 17-person Christmas event** (`docs/tickets/GTC-145.md`):
  86 items → **25 items** (−71%), 6 categories, zero cross-section duplication, one 43.86s call
  replacing instant-per-click calls. Ground truth: a real host's spreadsheet for a 33-person
  Christmas had ~19 items. The 44s wait was judged acceptable; coherence was not negotiable.

### 5d. The merge — GTC-146 (2026-05-08)

- `e250f64` — cherry-pick of the experiment onto `feat/moment-one-redesign` (deliberately preserved
  as a recognisable commit), `be66454` — removal of the deprecated per-section infrastructure,
  `88adeb6` — closed-summary docs. Single-call became canonical.
- `4fa1699` — GTC-138/139/140 closed as "resolved by architecture change, no code required".

### 5e. The prune — GTC-152 (2026-07-08)

- `82544b6` — Tier 1 dead-code delete (638 deletions, 0 insertions): five suggestion routes, the
  501-stubbed household `members` route, the broken `tests/measure-moment2-prompts.ts` (had imported
  six symbols deleted by GTC-146), explanation-generation code in `src/lib/ai/generate.ts` and
  `src/lib/ai/prompts.ts`.
- `05bc621` — schema: dropped `EventSetup.generatedData` and the entire `StructureChangeRequest`
  model (+2 enums) via migration `20260708081323_drop_generated_data_and_structure_change_request`.
  Both were empty; nothing ever wrote to StructureChangeRequest.

### Status and fencing

- **STATUS: SETTLED — DO NOT rebuild per-section generation.** Coordinated single call beats
  per-section calls for coherence; this was measured, not vibed.
- **If you are tempted to** re-introduce per-category or per-section AI calls (for speed, streaming,
  perceived responsiveness, or cost): read `docs/tickets/GTC-145.md` and `GTC-146.md` first. The
  duplication class returns the moment two calls cannot see each other's output. Any new proposal
  must follow the experiment-branch pattern with predicted item counts measured before/after (see
  `gather-experiment-methodology`).
- **Stale-doc trap:** `docs/moment-1-and-2-build-report.md` and `docs/moment-2-flow-document.md`
  still describe the DELETED per-section architecture. Do not implement from them.
- **AI call cap drift (as of 2026-07-09):** GTC-133 (`34565e3`) raised `AI_CALL_LIMIT` 10→20, but
  only in the routes on that era's flow; the GTC-145/146 rewrite brought some back to 10. Each
  route defines its own constant and the values drift — grep before citing
  (`grep -rn 'AI_CALL_LIMIT' src`); the canonical value table is `gather-config-and-flags` §4.
  The V1 UI in `page.tsx` still hardcodes a 10-call ceiling in its disabled/warning logic.

## 6. GTC-136 — "based on 0 guests" headcount source (2026-05-08)

- **Symptom:** Moment 2 plan header rendered "based on 0 guests" on events with a full roster.
- **Root cause:** Header read `event.guestCount` — an optional, host-entered V1 field that is `null`
  unless manually set — coerced to 0 via `?? 0`. Meanwhile finalize-plan already aggregated the real
  headcount from `Household` rows (`totalAdults + totalKids`), so quantities were correct and only
  the display lied.
- **Fix:** `5154252` — display reads the canonical household aggregate.
- **STATUS: SETTLED.** Canonical headcount = household aggregate, never `Event.guestCount`.
- **If you are tempted to** read `Event.guestCount` for anything V2-facing: don't. Two headcount
  sources is how this bug happened.

## 7. GTC-142 — token truncation + callSiteLabel (2026-05-08)

- **Symptom:** A 17-person / 117-item event 500'd on finalize-plan. The dietary-coverage AI call
  (one of three then competing inside the route) hit its 1024-token cap; `parseClaudeJSON` saw
  `stopReason === 'max_tokens'` and threw. The truncation log identified neither call site nor
  prompt class — attribution required a code-shape argument.
- **Fix:** `f21e200` — raised `MAX_TOKENS_DIETARY_COVERAGE` 1024→4096 and `MAX_TOKENS_CONSIDERATIONS`
  1024→2048, and added `callSiteLabel?: string` to `ClaudeConfig` /
  `parseClaudeJSON(response, callSiteLabel?)` so truncation logs and thrown errors name the caller.
- **STATUS: SETTLED — with a twist.** The bumped constants were later DELETED with the per-section
  infrastructure; as of 2026-07-09 `src/lib/ai/token-limits.ts` exports only
  `MAX_TOKENS_FULL_PLAN = 16384`. What survives is the diagnostic pattern: `callSiteLabel` in
  `src/lib/ai/claude.ts`.
- **If you are tempted to** add a new Claude call without a `callSiteLabel`, or to debug a 500 whose
  log says "AI response truncated": label first, then check `stopReason`/token budget before blaming
  the prompt. Budget-sizing guidance: `gather-ai-generation`.

## 8. GTC-141 — reorder capability deleted (2026-05-09)

- **Context:** GTC-125 (`de0b31d`) had added `Item.displayOrder` persistence with reorder arrows.
  GTC-141 (`d8fb530`) redesigned plan-view row interactions and **removed reorder entirely** — the
  hover-only arrows were useless on touch, and the use case wasn't strong enough to justify another
  mechanism (ticket: "Reorder removed entirely — user is on laptop, doesn't need reorder").
- **Vestige:** `Item.displayOrder Int?` remains in `prisma/schema.prisma` (indexed with
  `[teamId, displayOrder]`) and is still written/read for stable sort order in several routes and
  `Moment2PlanView.tsx`. Only the host-facing reorder UI is gone.
- **STATUS: KNOWN-TRADEOFF.** The column is not dead — do not drop it in a prune without checking
  its readers — but there is deliberately no UI to change it.
- **If you are tempted to** re-add reorder arrows or drag-and-drop: that is a product decision, not
  a bug fix. Ticket it; read `docs/tickets/GTC-141.md` first for why the last version was killed.

## 9. GTC-147 — PersonEvent.team Cascade → SetNull (2026-07-08)

- **Symptom class:** Deleting a Team silently deleted the `PersonEvent` row of everyone on it —
  removing them from the event entirely: household membership, RSVP state, and (via the
  `NudgeLog.personEventId` cascade) their whole nudge history.
- **Root cause:** `PersonEvent.team` declared `onDelete: Cascade`. Audit found six team-deletion call
  sites; NONE relied on the cascade, and three were live landmines (V1 delete-team endpoint,
  finalize-plan's `deleteMany` of GENERATED teams on every re-run, regenerate's team deletes).
  RED demo: deleting the seeded 7-member "Starters & Nibbles" team dropped the event's PersonEvents
  43 → 36.
- **Fix:** `da6c007` — one relation change to `onDelete: SetNull` (`schema.prisma` — `PersonEvent.team` relation), migration
  `20260708005434_change_person_event_team_set_null`. `teamId` was already nullable.
- **STATUS: SETTLED.**
- **If you are tempted to** add a new relation with `onDelete: Cascade`: enumerate every delete call
  site first and prove each one wants the cascade. "Cascade by default" is how people vanished from
  events. See `gather-data-model-and-migrations` for the cascade-semantics checklist.

## 10. GTC-151 — hardcoded allowlist → silent 400 → data loss (2026-07-08)

- **Symptom:** Moment 2 Step 1 data vanished on reload for most event types. Autosave was returning
  400 silently; the UI showed no error.
- **Root cause:** `setup/route.ts` validated `eventType` against a hardcoded 7-value legacy list
  (`BBQ, Roast dinner, Potluck, Picnic, Kids party, Christmas, Other`) while the modal offered the
  11 values of `CONFIG_EVENT_TYPES` (`src/lib/ai/config-loader.ts`). Overlap: exactly `Christmas`
  and `Other` — 9 of 11 pickable types silently failed to persist.
- **Fix:** `ab8678e` — route imports `CONFIG_EVENT_TYPES` as its allowlist; client chips and server
  validation share one source of truth.
- **STATUS: SETTLED.** Two binding lessons: (1) validators must share the UI's config source, never a
  parallel hardcoded list; (2) a silent 4xx on an autosave path IS data loss — surface it.
- **If you are tempted to** add any new hardcoded allowlist that mirrors a config or UI list: import
  the source instead. This class of drift is a repo-wide recurring theme (see themes section).

## 11. The 501-stubbed legacy household endpoint (ongoing)

- **What:** `POST /api/events/[id]/households/[householdId]/claim` returns HTTP 501 with
  "Household claim endpoint is being redesigned for the new household model". It was built for the
  old `HouseholdMember` model; the Moment 1 redesign replaced that with direct `PersonEvent`
  membership (`householdId` + `householdRole`).
- **History:** There were originally TWO such stubs; the `members` stub was deleted as dead code in
  GTC-152 (`82544b6`). `claim` remains because it needs redesign, not deletion.
- **STATUS: KNOWN-TRADEOFF (open, awaiting a redesign ticket).**
- **If you are tempted to** "fix" the 501 by resurrecting HouseholdMember-era logic, or to delete the
  route as dead: neither. It is a deliberate placeholder. The household model's real open wound is
  the delete-and-recreate PUT (below).

## 12. Open / deferred registry — looks like a bug, is known (as of 2026-07-09)

| Item | Reality | Do this |
|---|---|---|
| GTC-080 | Prisma v7 upgrade — status `deferred`, stub only | Leave it; not silently abandoned |
| GTC-130 | `eslint-config-next` vs Next.js major mismatch — status `open` | Known chore; don't "quick-fix" inside another ticket |
| GTC-137 / GTC-142 frontmatter says `in-progress` | Both have closing commits (`cf389c4`, `f21e200`) and CLOSED bodies — frontmatter is stale | Trust the body + git log, not frontmatter |
| `EventSetup.generatedData` referenced in docs | Column already DROPPED (GTC-152, `05bc621`) | Do not re-add; update the doc instead |
| Demo event name drift | Seed creates "Henderson Family Christmas 2026" but demo routes/tests expect "…2025" — demo session/tokens fail against a fresh seed | Known live drift (confirmed 2026-07-09); fixing it = its own ticket touching every site; canonical six-location table: `gather-config-and-flags` §7 |
| Household edit wipes memberships | `PUT /api/events/[id]/households/[householdId]` deletes non-primary PersonEvent rows and recreates them (deliberate "simpler than diffing") — wipes team membership, cascades nudge-history deletion, re-creates no-email members as new Person rows each edit | KNOWN-TRADEOFF, HIGH-risk; this is a flagship campaign target — see `gather-v1-v2-reconciliation-campaign` before touching |
| `docs/moment-1-and-2-build-report.md`, `docs/moment-2-flow-document.md` | Describe the deleted per-section architecture | Read GTC-146 first; never implement from these |

## Recurring failure themes (pattern-match new bugs against these first)

1. **Hardcoded-allowlist drift** — a validator list diverges from the config/UI list (GTC-151).
2. **Silent 4xx on save paths = data loss** — 400s the UI swallows (GTC-151).
3. **Two sources of truth for one number** — `Event.guestCount` vs household aggregate (GTC-136).
4. **Token-budget truncation** — `max_tokens` stop reason surfacing as a 500 (GTC-142).
5. **Cascade semantics assumed, not audited** — `onDelete: Cascade` landmines (GTC-147).
6. **Schema/migration divergence** — db push without a migration file (826e3fe, CHORE-001).
7. **Uncoordinated AI calls cannot cohere** — the entire per-section era (GTC-138–140/145/146).
8. **Delete-and-recreate instead of diffing** — household PUT membership wipe (open).

## Provenance and maintenance

All hashes/dates above verified 2026-07-09 against this repo. One-liners to re-verify anything that
may drift:

```bash
# Any commit cited above (date, message, files touched):
git show --stat --format='%h %ad %s' <hash>          # e.g. 17e7021, c7e60aa, a27f781, da6c007

# Ticket status vs reality (frontmatter can be stale — trust body + log):
grep -n '^status:' docs/tickets/GTC-*.md | grep -v closed
git log --oneline | grep GTC-<NNN>

# Migration count and endpoints of live history:
ls prisma/migrations | wc -l && ls prisma/migrations | sed -n '1p;$p'

# AI call cap per route (they drift independently):
grep -rn 'AI_CALL_LIMIT' src --include='*.ts' | grep -v increment

# Token budget constants still in force:
grep -n 'export const' src/lib/ai/token-limits.ts

# 501 stubs still present:
grep -rln 'status: 501' src/app/api

# Cascade/SetNull relations:
grep -n 'onDelete' prisma/schema.prisma

# Demo-name drift still live?
grep -n 'Henderson Family Christmas' prisma/seed.ts src/app/api/demo/*/route.ts tests/demo-endpoints-test.ts

# displayOrder vestige still referenced?
grep -rln displayOrder src prisma/schema.prisma
```

Maintenance rule: when a new saga closes (revert, multi-ticket investigation, measured experiment),
append a dated entry here in the same shape — symptom → root cause → evidence hashes → STATUS →
"if you are tempted to X" — in the SAME commit that closes the final ticket, subject to normal
change-control approval.
