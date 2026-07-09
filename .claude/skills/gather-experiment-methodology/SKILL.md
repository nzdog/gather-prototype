---
name: gather-experiment-methodology
description: >
  Load this skill when a change to Gather is a HYPOTHESIS rather than a defined fix — e.g.
  "I think single-call generation would be better", "should we swap X architecture for Y",
  "this rewrite might fix several bugs at once", or any AI-prompt/architecture change whose
  outcome cannot be predicted from reading code alone. Covers the full idea lifecycle:
  hunch → ticket → predict numbers first → experiment/<name> branch with [EXPERIMENTAL] commit
  → measured before/after on a fixed fixture → founder decision gate → merge or documented
  retirement. Canonical worked example: GTC-145 (86→25 items). Also load when you are tempted
  to adopt a change because "the output looks better" — this skill defines the evidence bar.
---

# Gather Experiment Methodology

How a hunch becomes an accepted change in this repo. This is the discipline that turned the
worst architecture mistake in the project's history (per-section AI generation, ~3 weeks of
rework) into a clean, measured recovery (GTC-145/146/152) — and it is expected practice for
any future change whose outcome is uncertain.

**Jargon, defined once:**

| Term | Meaning |
|---|---|
| GTC ticket | A tracked work item at `docs/tickets/GTC-NNN.md` with YAML frontmatter (ticket/title/status/branch/commit/type/...). Every change gets one. |
| Founder | The solo business owner (Nigel). Directs all work; nothing merges without his explicit chat approval. |
| Moment 2 | The V2 host journey step "What's the plan?" — Step 1 brief accordion → Step 2 AI-generated plan. |
| Per-section generation | The retired architecture (GTC-121 era): one Claude call per accordion section, no cross-section coordination. |
| Single-call generation | The current architecture (GTC-145/146): one Claude call at finalize-plan produces the whole plan. |
| Fixture event | A seeded test event with fixed, known composition, so before/after numbers are comparable. |
| Founder decision gate | The explicit ship/revert recommendation written into the experiment ticket, awaiting the founder's chat approval before any merge. |

## When NOT to use this skill

| Situation | Load instead |
|---|---|
| Day-to-day change gating: ticket lifecycle, commit format, do-not-touch zones, approval rules | `gather-change-control` |
| Measurement mechanics: how to write a test script, evidence package format, RED→GREEN, security suite | `gather-validation-and-evidence` |
| Mechanics of the AI layer itself: prompts, token budgets, parsing, caps | `gather-ai-generation` |
| Diagnosing a live bug (known symptom, unknown cause) | `gather-debugging-playbook` |

This skill is for when the CHANGE ITSELF is the unknown — you cannot know whether it is good
until you run it and measure.

## The idea lifecycle (8 steps, in order)

Do not skip or reorder. Each step exists because skipping it has burned this project before
(see Anti-patterns).

### 1. Hunch → written hypothesis

State one mechanism that would explain the observations. The bar: **one mechanism must
explain ALL observations, including the negatives.**

GTC-145's hypothesis: "each per-section call generates in isolation without cross-section
coordination." This single mechanism explained three separately-filed bugs at once:
- cake/dessert overlap (GTC-138: Yule Log in both Cake AND Dessert; Prosecco in Entrée AND Drinks),
- breakfast over-generation (GTC-139: 54 breakfast items in the per-section baseline),
- unit confusion (GTC-140: each fragmented call invented its own quantity conventions).

If your mechanism explains two symptoms but not the third, it is the wrong mechanism or an
incomplete one. Keep digging before writing code.

### 2. Open a ticket

Every experiment gets a GTC ticket like any other change (see `gather-change-control`).
Ground truth on ticket type (as of 2026-07-09):

- Ticket types actually in use across `docs/tickets/`: `bug` (11), `build` (64), `ux` (36).
  There is **no** `spike` type in practice.
- There is no `SPIKE-TICKET-TEMPLATE.md` at repo root (only BUG-TICKET-TEMPLATE.md,
  BUG-TICKET-TEMPLATE-FULL.md, UX-TICKET-TEMPLATE.md exist — GATHER-BUILD-CONSTANTS.md
  states this correctly since GTC-153, 2026-07-09). Do not invent one.
- House precedent: GTC-145 used `type: build` with `branch: experiment/single-ai-call` in
  frontmatter and the experimental framing in the ticket body. Follow that precedent unless
  the founder directs otherwise.

### 3. Predict numbers BEFORE running

Write expected metrics into the ticket before generating anything. GTC-145's assertion list
(written up front, checked off at close) included: "Plan item count materially differs from
86 baseline" and "No cross-section duplication observed." A prediction you write after seeing
the result is not a prediction.

Good predictions are falsifiable numbers: "fewer than N items", "zero cross-category
duplicates", "wait time under Ns", "0 requests to the old endpoint." "It should be better"
is not a prediction.

### 4. Experiment branch with [EXPERIMENTAL] tag

```
git checkout -b experiment/<short-name>   # only after founder approves starting
```

- Branch name: `experiment/<name>` (precedent: `experiment/single-ai-call`, still exists on
  origin as of 2026-07-09).
- Commit subject carries the tag: `feat(GTC-145): revert Moment 2 to single-call AI generation [EXPERIMENTAL]`
  (verified: commit `a27f781`).
- Keep the experiment to **one commit ahead** of its base if at all possible. GTC-145 was
  exactly one commit ahead of `feat/moment-one-redesign` (both from `cf389c4`), which is why
  the later cherry-pick landed with zero conflicts.
- Deprecate-by-disuse, don't delete: GTC-145 left the per-section infrastructure in place
  behind `DEPRECATED` comments and turned the old endpoint into a 410 Gone stub. Deletion is
  a SEPARATE later ticket (GTC-152). This keeps the experiment reversible and its diff readable.
- NO refactoring, renames, or drive-by fixes in the experiment commit. The diff must be the
  hypothesis and nothing else.

Standing rules still apply on experiment branches: no commit/push/merge without founder
approval in chat; do-not-touch zones in GATHER-BUILD-CONSTANTS.md are still off-limits.

### 5. Measure before/after on a fixed fixture

Baseline and candidate must run on the **same event composition with the same Step 1
selections**. The house fixture for Moment 2 experiments:

```
npx tsx scripts/seed-gtc-133-test-event.ts
```

This seeds a fresh 17-person event: 6 households, 14 named members + 3 "littles"
(Kate & Matt +1, Robyn & Dougal +2). Each run creates a NEW event (re-running is safe but
duplicates). The GTC-145 baseline used this composition with Christmas + Vegetarian +
Gluten-free and the default categories engaged. NOTE (as of 2026-07-09): this script is
present in the working tree but **untracked** — confirm it exists before relying on it.

Comparability trap, with receipts: the GTC-138/139/140 close-out verification engaged MORE
categories (Mains + Sides + Dessert + Cake + Drinks + Snacks + Breakfast & Brunch) and got
40 items / 8 categories. That number is NOT comparable to the 25-item GTC-145 baseline
(different selections). Compare like with like, or say explicitly that you didn't.

Record at minimum: total items, categories, duplicates observed, wait time, request count to
each endpoint, and any qualitative structure notes ("3 mains / 6 sides / 3 desserts").

### 6. Founder decision gate

Write an explicit **"Recommendations: ship vs revert"** section in the ticket (GTC-145 has
one verbatim), with the measured table above it. Then STOP. The founder decides in chat.
Never merge an experiment on your own judgment, however clear the numbers look.

### 7. Adoption is its own ticket — OR documented retirement

If shipped: a NEW ticket lands the experiment on the feature branch. GTC-146 did this with a
deliberate two-commit structure (documented in `docs/tickets/GTC-146.md`):

1. `e250f64` — cherry-pick of `a27f781`, subject amended to drop `[EXPERIMENTAL]` and
   reference GTC-146. Preserves the experimental work as a recognisable commit.
2. `be66454` — cleanup commit removing the deprecated-by-comment infrastructure
   ("removing dead code is not the same change as introducing the new architecture").
3. `88adeb6` — docs finalization with re-verification on the feature branch.

GTC-146 also RE-RAN the measurement after landing (28 items vs the experiment's 25 —
"within AI variance", architecture behaviour identical). Adoption is not done until the
numbers reproduce on the destination branch.

If retired: write the negative result into the ticket and close it. A documented dead end is
a deliverable; a silently abandoned branch is a trap for the next session.

### 8. Cleanup ticket (later, separate)

Deferred deletions get their own ticket once the adoption has soaked. GTC-152 (`82544b6`
code: 638 deletions; `05bc621` schema: dropped `EventSetup.generatedData` +
`StructureChangeRequest`) pruned what GTC-145/146 had deprecated — with a per-surface audit,
fresh greps at HEAD, and founder scope approval before deletion.

## The GTC-145 worked example, end to end

All hashes and numbers below verified against `git show` and the ticket files on 2026-07-09.

| Stage | Artifact | Fact |
|---|---|---|
| Symptom cluster | GTC-136–141 (filed from GTC-133 browser verification) | 86 items / 9 categories generated for a 17-person Christmas; Yule Log in Cake AND Dessert; 54 breakfast items; nonsense units |
| Partial fix falsified the shallow diagnosis | GTC-137 | Removing the parallel dietary generator gave a 27% reduction — but duplication persisted, proving the cause was architectural, not one bad prompt |
| Hypothesis | GTC-145 ticket | Per-section calls cannot coordinate because no call ever sees the whole plan |
| Prediction | GTC-145 assertions (pre-written) | Materially fewer items than 86; zero cross-section duplication; single finalize-plan POST; 0 generate-section requests |
| Experiment | branch `experiment/single-ai-call`, commit `a27f781` `[EXPERIMENTAL]` | One commit ahead of base `cf389c4`; old route stubbed 410; old prompts kept behind DEPRECATED comments |
| Measurement | GTC-145 comparison table | 86 → **25 items** (-71%), 9 → 6 categories, zero duplication, 43.86s wait; vs Kate's real spreadsheet ground truth of ~19 items for a 33-person Christmas |
| Free wins | GTC-138/139/140 | Three deferred bugs closed with **no code** — "resolved by architecture change" (commit `4fa1699`); breakfast 54 → 8 items |
| Decision gate | GTC-145 "Recommendations: ship vs revert" | "Ship. The 44s wait is real but acceptable." Founder approved |
| Adoption | GTC-146: `e250f64` (cherry-pick) + `be66454` (cleanup) + `88adeb6` (docs) | Re-measured on feature branch: 28 items, ~44s, zero duplication — reproduced within variance |
| Cleanup | GTC-152: `82544b6` + `05bc621` | Dead code and dead schema removed after soak, with audit + founder approval |

### Why it worked as PROCESS (not just as a fix)

- **Small blast radius**: one commit, five source files, old path stubbed not deleted.
- **Reversible**: the experiment branch could be abandoned at zero cost; base branch untouched
  until the founder said ship.
- **Numeric gate**: 86 → 25 is not arguable. "The plan feels more coherent" would have been.
- **One mechanism, all symptoms**: the diagnosis predicted the three deferred bugs would
  vanish for free — and they did, which is the strongest possible confirmation.

## Adversarial refutation — mandatory before adopting a conclusion

Before you believe your own result, genuinely try to kill it. Work this checklist and note
each item in the ticket:

| Alternative cause | How to rule it out |
|---|---|
| **Temperature variance** — AI output varies run to run. Verified current settings (as of 2026-07-09): default `temperature = 1.0` in `src/lib/ai/claude.ts:51`; V2 finalize-plan passes `0.8` (`src/app/api/events/[id]/finalize-plan/route.ts:235`); legacy V1 `src/lib/ai/generate.ts` passes `1.0` | Run the generation MULTIPLE times before trusting a delta. GTC-146 treated a 3-item difference (25 vs 28) as within variance. A single lucky run proves nothing — if your measured improvement is smaller than run-to-run spread, you have measured noise |
| **Seed / fixture state** — different event composition, leftover rows from a prior run | Fresh fixture per run (`scripts/seed-gtc-133-test-event.ts` creates a new event each time); confirm headcount and selections match the baseline exactly |
| **Stale Prisma client** — schema changed but generated client didn't | `npx prisma generate` after any schema change; if types look wrong, clear `.next` and regenerate |
| **RSC prefetch staleness** — UI showing pre-navigation state, not your change (KB-001 in GATHER-KNOWN-BEHAVIOURS.md) | Hard-reload the browser; verify via the Network tab (count actual requests), not via what the UI appears to show |
| **You measured the wrong path** — e.g. the legacy V1 `/api/events/[id]/generate` route still exists alongside V2 finalize-plan | Confirm in the Network tab WHICH endpoint fired. GTC-145 evidence explicitly recorded "zero requests to generate-section, single POST to finalize-plan" |
| **Cap/limit interference** — `AI_CALL_LIMIT` differs per route and the values drift (canonical table: `gather-config-and-flags` §4; `grep -rn AI_CALL_LIMIT src/`); truncation at `max_tokens` degrades output silently | Check server logs for the `callSiteLabel` truncation warning (GTC-142 infrastructure); a "worse" result may just be a truncated one |

Also actively hunt observations your hypothesis does NOT explain. GTC-137 is the cautionary
tale: the shallow fix (delete the parallel dietary generator) produced a real 27% improvement
— and was still the wrong diagnosis, because it could not explain the remaining duplication.
A partial improvement from a wrong theory is the most dangerous result you can get.

## Where good experiment ideas have historically come from

1. **Production symptoms via tickets** — GTC-133's end-to-end browser verification surfaced
   six follow-up bugs (GTC-136–141) in one sitting. End-to-end walks generate hypotheses.
2. **Deferred-bug clustering** — three deferred bugs (138/139/140) sharing one plausible
   mechanism is a flashing sign that an architectural experiment will pay for itself.
3. **Dead-code / reconciliation audits** — GTC-152 came from the v1-v2 reconciliation review's
   Tier 1 prune list; audits find both deletions and design smells worth testing.

## Anti-patterns (each has burned this project or nearly did)

| Anti-pattern | Why it fails here | The fence |
|---|---|---|
| Adopting after one generation run | Temperatures of 0.8–1.0 mean single runs vary by several items; GTC-146 saw ±3 on identical inputs | Multiple runs, or a delta so large (86→25) that variance is irrelevant |
| Refactor + experiment in one branch | You can no longer attribute the measured change to the hypothesis; cherry-pick becomes conflict soup | Experiment commit contains ONLY the hypothesis; cleanup is a later ticket (GTC-146 phase 2, GTC-152) |
| Skipping the prediction step | Post-hoc numbers always "confirm"; you lose the falsification test | Expected metrics written into the ticket before the first run |
| "It looks better" as evidence | The per-section era ALSO looked fine section-by-section; the failure was only visible in counted totals and cross-section comparison | Numbers on a fixed fixture, in a table, in the ticket |
| Merging on your own judgment | Standing rule: no commit/push/merge without founder chat approval — experiments doubly so | Write ship-vs-revert, then stop and wait |
| Silent abandonment | An undocumented dead branch misleads the next zero-context session into re-running the experiment | Documented retirement in the ticket, status closed |
| Deleting the old path inside the experiment | Kills reversibility; GTC-145 deliberately stubbed (410) and deprecated instead | Deprecate-by-disuse in the experiment; delete in a later cleanup ticket |

## Provenance and maintenance

Facts above were verified on 2026-07-09 against the working tree at branch
`feat/moment-one-redesign`. Re-verify before relying on any of them:

```bash
# The canonical experiment commits and their messages
git show --stat a27f781 | head -8        # GTC-145 [EXPERIMENTAL]
git show --stat e250f64 | head -8        # GTC-146 cherry-pick
git log --format='%h %s' -1 be66454 88adeb6 82544b6 05bc621 4fa1699

# Experiment branch still exists
git branch -a | grep experiment

# Numbers and decision sections in the tickets of record
grep -n '86\|25\|71%\|ship vs revert' docs/tickets/GTC-145.md
grep -n '28 items\|temperature' docs/tickets/GTC-146.md

# Current temperatures and call caps (may drift)
grep -n 'temperature' src/lib/ai/claude.ts src/lib/ai/generate.ts 'src/app/api/events/[id]/finalize-plan/route.ts'
grep -rn 'AI_CALL_LIMIT' src/

# Ticket types actually in use (no 'spike' as of 2026-07-09)
grep -h '^type:' docs/tickets/GTC-*.md | sort | uniq -c

# Templates that actually exist at root (SPIKE/FEATURE/CHORE referenced by constants but absent)
ls *TICKET-TEMPLATE*.md

# The 17-person fixture script (untracked as of 2026-07-09 — confirm presence)
ls scripts/seed-gtc-133-test-event.ts
```
