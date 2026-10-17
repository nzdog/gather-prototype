---
name: gather-change-control
description: >-
  Load BEFORE making ANY change to the Gather repo: starting a ticket (GTC-NNN),
  committing, branching, touching auth/Stripe/migrations/SMS, or proposing an
  architecture change. Covers the executor preamble, ticket lifecycle and
  frontmatter, commit-message and hash-backfill conventions, do-not-touch zones
  with the incidents behind them, the experiment-branch pattern for risky work,
  local/CI gates, and stop-condition culture. Keywords: ticket, GTC, commit,
  approval, do-not-touch, experiment branch, compliance check, preflight.
---

# Gather Change Control

How changes are classified, gated, and reviewed in this repo — and the incidents
that made each rule. This skill is process; for the technical map load
`gather-architecture-contract`, for incident detail load `gather-failure-archaeology`.

**The two absolute rules (memorize these first):**

1. **NO `git commit`, `git push`, or `git merge` without the founder's explicit
   approval in chat.** This is a standing directive (also in the user's global
   CLAUDE.md). Prepare the change, paste the evidence, propose the commit
   message, then WAIT. Staging files (`git add`) as prep is fine; committing is not.
2. **Every change gets a GTC ticket.** GTC-NNN ("Gather Ticket" numbering,
   `docs/tickets/GTC-NNN.md`). 124 ticket files exist as of 2026-07-09
   (GTC-028 onward; earlier tickets predate the folder convention).

Doctrine source of truth: `GATHER-BUILD-CONSTANTS.md` at repo root (last updated
2026-03-05). Nothing in this skill overrides it; where the constants file has
drifted from reality, the drift is flagged below rather than silently corrected.

## When NOT to use this skill

| You are trying to... | Load instead |
|---|---|
| Understand the system's architecture, invariants, V1/V2 split | `gather-architecture-contract` |
| Set up the environment / run preflight from scratch | `gather-build-and-env` |
| Run the app, seeds, crons, Stripe CLI | `gather-run-and-operate` |
| Write/execute tests, assemble an evidence package | `gather-validation-and-evidence` |
| Design an experiment (hunch → measured result) | `gather-experiment-methodology` |
| Look up an incident's full story and hashes | `gather-failure-archaeology` |
| Change the schema or write a migration | `gather-data-model-and-migrations` |

Use THIS skill for: the gates around a change (ticket, approval, zones, commit
form), not the content of the change.

## The executor preamble (condensed from GATHER-BUILD-CONSTANTS.md)

Every AI executor follows these steps IN ORDER before touching code, for every
ticket type:

1. **Read `GATHER-BUILD-CONSTANTS.md` in full.**
2. **Read the relevant ticket template in full.** Templates at root as of
   2026-07-09 (the constants file's template list was corrected to match
   reality in GTC-153):
   - `BUG-TICKET-TEMPLATE.md` — the default template
   - `BUG-TICKET-TEMPLATE-FULL.md` — complex/critical bugs
   - `UX-TICKET-TEMPLATE.md` — UX work
   - (`oldBUG-TICKET-TEMPLATE.md` is superseded; do not use)
   - No feature/chore/spike template exists — adapt the bug template's
     section structure (see real tickets in `docs/tickets/`, e.g. GTC-152
     for a chore).
   - If the ticket involves unexpected platform behaviour, stale UI state, auth
     anomalies, or DB irregularities: also read `GATHER-KNOWN-BEHAVIOURS.md`.
3. **Ticket compliance check** against the template. Output format (verbatim
   from the constants file):

   ```
   TICKET COMPLIANCE CHECK — GTC-XXX
   [ ] Issue: [field name] — [what is wrong and what is needed]
   CLEAR — no issues found (if applicable)
   ```

   Flag fields that are empty/placeholder, internally inconsistent, ambiguous,
   missing for the declared severity, or in conflict with the constants file.
   Any issues → **STOP, paste the punch-list, await instruction.** CLEAR →
   state "Compliance check passed — proceeding to preflight" and continue.
4. **Run the Preflight Sanity Sequence:**

   | Step | Command | Success signal |
   |---|---|---|
   | Install | `npm install` | exit 0, no peer-dep errors |
   | DB migrate | `npm run db:migrate` | "All migrations have been successfully applied" |
   | Boot | `npm run dev` | Turbopack prints `Ready` on localhost:3000 |
   | Security suite | `npm run test:security` | exit 0 |

5. **Execute the ticket.**

## The executor output contract

For every ticket, before committing:

1. Fill the ticket's **Evidence (Executor-Completed)** section: root cause,
   files changed, test results, assertions checked, commit hash.
2. Save the completed ticket as `docs/tickets/GTC-XXX.md`.
3. **One commit containing everything together**: the fix + the regression test
   + the completed ticket. Not three commits.

The evidence bar in practice (see closed tickets like `docs/tickets/GTC-151.md`
for the standard): RED→GREEN test output pasted, acceptance assertions checked
one by one, `tsc --noEmit` clean, build passes, adjacent flows verified, and —
for UI tickets — a real browser walk, not just an API check. "Evidence over
eyeballing" is house culture.

## Ticket lifecycle

### File and frontmatter

Tickets live at `docs/tickets/GTC-NNN.md` (an Obsidian vault — `[[GTC-NNN]]`
wiki-links appear in bodies; `.obsidian/` metadata sits alongside). YAML
frontmatter fields seen in practice (e.g. `docs/tickets/GTC-146.md`):

```yaml
---
ticket: GTC-146
title: "Single-call architecture brought to feat/moment-one-redesign"
status: closed
branch: feat/moment-one-redesign
commit: e250f64
moment: 2
type: ux
depends_on:
  - "[[GTC-137]]"
blocks: []
tags: [moment-2, ux, ai-generation]
---
```

Not every ticket has full frontmatter — some (GTC-147, GTC-151) have none and
open directly with `# GTC-NNN — title — CLOSED` plus a bold Status line. Both
forms are accepted; prefer full frontmatter for new tickets.

### Status values (as of 2026-07-09, across 124 tickets)

| `status:` value | Count | Meaning |
|---|---|---|
| `closed` | 111 | Done, commit landed |
| `open` | 1 (GTC-130) | Filed, not started |
| `in-progress` | 2 (GTC-137, GTC-142) | **BOTH STALE — see warning** |
| `deferred` | 1 (GTC-080) | Parked deliberately |

**Stale-frontmatter warning:** frontmatter `status` is hand-maintained and
lags. GTC-137's frontmatter says `in-progress` while its own body heading says
"— CLOSED" (closing commit `cf389c4`); GTC-142 likewise (`f21e200`). **Trust
the body heading and `git log --oneline | grep GTC-NNN` over the frontmatter.**
When closing a ticket, update BOTH the frontmatter and the body heading.

### Commit-hash backfill convention

The output contract creates a chicken-and-egg: the ticket is committed WITH the
fix, so it can't contain its own commit hash. House convention: a small
follow-up commit backfills the hash into the closed ticket. Real examples:

```
00e5388 chore(GTC-152): backfill commit hashes in closed ticket
1c77eb2 chore(GTC-151): backfill commit hash in closed ticket
37974bf chore(GTC-147): backfill commit hash in closed ticket
a0e59b7 docs(GTC-132): add commit hash to closed ticket
```

Both `chore(...)` and `docs(...)` prefixes appear; recent practice favours
`chore(GTC-NNN): backfill commit hash in closed ticket`. This backfill commit
also requires approval before it is made.

## Commit and branch conventions

### Commit messages: `{type}(GTC-NNN): summary`

Real examples from `git log` (verified 2026-07-09):

```
fix(GTC-151): setup route validates eventType against CONFIG_EVENT_TYPES
feat(GTC-150): dietary three-state model — unanswered vs confirmed_none vs confirmed_needs
refactor(GTC-146): remove deprecated per-section AI generation infrastructure
chore(GTC-152): delete dead V1/per-section code (Tier 1 prune)
docs(GTC-138,139,140): close deferred tickets resolved by single-call architecture
```

Types in use: `fix`, `feat`, `chore`, `refactor`, `docs`. Multiple tickets are
comma-separated in one scope when a single commit legitimately closes several
(`docs(GTC-138,139,140): ...`). Occasional untyped `docs:` commits exist for
cross-cutting doc sweeps, but ticket-scoped is the norm — default to it.

### Branches

- **Base branch: `master`.** All work branches off `master`; PRs merge back to
  `master`. (Current long-running feature branch: `feat/moment-one-redesign`.)
- Branch naming is not tool-enforced. Patterns seen in practice:
  `feat/moment-one-redesign`, `experiment/single-ai-call`,
  `gtc-042-part1-nudge-schema`. The constants file suggests ticket-prefixed
  descriptive names (e.g. `GTC-001-fix-session-cookies`).
- In practice most ticket work lands directly on the current feature branch;
  confirm with the founder before creating or switching branches. (Inferred
  house norm, not written doctrine — the constants file's branch-naming
  convention presumes executors do create branches, and no repo doc states an
  approval requirement.)

## Do-not-touch zones (with the incident behind each)

"Do-not-touch" = must not be refactored or modified without explicit
instruction from the founder, ideally via a dedicated ticket. If a fix seems to
REQUIRE touching one, that is Stop Condition 5 — stop and report.

| # | Zone | Files | Rationale | Incident |
|---|---|---|---|---|
| 1 | Session & cookie management | `src/lib/auth*`, `middleware.ts` (repo root, 116 lines; the constants file's stale `src/middleware*` path was corrected in GTC-153, 2026-07-09) | Role-scoped cookies (`gather_p/h/c_token`) separate host/participant sessions; changing naming/scoping re-introduces session collision | **GTC-001** (commit `c7e60aa`): a participant token overwrote the host's session cookie — host silently became a participant. Hard-won middleware isolation fix. No ticket file exists (predates the convention); the commit is the record. |
| 2 | Magic-link auth flow | `src/app/api/auth/`, Prisma `MagicLink`/`Session`/`User` | Sole authentication mechanism; a bug in token generation/expiry/consumption locks ALL users out | Same auth-fragility family as GTC-001; also KB-001 in `GATHER-KNOWN-BEHAVIOURS.md` (stale auth UI — fix with `router.refresh()`, never by touching auth) |
| 3 | AccessToken & scope system | Prisma `AccessToken`, unique `[eventId, personId, scope, teamId]` | Token issuance/validation/scope is interdependent with the scoped-cookie system; changes need a full security re-audit | Guarded by the security suite; the uniqueness constraint is load-bearing |
| 4 | Stripe integration | `src/app/api/webhooks/stripe/`, `src/lib/stripe*`, Prisma `Subscription`, `User.billingStatus` | Webhook signature verification, idempotency, billing transitions — **real money** | Preventive zone (no incident yet — keep it that way). Never run live-mode operations; test card 4242… only |
| 5 | Prisma migrations | `prisma/migrations/` | Never hand-edit SQL, never delete or reorder; always `prisma migrate dev` to generate | KB-002/P3005 schema drift was a months-long wound (resolved 2026-03-14 by baselining); CHORE-001 (`e475def`) repaired missing migrations after schema changes |
| 6 | Security test suite | `tests/security-*.ts` (`security-validation.ts`, `security-inventory-gate.ts`, `security-fixtures.ts`) | Defines the security contract for the API surface. NEVER weaken or skip assertions to make tests pass — fix the underlying issue | Standing rule; the suite is the preflight gate. (The living tool is `scripts/triage-unknown-routes.ts` + `route-classifications.json` at root; the constants file's stale `classify-routes.ts` reference was corrected in GTC-153, 2026-07-09.) |
| 7 | SMS opt-out logic | Prisma `SmsOptOut`, `Person.smsOptedOut` | Opt-out must be respected in every nudge-sending path — bypassing it is potential illegal sending (spam/TCPA-class legal exposure) | Preventive zone |
| 8 | `package.json` module type | Never add `"type": "commonjs"` | Turbopack strictly enforces it and rejects ESM source → every route returns HTTP 500 | Documented incident in project `CLAUDE.md`; it has actually happened |

Cascade semantics deserve honorary zone status: **GTC-147** (commit `da6c007`,
migration `20260708005434_change_person_event_team_set_null`) — `PersonEvent.team`
had `onDelete: Cascade`, so deleting any Team deleted every member's PersonEvent
row: they vanished from the event, RSVP state and nudge history gone. Six
team-deletion call sites existed; three were live landmines. Fixed to SetNull.
**Lesson: before adding or relying on any `onDelete` behaviour, audit every
delete call site — load `gather-data-model-and-migrations`.**

## The experiment-branch pattern (sanctioned route for architecture changes)

Risky or architectural changes do NOT land directly. The house pattern, proven
by GTC-145/146 (the single-call AI rewrite):

1. **File an experiment ticket** with `[EXPERIMENTAL]` framing and a dedicated
   branch (`experiment/<name>`). GTC-145 used `experiment/single-ai-call`
   (frontmatter: `branch: experiment/single-ai-call`, `commit:` left empty —
   the experiment commit `a27f781` stayed on the experiment branch).
2. **Predict numbers first, then measure.** GTC-145 measured the per-section
   architecture producing 86 items / 9 categories for a 17-person Christmas
   event with cross-section duplication (Yule Log in both Cake AND Dessert);
   the single-call replacement produced a 25-item plan in ~44s with no
   duplication. The decision was made on measured item counts, not vibes.
3. **Keep the old path alive during the experiment** (GTC-145 left per-section
   code behind `DEPRECATED` comments) so the experiment is reversible.
4. **Merge via a separate ticket.** GTC-146 cherry-picked `a27f781` onto
   `feat/moment-one-redesign` (as `e250f64`, `[EXPERIMENTAL]` tag stripped from
   the message), then removed the deprecated infrastructure in its own commit
   (`be66454`) — "removing dead code is not the same change as introducing the
   new architecture." Final verification doc: `88adeb6`.
5. **Prune remaining dead code later under its own ticket** (GTC-152:
   `82544b6`, `05bc621`).

Why this exists: the per-section architecture (GTC-116/121–128, Apr–May 2026)
was built incrementally on main-line branches without a measured gate, and
unwinding it cost ~3 weeks. Any proposal to change generation architecture, the
V1/V2 split, or state-machine semantics should be pitched AS an experiment
ticket in this shape. Full methodology: load `gather-experiment-methodology`.

### The merge protocol (landing an experiment branch)

The pattern above covers *building* on an experiment branch. This is the
landing half — how a finished experiment (or a whole epic of them) gets onto
`feat/moment-one-redesign` without smuggling an unruled decision through the
seam. Worked example: **GTC-200** (the merge) and **GTC-202** (the
merge-blocking corrections GTC-200's own review forced before a single commit
was picked) — Epic A landing on `feat/moment-one-redesign`, 2026-08-04.

1. **A cold session reviews, not the session that built it.** GTC-200 was
   deliberately executed by a fresh session with no memory of writing the
   branch, so its review of the diff had no stake in defending prior work. An
   executor reviewing their own recent output reads intention into a checkbox
   instead of checking the code.
2. **Re-run every gate before reading a line of diff.** Reseed, then the full
   gate suite — `tsc`, format check, build, security suite, every
   ticket-specific test script — on the experiment branch's tip, cold, before
   the review begins. A review built on stale gate results is a review of what
   the branch looked like, not what it is.
3. **Read the diff against the governing plan, section by section** — not
   file by file, not commit by commit. The plan-of-record is the ruler; the
   diff is what's being measured. GTC-200 read all 87 changed files against
   the A1 plan section by section, and that is what surfaced GTC-202's two
   corrections — both invisible from inside the sessions that had written
   them, because both tickets' own prose was accurate about intention; only
   the checkbox had run ahead of the evidence.
4. **STOP before the first pick on any unruled divergence.** If the diff
   contains a decision the plan doesn't already make — an acceptance box
   ticked ahead of its evidence, a deviation nobody signed off on, a scope
   item that quietly grew — do not merge around it and do not fix it inline.
   Stop, report it, get a ruling. GTC-200 found two merge-blocking gaps this
   way (the reason-prompt component promised but never built; the backfill
   promised but never run) and did not cherry-pick a single commit until both
   were ruled.
5. **Corrections land on the experiment branch, never mid-merge.** A ruled
   correction is its own ticket (GTC-202), committed to `experiment/<name>`,
   gated exactly like any other experiment commit, and sequenced as the new
   last commit in the series before the merge ticket resumes. The merge
   ticket does not grow a fix of its own — "any behaviour change... belongs to
   the ticket that owns the site" (GTC-200's own rule for itself).
6. **Gate suite after every pick, matching each ticket's recorded numbers —
   not just at the end.** Cherry-pick in chronological (as-built) order, not
   the filed order, if the two differ: GTC-200 had to correct its own filed
   pick order because the as-filed sequence produced an intermediate commit
   that didn't compile. After each ticket's commits land, the running gate
   count must match what that ticket's own evidence recorded — security suite
   16 → 38 → 45 → 51, matching A2 → A3a → A3b/A3c → A3d/A3b-2/A3c-2 exactly. A
   mismatch means the picks did not land the same code in the same order,
   even if every individual gate is green.
7. **A byte-identical diff against the experiment tip is the proof, not an
   assertion of "no conflicts".** `git diff experiment/<name> HEAD` should be
   empty once the series is fully picked. GTC-200's merge produced exactly
   this — stronger evidence than "zero conflicts reported", because it also
   rules out silent reconciliation during a pick that applied cleanly but
   landed different content than the source.
8. **Push the history branch whole — never delete it.** `experiment/<name>`
   stays intact after the merge, unsquashed, as the record of how the work was
   actually built; the per-ticket closed tickets keep citing their
   *experiment-branch* hashes rather than being rewritten to the merge's
   target hashes — renumbering history to point at trunk would sever the link
   back to the branch being kept as the record.

The corollary this protocol exists to prevent: an executor close to their own
work reviewing it, cherry-picking around a gap they wrote and no longer see,
and merging an audit trail — a ledger or otherwise — that records its own
blind spots as if they were complete.

## What gates a commit

### Locally (Husky)

`.husky/pre-commit` runs `npx lint-staged`; `package.json` lint-staged config
runs `prettier --write` on staged `*.{js,jsx,ts,tsx,json,css,md}`. That is the
ONLY automated local gate — no local typecheck, lint, or tests run on commit.
Therefore the executor contract (tests green, `tsc --noEmit` clean, evidence
assembled) is a discipline you enforce yourself BEFORE asking for commit
approval. Prettier may reformat staged files during commit; that is expected.

### In CI (`.github/workflows/ci.yml`, verified 2026-07-09)

Runs on every PR and on push to `master`. Node 20, then in order:

| Step | Command | Blocking? |
|---|---|---|
| Install | `npm ci` | yes |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | yes |
| Format check | `npm run format:check` (prettier `--check` on `src/**`) | yes |
| Prisma client | `npx prisma generate` | yes |
| Build | `npx next build` (dummy `DATABASE_URL` + `STRIPE_SECRET_KEY`) | yes |
| Security audit | `npm audit --audit-level=high` | no (`continue-on-error: true`) |

CI does NOT run the test suite (tests need a real DB). Also present:
`claude-review.yml` (automated PR review) and `codeql.yml`. Match CI locally
before requesting approval: `npm run typecheck && npm run format:check && npx next build`.

## Stop-conditions culture

Every ticket carries an explicit Stop Conditions list; treat it as binding.
The standard set from `BUG-TICKET-TEMPLATE.md` — stop and report, do not
proceed, if:

1. `GATHER-BUILD-CONSTANTS.md` missing
2. Preflight fails
3. Cannot reproduce the bug
4. Cannot write a RED (failing-first) test for Critical/High — document why,
   await instruction
5. Fix requires touching Do-Not-Touch zones or expanding scope
6. Real-world side effects possible without safe mode (Stripe live mode, real SMS)
7. DB schema migration required
8. Any required unknown surfaces during investigation

Cultural corollaries:

- **Stopping is success, not failure.** The compliance-check punch-list, the
  Unknowns section ("if an unknown blocks progress → STOP and report before
  writing code"), and the stop lists all encode the same value: an executor
  that halts with a precise question beats one that guesses.
- **Unexpected platform behaviour → consult `GATHER-KNOWN-BEHAVIOURS.md` before
  "fixing".** Several past near-misses were platform quirks (KB-001 stale RSC
  auth UI, KB-003 `replaceState` vs `useSearchParams`) where the "obvious fix"
  would have violated a do-not-touch zone.
- **Silent failure is a fire alarm.** GTC-151 (`ab8678e`): a hardcoded
  event-type allowlist in the setup route rejected 9 of the 11 types the UI
  offered → silent 400 on autosave → Step 1 data vanished on reload. If you
  observe a 4xx the UI swallows, that is a data-loss bug — file it, don't note it.
- Pre-existing known issues listed in the constants file are **not yours to fix
  without a dedicated ticket**.

## Change-classification quick reference

| Change kind | Route |
|---|---|
| Bug fix | `BUG-TICKET-TEMPLATE.md` ticket → preamble → fix + RED→GREEN test + ticket in one commit → approval → backfill hash |
| Complex/critical bug | Same, but `BUG-TICKET-TEMPLATE-FULL.md` |
| UX change | `UX-TICKET-TEMPLATE.md`; browser-walk verification required before close |
| Feature / chore | GTC ticket adapting the bug-template structure (no dedicated template exists — see preamble note) |
| Architecture change | Experiment-branch pattern (GTC-145 → GTC-146 shape); measured before/after mandatory |
| Schema change | Stop Condition 7 — surface it, get sign-off, then `prisma migrate dev` only; load `gather-data-model-and-migrations` |
| Anything in a do-not-touch zone | Explicit founder instruction + dedicated ticket, or don't |

## Provenance and maintenance

All facts verified against the repo on 2026-07-09 (branch
`feat/moment-one-redesign`). One-line re-verification commands:

```bash
# Doctrine + which ticket templates actually exist at root
ls *.md | grep -i template            # expect BUG, BUG-FULL, UX, oldBUG only
grep -n "TICKET-TEMPLATE" GATHER-BUILD-CONSTANTS.md   # constants still cite FEATURE/CHORE/SPIKE

# Do-not-touch zones (compare against the table above)
grep -n "^### " GATHER-BUILD-CONSTANTS.md

# Ticket count + status distribution (stale in-progress check)
ls docs/tickets/GTC-*.md | wc -l
grep -h '^status:' docs/tickets/*.md | sort | uniq -c

# Commit convention + backfill pattern still in use
git log --oneline -30 | grep -E '\(GTC-[0-9]+' 
git log --oneline | grep -i backfill | head -5

# Base branch and experiment branches
git branch -a | grep -E 'master|experiment/'

# Local gate
cat .husky/pre-commit && grep -A2 '"lint-staged"' package.json

# CI gate
grep -E 'run:|node-version' .github/workflows/ci.yml

# Incident anchors
git log --oneline --all | grep -E 'GTC-001|GTC-145|GTC-146|GTC-147|GTC-151'
ls prisma/migrations | grep set_null
```

Known drift already flagged above (do not "fix" without a ticket):
GTC-137/GTC-142 frontmatter says `in-progress` though both are closed; the
preflight table in the constants file lists `npm run test:security` twice
(as both Smoke and Security suite rows). Resolved 2026-07-09 (GTC-153): the
constants file's stale template list, `src/middleware*` path, and
`classify-routes.ts` reference are all corrected.
