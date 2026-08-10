---
name: gather-docs-and-writing
description: Load when reading, writing, or updating any Gather documentation — docs of record, GTC tickets, templates, KB entries, ADRs, or BUILD_STATUS — or when a doc contradicts the code. Covers the docs/ taxonomy, ticket authoring (frontmatter + body sections + evidence discipline + commit-hash backfill), house style, and the stale-doc registry (which docs describe deleted architectures and what to trust instead).
---

# Gather Docs and Writing

Runbook for maintaining Gather's documentation and writing new docs/tickets to house
standard. Also the registry of documents that are KNOWN to be stale or misleading.

**Jargon used below:**
- **GTC ticket** — Gather's work unit: a markdown file `docs/tickets/GTC-NNN.md` that is
  authored before work, executed against, filled with evidence, and committed WITH the fix.
- **Doc of record** — a document the team treats as authoritative for its topic (see table).
- **KB entry** — a numbered entry in `GATHER-KNOWN-BEHAVIOURS.md` documenting a confirmed
  platform quirk that looks like a Gather bug but is not.
- **Per-section era** — the deleted Apr–May 2026 architecture where Moment 2 generated the
  plan one section at a time (`generate-section` endpoint, `EventSetup.generatedData` cache).
  Replaced by single-call generation in GTC-145/146, dead code removed in GTC-152.
- **V1 / V2** — legacy dashboard vs. Moment flow. Labels used in docs and review material,
  NOT in the code.

## The house rule (read this first)

**Docs lie about deleted architectures unless dated. Tickets carry commit hashes; narrative
docs do not. When a narrative doc and a ticket disagree, the ticket wins. When a ticket and
the code disagree, the code wins.** Always date-stamp volatile claims you write
("(as of YYYY-MM-DD)"), and always check the stale-doc registry below before trusting any
doc's description of the AI generation pipeline or the Moment 2 flow.

## When NOT to use this skill

| You are actually trying to… | Load instead |
|---|---|
| Decide whether a change is allowed, run the ticket lifecycle, respect do-not-touch zones, commit discipline | `gather-change-control` |
| Understand why the architecture is the way it is (invariants, V1/V2 map) | `gather-architecture-contract` |
| Learn product concepts (Moments, households, roles, NZ rules) | `gather-domain-reference` |
| Reconstruct incident history with hashes | `gather-failure-archaeology` |
| Meet the evidence bar / write or run tests | `gather-validation-and-evidence` |
| Run the experiment lifecycle (hunch → measured result) | `gather-experiment-methodology` |

This skill is only about the documents themselves: what to read, what to trust, how to write.

## Docs of record (as of 2026-07-09)

Read in this order for a zero-context session. All paths repo-relative.

| # | Doc | Role | Freshness caveat |
|---|---|---|---|
| 1 | `gather-v1-v2-brief.md` (repo root) | The most current architecture map: V1/V2 route/component/API split, generation pipeline, known risks. **Read FIRST** — it is the only doc written after the single-call cutover. | Untracked in git as of 2026-07-09 (`git status` shows `??`) — at risk of loss; do not assume other sessions can see it after a clean checkout. |
| 2 | `GATHER-BUILD-CONSTANTS.md` (root) | Binding executor doctrine: preamble, output contract, preflight, env vars, do-not-touch zones. | Header says "Last updated: 2026-03-05". Two internal stale spots: (a) preflight note still calls P3005 schema drift a live pre-existing issue — KB-002 marks it RESOLVED 2026-03-14; (b) it references FEATURE/CHORE/SPIKE ticket templates that do not exist (see Templates below). |
| 3 | `GATHER-KNOWN-BEHAVIOURS.md` (root) | KB registry: KB-001 (RSC prefetch stale auth UI), KB-002 (P3005, resolved), KB-003 (replaceState vs useSearchParams), KB-004 (seed creates CONFIRMING event, not DRAFT). | Header "Last updated: 2026-03-05" but KB-002 carries a 2026-03-14 resolution note — update the header when you touch the file. |
| 4 | `docs/tickets/` (GTC-028…GTC-152 + GTC-FM1/FM2/FM3-FM5, 124 files) | The real change ledger. Each closed ticket has root cause, files changed, evidence, commit hash. **Ground truth for "what happened and when".** | Frontmatter `status:` can be stale (see registry). Newest tickets omit frontmatter entirely. |
| 5 | `docs/BUILD_STATUS.md` | Epic roadmap (Epics 1–6: reachability, RSVP, nudges, freeze, threshold UX, instrumentation). | **Frozen at "Last Updated: 2026-01-25."** Only Epic 1.1 marked complete; it predates ALL Moment work (GTC-101–152). Treat it as the epic backlog, not current status — the ticket directory is current status. |
| 6 | `docs/SYSTEM_OVERVIEW.md` | V1 system documentation (v1.3.3 spec era). | Last updated 2026-01-24 — predates V2/Moments entirely. Correct for V1 surfaces only. |
| 7 | `docs/GATHER_REPO_OVERVIEW.md` | Repo tour generated from git history. | Generated 2026-01-21 from 132 commits; repo has ~520 as of 2026-07-09. History before Jan 2026 only. |
| 8 | `docs/***What is Gather.md` | Product vision: who the host is, what pain Gather removes. | Raw Q&A transcript (timestamps embedded), not a maintained doc. Vision-level truth only. |

Note the reading-order inversion: the NEWEST doc (the root brief) outranks the polished older
ones. `docs/moment-1-and-2-build-report.md` and `docs/moment-2-flow-document.md` look like
docs of record but are NOT — see the stale-doc registry.

## docs/ taxonomy

`docs/README.md` is the navigation file. Structure (verify with `ls docs/`):

| Dir | Contents |
|---|---|
| `00_overview/` | Onboarding, project overview, changelog |
| `01_product/` | Product vision & positioning |
| `02_ux/` | UX/design (ui-protocol, figma spec) |
| `03_specs/` | Technical specs + `_versions/` history |
| `04_roadmap/` | Phase completions + `tickets/` (LEGACY phase-era tickets — 15 entries, some dirs with spaces in names; do not imitate, do not add here) |
| `05_ops/` | Run/test/deploy guides, `security/`, `testing/` |
| `06_research/` | README only (as of 2026-07-09) |
| `07_meetings/` | Meeting notes & integration reports |
| `08_decisions/` | ADR scaffolding — README with template only, ZERO ADRs written (as of 2026-07-09) |
| `assets/` | Diagrams, images |
| `_inbox/` | Unsorted new docs. **Rule: categorize weekly, never more than 5 files.** Currently in violation: 11 files (as of 2026-07-09). |
| `_archive/` | Superseded docs. Rule: review every 6 months and prune. |
| `tickets/` | THE canonical GTC ticket directory |

Rules from `docs/README.md` (Maintenance section):
- New uncategorized docs land in `_inbox/` first, get filed weekly.
- Superseded spec versions go to `03_specs/_versions/` or `_archive/`.
- Known drift: `docs/README.md` itself omits `06_research/` and `08_decisions/` from its
  structure list — trust `ls docs/` over the README's directory list.

## Ticket authoring

### Which template for what

Templates live at repo root:

| Template | Use for |
|---|---|
| `BUG-TICKET-TEMPLATE.md` | Default for bug tickets. Body sections: Signal, Reproduce, Scope, Acceptance, Unknowns, Stop Conditions, Executor Checklist, Evidence (Executor-Completed). |
| `BUG-TICKET-TEMPLATE-FULL.md` | Complex/high-severity bugs. Sections: 1. Title and Bug Signal Lock, 2. Deterministic Reproduction Package, 3. Environment and Execution Constraints, 4. Proof of Fix and Acceptance Criteria, 5. Ticket Output Contract (Stop Conditions, Plan, Unknowns, Executor Checklist). |
| `UX-TICKET-TEMPLATE.md` | UX work. Sections: The Person, The Broken Promise, The Cost, The Fix, Acceptance, Evidence Package, Executor Checklist. |
| `oldBUG-TICKET-TEMPLATE.md` | Deprecated. Do not use. |

**Note:** No FEATURE/CHORE/SPIKE template files exist at root (verified 2026-07-09:
`find . -name "*TICKET-TEMPLATE*" -not -path "*/node_modules/*"`). The constants file's
Executor Preamble used to cite them; corrected in GTC-153 (2026-07-09) — it now points
feature/chore/spike work at the BUG template structure. Follow the BUG template's section
discipline (Scope, Acceptance, Stop Conditions, Evidence) — see GTC-151/GTC-152 as strong
worked examples of chore-shaped tickets. Do not invent new template files without founder
approval.

### Frontmatter schema (older convention, GTC-101 → ~GTC-146)

```yaml
---
ticket: GTC-NNN
title: "Short description"
status: closed          # observed values: closed | in-progress | open | deferred
branch: feat/moment-one-redesign
commit: e250f64         # often left blank at authoring, backfilled at close
moment: 2               # optional: 1 | 2
type: build             # observed: build | ux
depends_on:
  - "[[GTC-137]]"       # Obsidian wiki-links
blocks: []
tags:
  - moment-2
  - build
---
```

**Convention drift (as of 2026-07-09):** the newest tickets (GTC-138, 139, 140, 147–152)
have NO YAML frontmatter — they open directly with the H1 and a bold status line:

```markdown
# GTC-152 — Tier 1 safe deletes — CLOSED

**Status:** Complete | **Branch:** feat/moment-one-redesign | **Commits:** 82544b6 (code), 05bc621 (schema)
```

Both forms are live. If you add frontmatter, keep `status:` truthful (see registry for the
two tickets where it is not). The `— CLOSED` suffix on the H1 and the bold Status line are
the load-bearing signals in recent practice.

### Evidence section discipline

Per the Executor Output Contract in `GATHER-BUILD-CONSTANTS.md`: before committing, fill the
**Evidence (Executor-Completed)** section with root cause, files changed, test results,
assertions checked, and commit hash; save the ticket to `docs/tickets/GTC-NNN.md`; commit
fix + regression test + completed ticket in ONE commit. The observed evidence bar in closed
tickets (see GTC-151, GTC-152):

- [ ] Root cause stated with symbol-level code evidence, not narrative. (This bar used to
      read "file:line evidence"; GTC-222 replaced line numbers with symbol citations —
      `theFunction` in `path/file.ts`, optionally with a short commit hash.)
- [ ] RED→GREEN: before-fix failing behaviour shown next to after-fix passing behaviour
      (GTC-151 does this as a per-event-type 400→200 table).
- [ ] Security suite result recorded (convention: "security suite 16/16" — re-verify the
      count with `npm run test:security` before quoting it).
- [ ] `npx tsc --noEmit` clean and `npx next build` compiled, when code changed.
- [ ] Browser verification noted for UI-touching work, including adjacent flows.
- [ ] Known limitations and intentional non-changes listed explicitly.

### Commit-hash backfill

The commit hash cannot be known when the ticket is committed in the same commit as the fix.
House pattern (23 `backfill` commits in history as of 2026-07-09):

1. At close, write `**Commit:** [pending]` (or leave frontmatter `commit:` blank).
2. After the fix commit lands, edit the ticket to insert the real short hash.
3. Commit as `chore(GTC-NNN): backfill commit hash`.
4. As with all commits: **explicit founder approval in chat before committing.**

## House style

- **kebab-case filenames**, no spaces, always `.md` extension (`docs/README.md` rule).
  Tickets are the exception: `GTC-NNN.md` uppercase.
- **Tables and checklists over prose.** Closed tickets use per-assertion tables.
- **✓ / ✗ markers** for pass/fail (KB-002 header, ticket evidence tables); ✅ acceptable in
  assertion checklists (GTC-151 "Assertions met").
- **Obsidian wiki-links** `[[GTC-NNN]]` inside tickets for cross-references (frontmatter
  `depends_on`/`blocks` and inline). Vault metadata lives at `docs/tickets/.obsidian/`
  (untracked as of 2026-07-09).
- **Date-stamp volatile facts**: any count, status, "currently", or "latest" claim gets
  "(as of YYYY-MM-DD)".
- **Cite code by symbol name, never by line number.** Anchor to the function, export,
  const, type, or enum — `workflow.ts — canTransition()`, not `workflow.ts:243`. Line
  numbers are a snapshot pretending to be a rule: any edit above the reference silently
  invalidates it (GTC-154/156 shifted these twice in two days; GTC-158 re-anchored the
  library). When a symbol appears more than once in a file, add a disambiguating cue
  (which function/section). For a line with no stable symbol (a migration `.sql` DDL line,
  a top-level `.create()` in `seed.ts`, an inline literal), anchor to the nearest named
  thing plus a relative cue ("inside `runGateCheck()`"), or — only as a last resort — keep
  the line number WITH an as-of commit hash: `file.ts:NNN (as of <short-hash>)`.

  **This rule predates GTC-222 and was ignored anyway.** GTC-211 addressed
  `onAssignmentReleased` as `ledger.ts:590-596`; those lines now hold `onMaterialChange`
  — a different hook, owned by GTC-183 (F1). Seventeen lines of drift, and the citation
  still reads as correct. Writing the rule down was not enough; it now also lives in the
  ticket templates, which is where citations actually get written (GTC-222, 2026-08-10).
- **ANCHOR tokens for locations with no symbol.** Preferred over the last-resort
  line-number-plus-hash above. Leave the anchor in the code and cite the anchor:
  `// ANCHOR(GTC-nnn): short label`. Grep-shaped on purpose
  (`grep -rn "ANCHOR(GTC-211)" src/`). Use it for a branch arm, a bare config literal, or
  a place where something should go and does not yet. One line, ticket ID, short label —
  a token, not prose. Delete it when the owning ticket closes.
- **A comment records WHY, or that a state is provisional — never WHAT the code does.**
  Asserting behaviour is a test's job. A comment describing behaviour is an unverified
  claim with nothing holding it true, so it rots silently: the docblock on
  `onAssignmentReleased` in `src/lib/ledger.ts` claims it preserves the correct half of
  frozen-edit's `handleReassign`, which GTC-211 established is false. Write the assertion
  as a test; let the comment carry the reason.
- **A deliberate temporary state carries the ticket ID that ends it.**
  `eslint.ignoreDuringBuilds: true` in `next.config.js` names GTC-221 as its end
  condition. Without the backward link, a temporary state is indistinguishable from a
  permanent one and nothing ever flips it back.
- Commit messages: `{type}(GTC-NNN): summary` (types observed: feat, fix, chore, refactor,
  docs); `[EXPERIMENTAL]` tag in the subject for experiment-branch commits (GTC-145).
- KB entries follow a fixed format: Symptom / Cause / Fix pattern / Do not / First seen.

## STALE-DOC REGISTRY (as of 2026-07-09)

Check here BEFORE trusting a doc. Each row: what it wrongly claims → where truth lives.

| Doc / location | The lie or gap | Truth source |
|---|---|---|
| `docs/moment-1-and-2-build-report.md` | Describes the DELETED per-section generation architecture as current: `POST /api/events/[id]/generate-section` background calls, output "cached on `EventSetup.generatedData` keyed by section" (lines ~164–245). That endpoint-family, the column, and the caching are gone. Also untracked in git. | Read `docs/tickets/GTC-146.md` first (single-call made canonical, per-section removed), then GTC-152 (column + dead code dropped, commits 82544b6/05bc621). |
| `docs/moment-2-flow-document.md` | Moment 2 narrative written in the per-section era ("cache progressive AI output per section" pacing model). Vision sections still useful; mechanics are not. | Same as above: GTC-145/146/152 tickets. |
| `docs/08_decisions/` | Looks like a decision log; contains only a README/template. Zero ADRs exist. Real decisions live in ticket bodies (e.g. GTC-146 "two-commit structure was chosen deliberately", GTC-152 "Intentional non-deletions"). | `docs/tickets/GTC-*.md` |
| `docs/tickets/GTC-137.md` | Frontmatter `status: in-progress`, body `**Commit:** [pending]` — but the closing commit exists. | `git log --oneline --all \| grep GTC-137` → `cf389c4 feat(GTC-137): dietary becomes pure input…`. Fix = backfill pattern above (needs approval). |
| `docs/tickets/GTC-142.md` | Same: frontmatter `status: in-progress`, `[pending]` commit. | `f21e200 fix(GTC-142): bump finalize-plan token caps…` |
| Demo event name (multiple places) | The seed creates "Henderson Family Christmas **2026**" but demo routes/tests/UI copy hardcode '…**2025**' — demo session/tokens fail against a fresh seed. Live bug + doc trap: any doc quoting the demo event name may cite either year. Canonical six-location table: `gather-config-and-flags` §7. | Grep before quoting: `grep -rn "Henderson Family Christmas" prisma src tests` |
| `docs/BUILD_STATUS.md` | "Last Updated: 2026-01-25"; shows only Epic 1.1 complete. All Moment 1/2 work (GTC-101–152) is invisible here. | `docs/tickets/` + `git log --oneline` |
| `GATHER-BUILD-CONSTANTS.md` preflight notes | Lists P3005 schema drift as a live "pre-existing known issue". | KB-002 in `GATHER-KNOWN-BEHAVIOURS.md`: RESOLVED 2026-03-14, migrations clean. |
| `GATHER-BUILD-CONSTANTS.md` preamble step 2 | References FEATURE/CHORE/SPIKE ticket templates that do not exist at root. | `ls *TICKET-TEMPLATE*.md` — only BUG, BUG-FULL, UX, oldBUG. |
| `docs/README.md` | Directory list omits `06_research/` and `08_decisions/`. | `ls docs/` |
| `docs/tickets/GTC-152.md` reference | Cites `docs/v1-v2-reconciliation-review.md` as its source — file does not exist in the repo (dangling reference; presumably never committed). | `find . -name "*reconciliation*" -not -path "*/node_modules/*"` returns nothing. |
| `docs/tickets/GTC-044.md` + `GTC-044-conflict-resolution.md` | Two files for one ticket number — naming anomaly, do not replicate. | — |
| Untracked docs | `docs/moment-1-and-2-build-report.md`, `gather-v1-v2-brief.md`, `docs/tickets/.obsidian/` are untracked (`??` in git status). They vanish on a fresh clone. | `git status --porcelain` |
| Seed statistics in any doc | Prior reports disagreed on seeded people/team/item counts. Never quote seed numbers from a doc. | Count from `prisma/seed.ts` directly. |

When you FIX a stale doc: date-stamp the correction, cite the ticket that changed reality
(e.g. "superseded by GTC-146, commit e250f64, 2026-05-08"), and prefer adding a banner at the top of the
stale doc over silently rewriting history. Deleting or archiving a doc of record needs
founder approval.

## Updating doctrine files (high-gravity)

`GATHER-BUILD-CONSTANTS.md` and `GATHER-KNOWN-BEHAVIOURS.md` are binding on every future
executor session. Treat edits like schema migrations:

1. **Get founder approval in chat before changing either file.** Never weaken or remove a
   do-not-touch zone; never relax the output contract or preflight to make your own task
   easier (that is routing around change control).
2. New KB entries: only for CONFIRMED platform behaviours (reproduced, not hypothesized),
   in the fixed Symptom/Cause/Fix pattern/Do not/First seen format, numbered sequentially
   (next free: KB-005 as of 2026-07-09), with the originating GTC ticket in "First seen".
3. Update the "Last updated:" header line when you touch either file.
4. If a KB entry is resolved (KB-002 precedent): keep the entry, add "✓ RESOLVED" to its
   heading and a dated **Resolved:** line — do not delete history.

## Close-of-work documentation checklist

When a piece of work closes, touch these (and only these, unless the ticket says otherwise):

- [ ] The ticket: Evidence section filled, H1 suffixed `— CLOSED`, bold Status line updated,
      frontmatter `status:` (if present) flipped to `closed`.
- [ ] Commit hash backfilled after the commit lands (separate approved `chore` commit).
- [ ] `docs/BUILD_STATUS.md`: tick the epic checkbox ONLY if the work completes a numbered
      epic item (know that this file is currently far behind — flag, don't silently
      rewrite its history).
- [ ] `GATHER-KNOWN-BEHAVIOURS.md`: add a KB entry only if you confirmed a NEW platform
      quirk (founder approval required).
- [ ] If your change deleted or replaced an architecture: check whether any narrative doc
      now belongs in the stale-doc registry above, and add it there.
- [ ] New loose docs → `docs/_inbox/`, then categorize (keep _inbox under 5 files).

## Provenance and maintenance

Re-verify volatile claims in this skill with:

```bash
# Docs of record exist + freshness headers
grep -n "Last updated\|Last Updated\|Generated:" GATHER-BUILD-CONSTANTS.md GATHER-KNOWN-BEHAVIOURS.md docs/SYSTEM_OVERVIEW.md docs/GATHER_REPO_OVERVIEW.md docs/BUILD_STATUS.md

# Which ticket templates actually exist
ls *TICKET-TEMPLATE*.md

# Ticket count, range, and frontmatter-less tickets
ls docs/tickets/ | wc -l && ls docs/tickets/ | head -1 && ls docs/tickets/ | tail -3
for f in docs/tickets/GTC-*.md; do head -1 "$f" | grep -q '^---$' || echo "$f"; done

# Stale frontmatter status vs closing commits
grep -l "^status: in-progress" docs/tickets/*.md
git log --oneline --all | grep -E "GTC-137|GTC-142"

# Demo event name drift still live?
grep -rn "Henderson Family Christmas" prisma/seed.ts src/app/api/demo tests/demo-endpoints-test.ts

# _inbox rule compliance (must be < 5 files)
ls docs/_inbox/ | wc -l

# ADRs still unwritten?
ls docs/08_decisions/

# Untracked docs still untracked?
git status --porcelain | grep -E "docs/|brief"

# Backfill pattern still in use
git log --oneline | grep -c backfill

# KB entry count / next free number
grep -n "^### KB-" GATHER-KNOWN-BEHAVIOURS.md
```

Last full verification of every fact in this file: 2026-07-09, on branch
`feat/moment-one-redesign`.
