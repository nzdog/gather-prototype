# Moment 4 + Hinge Discovery Report — Accuracy Audit (Trust Map)

> **THIS IS A POINT-IN-TIME SNAPSHOT. IT DECAYS.**
>
> - **Audited document:** `docs/04_roadmap/moment4-hinge-discovery-report.md` (181 lines, landed by GTC-165, written 2026-08-03)
> - **Audited on:** 2026-08-04
> - **Audited against commit:** `06c3939` — *fix(GTC-208): remove unauthenticated /api/sms/test-send route*
> - **Branch:** `feat/moment-one-redesign`
> - **Every ruling below is a statement about commit `06c3939` and nothing else.** Any ticket that lands after that commit can invalidate any row in this document. If you are reading this more than a few tickets later, re-verify before trusting a ruling — that is exactly the failure mode this audit was commissioned to map.
> - **Status:** Findings only. No code, no tickets and not the report itself were changed in producing this. Fixes and re-scopes are the founder's call.
>
> **⚠ PART TWO OF THIS DOCUMENT CORRECTS PART ONE.** A confirmation audit (same date, same commit) independently re-derived this document's three decision-driving findings and **revised two of them and refuted one incidental defect outright.** Before acting on anything in Part One, read [the confirmation pass](#confirmation-audit--2026-08-04) at the end. Claims corrected there: D3's effort characterisation, the "nudge cron sends nothing" severity, and defect 7 (`detectConflicts`), which is **not** dead code.

---

## What this is

The discovery report is the build authority for Moment 4 / Hinge epics B–K. It had been caught wrong four times. This audit asks how much of the rest can be trusted, for the claims that **unbuilt tickets will actually build on**: the §Task 3 epic/ticket breakdown, and the "current code does X / already handles Y / this is the risk" assertions behind the still-open tickets (C2, D, E, F, G, H, I, J, K).

87 claims were ruled. Each was verified by opening the current code — not by trusting the report's own file citations. High-priority clusters (C, D, E, F/H, G, cross-cutting) were then adversarially re-checked by a second pass instructed to overturn them; **five rulings were overturned** and are marked as such.

## How to use it

The single most useful sentence in this document:

> **The report's spec citations are sound. Its claims about the repo are not.**

40+ `§`-references across both specs were checked and resolve to real text that says what the report says it says (two narrow defects, neither propagated). Meanwhile every claim about the *state of the code or the ticket library* has decayed or was wrong at writing.

**Treat the report as a reliable index into the two specs. Treat nothing in it as current about code or tickets.** For code, `docs/tickets/` is more accurate than the report it was filed from — with three named exceptions (GTC-176, GTC-186, GTC-188).

---

## Scoreboard

| Ruling | Count | Meaning |
|---|---|---|
| **ACCURATE** | 40 | Still true of code at `06c3939`, verified by opening the file |
| **STALE** | 30 | Was true when written; changed since (attributing ticket named where findable) |
| **WRONG** | 11 | Never true, including at time of writing |
| **UNVERIFIABLE** | 1 | Could not be settled either way |
| **Unruled, found by the completeness pass** | 5 | In scope, missed by the cluster sweep — ruled in the addendum |

By cluster, in build order:

| Cluster | Open tickets it feeds | ACCURATE | STALE | WRONG | UNVERIF |
|---|---|---|---|---|---|
| **C** — recipient model | GTC-173 | 2 | 5 | 0 | 0 |
| **D** — guest response | GTC-174/175/176/177 | 8 | 4 | 1 | 0 |
| **E** — nudge machinery | GTC-178/179/180/181/182 | 9 | 0 | 3 | 1 |
| **F + H** — material change, wrap-up | GTC-183/186/187 | 2 | 5 | 0 | 0 |
| **G** — dietary | GTC-184/185 | 5 | 0 | 2 | 0 |
| **A-residue** — feeds D/E/F/I | GTC-176/177/183/188/189 | 0 | 5 | 0 | 0 |
| **I** — the Hinge experience | GTC-188/189/190/191 | 3 | 2 | 0 | 0 |
| **J** — screen + runbook | GTC-192/193/194 | 4 | 3 | 1 | 0 |
| **K** — clone review | GTC-195 | 2 | 0 | 1 | 0 |
| **X** — cross-cutting / citations | all | 5 | 6 | 3 | 0 |

---

## The four known inaccuracies — status

| # | As stated | Status |
|---|---|---|
| 1 | `h/[token]` called "already correct" — it wasn't; fixed in GTC-205 | **Confirmed** (J-2a). Ruled WRONG, not stale — the host team-detail view was floating critical items to the top when the report claimed it rendered correctly. `git show e0eb07d` shows the sort comparator and the `orderBy: [{critical:'desc'}]` both being removed. |
| 2 | The P3005 drift warning it references (via `GATHER-BUILD-CONSTANTS.md`) is stale | **Misfiled — not in this report.** See below. |
| 3 | C2/GTC-173's "non-transactional partial-write risk" is stale, fixed by GTC-159/201 | **Confirmed** (C-1, C-2), and it is worse than recorded — see the C cluster. |
| 4 | Understated the child-message exclusion surface — said ~2 paths, there are 5 | **Confirmed** (C-5). All five paths are now guarded by one shared predicate; no unguarded SMS dispatch path was found. |

### On #2 — the P3005 attribution is wrong, and that matters operationally

`grep -inE "p3005|drift|build-constants|migrate status"` over all 181 lines of the discovery report returns **zero hits**. The report never mentions `GATHER-BUILD-CONSTANTS.md`, Prisma, migrations or the preflight sequence — it has no build-environment section at all, and is not reachable to that warning by any pointer.

The warning actually lives at **`GATHER-BUILD-CONSTANTS.md:108-112`**, and executors reach it via the ticket-template preamble (`BUG-TICKET-TEMPLATE.md:7`, `BUG-TICKET-TEMPLATE-FULL.md:141`, `UX-TICKET-TEMPLATE.md:4` all say "Read GATHER-BUILD-CONSTANTS.md in full") — step 1 of every GTC ticket.

Two consequences:

1. **The report's record is three known inaccuracies, not four** (plus what this audit adds).
2. **Correcting the report would leave the actual stale warning untouched at the repo root.** The underlying fact is confirmed stale (X-6b): GTC-171 (`e85ebfa`) and GTC-172 (`63764d1`) both independently recorded `prisma migrate status` → *"Database schema is up to date!"* (32 migrations, no reset prompt) on 2026-08-04, and four migrations have been authored and applied since the warning was written. `GATHER-BUILD-CONSTANTS.md` has not been touched since `9eb6069` (GTC-153). Two tickets have each already burned a verification step disproving it; a third and fourth will until it is fixed. Five skills and `GATHER-KNOWN-BEHAVIOURS.md` also mention P3005 and would need the same sweep.

---

## Read this first: the three findings that change what you do

### 1. GTC-176 (D3) rests on a mechanism that never existed — and the error is now in merged code

Report line 27: *"`handleReassign` in `frozen-edit/route.ts` already does the 'why' + **'notify the released guest'** halves correctly."*

**WRONG, and it was wrong when written.** Reading the deleted route at `git show 902093f~1:src/app/api/events/[id]/frozen-edit/route.ts`: its entire import list is `NextResponse`, `prisma`, `requireEventRole`, `logInviteEvent`. **No SMS client. No email client. No carrier of any kind.** `handleReassign` (lines 186–237) writes one `logInviteEvent` row and pushes a personId onto a local array declared at line 127 as `const notificationsSent: string[] = []`, returned to the client at line 175 as `sent: notificationsSent`. Nothing was ever sent to a released guest.

The report appears to have read the variable name as the behaviour.

This has propagated **twice**, and one of them is into `src/`:

- `docs/tickets/GTC-176.md` (OPEN) repeats it verbatim, then scopes the work as *"notify the released guest via the existing SMS/email carrier"* with first acceptance criterion *"Reassigning any item ... notifies the previously assigned person"* — i.e. as porting a working mechanism. There is nothing to port. **D3 is greenfield SMS work in an opt-out zone, and its "high" effort estimate was set on a false premise.**
- `src/lib/ledger.ts:587-589` — the `onAssignmentReleased` no-op docstring reads *"This is the half of frozen-edit's handleReassign that was correct and is preserved here rather than reinvented later."* Epic A believed it too.

Correcting the report alone will not clear this. GTC-176 and `ledger.ts:587-589` both need the line.

There is also a **live functional regression window** nobody has recorded: under `frozen-edit`, a FROZEN-state reassignment at least wrote an InviteEvent row for the released person. Between GTC-196 and GTC-176 landing, no released guest is notified on any path.

### 2. Report line 44 is an instruction *not to look*, and there are two real defects behind it

*"TNZ vs Twilio routing and quiet-hours logic are both real and working correctly — not in question."*

**Both halves WRONG** (E-8a, E-8b), both predating the report (lineage `b3841a0`), and re-issued as a prohibition inside `GTC-178.md`'s **"Do not touch"**: *"TNZ/Twilio routing and quiet-hours logic (`send-sms.ts`, `quiet-hours.ts`) — working correctly, out of scope."*

- **The routing function is correct; the machinery that calls it is gated on the wrong provider.** `src/lib/sms/nudge-scheduler.ts:5` imports `isSmsEnabled` from `./twilio-client`, and `:50` short-circuits the *entire* cron run before any candidate is found. `twilio-client.ts:9,23` defines that as `!!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER)` — while every `+64`/`+61` number routes to TNZ. **On a TNZ-only deployment — the NZ production path — the nudge cron returns `{smsEnabled:false, errors:['SMS not configured']}` and sends nothing.** Same Twilio-only gate at `trigger-nudges/route.ts:24` and `people/[personId]/nudge/route.ts:97-101`. `isTnzEnabled()` is referenced in exactly one place repo-wide.
- **Quiet hours: the gate is right, the arithmetic is not.** `isQuietHours()` is correct in any server timezone. But `getNZTime()` returns `new Date(new Date().toLocaleString('en-US',{timeZone:'Pacific/Auckland'}))` — NZ wall-clock component values on a shifted absolute instant — and `getNextSendTime()` / `getMinutesUntilQuietEnd()` subtract a *real* `new Date()` from it. On a UTC server the reported deferral is off by ~720 min (worked example in the E cluster). That number is written to InviteEvent metadata as `deferredMinutes` and returned as `deferredUntilMinutes`.
- **Coverage gap:** quiet-hours is imported only by `nudge-sender.ts` and `proxy-nudge-sender.ts`. The wrap-up/thank-you SMS cron (`src/lib/wrap-up.ts:210`, scheduled at `vercel.json:8`) sends with **no quiet-hours guard at all** — which lands directly on GTC-186 (H1).

E1 is the ticket that rebuilds cadence. It is the last natural moment to catch this, and line 44 is the sentence telling it not to.

### 3. Epic A / B / C1 have landed — the report is a pre-landing snapshot with no decay warning

`grep -inE "stale|snapshot|point-in-time|as of|may have changed|superseded|decay|re-verif"` over all 181 lines returns six hits, **none of them a decay warning**. The only temporal hedge is line 7's *"at the time of the pass"*, which qualifies the read-only *process*, not the shelf life of the findings. Against that, line 3 says **"Breakdown of record"** and *"so it survives past the session that produced it"*, line 5 says **"Source authority"**, and Task 1 is ~70 lines of undated present-tense code assertions.

This is the meta-claim that converts every individual staleness into a trap (X-5): a builder gets no cue that a "(d) doesn't exist" needs re-checking, so **a landed feature reads as a greenfield instruction**.

The report's own author named this failure mode. `GTC-165:43`: landing a report *"that cited stale 'OPEN' pointers as current would itself be the drift class this ticket exists to prevent"* — and applied the guard to the spec pointers, not the code claims.

**Amplifier:** two auto-loading skills point at the report with no caveat — `gather-frontier-and-roadmap/SKILL.md:69` (*"for the full picture"*) and `gather-domain-reference/SKILL.md:69-70` (*"for the decided-vs-built map and ticket breakdown"*). Sessions reach the report without deciding to.

---

## Cluster C — Recipient model (GTC-173 / C2 open, next in build order)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| C-1 | L75 | reconcile path "still runs with no transaction" | **STALE** | `reconcileMembers.ts:18,120` now takes a `Prisma.TransactionClient` — a non-transactional call will not typecheck. Sole caller wraps it in `prisma.$transaction` at `households/[householdId]/route.ts:171-197`. Stale by **GTC-201** (`1e10529`). Diff-based half from GTC-159 still accurate. |
| C-2 | L135 | C2 = "update reconcileMembers.ts to preserve new toggle fields given its non-transactional partial-write risk. Effort: medium" | **STALE** | *Both* premises are dead. Transaction risk fixed by GTC-201; field preservation already shipped by **GTC-172** (`63764d1`) and verified end-to-end through both PUT callers. See below. |
| C-3 | L134 | C1 framed as unfiled/unbuilt | **STALE** | C1 is **GTC-172**, closed at `63764d1`. Report's "B–K remain unfiled" framing is stale for C1, B1, B2. |
| C-4a | L71 | `Moment1InputForm.tsx` captures name/email/phone only | **STALE** | Also captures `contactPersonEventId` (the §10.7 picker, `<select>` at `:910-940`) and per-helper `adultRoled` (checkbox at `:768-789`). Stale by GTC-172. |
| C-4b | L71 | `reachabilityTier`/`contactMethod` auto-derived, not a host toggle | **ACCURATE** | `reconcileMembers.ts:114-118` + four duplicate derivations. GTC-172 deliberately left the enum alone. |
| C-5 | L72 | nothing filters CHILD from message eligibility | **STALE** | **Five** paths now guarded by one shared predicate (`src/lib/eligibility/child-exclusion.ts`), spread into SQL and re-checked in JS: nudge candidates, RSVP follow-up, proxy nudge, wrap-up, host manual nudge. Plus a sixth gate at `channel.ts:72`. No unguarded `sendSms` path found. Stale by GTC-172 + GTC-207. |
| C-6 | L73 | `PROXY` tier exists in the enum but is never written | **ACCURATE** | Every write is DIRECT/SHARED/UNTRACKABLE across 13 sites. `PROXY` survives only as reads on a dead branch (`invite-status/route.ts:233`, `ReachabilityBar.tsx:57` — both always render zero). |

**The C2 question, answered:** `reconcileMembers.ts` **already preserves** `householdRole` / `isYoungPerson` / `adultRoled` / `contactPersonEventId` across a household edit — verified around the whole loop, not just the function: `reconcileMembers.ts:86-91,300-318` (undefined = leave alone, null = clear), `:169-183,186-217` (role derived from `adultRoled`, written in place), `page.tsx:615-657` (`apiHouseholdToSaved` reads both back), `Moment1InputForm.tsx:192/362/372`, and the second PUT caller `Moment1Summary.tsx:133-180`. It also self-heals a channel whose holder is re-roled to CHILD (`:320-339`).

**So GTC-173's acceptance bullet 1 already passes.** What genuinely remains:

1. **The regression test** (its bullet 2) — `grep adultRoled|contactPersonEventId tests/` hits only `child-message-exclusion-test.ts`, which writes via Prisma directly and never exercises the PUT/reconcile cycle. The two household-edit tests predate the toggle fields.
2. **Two real gaps the report never had:** (a) only the **edit** path was made transactional — `POST /api/events/[id]/households` is still a sequential bare-prisma write (`:209`, `:217-249`, `:265-268`), so a partial failure on household *create* still leaves a half-built household; (b) the channel self-heal at `:324-339` checks only the edited household's own `contactPersonEventId`, but the picker is cross-household by design, so re-roling a member to CHILD via household B leaves household A pointing at a CHILD — no message goes out (fails closed) but household A is then silently skipped from proxy nudges entirely.

GTC-173 as written is closer to *low* effort than *medium*, and its Stop Condition 9 is now unreachable.

---

## Cluster D — Guest response model (GTC-174/175/176/177, all open)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| D-1a | L50 | `rsvpStatus` asked directly via `PATCH /api/p/[token]` | **ACCURATE** | `p/[token]/route.ts:217-263`. Epic A did not touch this handler. |
| D-1b | L50 | `Assignment.response` is binary accept/decline | **ACCURATE** | `schema.prisma:1011-1015` PENDING/ACCEPTED/DECLINED; both guest write paths validate to exactly two values. |
| D-2a | L51 | NOT_SURE force-converted via nudge at 48h | **ACCURATE** | `nudge-eligibility.ts:247-292` → `nudge-sender.ts:263`. Forcing lands in the UI at `p/[token]/page.tsx:397-425` (the "Not sure" button is dropped once `rsvpFollowupSentAt` is set). |
| D-2b | L51 | "No `decideBy` field anywhere" | **STALE** *(overturned from ACCURATE)* | The literal column is still absent — but the **shared derivation anchor exists**: `src/lib/lifecycle.ts:117` `neededBy(item, event) => item.dropOffAt ?? event.endDate`, whose docstring names §10.2, Moment 4 §8.1 and Hinge §8. Landed by **GTC-168** (`d290326`) **76 minutes after** the report's commit. |
| D-3a | L52 | No maybe state exists to hold softly | **ACCURATE** | Only maybe in the schema is `RsvpStatus.NOT_SURE`, which is event-level. |
| D-3b | L52 | reassign routes "delete-then-create identically regardless of prior state" | **STALE** | Delete-then-create survives, but the routes are no longer state-blind: both now branch `MOVE_ASSIGNMENT` vs `CREATE_ASSIGNMENT`, carry `released.response` into `before`/`context` via `recordChange()`, run in a transaction, and call `onAssignmentReleased()`. Stale by GTC-196/201. |
| D-4 | L53 | both assign routes silent — no message to the released person | **ACCURATE** | Neither route imports any carrier; `onAssignmentReleased` is a declared no-op at `ledger.ts:590-596`. |
| D-5a | L54 | declining only updates the field; `Item.status` stays ASSIGNED; item never reopens | **ACCURATE** | `p/[token]/ack/[assignmentId]/route.ts` never touches Item. `workflow.ts:60-76` derives status purely from assignment presence — response is not an input. |
| D-5b | L54 | "host isn't specially notified beyond an audit log line"; "only a host-initiated DELETE reopens an item" | **WRONG** | Two records are written (`logAudit` + `logInviteEvent RESPONSE_SUBMITTED`), and declines **are** surfaced: `invite-status/route.ts:300-302` folds them into `gaps`, `h/[token]/page.tsx:140` prints "❌ DECLINED (needs reassignment)". What is missing is an outbound *message*, not host visibility. Items also reopen via the **coordinator** DELETE and via host person-removal / team-change. |
| D-6 | L56 | why-capture exists only in `frozen-edit`'s `handleReassign`; day-to-day routes capture none | **STALE** | `frozen-edit` is deleted. Both assign routes (host + coordinator, POST + DELETE) now take an optional `reason` and write it to the ChangeSet ledger at any lifecycle state. Stale by GTC-196 (`902093f`). |
| D-7a | L138/139/141 | D1, D2, D4 ticket lines | **ACCURATE** | Premises verified; filed tickets match, dependency chain intact. GTC-174 is the true gate (only `depends_on: []`; the other three hang off it). |
| D-7b | L140 | D3 framing + "Depends on D1, A2" | **STALE** | A2 (GTC-168) has landed, discharging that half — and the ledger D3 must consume was built by GTC-196/201, not GTC-168, so its Stop Condition 9 aims at the wrong risk. Half of D3's stated work already exists. |
| D-8 | L50 | the one-tap ruling restated from Hinge §3 | **ACCURATE** | Faithful to `gather-hinge-spec-v1.md` §3, clause for clause, no additions. |

**GTC-176 (D3) is the most damaged open ticket in the document.** Three of its four Scope/Acceptance bullets are already satisfied or point at a deleted file (four separate references to `frozen-edit/route.ts`). Combined with finding #1 above, it should be **re-scoped, not corrected**. Its real remaining work is narrow: put a body in `onAssignmentReleased()`, and once D1 lands the maybe, branch the assign routes for held-softly.

**Unowned shared dependency:** `workflow.ts:60-76` `repairItemStatusAfterMutation` derives `Item.status` purely from assignment presence. Neither GTC-174 (D1) nor GTC-177 (D4) can express "assigned but declined/maybe" through it without changing that derivation — and `Item.status` is a called-out load-bearing invariant in the architecture-contract skill. **No ticket owns that change.**

---

## Cluster E — Nudge machinery (GTC-178–182, all open)

Notable: **nothing here is STALE.** The three failures were all false when written — a different and worse mode than drift.

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| E-1a | L35 | cron machinery real, runs 24h/48h not day-4/7 | **ACCURATE** | Constants at `nudge-eligibility.ts:57-58`; no day-4/7 constant exists anywhere. Cron genuinely scheduled (`vercel.json:2-8`). |
| E-1b | L35 | ...on **"opened but no response"** semantics | **WRONG** | The 24h leg fires when `!candidate.hasOpened` — the *opposite* of "opened". The 48h leg has no opened-check at all. And the clock has **always** been anchored on the send (`Person.inviteAnchorAt`), never on `openedAt`. |
| E-1c | L35 | `sendRsvpFollowupNudge` force-converts NOT_SURE at 48h | **ACCURATE** | Still wired end to end. Note the conversion is forced by *removing the maybe option in the UI*, not by overwriting the row. |
| E-2 | L36 | no cadence config field; only `HostNudgeVariant` tone | **ACCURATE** | Full absence search clean. Wrinkle: `NudgeComposer.tsx:6-21` keeps its own duplicate copy of the variant union — "the only gentle concept" exists twice. |
| E-3 | L37 | no deadline/stop-nudging field on Event or Person | **ACCURATE** | Confirmed field-by-field on both models. |
| E-4 | L38 | raw nudge data exists; nothing computes a forward-looking clock | **ACCURATE** | Both halves. The only clock arithmetic in the host UI is backward-looking (`page.tsx:3592-3597`). |
| E-5 | L39 | no post-yes reminder offer in `p/[token]/page.tsx` | **ACCURATE** | Zero hits for remind/reminder in `src/app/p/` or `src/app/api/p/`. |
| E-6 | L41 | zero bounce handling; no delivery-status receiver on TNZ or Twilio | **ACCURATE** | TNZ parses a MessageID "for delivery tracking" that nothing ever reads; `send-sms.ts:140-145` passes no `statusCallback`; `api/sms/inbound` is an inbound-*message* receiver only. GTC-208 removed a send endpoint, not a receiver. |
| E-7 | L42 | `openedAt` rendered to host in two named components | **ACCURATE** | Both still exist and are still mounted (`page.tsx:44/3558`, `:50/3950`). |
| E-8a | L44 | TNZ/Twilio routing "working correctly — not in question" | **WRONG** | See finding #2. Twilio-only gate blanks the whole nudge cron on a TNZ-only deployment. |
| E-8b | L44 | quiet-hours "working correctly — not in question" | **WRONG** | See finding #2. Gate correct, derived times off by the server-TZ offset; wrap-up path has no quiet-hours guard at all. |
| E-9a | L144 | E1 ticket line + ⚠ SMS opt-out marker | **ACCURATE** | Removal targets still exist and are still wired; the ⚠ is justified — the candidate query E1 rewrites contains the `isOptedOut()` call itself. |
| E-9b | L145-148 | E2–E5 ticket lines: premises + ⚠ placement | **UNVERIFIABLE** *(overturned from ACCURATE)* | Premises all verified true. The ⚠-placement half cannot be settled by code: E3's scope explicitly truncates E1's schedule *inside* `nudge-eligibility.ts`, the same loop holding the Zone 7 opt-out gates at `:170`/`:321` — the adjacency that earned E1 and E2 their ⚠. Whether the report *should* have flagged E3 is editorial. |

**Corrections a builder needs that neither the report nor the tickets carry:**

- E1's real work is (a) 24h/48h → day 4/7, (b) delete the `!hasOpened`/`!hasResponded` gates, (c) **re-anchor from the global `Person.inviteAnchorAt` to the per-event `PersonEvent.sentAt`** that GTC-168 created for exactly this reason. `schema.prisma:173-178` explicitly assigns that migration to GTC-178. `GTC-178.md` never names an anchor, so a builder could rebuild day-4/7 on the global field and reproduce the per-event leak.
- `GTC-178.md`'s Scope reads *"from 24h/48h-since-opened to day-4/day-7-since-send"* — the ticket **sharpened the report's error**. Nothing has ever been anchored on `openedAt`.
- `GTC-180.md` (E3) asserts *"No derived-with-override pattern exists for this concept"* and tells the builder to coordinate with D2 on a shared helper. **It already exists** — `lifecycle.ts:117`, with the offset constant deliberately omitted pending founder sign-off, and a docstring naming GTC-180 as its consumer. Its own Stop Condition 10 warns against exactly the divergence the ticket text invites.
- `GTC-182.md` (E5): removing the "Opened" tile and the "Link opened" row does **not** remove the seen signal — `invite-status/route.ts:144` still derives a per-person `OPENED` status and `InviteStatusSection.tsx:651` still renders it as a chip. Acceptance criterion 1 would fail as written.
- `GTC-178.md`'s acceptance (remove the two functions and their call sites) would leave the UI branch at `p/[token]/page.tsx:398-427` and the `rsvpFollowupSentAt` column behind as dead code.

---

## Clusters F + H — Material change, COMPLETE, wrap-up (GTC-183/186/187, all open)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| F-1 | L24 | FROZEN→COMPLETE is an explicit host action; no date-based transition; wrap-up hard-requires FROZEN | **STALE** | There is **no FROZEN→COMPLETE transition at all**. COMPLETE is a derived calendar predicate (`isComplete()` = `now > endDate`); nothing writes it. Wrap-up is **already** COMPLETE-gated. Stale by GTC-169 (`30333e6`). |
| F-2 | L25 | no concept of post-send mini-sends | **STALE** | The **data model exists and is live** — every `PersonEvent` carries its own `sentAt`, stamped at the press for the cohort and at insert for later adds; `isMiniSend()` is defined and unit-tested. **No behaviour hangs off it**: zero production callers, no message, no clock reads it. Stale by GTC-168/196. |
| F-3 | L40 | wrap-up fires automatically on FROZEN→COMPLETE for all guests, no offer/review | **STALE** | Trigger is now an explicit host POST refused with 400 unless `isComplete(event)`. Recipients are **not** "all guests" — host and non-messageable roles are excluded (GTC-172). The "no offer/review step" half is **still accurate**. |
| F-4 | L151 | F1 = date/venue re-ask + wrong-date recovery; depends A2, D1 | **STALE** | **Half of F1 is already built**: `MATERIAL_EVENT_FIELDS` (`ledger.ts:64-78`), change detection, ledger recording, the sent-event guard, and the single call site — `onMaterialChange()` at `ledger.ts:574`, an explicit no-op carrying ⚠ *"UNTIL F1 LANDS, A POST-SEND DATE CHANGE IS RECORDED BUT NOBODY IS RE-ASKED."* Dependencies still correct as written. |
| F-5a | L158 | H1 = once-only offer, +1–2 days, with review | **ACCURATE** | Correctly describes unbuilt work. **And it surfaced a live bug** — see below. |
| F-5b | L159 | H2 = dual-voice architecture (i.e. none exists) | **ACCURATE** | Both template modules return single hard-coded strings; zero hits for dual-voice/three-movement/composeMessage anywhere in messaging. |
| F-6 | L23 | the FROZEN→CONFIRMING unfreeze path is exactly the recall the spec rules out | **STALE** | **There is no unfreeze path.** `PATCH /api/h/[token]/status` now only edits `guestCount`; `unfreezeReason`, `OVERRIDE_UNFREEZE` and `UnfreezeSection.tsx` are gone; `canTransition` allows nothing out of FROZEN or COMPLETE. Hinge §2's "no unsend at the mechanism level" is **already satisfied**. |

**GTC-186 (H1) is the worst-affected open ticket in this cluster.** Its Context (`:33-34`) and Scope (`:42-43`) both repeat the FROZEN→COMPLETE trigger claim verbatim; two of its three factual clauses are false; its Stop Condition 9 is already satisfied. It is an SMS opt-out-zone ticket, so an executor is working from a false trigger model inside the highest-consequence do-not-touch zone in the repo.

**GTC-183 (F1)** is affected more subtly: its Scope still lists *"Date/venue change detection on the event"* as work to do, and it never names `onMaterialChange` as the hook to fill. The likely concrete failure is an F1 builder writing a **second** detection path alongside the wired one.

**Live bug found beside F-5a (not a doc issue):** `POST /api/events/[id]/wrap-up` writes `wrappedAt` but **never reads it**; `generateWrapUpLinks` has no `(eventId, personId)` dedupe; and the host UI re-offers the button after any reload because it gates on React state (`wrapUpResult`), not on the event. **A host who presses twice sends every guest two thank-you texts.** Contrast `confirm-invites-sent/route.ts:51`, which does have a proper idempotency guard.

---

## Cluster G — Dietary (GTC-184/185, both open)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| G-1 | L62 | three-state model real but event-scoped; legacy `Event.dietary*` model also lives on, unreconciled | **ACCURATE** | Both models live, written by different paths, nothing reconciles them. `EventSetup.eventId @unique` confirms event-scoping. |
| G-2 | L63 | no per-person dietary field on Person/PersonEvent/Household | **ACCURATE** | All three models read in full plus a wide absence search. Greenfield add confirmed. |
| G-3 | L64 | `detectDietaryGaps()` reads legacy counts, blind to `EventSetup.dietaryData` | **ACCURATE** | `check.ts:187,213` gate on the legacy ints; `detectConflicts`'s event query never includes `setup`. |
| G-4a | L65 | "...no message-preview... anywhere" | **WRONG** *(overturned from ACCURATE)* | `src/components/plan/NudgeComposer.tsx` **is** a review-before-send surface — four registers of the literal SMS text in host-editable state, POSTed only on Send, reachable from `PersonInviteDetailModal.tsx:396-425` with the recipient and channel named beside it. Landed `7bc243b`, **four months before** the report. |
| G-4b | L65 | "No coverage sweep... anywhere" | **WRONG** | `workflow.ts:172` `checkSendReadiness()` — doc-commented as *"the Hinge §1 pre-flight's 'hunt for absence', and its final form is GTC-188 (I1)"*. Emits UNASSIGNED_ITEMS / LOW_COMPLIANCE / CRITICAL_GAPS. Only the *name* changed after the report (GTC-169 renamed it from `checkFreezeReadiness`). A coverage *display* also renders pre-send at `InviteStatusSection.tsx:287-296`. |
| G-5 | L153-155 | Epic G ticket lines + scope + G2-depends-on-G1 | **ACCURATE** | All three named work axes untouched; dependency encoded in frontmatter. |
| G-6 | L63 | capture point specified: Moment 1, optional, per-person | **ACCURATE** | Matches `gather-moment-4-spec-v1.md:144` on all three attributes. |

**Three things a G1/I1 builder needs that nothing currently says:**

1. **There is a third dietary surface.** `Item.glutenFree/dairyFree/vegetarian` + `Item.dietaryTags` (`schema.prisma:260-263`) are the *coverage* side of the gap check. Repointing `detectDietaryGaps` at `readDietaryData()` means mapping free-text `requirements[]` onto three item booleans, and **no mapping layer exists**. Also: `detectDietaryGaps` only ever checks vegetarian and gluten-free — `Event.dietaryVegan` and `dietaryDairyFree` are dead inputs — and `suggest-resolution/route.ts:158` prints `${event.dietaryVegan} vegetarian, ${event.dietaryVegan} vegan`, the same field twice.
2. **The conflict-detection path may be dead.** `detectConflicts` is reachable only via `POST /api/events/[id]/check`, and no caller of that route exists in `src`. G1's acceptance criterion can go green against a route nothing invokes.
3. **Per-person capture cannot cover littles.** `Household.littleCount` is a bare integer with no `PersonEvent` rows, so a per-person dietary note has nowhere to hang **for exactly the cohort most likely to have an allergy**. G1 must rule on that; "max" effort is if anything understated.

`GTC-188.md` (I1) repeats the G-4 sentence verbatim at `:33` *and* cites the dead symbol `checkFreezeReadiness` at `:34` and `:54` — a stale symbol name sitting next to a claim that the thing doesn't exist.

---

## Cluster A-residue — Epic A claims that open D/E/F/I tickets still inherit

Epic A has landed, so these claims are moot as Epic A scope. They are listed because open tickets inherit them as their *starting picture*. **All five are STALE, all in the same direction.**

| ID | Report loc | Claim | Current truth |
|---|---|---|---|
| A-1 | L20 | `c/[token]/items/*` call `requireNotFrozen` → hard 403 | **No lifecycle-derived hard block exists on the server at all.** `guards.ts:125-140` is a tombstone. Those routes allow the mutation and call `recordChange()` in the same transaction. D3/D4 inherit *allow-and-record*, not *403-and-migrate*. |
| A-2 | L21 | PlanRevision manual/opt-in; `GET .../revisions` caps at 5 | **The 5-cap is gone** — cursor-paginated, default 25, max 200, `total` returned (GTC-168). Per-change versioning now lives in `AuditEntry.sequence` via `recordChange()`, wired into ~30 mutation routes including the assignment ones. `createRevision` is demoted to a coarse checkpoint. *Live risk to inherit instead:* **GTC-206** — `restoreFromRevision` nulls every `PersonEvent.teamId`. |
| A-3 | L22 | two unlinked audit systems; reason in a JSON blob; nothing anchors to "the send" | `AuditEntry` is now the plan ledger with `reason`/`reasonRequired` as **typed columns**; `InviteEvent` is the delivery log. **The send IS anchored** — `SEND_PRESSED` recorded at `confirm-invites-sent/route.ts:113-124` plus `Event.sentAt`/`PersonEvent.sentAt`. |
| A-4 | L26 | "~30 call sites" FROZEN consumer map, "every one is a migration site" | **The map is spent, not pending.** `grep -c FROZEN` on the god file returns **0** (the claimed "12+ branch sites" are gone). `frozen-edit`, `UnfreezeSection.tsx`, `FrozenEditModal.tsx` all deleted. What remains is ~6 residual touchpoints — precisely GTC-199 (A4)'s surface, which its own list enumerates correctly. |
| A-5 | L19 | "No send/press/hinge concept anywhere" | **The press exists and is the lock point.** `Event.sentAt` + `PersonEvent.sentAt`, stamped by `POST /confirm-invites-sent` (and its `/h/[token]` twin), recorded as `SEND_PRESSED`. Only the third sub-clause survives: link generation is still independent of the press. |

**The two hooks Epic A left behind are mentioned nowhere in the report**, and they are the correct starting picture for F1 and D3:

- `src/lib/ledger.ts:574` `onMaterialChange()` — docstring names GTC-183 (F1)
- `src/lib/ledger.ts:590` `onAssignmentReleased()` — docstring names GTC-176 (D3)

---

## Cluster I — The Hinge experience (GTC-188–191, lighter pass)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| I-1 | L162 | I1 pre-flight; depends on G2, C1 | **STALE** | No pre-flight screen exists (confirmed). But **C1 has landed**, so I1's live blockers are G2 + E2 — and `GTC-188`'s frontmatter lists three deps (GTC-185, GTC-172, GTC-179), not the report's two. Also stale by GTC-169's `checkFreezeReadiness` → `checkSendReadiness` rename. |
| I-2 | L163 | I2 the press: ledger-anchored send timestamp; depends A2, H2 | **STALE** | **The ledger-anchored send timestamp is already built**: `Event.sentAt` stamped, every `PersonEvent.sentAt` cohort-stamped, second press refused with 400, `SEND_PRESSED` recorded. What remains is message construction, actual dispatch, atomic rollout, mini-sends. |
| I-3 | L164 | I3 minutes-after screen; depends E5 | **ACCURATE** | Zero hits for nudge-clock; no post-press component. E5's precondition still unmet. |
| I-4 | L165 | I4 guest-side one-tap ask; depends D1 | **ACCURATE** | The page still asks two separate questions across a three-phase flow. Worth flagging: I4 is a **deletion job as much as a build job** — the current page carries a venue/date/guest-count header, team+coordinator block and expand-all grid that §3's closed content list refuses. |
| I-5 | L92 | no Moment 4 screen; no V2 component for Moment 3 or 4 | **ACCURATE** | Seven `*Moment*` files, all Moment1/Moment2, plus `MomentArc.tsx` which types Moment 4 as a progress-arc step with no screen behind it. |

**GTC-189 (I2) is already more current than the report** — it carries an explicit "⚠ Inherited from Epic A" section reconciling what A2/A3b landed. The risk sits entirely with anyone scoping off the report instead.

---

## Cluster J — Screen, criticality, runbook (GTC-192–194, lighter pass)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| J-1 | L81 | live `finalize-plan` path has no `critical` field; every AI item defaults false | **STALE** | The live path **does** carry `critical`/`criticalReason` in its output schema and persists them (`finalize-plan/route.ts:82-83, 296-301, 342-343`; `prompts.ts:620-624, 717-718`). Stale by **GTC-170** (`4ce7e90`). Only the schema half survives. |
| J-2a | L82 | badge "renders correctly" in the god file and `h/[token]` | **WRONG** | The known one. `git show e0eb07d` removed both the client-side critical-first comparator and the API `orderBy: [{critical:'desc'}]` from the host team-detail view. |
| J-2b | L82 | `c/[token]` sorts unassigned critical items to the top — **J2's premise** | **STALE** | Gone at both layers. `c/[token]/page.tsx:374-378` now reads `const sortedItems = data.items;` under a comment quoting §8.2; API `orderBy` is displayOrder/createdAt. Stale by **GTC-170** (`4ce7e90`) for the coordinator view, GTC-205 for the host. **The §8.2 contradiction is closed on both surfaces.** |
| J-3 | L83 | no Task model, no row-kind distinction anywhere in the schema | **STALE** | There is still no `model Task` — **by design**. The distinction exists as `Item.kind: RowKind {ITEM, TASK}` (`schema.prisma:241`, enum `:753-758`), with `src/lib/ai/tasks.ts` and `TASK_BUCKETS` wired into finalize-plan. Stale by **GTC-171** (`e85ebfa`). Grepping `model Task` gives a false negative on B2. |
| J-4 | L84 | Download PDF is a raw item table; separate Copy-as-text export | **ACCURATE** | Verified inside the generated HTML: no `item.critical`, no kind filter, no checkbox markup, and the only date emitted is the event date. |
| J-5 | L85 | no print-date stamping, no reprint detection | **ACCURATE** | Full absence search clean. |
| J-6 | L86 | no live day-of check-off — clean absence | **ACCURATE** | Two absence sweeps clean; Item's only state fields are `status` and assignment response. |
| J-7 | L168-170 | J1/J2/J3 dependencies | **ACCURATE** | Structure unchanged and correct. B1/B2 closing does **not** change J's readiness: J1 is still blocked on GTC-174 (D1) and GTC-178 (E1). Useful nuance: the tickets narrow the report's loose "D, E" to **D1/E1 specifically** — J1 does not wait for all of Epics D and E. |

**Good news on propagation:** the J tickets were re-worded when B1/B2 landed. None repeats a stale claim; `GTC-193` even frames the float-to-top in the past tense as *"the exact contradiction B1 already fixed once"*. The staleness lives in the report, not the build instructions.

**Live behaviour regression from B2 that no J ticket owns:** the V1 "Download PDF" generator (`plan/[eventId]/page.tsx:2890-2971`) iterates all Items with **no `kind` filter**. Now that GTC-171 creates TASK rows as Item rows, that legacy export has silently started interleaving day-of tasks into the food-category tables. `GTC-194` explicitly says leave the V1 export alone.

---

## Cluster K — Clone review (GTC-195, lighter pass)

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| K-1a | L117, L172-173 | the mandatory people-review requirement, sourced to §10.10 | **ACCURATE** | Matches `gather-moment-4-spec-v1.md:154` clause for clause. This rules citation fidelity only. |
| K-1b | implicit | Epic K's premise: that cloning carries the old guest list forward | **WRONG** | `templates/[id]/clone/route.ts` copies plan **structure only** (days/teams/items) and creates exactly **one** PersonEvent — the host. `StructureTemplate` has no people field to copy from. `git log -S "household"` on that route returns **nothing** — guests were never copied at any point. **There are zero ghost guests to guard against on the clone path.** |
| K-2 | Task 1 | the report makes no code-side claim about cloning anywhere | **ACCURATE** | `grep -i clone\|ghost\|template` over the whole report returns three lines, all in Task 2/Task 3. The word "template" appears nowhere. **K1 is the only epic with no Decided-vs-Built column behind it**; its "Effort: high" is a pure spec-side guess. |

**Where the real exposure is:** the `fromReuse` path. `plan/[eventId]/page.tsx:534-543` fetches the **source** event's people over `/api/events/{clonedFromId}/people` and renders their first names in `PastEventOverlay.tsx` on the **new** event's page. That is §10.10's exact failure — *"a dead relative's name appears in this year's event"* — happening in the UI, where a DB-side people-review will not catch it. `GTC-195` never names this path.

**Mitigating:** GTC-195 was filed honestly — it explicitly says *"The discovery pass did not investigate any existing clone/duplicate-event mechanism specifically — verify what exists (if anything) at ticket start rather than assuming greenfield"* and carries a stop condition for the no-mechanism case. And `clone/route.ts:215-217` carries an in-code pointer added by GTC-201. The gap propagated as an honest unknown, not a false assertion.

---

## Cluster X — Cross-cutting: filing status, dependencies, citations

| ID | Report loc | Claim | Ruling | Current truth |
|---|---|---|---|---|
| X-1 | L125, L127 | "Epic A is filed as GTC-167–169; B–K remain unfiled" | **STALE** | **All 36 epic tickets are filed.** Epic A is **10** tickets, not 3 (167,168,169,196,197,198,199,200,201,202); GTC-169 is **A3a**, not A3 — A3 was split four ways plus two follow-ups. |
| X-2a | L175 | "~28 tickets across 11 epics" | **STALE** | 36 filed across the same 11 epics. The under-count is *entirely* Epic A, which tripled on contact with the code — which is the signal the number hides. |
| X-2b | L175 | "Epic A is the hard dependency floor; B1/B2, C1, G1 can start in parallel with A once filed" | **STALE** *(overturned from ACCURATE)* | The window is spent — Epic A landed, B1/B2/C1 are closed, only G1 remains open and nothing gates it. And the "floor" over-generalises: of 26 B–K tickets, **exactly four** route through Epic A (GTC-176, 183, 186, 189). The other 22 carry no Epic A dependency. |
| X-2c | L175 | "D, E, F, I4 still depend on A2 for the ledger" | **WRONG** | Only 2 of those 11 tickets carry GTC-168. **The real floor for D/E/I4 is D1 (GTC-174)**, which gates eight downstream tickets and is still open. The report's blocking story points at the wrong node. |
| X-3 | L119 | "D1, C1, G1, E2, E3, K1 are unblocked" | **STALE** | C1 is **built**. D1/G1/K1 remain genuinely startable (`depends_on: []`). **E2 and E3 are dependency-blocked** two levels deep behind GTC-178 → GTC-174. The actual startable frontier is D1, G1, K1 (+ E4, `depends_on: []`). |
| X-4a | L23,31,54,77,82,85,150 | all Moment 4 §8.x citations | **ACCURATE** | All six (§8.2–8.6, 8.8) exist and say what the report says. |
| X-4b | L24,31,36-41,51,63,71-72,92,105-119,133-172 | all Moment 4 §10.x citations | **ACCURATE** | All ten (§10.1–10.10) resolve, including the exact §10.6 quote. **This is the family every "unblocked (§X)" claim rests on — the unblocked-ness argument is sound** even where the dependency arithmetic is not. |
| X-4c | L20-25,50,102-111,151 | "ruled gap #1/#2/#3/#5/#10" references | **ACCURATE** | The gap numbers are the spec's own, carried inline in Hinge §2/§3. All 16 Task 2 rows resolve. |
| X-4d | L5,20-25,35,39,42,50,58,151,165,175 | Hinge §1/§2/§3/§6 citations | **ACCURATE** | All four resolve, including the one verbatim quote the report reproduces. |
| X-4e | L38, L41 | bare "§6" (nudge-clock) and "§7" (bounce detection) | **WRONG** | Both mean **Hinge** §6 and §7. Under the document's default spec (Moment 4) they land on "The runbook" and "Freeze, the ending, and after" — neither contains the cited material. Proof of collision: L77 uses "§6" to mean Moment 4 §6. L42 writes "Hinge §6" explicitly, so this is inconsistency, not a house convention. |
| X-4f | L5, L98 | "the discovery-gap-ruled versions — Moment 4 §10, Hinge §2–§3" | **ACCURATE** *(overturned from WRONG)* | Settled by git: Hinge §8 was already present in GTC-163's original filing (`5f44649`) and GTC-164's diff (`f5cb7b4`) is 13 lines touching only the status line, §2 and §3. L5 is an exact description of that diff. **Residual editorial point:** the report never writes the string "Hinge §8", so the maybe's own build line is reachable only via §10.2 — but the chain is intact at one hop, and GTC-175/176 both cite §8 directly. |
| X-5 | L3, L7 | "Breakdown of record... survives past the session" with no decay warning | **STALE** | See finding #3. |
| X-6a | n/a | the founder's P3005 attribution | **WRONG** | Not in this report; lives at `GATHER-BUILD-CONSTANTS.md:108-112`. See "the four known inaccuracies". |
| X-6b | `GATHER-BUILD-CONSTANTS.md:108-112` | the underlying P3005 drift fact | **STALE** | Migrate status is clean, confirmed twice on 2026-08-04 (GTC-171, GTC-172), corroborated by four migrations applied since. **No open ticket tracks the correction.** |

**Adjacent staleness, same class:** `docs/04_roadmap/send-lock-reconciliation-plan.md` still carries Status *"Plan of record"* and says at `:780` *"A single merge ticket (proposed A-merge, unfiled)"* and at `:822` *"| A-merge | **Still unfiled.**"* — A-merge is filed and closed as GTC-200. `GTC-167:108` likewise still calls A4 "unfiled"; it is GTC-199. **The "unfiled" idiom is decaying across the whole 2026-08-03 document set** — this wants a sweep, not three point fixes.

---

## Addendum — in-scope claims the cluster sweep missed

Found by the completeness pass and ruled here.

| Report loc | Claim | Ruling | Note |
|---|---|---|---|
| **L27** | *"`handleReassign` in `frozen-edit/route.ts` already does the 'why' + 'notify the released guest' halves correctly"* | **WRONG** | **The single most load-bearing claim in the document.** See finding #1. Propagated into GTC-176 *and* into `src/lib/ledger.ts:587-589`. |
| **L55** | "No `Task` model or row-kind distinction anywhere in the schema" | **STALE** | Verbatim duplicate of L83 (ruled J-3). L55 sits in §3, the section **Epic D** builders read; L83 sits in §6, which **Epic J** builders read. Fixing only L83 leaves a D-builder believing `Item.kind` doesn't exist — which matters, because D1's unified response has to apply across TASK rows and no D ticket mentions `RowKind`. |
| **L155** | "G2 — Per-person by-name re-verify screen at pre-flight" | **UNVERIFIABLE** | Like Epic K, G2 has **zero Task 1 discovery behind it** — §4 asks whether per-person dietary *data* exists, never whether any per-person *display* exists. The gap was filled by an unverified invention: `GTC-185.md:31` asserts *"no route or component re-displays dietary data at the individual-guest level anywhere"* — an absence claim that exists only in the ticket, so nothing has ever searched it. G-4b is the precedent for why that matters. **The report has two epics scoped with no discovery, not one.** |
| **L181** | "`gather-architecture-contract` §5 and the RSVP table in `gather-domain-reference` were deliberately NOT rewritten — both remain accurate descriptions of pre-reconciliation code... Full rewrite is owed once Epic A lands" | **STALE** | **The deferral has triggered and the debt is unowned.** `gather-architecture-contract/SKILL.md:194` still presents as current: *"FROZEN | nothing (frozen edits go through the dedicated override route `.../frozen-edit/route.ts` + `requireNotFrozen(...)`)"* — a deleted route and a deleted function; `:168` still lists `requireNotFrozen` at `guards.ts` line 138. `gather-domain-reference/SKILL.md:146` still says the ack route is *"blocked while FROZEN"*. A post-Epic-A note exists at arch-contract `:387-392` but sits ~200 lines **below** the table it disclaims. |
| **L7** | "further epics unfiled pending founder review" | **STALE** | Third instance of the decaying "unfiled" idiom, and the one a reader hits **first**. |

---

## The systemic pattern — two failure classes, opposite responses

### Class 1 — Time decay. One-directional, predictable, cheap to fix.

Every STALE ruling runs the same way: the report describes hard gates and absences that Epic A/B/C1 have since replaced with allow-and-record mechanisms and shipped features. **It never overstates what exists; it always understates.**

And the boundary is sharp, which gives you a one-line discriminator for anything not yet audited:

> **If the claim describes how a HOST change is gated, recorded or blocked — assume stale.**
> **If it describes how a GUEST answers — assume still true.**

Host-side mutation routes all moved (`requireNotFrozen` deleted, `frozen-edit` deleted, unfreeze deleted, `recordChange` added, lifecycle predicates added, household picker shipped). Guest-side response mechanics were untouched and survive intact (`PATCH rsvpStatus`, the ack route, the 48h forced conversion, the `AssignmentResponse` enum, `workflow.ts` status derivation). That is exactly why D1/D2/D4's premises survived and D3's did not.

This class needs no line-by-line pass — a dated banner plus "Task 1 §1 superseded by Epic A" neutralises most of it.

### Class 2 — Verification asymmetry. Present at writing. A banner does nothing for it.

**This is the one to worry about.** Every WRONG ruling in this audit — E-1b, E-8a, E-8b, G-4a, G-4b, J-2a, D-5b, K-1b, X-4e, X-2c, and L27 — sits on a clause where the report says something is **fine**, not on a clause where it says something is **missing**.

The absences were genuinely searched. The reassurances were asserted. The tell is a small recurring vocabulary:

> *"already does ... correctly"* (L27) · *"real and working correctly — not in question"* (L44) · *"renders correctly"* (L82) · *"exists cleanly"* (L56) · *"real and well-built"* (L62)

L27 shows the mechanism concretely: the deleted route contained a variable named `notificationsSent` and a response key named `sent`, and the report reported a send. **Naming was read as behaviour.**

The practical rule: **in this document, a stated absence is roughly trustworthy and a stated adequacy is not** — the exact inverse of how a builder instinctively reads a discovery report. Absences get re-checked because you have to build them; adequacies get taken on faith because they tell you to move on.

### Structural contributor to both

The taxonomy at L13 has cells for (a) conforms / (b) contradicts / (c) partial / (d) doesn't exist — and **no cell for the two states that now dominate the repo**:

- **"hook point exists, behaviour doesn't"** — `onMaterialChange`, `onAssignmentReleased`: deliberately-named empty functions Epic A left for F1 and D3, mentioned nowhere in the report.
- **"exists but is dead / unreachable"** — the PROXY read path, `detectConflicts` with no caller, the NOT_SURE UI branch.

Claims about both get forced into (d), which reads as *"greenfield — go build it"*. That is the specific misread that produces duplicate implementations, and it is behind two of the five most dangerous findings.

### The encouraging half

- **The spec citations are sound** — 40+ §-references, two narrow defects, **neither propagated**. The ticket authors independently caught both (`GTC-181:22` writes "Hinge spec §7", `GTC-182:23` writes "Hinge spec §6", `GTC-175`/`GTC-176` write "Hinge spec §8").
- **The ticket files are consistently more accurate than the report they were filed from.** GTC-189 reconciles what Epic A actually landed; the J tickets were re-worded when B1/B2 shipped; GTC-195 names its own unknown honestly.

So the right shape of a fix — your call, not mine — is narrow: mark Task 1 and Task 3 historical and point at `docs/tickets/` as the authority; correct **three** tickets by hand (GTC-176, GTC-186, GTC-188); and clear the two errors that have reached `src/` and the skills (`ledger.ts:587-589`, `gather-architecture-contract/SKILL.md:168,194`).

---

## Propagation map — stale claims already inside OPEN tickets

The tickets were filed by copying the report's Context sections verbatim. Where the report is wrong, the ticket usually is too.

| Open ticket | Inherited defect | Severity |
|---|---|---|
| **GTC-176 (D3)** | Cites the deleted `frozen-edit/route.ts` **four times**; scopes release-notification as a port of a mechanism that never existed; its "reason captured through A2's ledger" acceptance is **already satisfied**; repeats the stale delete-then-create line | **Re-scope, don't correct** |
| **GTC-186 (H1)** | Repeats "fires automatically on FROZEN→COMPLETE, for all guests" at `:33-34` and `:42` — two of three clauses false; Stop Condition 9 already satisfied; it is an SMS opt-out-zone ticket | **High** |
| **GTC-188 (I1)** | Repeats "no coverage sweep, no message-preview, no recipient-confirmation screen anywhere" at `:33` (two of three clauses WRONG); cites the dead symbol `checkFreezeReadiness` at `:34` and `:54` | **High** — largest effort in the epic |
| **GTC-178 (E1)** | "Do not touch: TNZ/Twilio routing and quiet-hours — working correctly, out of scope"; and **sharpened** the report's error into "24h/48h-since-opened → day-4/day-7-since-send" | **High** |
| **GTC-173 (C2)** | Repeats the transaction risk three times (`:24`, `:33-35`, Stop Condition 9); its Scope bullet 1 is already shipped | **Medium** — re-scope to the test |
| **GTC-180 (E3)** | "No derived-with-override pattern exists" — `lifecycle.neededBy()` exists and names GTC-180 as its consumer | **Medium** |
| **GTC-175 (D2)** | Tells the builder to coordinate with GTC-180 to build a shared helper that already exists | **Medium** |
| **GTC-183 (F1)** | Scope still lists "date/venue change detection" as work; never names `onMaterialChange` as the hook | **Medium** |
| **GTC-177 (D4)** | Repeats the D-5b WRONG sentence verbatim; misses the coordinator DELETE reopen path | **Low-medium** |
| **GTC-182 (E5)** | Acceptance criterion 1 unachievable as written (the `OPENED` per-person chip survives) | **Low-medium** |
| **GTC-185 (G2)** | Carries a self-authored, never-audited absence claim at `:31` | **Unknown — verify first** |
| **`src/lib/ledger.ts:587-589`** | The L27 error is in **merged code** | **Highest — survives a doc fix** |
| **Two auto-loading skills** | `gather-architecture-contract:168,194` and `gather-domain-reference:146` still describe deleted symbols as current; both point at the report with no caveat | **High reach** |

**Clean:** GTC-174, GTC-179, GTC-181, GTC-184, GTC-187, GTC-189, GTC-190, GTC-191, GTC-192, GTC-193, GTC-194, GTC-195, GTC-199.

---

## Found in passing — live defects, not doc-accuracy issues

Flagged because the audit surfaced them, not because they are in scope. None was touched.

1. **Wrap-up double-send.** `POST /api/events/[id]/wrap-up` writes `wrappedAt` and never reads it; `generateWrapUpLinks` has no dedupe; the host UI re-offers the button after any reload (React state, not event state). **Two presses = every guest gets two thank-you texts.** Exists today on `master`-lineage code.
2. **Nudge cron is mute on a TNZ-only deployment.** `nudge-scheduler.ts:50` gates the whole run on the Twilio credential check.
3. **Quiet-hours deferral arithmetic** is off by the server-TZ-vs-Auckland offset, and the wrap-up/thank-you SMS path has **no quiet-hours guard at all**.
4. **Release-notification regression window.** Between GTC-196 and GTC-176, no released guest is notified on any path.
5. **V1 PDF export** now silently interleaves GTC-171's TASK rows into the food-category tables.
6. **`suggest-resolution/route.ts:158`** prints `${event.dietaryVegan}` twice, labelled "vegetarian" and "vegan".
7. **`detectConflicts` may be unreachable** — no caller of `POST /api/events/[id]/check` exists in `src`.
8. **§10.7 spec-vs-code question.** `Moment1InputForm.tsx:928` filters channel candidates with `.filter((c) => c.householdId !== editingHousehold?.id)`, so **editing** a household does not offer that household's own adults as the channel — against §10.7's "any adult addable". GTC-172 shipped without visual confirmation. Needs a founder ruling before C2, E2 or I1 builds beside the picker.

---

## Deserves a deeper check later

Ranked. Items 1–3 are the ones I would not start the relevant ticket without.

1. **GTC-176 (D3) re-scope, and `ledger.ts:587-589` in the same pass.** Greenfield SMS work in an opt-out zone, not a port. The wiring is done (`onAssignmentReleased` is called at all four correct sites); only the send is missing.
2. **One "SMS send-path correctness" investigation before E1 or H1 starts.** Three of the four defects share the `b3841a0` lineage: the Twilio-only gate, the quiet-hours arithmetic, and the unguarded wrap-up path.
3. **Prove exactly one writer to `Event.sentAt` before GTC-189 (I2).** The I cluster verified `/api/events/[id]/confirm-invites-sent` end to end but explicitly did **not** read `/api/h/[token]/confirm-invites-sent`, which `h/[token]/page.tsx:366` POSTs. If that route duplicates the stamp/ledger logic rather than sharing it, the send-lock invariant is doubled before I2 adds a third path. Cheap check, high consequence.
4. **`GTC-185.md:31`'s absence claim** — run the real multi-spelling search before G2 is scoped. It sits under I1's critical path and has never been verified by anyone.
5. **The `fromReuse` ghost-guest path** (`plan/[eventId]/page.tsx:534-543`) — §10.10's exact failure happening in the UI, plus an unverified cross-event authorization on that fetch. Also: `clone/route.ts:120` sets `clonedFromId: template.createdFrom || null`, so the overlay silently no-ops for templates lacking `createdFrom` — K1's browser-walk acceptance would trip over this.
6. **J2's effort estimate.** It rests on J-2a (WRONG). The literal "Critical Item" string was found only in `c/[token]/page.tsx:933`; badge rendering is referenced but unconfirmed in `h/[token]/page.tsx`, `h/[token]/team/[teamId]/page.tsx` and the god file. J2 may be materially larger or smaller than "high".
7. **`Item.status` derivation as an unowned dependency of D1 and D4** (`workflow.ts:60-76`). Neither ticket can express "assigned but declined/maybe" through it without changing the derivation, and `Item.status` is a called-out load-bearing invariant.
8. **Enum sequencing, currently unscheduled.** GTC-199 drops FROZEN/COMPLETE; D1 must retire `RsvpStatus.NOT_SURE`; GTC-178 deletes the forced conversion that is NOT_SURE's only nudge-path consumer — and would leave the guest-UI branch at `p/[token]/page.tsx:398-427` and the `rsvpFollowupSentAt` column as dead code. Three tickets, one enum, no ordering.
9. **A duplicate-row sweep of the report before any per-line correction.** L55/L83 decay together but would be corrected separately; L25/L106 restate mini-sends; L51/L112 restate the decide-by derivation.

---

## Method and limits

**Method.** 10 cluster agents, one per epic-group, each instructed to open the actual code rather than trust the report's citations, to search several spellings before ruling any absence ACCURATE, and to check whether each claim had propagated into an open ticket. The six high-priority clusters (C, D, E, F/H, G, X) then got an adversarial second pass instructed to overturn — prioritising ACCURATE rulings, since an ACCURATE that should be STALE is the most damaging error available here. A completeness critic then re-read the report against the audit scope to find unruled claims. 5 rulings were overturned; all overturns are marked inline.

**Weighting.** C/D/E were verified most carefully per the build-order brief; F/H, G and X got the same depth because their claims turned out to be load-bearing. H–K were a lighter pass — the J cluster's B1/B2-adjacent claims were checked properly because those had known movement under them.

**Known limits — do not read these as ACCURATE:**

- `npx prisma migrate status` was **not run** (not certifiably read-only in this context). X-6b rests on committed, dated, attributed evidence from GTC-171 and GTC-172 plus four migrations applied since — which is stronger here, but it is not a live check.
- **GTC-206** (`restoreFromRevision` nulling `PersonEvent.teamId`) — the delete-teams step and the absent `teamId` repoint were confirmed in code, but proving the resulting failure needs a running DB. Treated as a live risk, not a verified failure.
- Whether the residual `FROZEN`/`COMPLETE` enum values are still present **in the deployed database** (as opposed to `schema.prisma`) needs a `psql` check that was not run. GTC-199's own pre-flight query is the right instrument.
- The I, J and K clusters were a lighter pass by design. Where something looked load-bearing enough to deserve more, it is listed under "Deserves a deeper check".
- No agent was permitted to write. No code, ticket, skill or report file was modified in producing this document.

---
---

# Confirmation audit — 2026-08-04

> **Same snapshot rules apply.** Audited on 2026-08-04 against commit `06c3939`, branch `feat/moment-one-redesign`. Everything below is a statement about that commit.
>
> **Purpose:** Part One's own decision-driving findings were unverified "current code does X" claims — the exact class it warns against. This pass re-derived them independently from code, with an adversarial second pass instructed to break each conclusion. Nothing here cites Part One as evidence.
>
> **Read-only:** no code, ticket or skill file was modified. `npx prisma migrate status` was run (read-only, reports state without altering it). No mutating command was run.

## Verdicts

| Finding | Verdict | Safe to decide on? |
|---|---|---|
| **1 — GTC-176 (D3) "nothing to port"** | **REVISED** | Yes for re-scoping — but scope it **down**, not as greenfield |
| **2 — nudge cron dead on TNZ-only** | **REVISED (code half) · BLOCKED (prod half)** | Yes for the code fix. **No** for a prod incident — one command settles it |
| **3 — the 8 incidental defects** | **1 refuted, 2 revised, 5 confirmed** | Per-defect below |
| Bonus: `prisma migrate status` | **Clean — ran it** | Yes |
| Bonus: GTC-206 | **REVISED** | Yes for re-scoping — the ticket's fix cannot work as written |

**Headline:** the *mechanisms* in Part One survived. Several *characterisations* did not — and they were wrong in the direction that costs money: they made unbuilt work sound bigger and one healthy code path sound dead.

---

## Finding 1 — REVISED

### What holds (confirmed independently, six ways)

The deleted `frozen-edit` route **never sent anything to a released guest.** Re-derived without reference to Part One:

- Deletion commit established independently: `git branch --contains` and `git merge-base --is-ancestor` put `902093f` on this branch and `d0c484d` (experimental twin) only on `experiment/send-lock-ledger`. Parent blobs byte-identical. 499 lines.
- **(a) No carrier:** complete import list is `next/server`, `prisma`, `requireEventRole`, `logInviteEvent`. Zero hits for twilio/tnz/sendSms/sendEmail/nodemailer/resend/axios/`fetch(`.
- **(b) Helpers followed into their definitions:** `logInviteEvent` (`invite-events.ts:14-31`) is one `db.inviteEvent.create` in an error-swallowing try/catch. `requireEventRole` is `getUser()` + a `findFirst` + 401/403. Neither sends.
- **(c) No deferred execution:** no `setTimeout`/`waitUntil`/`after(`/queue.
- **(d) No hook layer:** `prisma.ts` at that commit is 9 lines, no `$use`/`$extends`; zero `CREATE TRIGGER`/`pg_notify` in any migration.
- **(e) No InviteEvent-driven dispatch:** `nudge-eligibility.ts`, `proxy-nudge-eligibility.ts` and `nudge-scheduler.ts` contain **zero** case-insensitive occurrences of "inviteevent". Nothing turns a log row into a send.
- **(f) No client follow-up:** `FrozenEditModal.tsx:126` is the only caller; `await response.json()` is discarded to no variable.

`handleReassign`'s "notify" branch wrote one `logInviteEvent` row and pushed an id onto `const notificationsSent: string[]` (line 127), returned as `notifications: { sent: [...], failed: [] }` with `failed` a hardcoded literal. **A log write named as a send.** The released person's `phoneNumber`/`contactMethod` were selected in the item query and then never read — the shape of an intended send that was never wired.

The docstring at `src/lib/ledger.ts:582-589` was quoted accurately in Part One and does assert *"This is the half of frozen-edit's handleReassign that was correct and is preserved here rather than reinvented later."* **That assertion is false** and should be corrected to say the *call site* is preserved.

Also confirmed on code alone: `FrozenEditModal.tsx:64` defaults a checkbox to `true` labelled *"Notify {name} that they've been unassigned"*, and line 362 promises editing will *"notify them to re-confirm."* Neither was ever delivered.

### What changed — and it changes the ticket size

**Part One said D3 is "greenfield SMS work in an opt-out zone." That was wrong, and it inflates the estimate.** A complete stack already exists and is directly reusable:

| Asset | Location | What it already does |
|---|---|---|
| `sendSms` | `src/lib/sms/send-sms.ts:45` | E.164 validation, per-host opt-out, TNZ/Twilio routing, success/failure logging |
| `sendNudgeEmail` | `src/lib/email.ts:31` | Resend-backed, returns `{success,error}` |
| Quiet hours | `nudge-sender.ts:115` | Gate pattern, ready to copy |
| Child gate | `child-exclusion.ts:65` | §10.6 allowlist |
| Household channel resolver | `channel.ts:46/62` | Cross-household capable |
| **Row-queue + cron dispatcher** | `wrap-up.ts:106/157` over `WrapUpLink` (`schema.prisma:1045-1066`) | Durable "queue from a request, send out-of-band", SMS→email fallback, failure recording |
| Household→adult re-routing | `proxy-nudge-eligibility.ts:68-113` → `proxy-nudge-sender.ts:39` | Resolves the channel PersonEvent, fails closed on CHILD |

**What D3 actually has to write:** one template function; a body for `ledger.ts:590`; **one** extra call site at `people/[personId]/route.ts:70` (the PUT team-change, where `PersonEvent` survives); and a person→household→channel lookup reusing the existing resolver. That is *wiring an existing carrier into a placed hook* — materially smaller than "greenfield SMS."

> Part One claimed **two** missing call sites. Only one is real. The other (`people/[personId]/route.ts:310`, person removal) deletes the recipient's `AccessToken`s at `:327` and their `PersonEvent` at `:332` in the same transaction — a release message there would carry a dead link to a non-participant. That is a product decision, not an omission.

### A refutation raised, then broken

The first re-derivation argued the deleted route *did* have a live path to a real SMS — not via InviteEvent but via the data it mutated: deleting an Assignment flips `hasResponded` false (`nudge-eligibility.ts:155`), qualifying the person for the 48h nudge.

**The adversarial pass broke it.** The route's own gate is `if (event.status !== 'FROZEN') return 400`. At the deletion commit **nothing in `src` can write FROZEN** — the only event-status write is `'CONFIRMING'` at `workflow.ts:698`, and `transition/route.ts:81` carries the tombstone recording that GTC-169 deleted the FROZEN branches. Decisively: **commit `30333e6` deleted the FROZEN writer in the same commit that opened the nudge filter from `status: 'CONFIRMING'` to `SENT_AND_LIVE`.** Before it, a frozen event's members were never loaded as candidates; after it, no app code could create a frozen event. The two halves never coexisted for any event the app could produce. Residual exposure is a legacy pre-2026-08-03 `FROZEN` row with a future `endDate` — a database question, not a code one.

### A genuinely new finding, and it argues *for* building D3

**Releasing someone can make them eligible for the wrong message.** `nudge-eligibility.ts:177-179` computes `hasResponded` from *remaining* assignments; the 48h gate at `:207-213` is `anchorAt <= 48h ago && !hasResponded && !nudge48hSentAt`. Because `nudge48hSentAt` is stamped only on success (`nudge-sender.ts:77`), anyone still unstamped past 48h must have had `hasResponded` true throughout — **so the exposed population is exactly "accepted, then released": D3's entire target audience.** They receive *"Reminder: {host} needs your response for {event}"* (`nudge-templates.ts:42`) — the opposite of D3's intended "all good, the pavlova's covered."

And it is not only the 15-minute cron: `src/app/api/events/[id]/trigger-nudges/route.ts:31` calls `processNudges` directly from a host-authenticated POST, so a host can fire it on demand seconds after reassigning. (Part One's inventory of outbound entry points missed this route.)

### Decision safety

✅ **Safe: re-scope GTC-176 down.** Not greenfield — wiring.
✅ **Safe: correct `ledger.ts:587-588`.** It credits a send that never happened.
❌ **Not safe: a production investigation on "guests are told nothing when released."** That is an unbuilt feature, not a defect — no send path is reachable from any release, so an investigation finds nothing.
⚠️ **Worth one production check** — the *opposite* risk: released guests receiving the 48h "we still need your response" nudge. Query in the "what I need you to check" section.

---

## Finding 2 — REVISED (code half) · BLOCKED (production half)

### The mechanism is real, and worse than stated

Confirmed independently and sharpened:

- **The gate** is `src/lib/sms/nudge-scheduler.ts:50` `if (!isSmsEnabled())`. `isSmsEnabled` (`twilio-client.ts:23-25`) returns a **module-scope credential-presence boolean** computed once at `:9` from the three `TWILIO_*` vars. It knows nothing about TNZ.
- **Blast radius is total, not partial.** The `try` block starts at `:60`, so the early return at `:51-57` skips `findNudgeCandidates` (`:62`), `processNudges` (`:65`), `findRsvpFollowupCandidates` (`:76`), `processRsvpFollowupNudges` (`:79`), `findProxyNudgeCandidates` (`:90`), `processProxyNudges` (`:93`). **All three nudge families die together, before any query runs.**
- **It fails silently.** `cron/nudges/route.ts:29` returns `{ success: true, ...result }` → HTTP 200 with `smsEnabled: false`. Monitoring on status code or `success` sees a healthy cron.
- **The blocker is in the caller, not the sender.** `send-sms.ts:98-105` checks `isTnzEnabled()` for a `+64`/`+61` destination and **never calls `isSmsEnabled()`**. `sendSms` would dispatch to TNZ with Twilio entirely unconfigured.

**Sharper than Part One:** it is not one call site but **three** — `nudge-scheduler.ts:50`, `trigger-nudges/route.ts:24`, and `people/[personId]/nudge/route.ts:101`. And the adversarial pass established something stronger: eligibility itself already forces `+64` (`nudge-eligibility.ts:164` and `:315`, `proxy-nudge-eligibility.ts:103`, via `isValidNZNumber` = `/^\+64\d{8,10}$/`). **So `send-sms.ts:107`'s Twilio branch is structurally unreachable from any nudge path — these three checks guard a provider no nudge can ever use.**

That changes the fix: **delete the caller-side `isSmsEnabled()` checks and let `send-sms.ts:98-117` own provider selection.** Widening them to `isSmsEnabled() || isTnzEnabled()` would leave a subtler wrong answer in place.

Provenance: the gate is original to the feature (`b3841a0`, 2026-01-23); TNZ routing arrived 2.5 months later (`01962a9`, 2026-04-09), and `git show --name-only 01962a9` touches only the constants doc, the ticket, `send-sms.ts`, `tnz-client.ts` and a test — **the callers were never revisited.** A classic stale guard after a provider split.

### Where Part One overstated

**"A TNZ-only deployment sends nothing" is too broad.** The wrap-up cron is **not** Twilio-gated — `wrap-up.ts:209-216` calls `sendSms` directly, reached from `cron/wrap-up-dispatch/route.ts:21`, with no `isSmsEnabled` anywhere in either file. (Caveat: *not gated* is provable from code; *actually sending* also needs `WrapUpLink` rows and an E.164 `guestPhone` — `wrap-up.ts:116` falls back to the unnormalised `phone` column, which `send-sms.ts:50` would reject.)

**And the premise was never verified.** The only environment readable from here is the **opposite** configuration: `.env` has all three `TWILIO_*` present and non-empty and **no `TNZ_AUTH_TOKEN` at all**. In that state `isSmsEnabled()` is true, the cron runs to completion, and `+64` sends fail one layer deeper at `send-sms.ts:99` with *"TNZ not configured"* — a **different failure with a different signature**. The two states are distinguishable from the cron's own JSON output.

One provable local consequence, needing no dashboard: **`grep -c TNZ .env` = 0, so every `+64`/`+61` SMS on this machine returns `blocked:'SMS_DISABLED'`.** Any local QA of NZ nudges has been silently non-sending.

### Deployment config — UNPROVABLE HERE

There is no committed production env manifest and **no host config file of any kind** (`find` for railway.*/nixpacks/Dockerfile/Procfile/fly.toml/netlify.toml at depth 3 → zero). What the repo does show:

- **The deployment target is Railway, not Vercel.** `.env.example:2` (tracked): *"For Railway deployment, this is set as an environment variable"*; `package.json:55` `"railway:setup"`; the Railway production hostname in four docs. `docs/launch-readiness-section-9-infrastructure-VERIFIED.md:168` says *"Platform: Vercel"* and contradicts `docs/SYSTEM_OVERVIEW.md:275` (*Railway*) — treat the "VERIFIED" doc's infrastructure section as wrong.
- **The live cron is cron-job.org, not Vercel Cron** (`docs/tickets/GTC-042.md:76-79`). Railway does not read `vercel.json`, so **`vercel.json`'s cron block is probably inert** — do not reason "the crons are deployed because vercel.json declares them."
- **`TNZ_AUTH_TOKEN` is documented but not templated.** `GATHER-BUILD-CONSTANTS.md:210` lists it as *"Required for production NZ delivery (Twilio does not deliver to NZ)"*, and `:197`/`:216` declare all unmarked vars required and name `.env.example` as the template — but `.env.example` (55 lines; Twilio block at `:38-44`) never mentions TNZ. **Two tracked files contradict each other.**
- **`docs/tickets/GTC-079.md` contradicts itself**: `:79` says prod TNZ wiring was out of scope; `:128-133` claims a live send proved *"TNZ_AUTH_TOKEN confirmed present in the linked Railway environment."* That evidence used `railway run`, which injects the linked environment's variables into a **local** process — it does not prove the deployed service has it. It is ~4 months old either way.
- **Separate exposure, same command answers it:** `cron/nudges/route.ts:21` and `wrap-up-dispatch/route.ts:15` both guard with `if (CRON_SECRET && providedSecret !== CRON_SECRET)`. **If `CRON_SECRET` is unset in production, both cron endpoints are open to anonymous GET.**

### Decision safety

✅ **Safe: the code fix**, scoped to all three call sites plus `.env.example`, and stop returning `success: true` when `smsEnabled` is false.
❌ **Not safe: a production incident narrative.** It asserts an env state nobody has observed, and the one readable env is the opposite. **This is the finding I am stopping on** — see below.

---

## Finding 3 — the eight defects, ruled independently

| # | Defect | Ruling | Note |
|---|---|---|---|
| **1** | Wrap-up double-send | **CONFIRMED** | Both passes. See below. |
| **2** | Nudge cron mute on TNZ-only | **REVISED** | Finding 2 above. |
| **3a** | Quiet-hours deferral arithmetic wrong by server-TZ offset | **CONFIRMED — but LOW severity** | Re-derived numerically: at `2026-08-04T10:30Z`, `TZ=UTC` → 1295 min vs correct 575 (+720 error); `TZ=Pacific/Auckland` → 575, correct. **But every consumer of `deferredMinutes`/`deferredUntilMinutes` is a log or response field** — the send/skip decision is the boolean `isQuietHours()`, which is correct in any timezone. **No message is sent at the wrong time because of this.** Part One implied otherwise. The dev machine resolves to `Pacific/Auckland`, where the error is exactly zero — which is why it was never noticed, and why any regression test **must pin `TZ`** or it passes vacuously. |
| **3b** | Wrap-up path has no quiet-hours guard | **CONFIRMED — MEDIUM-HIGH** | Only two importers of quiet-hours exist (`nudge-sender.ts:4`, `proxy-nudge-sender.ts:3`). `wrap-up.ts` has zero hits for `Auckland`/`getHours`/`quiet`; `DISPATCH_DELAY_MINUTES = 10` is an age filter, not a time-of-day window; the cron runs `*/10` 24h/day. **A host confirming wrap-up at 23:00 NZ texts every guest ~23:10.** This is a real wrong-send and it, not 3a, is what would justify an investigation. |
| **3c** | Dead code in `quiet-hours.ts` | **CONFIRMED — LOW** | `isTimeInQuietHours` (`:61-70`) has zero callers; `getNextSendTime` is exported with no external caller. Matters as a trap: `isTimeInQuietHours` is exactly what a "add quiet hours to wrap-up" fix would reach for. |
| **4** | Release-notification regression window | **CONFIRMED** | Finding 1. |
| **5** | V1 PDF export leaks TASK rows | **REVISED — LOW** | Tasks do reach the printed sheet (`items` state ← `/api/events/[id]/items`, which has no `kind` filter). **But they are not "interleaved into food-category tables"** — each bucket gets its own Team (`tasks.ts:32-34`), and the PDF groups by `team.name`, so the sheet gains three self-describing sections ("Set up" / "Other jobs" / "Clean up") with `—` quantities. Reads as extra content, not wrong content. **And it is not PDF-specific:** the same unfiltered array drives the on-screen V1 accordion. |
| **6** | `suggest-resolution` prints `dietaryVegan` twice | **CONFIRMED — LOW-MEDIUM** | `route.ts:158` verbatim. Correct field is `dietaryVegetarian` (`schema.prisma:30`). It reaches an **AI prompt** (`callClaudeForJSON`, `:102`), not user copy — so vegetarian headcount is invisible to the model and vegan is double-weighted. AI resolutions can under-cater vegetarians. |
| **7** | `detectConflicts` unreachable / dead | **❌ NOT REPRODUCED — REFUTED** | **Part One was wrong.** Two live callers exist, both verified by me directly: `page.tsx:975` (`handleCheckPlan`, wired to the UI at `:2853`) and `:1007` (`autoRecheck`, invoked from seven sites). Part One's grep missed them because the URL is a template string. **Any decision premised on "conflict detection is dead" should be reversed.** |
| **8** | Channel picker excludes the household's own adults | **CONFIRMED — narrowed** | `Moment1InputForm.tsx:927-933`; I read the whole `<select>` — no concat, no optgroup re-adding them. **Two narrowings:** it is **edit-path only** (`editingHousehold` is null when adding, so the filter is a no-op), and the **primary contact is still offered** via the `value=""` default — so it is the household's *non-primary* adults that are unreachable. The server disagrees with the UI: `channel.ts:62-80` does not reject a same-household target. Pure client-side over-filter, one-line fix, genuine §10.7 contradiction. |

### The wrap-up double-send — CONFIRMED, and a breaker was tested and killed

No guard exists at any of the four candidate layers:

1. **Route** (`wrap-up/route.ts`): complete guard list is `requireEventRole(['HOST'])` (`:20`), 404 (`:48`), `if (!isComplete(event))` → 400 (`:61-66`). `isComplete` is `now > endDate` — **permanently true once past.** `:86-91` writes `wrappedAt` unconditionally, no `where: { wrappedAt: null }`.
2. **Generator**: `wrap-up.ts:131` is a bare `create`, no upsert, no existence check.
3. **Database**: `WrapUpLink` (`schema.prisma:1045-1066`) has `token @unique` only; the three `@@index` are non-unique; no composite on `(eventId, personId)`. Migration agrees; no later migration touches the table. Tokens are fresh 192-bit random per call, so the token index never fires.
4. **Dispatcher**: where-clause is `{ dispatched: false, createdAt: { lte: cutoff } }` — no distinct, no groupBy. `:182` iterates **rows, not people**. Two rows = two sends, 500ms apart.

**The one thing that could have broken this was tested.** `AuditEntry` carries `@@unique([eventId, sequence])`, and `generateWrapUpLinks` sits *outside* the route's transaction (`:108`) — so a constraint violation on the second `WRAP_UP_SENT` insert would have rolled back and prevented duplicates entirely. It does not fire: `logAudit` (`workflow.ts:387-397`) never sets `sequence`, the index SQL has no `NULLS NOT DISTINCT`, and Postgres treats NULLs as distinct. Unlimited NULL-sequence rows coexist. **The conclusion survives a genuine attempt to kill it.**

**Two corrections to Part One that change the fix cost:**

- **`wrappedAt` IS serialised to the client.** `events/[id]/route.ts:26-51` uses `include` with no top-level `select`, `prisma.ts` applies no `omit`/`$extends`, and `wrappedAt` is an Event scalar — so `page.tsx:698` `setEvent(data.event)` already has it in client state, unused. **The UI gate is free today**; Part One said the field wasn't available. A grep-only absence check could not see this because the field is never named in the route.
- **`AuditLog` is not a table.** The model is `AuditEntry` (`schema.prisma:439`); `auditLog` is only a relation-field name. Part One's settling query errors as written. Corrected below.

**Reproduction is narrower than Part One implied:** within one page load the second press *is* blocked (`disabled={wrapUpLoading}`, and `!wrapUpResult?.success` hides the button). **The double-send needs a reload, a second tab, or a direct POST** — a reload/multi-tab hazard, not a double-click hazard.

**Corrected fix scoping** (cheaper than Part One said): (a) route guard is a one-liner mirroring the already-shipped pattern at `confirm-invites-sent/route.ts:51-53` — no migration; (b) the UI gate is free — no API change; (c) a `@@unique([eventId, personId])` migration is still warranted as the race backstop, **but it will fail to apply if duplicates already exist**, so run the count query first and plan a cleanup. Also fix `wrap-up/route.ts:4`, whose comment claims this route is already once-only.

---

## The two checks Part One skipped

**`prisma migrate status` — RAN IT. Clean.**

```
33 migrations found in prisma/migrations
Database schema is up to date!
```

No drift, no reset prompt, against `gather_dev` at localhost:5432. **The P3005 warning at `GATHER-BUILD-CONSTANTS.md:108-112` is confirmed stale by live check**, not just by inference from GTC-171/172. The file has not been touched since `9eb6069`.

**GTC-206 — REVISED. The mechanism is real; the ticket's fix cannot work.**

Provable from code: `workflow.ts:942` `tx.team.deleteMany({ where: { eventId } })`; `schema.prisma:195` `onDelete: SetNull` — a real Postgres action, confirmed in the migration DDL, not Prisma emulation; teams recreated with fresh cuids at `:978`; and **zero occurrences of "personevent" in the entire `workflow.ts`**, so nothing repoints. The route does nothing after the call.

**Where the ticket is wrong** — it says `teamIdMap` means "the data needed to remap memberships is already in hand":

1. **The snapshot has no members.** `createRevision`'s capture (`workflow.ts:809-822`) includes coordinator and items but **not** `members`, though the relation exists (`schema.prisma:122`).
2. **The live values are already destroyed.** `teamIdMap` is populated at `:991`, **49 lines after** the delete at `:942` that nulled them.
3. **The key is wrong.** `teamIdMap` is keyed by *snapshot* team ids; a pre-delete `PersonEvent.teamId` points at *current* ids. After any prior restore they diverge and the remap silently drops every membership.

**Worse, and unfiled:** the "Checkpoint before restore" at `:919` uses the same members-less capture, so the comment at `:917` — *"nothing is lost by moving forward"* — **is untrue for team membership.** The loss is not undoable by restoring the checkpoint. **The root cause is `createRevision`, not `restoreFromRevision`** — it cannot restore what was never recorded. Scope must include both. (Also: assignments *are* restored while memberships are not, producing a state the assign gate at `:77` would itself reject.)

**What remains unprovable without a live DB:** that a real restore actually leaves zero non-null `teamId` (the DDL and code path are unambiguous, but **no test has ever executed this** — `grep teamId tests/security-validation.ts` returns nothing); and whether any user hits the 400, which is data-dependent. Repro requires a **scratch database** — it mutates data.

---

## Corrections to Part One

Stated plainly, because these change decisions:

1. **"D3 is greenfield SMS work"** → wrong. It is wiring an existing carrier into a placed hook. Ticket should shrink.
2. **"`detectConflicts` may be unreachable"** → wrong. Two live callers, one behind a visible button. Verified directly.
3. **"The nudge cron sends nothing on a TNZ-only deploy"** → mechanism right, scope overstated. Wrap-up is ungated; and no one has established that any deployment *is* TNZ-only.
4. **"The V1 PDF interleaves tasks into food tables"** → they form their own sections; and the same leak is already on screen.
5. **Quiet-hours severity** → the arithmetic bug is a log-field defect, not a wrong-send. The *unguarded wrap-up path* is the real one.
6. **"`wrappedAt` is never serialised to the client"** → it is; the UI fix is free.
7. **Two missing `onAssignmentReleased` call sites** → one.
8. Part One's inventory of outbound entry points **missed `trigger-nudges/route.ts`**.

Part One's citations were otherwise accurate — roughly twenty were re-checked line-by-line during this pass and only the ones above were wrong.

---

## What I need you to check — Finding 2's production half

**I stopped here rather than guess.** This is the one question that cannot be settled from the repo, and it swings the ticket between **P0 incident** and **P2 hygiene**.

**One command:**

```bash
railway variables --environment production --kv | grep -E 'TNZ_AUTH_TOKEN|TWILIO_|CRON_SECRET'
```

Reading the result:

- **`TNZ_AUTH_TOKEN` present** → Finding 2 is **latent** in production (still live on every dev machine). P2.
- **`TNZ_AUTH_TOKEN` absent** → **all NZ/AU SMS is dead in production.** P0.
- **`CRON_SECRET` absent** → both cron endpoints are open to anonymous GET (`cron/nudges/route.ts:21`). Arguably more urgent than the SMS question, and the same command answers it.
- Also note the Railway service's **last deploy timestamp** versus when any variable was added — `twilio-client.ts:4-6` and `tnz-client.ts:14` read env at **module load**, so a variable added without a redeploy has no effect.

**Non-destructive alternative that discriminates the two failure modes directly:**

```bash
curl -s "https://gather-prototype-production.up.railway.app/api/cron/nudges?secret=$CRON_SECRET" | jq '{smsEnabled, errors, candidates}'
```

`smsEnabled:false` + `errors:["SMS not configured"]` can only come from `nudge-scheduler.ts:51-57` (Twilio vars missing). `smsEnabled:true` with `"TNZ not configured (TNZ_AUTH_TOKEN missing)"` proves the opposite state.

### Optional production queries, all read-only

```sql
-- Has anything ever actually sent, and via which provider?
SELECT type, metadata->>'provider' AS provider, metadata->>'type' AS kind, count(*)
FROM "InviteEvent"
WHERE type IN ('NUDGE_SENT_AUTO','SMS_SEND_FAILED','PROXY_NUDGE_SENT')
GROUP BY 1,2,3;

-- Wrap-up: did any host press twice?  (table is AuditEntry, not AuditLog)
SELECT "eventId", COUNT(*) FROM "AuditEntry"
WHERE "actionType" = 'WRAP_UP_SENT' GROUP BY 1 HAVING COUNT(*) > 1;

-- Wrap-up: duplicate links?  Run BEFORE writing any @@unique migration.
SELECT "eventId","personId",COUNT(*) FROM "WrapUpLink"
GROUP BY 1,2 HAVING COUNT(*) > 1;

-- Did any thank-you actually land inside quiet hours?  (defect 3b)
SELECT "createdAt", metadata FROM "InviteEvent"
WHERE type IN ('WRAPUP_MESSAGE_SENT','WRAPUP_MESSAGE_FAILED')
  AND (EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Pacific/Auckland') >= 21
    OR EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Pacific/Auckland') < 8);

-- Has GTC-206 claimed a real victim?
SELECT "eventId","createdAt" FROM "AuditEntry" WHERE "actionType" = 'RESTORE_REVISION';
-- then, per eventId:
SELECT count(*) FILTER (WHERE "teamId" IS NOT NULL) AS on_a_team, count(*) AS total
FROM "PersonEvent" WHERE "eventId" = '<id>';
```

Zero rows on the `RESTORE_REVISION` query closes GTC-206 as latent.

## Method and limits (confirmation pass)

8 independent re-derivations, each forbidden from citing Part One and required to search multiple spellings before asserting any absence; the five decision-driving ones then got an adversarial pass instructed to break them. **That pass earned its keep** — it overturned the FROZEN-reachability refutation, killed the `AuditEntry` breaker on the wrap-up finding, caught a **fabricated line citation** (`.env.example:69-79`, in a 55-line file — excluded above; the real block is `:38-44`), and caught the false "`wrappedAt` isn't serialised" claim that a grep-only check had produced.

Nothing here was verified against a running database or the deployed environment except `prisma migrate status`, which was run locally against `gather_dev`.
