---
name: gather-debugging-playbook
description: >
  Load this when something in the Gather prototype is BROKEN and you need to triage: all pages
  return HTTP 500, UI shows stale auth state, Step 1 / autosave data vanishes on reload, AI plan
  generation 500s or returns 0 items, people disappear from an event, demo login fails, a URL
  param keeps reappearing, seed/repro state doesn't match the ticket, or the dev server behaves
  strangely after file changes. Symptom → cause → discriminating check → fix pattern, with the
  incident history behind each trap.
---

# Gather Debugging Playbook

Symptom-first triage for this project's known failure modes. Every entry below cost real time
once; the table exists so it never costs that time again.

**Jargon, defined once:**
- **KB-NNN** = an entry in `GATHER-KNOWN-BEHAVIOURS.md` (repo root) — a confirmed *platform*
  quirk that is NOT a Gather bug but is routinely misdiagnosed as one.
- **GTC-NNN** = a Gather ticket in `docs/tickets/GTC-NNN.md` — the project's unit of change.
- **Moment 2 / finalize-plan** = the V2 AI plan-generation step (`POST /api/events/[id]/finalize-plan`).
- **Seed** = `npm run db:seed` → `prisma/seed.ts`, which creates the demo "Henderson Family
  Christmas" event.

## The discipline (read before touching anything)

1. **Consult `GATHER-KNOWN-BEHAVIOURS.md` BEFORE "fixing" platform weirdness.** Stale UI, auth
   anomalies, URL-param ghosts, and schema-drift messages all have KB entries. The file's own
   header says it: before touching auth, session, middleware, or DB code to fix an unexpected
   behaviour, check this file.
2. **Open a GTC ticket before any nontrivial fix.** House rule: every change gets a ticket
   (`docs/tickets/GTC-NNN.md`), commit message `{type}(GTC-NNN): summary`, fix + regression test +
   completed ticket in one commit. See the `gather-change-control` skill.
3. **Never route around the DO-NOT-TOUCH ZONES** in `GATHER-BUILD-CONSTANTS.md` (auth/session/
   middleware, magic-link flow, AccessToken system, Stripe, Prisma migrations, security tests,
   SMS opt-out, and the `package.json` module-type rule). Several symptoms below LOOK like bugs
   in those zones. They are not. The fix is always elsewhere.
4. **Evidence over eyeballing.** Reproduce, capture the failing request/log line, then fix, then
   show RED→GREEN. `npm run test:security` must stay green (exit 0).

## Master symptom table

| # | Symptom | Likely cause | Discriminating check | Fix pattern | Source |
|---|---------|--------------|----------------------|-------------|--------|
| 1 | ALL pages HTTP 500; dev server says "Ready"; errors mention "Specified module format (CommonJs) is not matching … EcmaScript Modules" | `"type": "commonjs"` added to `package.json` (Turbopack enforces it strictly) | `grep '"type"' package.json` | Delete the field. Never add it. (DO-NOT-TOUCH zone 8) | CLAUDE.md; GATHER-BUILD-CONSTANTS.md §8 |
| 2 | Nav shows "Sign In" (or stale user) right after login, on routes reached via `<Link>` | KB-001: Next.js RSC prefetch serves cached server payload; `getUser()` never re-runs | Hard-refresh the page — if state corrects itself, it's prefetch staleness, not auth | `router.refresh()` after auth-state changes, route level only. **Do NOT touch auth/session/middleware/cookies** | KB-001 (GTC-002) |
| 3 | URL param removed via `window.history.replaceState()` reappears; effects depending on it re-fire | KB-003: `replaceState` doesn't sync `useSearchParams()`; handlers copying current params carry the stale one forward | Log `useSearchParams().toString()` vs `window.location.search` — they diverge | `params.delete()` explicitly before `router.push()`; never treat browser URL as source of truth for param state | KB-003 (GTC-003) |
| 4 | Repro steps need a DRAFT event but the event is in CONFIRMING | KB-004: default seed creates the event with `status: 'CONFIRMING'` | `npx tsx scripts/list-events.ts` or Prisma Studio → check `Event.status` | Create via UI (pay → setup modal), or direct DB update to DRAFT with rollback note, or seed change only if the ticket authorises it | KB-004 (GTC-003) |
| 5 | Step 1 (Moment 2 brief) selections vanish on reload; autosave "worked" per the UI | Server validator rejecting the value with a **silent 400** the UI ignores | DevTools Network tab → `POST /api/events/[id]/setup` → is it 400? Response body lists `allowed` values | Validator must share the UI's config source. Since GTC-151 both use `CONFIG_EVENT_TYPES` (`src/lib/ai/config-loader.ts:86`). If a new field drifts, apply the same pattern | GTC-151 (ab8678e) |
| 6 | `POST /api/events/[id]/finalize-plan` 500s, typically on larger/complex events | AI response truncated at the `max_tokens` cap; `parseClaudeJSON` throws | Dev-server terminal: `[Claude API] AI response truncated (finalize-plan:full) - max_tokens reached` | Raise the named constant in `src/lib/ai/token-limits.ts` (currently `MAX_TOKENS_FULL_PLAN = 16384`) with headroom rationale — never inline a literal at the call site | GTC-142 (f21e200) |
| 7 | Generation "succeeds", teams created, but 0 items appear | AI returned items with `teamName`s that don't match any created team | Since GTC-030 the route returns **422** with `missingTeamNames` — check Network tab. If you see 200-with-0-items, that's a regression of the guard | Guard lives in `src/app/api/events/[id]/generate/route.ts` (~lines 55–75 and 260–280). Keep the 422; fix the prompt/team-name coherence, don't drop items silently | GTC-030 (a8fd96c) |
| 8 | AI call returns 429 "AI call limit reached for this event" | Per-event cap on `Event.aiCallsUsed` | Check `aiCallsUsed` on the event row | Caps are per-route and drift — canonical value table: `gather-config-and-flags` §4 (`grep -rn AI_CALL_LIMIT src/app/api`). Reset the counter on a *test* event via DB; don't raise caps without a ticket | GTC-133 era |
| 9 | People vanished from an event after team operations (regenerate, delete team, finalize re-run); nudge history gone too | Historical: `PersonEvent.team` had `onDelete: Cascade` — deleting a Team deleted its members' PersonEvent rows | Migration `20260708005434_change_person_event_team_set_null` present? `ls prisma/migrations | grep set_null`. On seed, the old bug dropped PersonEvents 43→36 when deleting one 7-member team | Fixed by SetNull (GTC-147). If you see this NOW, check for any new relation with Cascade semantics touching PersonEvent | GTC-147 (da6c007) |
| 10 | Demo login / demo tokens return 404 "Demo event not found" on a fresh seed | Name drift: seed creates **"Henderson Family Christmas 2026"** but demo endpoints look for **"Henderson Family Christmas 2025"** | `grep -rn "Henderson Family Christmas" prisma/seed.ts src/app/api/demo/ tests/demo-endpoints-test.ts` | Known LIVE drift (as of 2026-07-09) — demo endpoints 404 on fresh seed = this bug. Fix = one constant, one ticket; canonical six-location table: `gather-config-and-flags` §7 | Discovery 2026-07-09 |
| 11 | Host's dashboard session lost after opening a participant `/p/[token]` link in the same browser | GTC-001 class: token flows once overwrote the global `session` cookie | Read `middleware.ts` (116 lines): path-scoped cookies `gather_p_token`/`gather_h_token`/`gather_c_token`; `session` cookie stripped from `/api/p/` and `/api/c/` (deliberately NOT `/api/h/`) | This is FIXED. If it recurs, suspect a new route bypassing middleware matching — check the `config.matcher` list. **Do not "fix" by touching cookie logic** (DO-NOT-TOUCH zone 1) | GTC-001 |
| 12 | `npm run db:migrate` reports P3005 / schema drift | KB-002 — historical drift, RESOLVED 2026-03-14 by baselining | `npx prisma migrate status` — should be clean | If clean: proceed. If drift reappears: STOP, do NOT `prisma migrate reset` or edit migration files; open a chore ticket with rollback plan | KB-002 |
| 13 | Plan header says "based on 0 guests" (or wrong headcount) | Reading `Event.guestCount` (nullable, host-entered, often null) instead of the Household aggregate | The display source is `planGuestCount` in `src/app/plan/[eventId]/page.tsx` (~line 1816): households headcount, falling back to `event.guestCount ?? 0` | One canonical headcount = aggregate over Household members (+ `littleCount`). Any NEW headcount display must use it, not `Event.guestCount` | GTC-136 (5154252) |
| 14 | `tsc --noEmit` errors referencing routes/files you just deleted; or dev behaves oddly after big file moves | Stale Turbopack/Next artifacts in `.next/` (notably `.next/types` stubs for deleted routes) | Do the errors reference paths that no longer exist? | `rm -rf .next` then rebuild (`npm run dev` or `npm run build`). Transient, expected after route deletions | GTC-146, GTC-152 evidence notes |
| 15 | AI features return canned-looking output with no API errors | Mock fallback: `src/lib/ai/generate.ts` falls back to mock data when `ANTHROPIC_API_KEY` is unset | `grep ANTHROPIC_API_KEY .env` (or check env) | Set the key. Mock output historically had team names like 'Unknown' that trip the 422 guard (#7) | generate.ts |

## Trap stories (why the table says what it says)

### #5 — GTC-151: the silent-400 autosave (worst-in-class, learn the shape)
A hardcoded 7-value event-type allowlist in `src/app/api/events/[id]/setup/route.ts` overlapped
the UI's 11 `CONFIG_EVENT_TYPES` chips on exactly two values ("Christmas", "Other"). 9 of 11
pickable types → every autosave returned 400 → the UI ignored it → the host's entire Step 1 brief
was gone on reload, for ~82% of event types. **Lesson encoded:** (a) a silent 4xx on an autosave
path IS data loss; (b) validators must import the same constant the UI renders from. When
debugging any "my input vanished" report, open the Network tab FIRST and look for non-200s the
UI swallowed.

### #6 — GTC-142: truncation with no attribution
A 17-person event 500'd in finalize-plan because one internal AI call hit a 1024-token cap. The
original log line gave response length but not the call site, so attribution took a code-shape
argument instead of one grep. The fix added `callSiteLabel` plumbing: `parseClaudeJSON(response,
label)` in `src/lib/ai/claude.ts` (~line 111) now logs
`[Claude API] AI response truncated (<label>) - max_tokens reached`. Current labels (as of
2026-07-09): `finalize-plan:full`, `conflict-resolution`, `plan-generation`, `plan-regeneration`,
`selective-regeneration`. **Any new AI call site must pass a `callSiteLabel`.** Note: GTC-142
predates the single-call architecture (GTC-145/146); the per-section token constants it bumped
are gone — only `MAX_TOKENS_FULL_PLAN` remains in `src/lib/ai/token-limits.ts`.

### #9 — GTC-147: the cascade landmine
`PersonEvent.team` was `onDelete: Cascade`, so deleting a Team deleted every member's PersonEvent
row — household membership, RSVP state, and (via a second cascade on `NudgeLog.personEventId`)
their nudge history. Six team-deletion call sites existed; none intended it. finalize-plan
re-runs delete GENERATED teams every time, so every V2 regeneration was armed. **Lesson:** when
rows vanish, `grep -n "onDelete" prisma/schema.prisma` and trace the cascade graph before
blaming application code.

### #1 — the commonjs trap
Someone (or some tool) adds `"type": "commonjs"` to `package.json`; Turbopack then rejects ESM
syntax in every source file and every route 500s while the server still reports "Ready". It is
DO-NOT-TOUCH zone 8 precisely because it looks like an innocent metadata edit. Check takes two
seconds; do it before any deeper 500 investigation.

## Discriminating-experiment recipes

### Truncation vs. malformed JSON (AI 500s)
Both end in `parseClaudeJSON` throwing. Distinguish by the dev-server log line:

| Log line | Meaning | Fix direction |
|---|---|---|
| `[Claude API] AI response truncated (<label>) - max_tokens reached. Response length: N` | Hit the `max_tokens` cap (`stopReason === 'max_tokens'`) | Raise the named constant in `src/lib/ai/token-limits.ts`, with headroom comment |
| `[Claude API] Failed to parse JSON response: <text>` | Model emitted non-JSON / broken JSON at normal length | Prompt/parsing problem — load `gather-ai-generation` |

The dumped response text in the second case is your primary evidence; save it into the ticket.

### Auth bug vs. prefetch staleness (KB-001)
Before suspecting the auth system (a DO-NOT-TOUCH zone):
1. Reproduce the stale state via a `<Link>` navigation.
2. Hard-refresh (Cmd+Shift+R). If the UI is now correct → **prefetch staleness**, fix is
   `router.refresh()` after the auth-state change. Full stop.
3. Only if a hard refresh STILL shows wrong auth state: check the actual cookie
   (DevTools → Application → Cookies → `session`) and the response of a fresh request to a
   session-guarded route. Then open a ticket — do not hot-fix middleware or `src/lib/auth*`.

### DB-vs-UI state divergence
When the UI claims one thing and you suspect the DB says another:
```bash
# Fast event overview (ids, status, team/conflict counts)
npx tsx scripts/list-events.ts

# Full browse
npx prisma studio

# Raw SQL (dev DB per .env DATABASE_URL, typically gather_dev)
psql "$DATABASE_URL" -c "SELECT id, name, status, \"guestCount\", \"aiCallsUsed\" FROM \"Event\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```
Rules of interpretation:
- `Item.status` (ASSIGNED/UNASSIGNED) is a **cache** — never trust it for gates; query
  `Assignment` rows directly (documented in `src/lib/workflow.ts`, which also ships a repair
  helper that reconciles `Item.status` to Assignment existence).
- Three role axes exist and are routinely confused: `PersonEvent.role`,
  `EventRole.role` (session-level), `AccessToken.scope` (token-level). State which one you
  queried in your evidence.
- If the UI is stale but DB is right: suspect #2 (prefetch) or #3 (searchParams) before
  suspecting fetch logic.

### "It works on my event but 500s on theirs"
Size-sensitive failures (truncation #6, cap exhaustion #8) scale with guests × categories ×
items. Reproduce with a LARGER event, not the default seed: per-ticket seed scripts exist
(pattern: `scripts/seed-gtc-NNN-test-event.ts`, e.g. `scripts/seed-gtc-133-test-event.ts`) and
`scripts/create-test-event.ts` / `scripts/create-gtc-test-event.ts`.

## Where logs live

There are **no log files**. Everything is stdout/stderr of the dev-server terminal
(`npm run dev` = `next dev --turbo`), plus the browser console and Network tab.

| Signal | Where |
|---|---|
| AI-layer diagnostics (`[Claude API] …` truncation, parse failures, API errors) | dev-server terminal (`src/lib/ai/claude.ts` console.error calls) |
| Route 4xx/5xx bodies (e.g. GTC-151's 400 with `allowed`, GTC-030's 422 with `missingTeamNames`) | browser DevTools → Network tab → response body |
| Client-side state issues | browser console |
| DB truth | `npx prisma studio`, `scripts/list-events.ts`, `psql "$DATABASE_URL"` |
| Deployed (Vercel) | Vercel dashboard function logs (out of scope here) |

Preflight, when the environment itself is suspect (order matters):
`npm install` → `npm run db:migrate` → `npm run dev` (wait for Turbopack "Ready") →
`npm run test:security` (must exit 0). See `GATHER-BUILD-CONSTANTS.md` "Preflight Sanity Sequence".

## When NOT to use this skill

| Situation | Load instead |
|---|---|
| You need the full incident history with hashes and post-mortem detail | `gather-failure-archaeology` |
| You're changing prompts, token budgets, or the single-call generation flow | `gather-ai-generation` |
| Fresh machine / env vars / preflight fails before you can even reproduce | `gather-build-and-env` |
| You need to run seeds, mint tokens/URLs, Stripe CLI, crons, demo mode | `gather-run-and-operate` |
| Schema changes, migrations, cascade semantics design | `gather-data-model-and-migrations` |
| You've diagnosed it and now need the ticket/commit/approval workflow | `gather-change-control` |
| Writing the regression test and evidence for the fix | `gather-validation-and-evidence` |
| You just need to understand Moments/roles/households conceptually | `gather-domain-reference` |

## Provenance and maintenance

All facts verified against the repo on 2026-07-09 (branch `feat/moment-one-redesign`). One-line
re-verification commands for everything that may drift:

```bash
# 1  commonjs trap still documented + absent
grep -n '"type"' package.json; grep -n 'commonjs' GATHER-BUILD-CONSTANTS.md CLAUDE.md

# 2-4  KB registry unchanged (KB-001..KB-004, 88 lines as of 2026-07-09)
grep -n '^### KB-' GATHER-KNOWN-BEHAVIOURS.md

# 5  setup validator still uses the shared config source
grep -n 'CONFIG_EVENT_TYPES' "src/app/api/events/[id]/setup/route.ts" src/lib/ai/config-loader.ts src/components/plan/Moment2Step1Modal.tsx

# 6  truncation diagnostics + current token constant
grep -n 'callSiteLabel\|max_tokens' src/lib/ai/claude.ts | head; grep -n 'MAX_TOKENS' src/lib/ai/token-limits.ts

# 7  0-items guard still 422s
grep -n 'missingTeamNames' "src/app/api/events/[id]/generate/route.ts"

# 8  current AI call caps
grep -rn 'AI_CALL_LIMIT' src/app/api

# 9  SetNull migration present
ls prisma/migrations | grep set_null; grep -n 'onDelete' prisma/schema.prisma | head

# 10  demo-name drift status (fixed when all four agree)
grep -rn 'Henderson Family Christmas' prisma/seed.ts src/app/api/demo tests/demo-endpoints-test.ts

# 11  middleware isolation intact
grep -n 'gather_._token\|SESSION_STRIP_PREFIXES' middleware.ts

# 12  migration status clean
npx prisma migrate status

# 13  headcount display source
grep -n 'planGuestCount' "src/app/plan/[eventId]/page.tsx"

# 15  mock fallback
grep -n 'ANTHROPIC_API_KEY' src/lib/ai/generate.ts src/lib/ai/claude.ts
```

Volatile facts date-stamped above: AI call caps (10/20 split), `MAX_TOKENS_FULL_PLAN = 16384`,
callSiteLabel list, demo-name drift (open), KB file last updated 2026-03-05. If any
re-verification command disagrees with this file, trust the repo and update this skill via a
ticket.
