# Send-Lock Reconciliation Plan (Epic A1)

**Ticket:** [[GTC-167]] | **Status:** Plan of record | **Mode:** Plan mode, max effort | **Date:** 2026-08-03

**What this is.** The written plan `gather-moment-4-spec-v1.md` §7 called for when it said the
CONFIRMING→FROZEN transition "must be treated as a state-machine change (Plan mode, max effort,
review step)." It decides how `EventStatus.FROZEN` and `EventStatus.COMPLETE` are disposed of, what
replaces them, how the ledger and versions are stored, when a change owes a why, and in what order
the consumers migrate. [[GTC-168]] (A2) and [[GTC-169]] (A3) execute it.

**Authority order.** `docs/03_specs/gather-moment-4-spec-v1.md` and
`docs/03_specs/gather-hinge-spec-v1.md` first; then the discovery report
(`moment4-hinge-discovery-report.md`); then code inference. Where the
`gather-architecture-contract` skill's §5 describes freeze as "deliberate and final," that is the
accurate FROM state, not a constraint on the TO state.

**No code, schema, or migration file was modified by this ticket.** All repo facts below were
verified by reading the working tree on branch `feat/moment-one-redesign` at commit `898e729`.
Preflight was not run: this ticket produces a document and touches nothing the preflight gates.

---

## 0. Read this first — three findings that reframe the problem

### 0.1 The send already exists in the code, and it is not `frozenAt`

`Event.inviteSendConfirmedAt` is set by `POST /api/events/[id]/confirm-invites-sent` and
`POST /api/h/[token]/confirm-invites-sent`, both of which **require `status === 'CONFIRMING'`**. It
is what anchors the nudge machinery (`Person.inviteAnchorAt` is copied from it in five places:
`people/route.ts:130`, `people/batch-import/route.ts:122`, `households/route.ts:144`,
`households/[householdId]/route.ts:160`, `reconcileMembers.ts:170`).

So today's lifecycle is:

```
DRAFT ──▶ CONFIRMING ──[invites go out]──▶ CONFIRMING ──▶ FROZEN ──▶ COMPLETE
                        ^^^ the real send                  ^^^ a second, later ceremony
```

The send is already in the codebase, under a different name, in the right place — **before** the
lock. FROZEN is a *second* threshold bolted on afterwards, and it is the thing with no counterpart
in the ruled model. That reframes question 1: this is not "invent a send and delete FROZEN," it is
"promote the send that already exists and delete the redundant ceremony that follows it."

**Consequence for A2:** `Event.sentAt` is a *rename with backfill* of `inviteSendConfirmedAt`, not a
new field. Historical events get real, correct values for free.

### 0.2 Freezing currently *stops* the nudges — exactly backwards

`src/lib/sms/nudge-eligibility.ts:62,71,237` and `src/lib/sms/proxy-nudge-eligibility.ts:38` all
filter `event: { status: 'CONFIRMING' }`. Under today's model, the moment a host freezes, every
nudge for that event stops firing. Under the ruled model, the send is precisely when the chasing
*starts* (Moment 4 §4, Hinge §6: *"I'll tell you the moment anything comes back"*).

These four sites are **not in the discovery report's consumer map** and are the single most
spec-contradicting behaviour in the whole surface. They are A3's, not E1's — E1 rebuilds the
*cadence*; A3 fixes the *predicate* that decides whether the cadence runs at all.

### 0.3 The consumer map is roughly twice the size the discovery report states

The report says "~30 call sites." Measured on the working tree:

| Measure | Count |
|---|---|
| Non-comment `FROZEN` occurrences in `src/` + `schema.prisma` | **85** (in 26 files) |
| Files containing `FROZEN` | **26** |
| `requireNotFrozen` call sites | **7** (in 4 route files) |
| `canMutate` call sites | **5** (in 3 route files) |
| `status: 'CONFIRMING'` filters in nudge eligibility | **4** |
| Mutation routes that will need ledger wiring (superset of the above) | **25** |

The report's "~30" counted decision sites in the *gating* map. The real A3 surface is the gating map
**plus** every mutation route that must now write to the ledger. This is the main reason A3 must be
split (§3.4).

---

## 1. The target model, on one page

### 1.1 Four phases, two stored facts, one derived predicate

| Phase | How it is known | What it means |
|---|---|---|
| `DRAFT` | `status = DRAFT` | Plan being built (Moments 1–2). Authored transition. |
| `CONFIRMING` | `status = CONFIRMING` and `sentAt IS NULL` | Plan built, tokens issued, structure locked; the pre-flight lives here (Moment 3). Authored transition. |
| `SENT` | `sentAt IS NOT NULL` and `now <= endDate` | The Hinge has been crossed. Ledger live, nudges live, mini-sends live (Moment 4). **Not authored — stamped by the press.** |
| `COMPLETE` | `now > endDate` | Event past. Nudges dead, thank-you offer available, cloneable. **Not authored — the calendar does it.** |

`EventStatus` retains exactly two values that a human ever chooses: `DRAFT` and `CONFIRMING`.
`FROZEN` and `COMPLETE` stop being *authored states* and become, respectively, a timestamp and a
calendar predicate.

### 1.2 The canonical predicate module

A2 adds one module — `src/lib/lifecycle.ts` — and every consumer reads it. Nothing else in the
codebase may compare `event.status` to `'FROZEN'` or `'COMPLETE'` after A3.

```ts
// Shape only — A2 writes the real thing.
export type EventPhase = 'DRAFT' | 'CONFIRMING' | 'SENT' | 'COMPLETE';

export function isSent(event, now = new Date()): boolean;      // sentAt != null
export function isComplete(event, now = new Date()): boolean;  // now > endDate
export function getEventPhase(event, now = new Date()): EventPhase;

// Prisma-level equivalents so cron/eligibility queries filter in SQL, not in JS:
export const SENT_AND_LIVE = (now) => ({ sentAt: { not: null }, endDate: { gt: now } });
export const COMPLETE_WHERE = (now) => ({ endDate: { lte: now } });
```

Why one module and not scattered helpers: this is the `GTC-136` house lesson (one canonical source
for a computed fact) applied to lifecycle. It is also what makes the rollback story in §8 cheap — the
compatibility shim lives in exactly one function.

### 1.3 What the lock is, mechanically

The lock is **not a gate**. After the send:

- Every mutation is **allowed**, for every actor the ordinary role checks already permit.
- Every mutation writes **one ledger entry per changed field**, grouped by request.
- A mutation that **touches someone** (§5) additionally carries a **reason**.
- Nothing returns 403 or 400 because the plan is sent. `requireNotFrozen` ceases to exist.

Moment 4 §7 is the constraint: *"The product never contests the host at any threshold… The fact is
welcome; the challenge is forbidden."*

---

## 2. Question 1 — Disposition of `EventStatus.FROZEN`

### Recommendation: **collapse into `Event.sentAt`; retire the enum value (in a later, separate ticket).**

Three options were on the table. Taking them in turn:

**(a) Retain FROZEN as a renamed enum value (`SENT`).** Rejected. It keeps sent-ness as an authored
*state*, which reintroduces the ceremony the spec dissolved, and it loses the timestamp — but every
downstream consumer in the ruled model needs the timestamp, not the flag: nudge cadence runs from it
(Hinge §2), red-by-time is derived from it (§10.2), mini-sends compare against it (§7 below), and the
ledger anchors to it (Moment 4 §7: *"The audit trail starts at the send"*). A boolean state would
force a parallel timestamp field anyway, giving two sources of truth for one fact.

**(b) Keep FROZEN for historical read-compatibility.** Rejected as a *permanent* answer, adopted as a
*transitional* one — see §8. Retaining it forever means every consumer keeps a two-branch read
(`status === 'FROZEN' || sentAt != null`), which is precisely the `event.setup`-truthiness pattern
already listed as weak point #5 in `gather-architecture-contract` §10. One backfill removes the need.

**(c) Collapse into `Event.sentAt: DateTime?`.** **Adopted.** It is the only option that matches what
the ruled model actually asks of the field, and finding 0.1 shows the field already exists under
another name.

### Concretely

| Change | Detail |
|---|---|
| `Event.inviteSendConfirmedAt` → `Event.sentAt` | Rename with column-level backfill. Semantics shift from "host confirmed *they* sent invites" to "the press happened" — a widening, not a contradiction: in both cases the asks are in the world. |
| `Event.frozenAt` | **Retained, unwritten.** Historical evidence of the old ceremony. No new code reads it. Dropped by the enum-cleanup ticket (§8.4). |
| `Event.complianceAtFreeze`, `Event.freezeReason` | Same: retained, unwritten, dropped later. Both are artefacts of a threshold that no longer exists. |
| `EventStatus.FROZEN` | Retained in the enum through all of Epic A, **never written** after A3a. Dropped later (§8.4). |
| `canTransition` | Shrinks to `{ DRAFT: ['CONFIRMING'], CONFIRMING: [] }`. Every other edge disappears with FROZEN and COMPLETE. |
| `checkFreezeReadiness` | **Survives, renamed `checkSendReadiness`, repurposed.** Its warnings (`UNASSIGNED_ITEMS`, `LOW_COMPLIANCE`, `CRITICAL_GAPS`) are exactly the Hinge §1 pre-flight's "hunt for absence." `canFreeze: true` was always a no-op field; it goes. The `<80% compliance requires a freezeReason` rule **is deleted** — it is a demand for justification at a threshold, forbidden by Moment 4 §7. |
| `requireNotFrozen` | **Deleted.** See §3.3 and the stop in §12.1. |

### What about `EventStatus` being down to two values?

Not worth collapsing further. `DRAFT → CONFIRMING` is real, load-bearing work that neither spec
touches: `transitionToConfirming` (`workflow.ts:625`) runs the gate check, creates the `PlanSnapshot`,
sets `structureMode: 'LOCKED'`, and generates the `AccessToken` rows the send later uses. Turning it
into a `confirmedAt` timestamp for symmetry would add every `DRAFT`/`CONFIRMING` branch in the
codebase to A3's diff for zero product gain. Keep the enum; keep the two values.

---

## 3. Question 2 — Disposition of `COMPLETE`

### Recommendation: **derived at read time from `endDate`; never written; a cron sweep reacts to it but does not set it.**

Moment 4 §10.1: *"no one declares it. The calendar does the transition, silently: the event date
passing IS the state change."*

### 3.1 Where the check runs

**Read-time derivation is the authority.** `isComplete(event, now) === now > event.endDate`.

Rejected: a cron sweep that writes `status = 'COMPLETE'`. The failure mode is decisive — if the cron
is down for twenty minutes past an event's end, the sweep-written model says the event is still live,
and a nudge fires after the event. §10.1 says *"nudges must never fire after it."* A derived predicate
makes that class of bug structurally impossible; a materialised one merely makes it unlikely. There is
no performance argument on the other side: `endDate: { lte: now }` is a plain indexed comparison in
the same `WHERE` clause the queries already have.

**A sweep is still needed, for edge-triggered effects only.** Some things must *happen once* at the
boundary rather than *be true* after it — chiefly the thank-you offer (§10.4: "offered, once… a day or
two after the date passes"). The existing `/api/cron/wrap-up-dispatch` (every 10 min, `vercel.json`)
is the natural host. The rule for A2/A3 is one line: **the sweep may create work; it may never set the
phase.** Building the offer itself is [[GTC-186]] (H1), not Epic A.

`Event.wrappedAt` survives with a narrowed meaning: "the thank-you was actioned," not "the event
completed."

### 3.2 How `wrap-up` migrates

`src/app/api/events/[id]/wrap-up/route.ts` today: requires `status === 'FROZEN'` (line 50), warns
when `endDate` has not passed and offers a `confirmEarly` bypass (lines 56–68), then **sets
`status: 'COMPLETE'`** (line 90).

After A3:

1. `status !== 'FROZEN'` → `!isComplete(event)` → 400. The gate moves from a state the host declared
   to a fact about the calendar.
2. The `confirmEarly` bypass is **deleted**. You cannot wrap up an event that has not happened, because
   COMPLETE is not a decision anyone gets to make early. This removes a branch, not a capability.
3. The route stops writing `status`. It writes `wrappedAt` only, and its audit entry changes from
   `TRANSITION_TO_COMPLETE` to `WRAP_UP_SENT`.

Note this is a *narrowing* of what the host can do, and it is the one place in this plan where that
happens. It is not a hard-block in the Moment 4 §7 sense: §7 forbids the product contesting the host's
judgement, and the calendar is not a judgement.

### 3.3 The other COMPLETE consumer

`requireNotFrozen` also blocks on `COMPLETE` (`guards.ts:147`). When it is deleted, that block goes
with it. Is that right? `canMutate` returns `false` for COMPLETE (`workflow.ts:253`), and Moment 4
says nothing about editing a past event.

**Decision: COMPLETE stops blocking mutations too.** Reasoning: §8.8 rules that the day's corrections
are captured on paper and *"resolve[d] in the system later, when she has it straight in her head"* —
which requires the system to accept edits after the event. A hard block on a past event would make the
ruled paper-then-system workflow impossible. Ledger entries continue; the why-scope rule continues to
apply (a post-event reassignment still touches someone, though nothing will be sent to them — §5.4).

---

## 4. Question 3 — The consumer migration sequence

### 4.1 Sequencing principle

**Additive first, flip second, delete last.** Every ticket in the sequence must be revertible by
`git revert` alone, with no down-migration and no data loss (§8).

### 4.2 The full inventory, by surface

Verified counts. "Sites" = distinct decision points, not raw string occurrences.

#### Layer 0 — Predicate + ledger foundation ([[GTC-168]] / A2, additive only)

| Item | Detail |
|---|---|
| `src/lib/lifecycle.ts` | New. §1.2. Nothing consumes it yet. |
| `Event.sentAt` | Rename of `inviteSendConfirmedAt` + backfill (§8.2). |
| `PersonEvent.sentAt` | Relocation of `Person.inviteAnchorAt` (§7). |
| `AuditEntry` extension | `reason`, `changeSetId`, `sequence`, `before`, `after`, `actorKind`, nullable `actorId` (§6). |
| `recordChange()` helper | New. The single write path for the ledger. |
| `PlanRevision` | GET cap 5 → uncapped + pagination (§6.4). |
| Compat shim | `isSent()` reads `sentAt != null || status === 'FROZEN'` for the duration of Epic A. |

#### Layer 1 — Server gating (A3a; **security-relevant, smallest diff, highest risk**)

| File | Sites | Change |
|---|---|---|
| `src/lib/workflow.ts` | 4 | `canTransition` shrinks to one edge; `canMutate` loses its FROZEN/COMPLETE denials and its dead critical-delete branch (§4.5); `checkFreezeReadiness` → `checkSendReadiness`. |
| `src/lib/auth/guards.ts` | 2 | `requireNotFrozen` **deleted**. ⚠ Rewrites four security-suite assertions — see §12.1. |
| `src/lib/sms/nudge-eligibility.ts` | 3 | `status: 'CONFIRMING'` → `SENT_AND_LIVE(now)`. ⚠ Zone-7-adjacent — see §4.6. |
| `src/lib/sms/proxy-nudge-eligibility.ts` | 1 | Same. |
| `api/c/[token]/items/route.ts` | 2 | `requireNotFrozen` + `canMutate` removed. |
| `api/c/[token]/items/[itemId]/route.ts` | 4 | Same, PATCH + DELETE. |
| `api/c/[token]/items/[itemId]/assign/route.ts` | 4 | Same, POST + DELETE. |
| `api/events/[id]/items/[itemId]/assign/route.ts` | 2 | `requireNotFrozen(event, isHost)` removed. |
| `api/p/[token]/ack/[assignmentId]/route.ts` | 1 | **Inverts.** Today 400s with *"Plan is frozen — responses are locked"*; post-send responding is the entire point of Moment 4 (§7: *"they are the plan being answered"*). |
| `api/join/[token]/claim/route.ts` | 1 | `CONFIRMING \|\| FROZEN` → `status === 'CONFIRMING' \|\| isSent()`. Claiming post-send is a mini-send trigger. |
| `api/events/[id]/shared-link/route.ts` | 1 | Same predicate swap. |
| `api/events/[id]/transition/route.ts` | 7 | CONFIRMING→FROZEN branch **deleted**; FROZEN→COMPLETE branch **deleted**. Route reduces to the DRAFT→CONFIRMING handler. |
| `api/h/[token]/status/route.ts` | 2 | `status` handling **deleted entirely** (§8 below / Q6). Route keeps `guestCount`. |
| `api/events/[id]/wrap-up/route.ts` | 2 | §3.2. |
| `api/events/[id]/confirm-invites-sent/route.ts` ×2 | 2 | `status === 'CONFIRMING'` gate retained; the write target becomes `sentAt`. Superseded wholesale by [[GTC-189]] (I2) later. |
| `api/sms/test-send/route.ts` | 1 | Dev fixture lookup; trivial predicate swap. |

**Sub-total: ~39 sites across 16 files.**

#### Layer 2 — Ledger wiring (A3b; largest diff, lowest risk)

`frozen-edit/route.ts` (499 lines) is **deleted**, and its three handlers fold into the ordinary
routes, which gain an optional `reason` field:

| Today | Tomorrow |
|---|---|
| `frozen-edit` action `reassign` | `POST/DELETE /api/events/[id]/items/[itemId]/assign` + reason |
| `frozen-edit` action `edit_item` | `PATCH /api/events/[id]/items/[itemId]` + reason |
| `frozen-edit` action `toggle_critical` | `PATCH /api/events/[id]/items/[itemId]` — **no reason** (§5.3) |

`handleReassign`'s two genuinely-correct halves — capture the why, notify the released person — are
kept and promoted into `recordChange()` and the release-notification hook that [[GTC-176]] (D3) fills
in. Its `InviteEvent`-with-`metadata.auditType='FROZEN_EDIT'` writes are replaced by real ledger
entries.

Then `recordChange()` is wired into the remaining mutation routes. The 25 identified:

```
api/events/[id]/route.ts (PATCH — date/venue: the §5 T5 site, currently ungated and unlogged)
api/events/[id]/items/[itemId]/route.ts, .../assign/route.ts
api/events/[id]/teams/[teamId]/items/route.ts
api/events/[id]/people/route.ts, .../[personId]/route.ts, .../[personId]/manual-override/route.ts,
  .../auto-assign/route.ts, .../batch-import/route.ts
api/events/[id]/households/route.ts, .../[householdId]/route.ts
api/events/[id]/review-items/route.ts, .../items/mark-for-review/route.ts
api/events/[id]/conflicts/[conflictId]/execute-resolution/route.ts
api/events/[id]/finalize-plan/route.ts, .../generate/route.ts, .../regenerate/route.ts   ⚠ see §12.3
api/c/[token]/items/route.ts, .../[itemId]/route.ts, .../[itemId]/assign/route.ts,
  .../ack/[assignmentId]/route.ts
api/h/[token]/people/[personId]/manual-override/route.ts
api/p/[token]/ack/[assignmentId]/route.ts
api/join/[token]/claim/route.ts
api/templates/[id]/clone/route.ts
```

Guest-side routes (`p/ack`, `c/ack`, `join/claim`) write to `InviteEvent`, **not** the plan ledger —
see §6.3.

#### Layer 3 — Host UI (A3c)

| File | Sites |
|---|---|
| `src/app/plan/[eventId]/page.tsx` (god file) | **17 FROZEN + ~9 CONFIRMING branches.** Includes the Plan Frozen Card (2246), Complete Event Card (2272), Invite Links gates (470/1535/2431/2505/3073), Shared Link gate (3420), `UnfreezeSection` render (3402), Unfreeze modal (2535), wrap-up gate (3614/3621), Freeze Readiness section (2727). **Grep `event.setup` / `event?.setup` first** per `gather-architecture-contract` §1 to establish which V1/V2 branch each site serves. |
| `components/plan/EventStageProgress.tsx` | 8 — the four-step stepper. Becomes three steps: Draft → Confirming → Sent, with COMPLETE as a passive terminal label. |
| `components/plan/FreezeCheck.tsx` | 2 — renamed/repurposed as the pre-flight's coverage panel; final form is [[GTC-188]] (I1). |
| `components/plan/TransitionModal.tsx` | 1 — the `isFreezeTransition` branch and its `<80% reason` prompt go. |
| `components/plan/UnfreezeSection.tsx` | whole file — **deleted** (§8). |
| `components/plan/FrozenEditModal.tsx` | whole file — **superseded** by a general reason-prompt component. |
| `components/plan/EditItemModal.tsx` | 3 — `isEditBlockedByFreeze()` deleted; the modal opens post-send and collects a reason when §5 says so. |
| `components/plan/SharedLinkSection.tsx` | 2 — predicate swap. |
| `components/plan/InviteStatusSection.tsx` | 1 + the `readyToFreeze` threshold consumption (line 403). |
| `components/plan/ReadyToFreezeIndicator.tsx` | whole file — its `complianceRate < 0.8 → render nothing` rule is a readiness judgement, refused by Moment 4 §2. **Deleted.** |
| `src/app/plan/events/page.tsx` | 1 — status badge colour map gains SENT. |
| `components/plan/RevisionHistory.tsx` | "Showing last N revisions" copy; consumes the uncapped GET. |

#### Layer 4 — Token-route UI (A3d)

| File | Sites |
|---|---|
| `src/app/h/[token]/page.tsx` | 10 — including the three transition confirmations (268/276/289) and the `freezeAllowed`-disabled button (1051–1069). |
| `src/app/h/[token]/team/[teamId]/page.tsx` | 3 — "(Frozen - Limited Edits)" label, Frozen Edit button. |
| `src/app/c/[token]/page.tsx` | 9 — the "Plan is FROZEN" banner and six read-only branches. |
| `src/app/p/[token]/page.tsx` | 4 — including the response-locked branches that invert with the `p/ack` route. |
| `src/app/join/[token]/page.tsx` | 1 |

**Grand total: ~39 (L1) + ~30 (L2) + ~49 (L3) + ~27 (L4) ≈ 145 decision sites across 56 distinct
files** (union of the FROZEN map, the `requireNotFrozen`/`canMutate` callers, the SMS eligibility
predicates, the 25 mutation routes, and the components slated for deletion).

### 4.3 Order, and why

```
A2  ─ schema + lifecycle.ts + recordChange()      [additive; nothing consumes it]
 │
A3a ─ server gating flips                          [behaviour changes; security contract changes]
 │
A3b ─ ledger wiring + frozen-edit fold-in          [behaviour is recorded; large but mechanical]
 │
A3c ─ host UI                                      [god file; browser walk]
 │
A3d ─ token-route UI                               [4 surfaces; browser walk]
 │
A-merge ─ single merge ticket onto feat/moment-one-redesign   (GTC-146 shape)
```

A3a before A3b opens a window in which post-send mutations are allowed but not yet recorded. **This
is why the whole epic runs on an experiment branch and merges as one unit** — the window exists only
between two commits on a branch nobody deploys.

A3c/A3d after both server layers, so the UI is written against settled server behaviour rather than
chasing it.

### 4.4 Sites that are larger than "swap FROZEN for a send-predicate"

Flagged per the ticket's request:

| Site | Why it is bigger |
|---|---|
| `api/events/[id]/frozen-edit/route.ts` | Not a predicate swap — a 499-line route **deleted** and redistributed across three ordinary routes, with its reason semantics inverted from "always required, FROZEN only" to "required per §5, always." Biggest single behavioural change in Epic A. |
| `src/lib/auth/guards.ts` | Deleting `requireNotFrozen` rewrites four assertions in the security suite — Do-Not-Touch zone 6. **See §12.1.** |
| `src/lib/sms/*-eligibility.ts` | The predicate inverts (freeze stops nudges → send starts them). Zone-7-adjacent. §4.6. |
| `api/p/[token]/ack/[assignmentId]/route.ts` | Semantic inversion, not a swap: the guest's ability to respond currently *ends* where the ruled model says it *begins*. |
| `api/events/[id]/wrap-up/route.ts` | Gate changes axis entirely (declared state → calendar fact) and loses the `confirmEarly` bypass. |
| `api/h/[token]/status/route.ts` | The whole `status` branch is removed, not migrated. §8. |
| `api/events/[id]/route.ts` PATCH | Currently ungated *and* unlogged, yet it is the date/venue site — the §5 T5 trigger and the [[GTC-183]] (F1) handoff point. It is new work, not migration. |
| God file | 26 branch sites in a 3,870-line component that renders V1 and V2 from one tree. Campaign-grade hazard. |

### 4.5 A scope note: the CONFIRMING critical-delete block

`canMutate` denies `deleteItem` on a critical item while CONFIRMING (`workflow.ts:257`). That is a
hard block on the host, forbidden by Moment 4 §7, and it is *outside* the FROZEN map — so removing it
widens A3a's scope beyond "FROZEN consumers."

Recommended: **remove it.** Cost is zero — the only caller
(`c/[token]/items/[itemId]/route.ts:150`) passes `itemCritical: false` unconditionally, so the branch
is unreachable today. It is dead code that encodes a forbidden behaviour. Logged as an interpretation
in §13.

### 4.6 Zone-7 boundary for the nudge eligibility change

`gather-change-control` Do-Not-Touch zone 7 covers SMS opt-out logic (`SmsOptOut`,
`Person.smsOptedOut`, and every path that must respect them). A3a's change to
`nudge-eligibility.ts` / `proxy-nudge-eligibility.ts` is confined to the **event-status filter in the
candidate query**. Explicitly unchanged: the `isOptedOut()` call, `isValidNZNumber()`, quiet-hours,
cadence windows, and the `nudge24hSentAt`/`nudge48hSentAt` bookkeeping. Cadence is [[GTC-178]] (E1).

This is adjacent to a zone, not inside it. It is flagged rather than assumed.

---

## 5. Question 5 — The why-scope rule (answered before Q4 because Q4 depends on it)

Hinge §2: *"The why is required only for changes that touch someone: reassignment, removal, a
quantity someone claimed against, date/venue. A typo fix gets a version and no interrogation."*

### 5.1 The principle, stated so it can be coded

> A change **touches someone** when it withdraws, transfers, or alters an ask that a named person has
> already received.

Two tests fall out: *is there a live ask on the affected thing?* and *does this change alter what was
asked, or who was asked?*

### 5.2 The rule

Reason is required **iff the event is sent** (`isSent(event)`) **and** one of the following holds:

| # | Trigger | Rationale |
|---|---|---|
| **T1** | An `Assignment` is **created, moved, or deleted** on an item — any `response` value, including `PENDING`. | Reassignment and removal, named in Hinge §2. Applies at `PENDING` too: the person received the ask even if they have not answered, and §8 rules that the system closes the loop with anyone released. |
| **T2** | A `Person` is **removed from the event** while holding ≥ 1 assignment. | Named in Hinge §2. |
| **T3** | An `Item` is **deleted** while holding an assignment. | Same shape as T1 — the ask disappears. |
| **T4** | A field in `ASK_FIELDS` changes on an item whose assignment has `response != PENDING`. | *"a quantity someone claimed against"* — **claimed against** is the operative phrase. They answered; the thing they answered about moved. |
| **T5** | `Event.startDate`, `Event.endDate`, or any `venue*` field changes. | Named in Hinge §2; the [[GTC-183]] (F1) trigger. |

```ts
ASK_FIELDS = {
  name,
  quantity, quantityAmount, quantityUnit, quantityUnitCustom, quantityText,
  dropOffAt, dropOffLocation, dropOffNote,
}
```

These are exactly the message's contents per Hinge §3: *"What they've been asked to bring / the item
carrying its own logistics: quantity, where to drop off, when."* The field set is defined by the spec,
not by taste.

### 5.3 Explicitly NOT touching someone — version only, no interrogation

| Case | Why |
|---|---|
| **Any change while `!isSent(event)`** | Moment 4 §7: *"The audit trail starts at the send."* Nobody is owed a story about a plan nobody has seen. |
| **Any change to an item with no assignment** | Nobody was asked. |
| **An `ASK_FIELDS` change where `response === PENDING`** | **This is the typo-fix case.** Correcting "Pavolva" before anyone has answered is updating an ask in flight, not moving a claim. It is also the overwhelmingly common edit. |
| **`critical` / `criticalReason` toggle** | Moment 4 §8.3, verbatim: *"criticality does exactly two things (the badge, and the assistant's message at red) and touches nothing else. It is entirely a host-facing signal, never a guest-facing pressure."* Today's `frozen-edit` demands a reason for this; that is the "stricter than the ruled model" contradiction the discovery report flagged. **Removed.** |
| **`description`, `notes`, prep/serve times, dietary tags, equipment** | Host-side planning fields; not in the message. |
| **Team rename, `displayOrder`, `dayId`, team membership** | Organisational, not an ask. |
| **Adding an item, or adding a person with no assignment** | Nothing has been asked yet. Hinge §2 is precise: *"Adding a person **with an assignment** post-send touches someone"* — the assignment creation is T1, so no separate rule is needed. |
| **A guest's own response** (yes/no/maybe, withdrawal) | Moment 4 §7: *"Responses, claims, and reassignments-with-reasons are not the plan changing; they are the plan being answered."* Recorded in `InviteEvent`, not the plan ledger. |

### 5.4 Three rules that keep this honest

1. **Actor-agnostic.** The why is a property of the *change*, not the *changer*. A coordinator
   reassigning within their team owes the same why a host does — the ledger serves Kate's memory
   regardless of whose hand moved the item. (Whether coordinators may make such changes at all is a
   separate question — **§12.2.**)
2. **A missing reason never blocks the change.** See §13.1 — this is the load-bearing reconciliation
   between Hinge §2's *"required"* and Moment 4 §7's *"never… demands justification."*
3. **Post-event changes still carry a why.** After `isComplete`, a reassignment still touches
   someone in the ledger's sense even though no message will be sent. §8.8's paper-then-system
   workflow depends on those late corrections being recorded with their reasons.

---

## 6. Question 4 — Ledger unification and versioning

### 6.1 `AuditEntry` vs `InviteEvent`: neither merges; the boundary is redrawn

**Recommendation: `AuditEntry` becomes the canonical plan ledger. `InviteEvent` remains the
messaging/channel log. `frozen-edit`'s misuse of `InviteEvent` is corrected, not blessed.**

They answer different questions:

| | `AuditEntry` (→ the ledger) | `InviteEvent` (→ channel telemetry) |
|---|---|---|
| Question | *Who changed the plan, to what, and why?* | *What did the messaging system do to or for this person?* |
| Members | assignments, items, people, teams, date/venue | `LINK_OPENED`, `NUDGE_SENT_AUTO`, `SMS_BLOCKED_OPT_OUT`, `SMS_SEND_FAILED`, `RESPONSE_SUBMITTED`, `WRAPUP_MESSAGE_SENT` |
| Read by | Kate, as her history of why | The system, and diagnostics |

Merging them would put `SMS_BLOCKED_INVALID` in the same stream as *"reassigned the beef — Pete
couldn't do it."* Hinge §2 is explicit about why that is wrong: *"the ledger stays meaningful because
it is never asked to hold noise."*

`frozen-edit` writing plan changes into `InviteEvent` with `metadata.auditType: 'FROZEN_EDIT'` is not
a design, it is an expedient — `InviteEvent` had a free-form `metadata` blob and `AuditEntry` had
nowhere to put a `reason`. Fix the cause: give the ledger a `reason` column and move those three
writes home.

`InviteEvent.type` keeps `MANUAL_OVERRIDE_MARKED` for genuine channel overrides; the
`auditType: 'FROZEN_EDIT'` convention disappears with the route.

### 6.2 The ledger's shape

`AuditEntry` is extended in place — not replaced. It already has ~15 call sites, all funnelled
through one helper (`logAudit`), and extending preserves existing history with no data migration.

```prisma
model AuditEntry {
  id           String    @id @default(cuid())
  timestamp    DateTime  @default(now())
  eventId      String
  sequence     Int       // monotonic per event — the version number
  changeSetId  String    // one request = one changeSet = one "step" to a human

  actorId      String?   // NULLABLE — system actions have no Person
  actorKind    ActorKind // HOST | COHOST | COORDINATOR | GUEST | SYSTEM

  actionType   AuditActionType  // was an untyped String
  targetType   String
  targetId     String
  field        String?   // null for whole-entity actions (create/delete)
  before       Json?     // scoped to the changed entity, NOT the whole plan
  after        Json?

  reason         String?
  reasonRequired Boolean  @default(false)  // §5 fired
  details        String?  // retained for existing rows

  event Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  actor Person? @relation(fields: [actorId], references: [id])

  @@unique([eventId, sequence])
  @@index([eventId, timestamp])
  @@index([changeSetId])
}
```

Notes on the fields the spec forces:

- **`sequence`** makes "complete history always reachable" a total order, not a timestamp sort that
  ties under concurrent writes.
- **`actorId` becomes nullable + `actorKind`** because the calendar, the cron sweep, and the
  release-notification path have no `Person` to point at. Today's non-null FK cannot express
  "the system did this," and §7's constitution (*"the system does what the system does"*) means the
  system is now a first-class actor in the history.
- **`changeSetId`** groups one request's field-deltas. "I renamed the pavlova and changed its
  quantity" is one step to a human and three rows to a database. Granularity stays per-individual-
  change (Hinge §2, gap #3) — the grouping is a display key, not a batching mechanism. Logged as an
  interpretation in §13.4.
- **`reasonRequired`** records that §5 fired even when the reason came back null. Without it, a null
  reason is ambiguous between "not owed" and "owed and not given," and the ledger cannot honestly
  report the gap.

### 6.3 Versions ARE the ledger entries

Hinge §2: *"Reasons explain the steps; versions ARE the steps."* Read literally, that means a version
is not a separate object joined to a reason — **it is the same object.** `AuditEntry.sequence` is the
version number. Version *N* of the plan is the state after ledger entry *N*.

This is what makes the storage problem tractable. The alternative — a `PlanRevision` per change — is
what the current code would do if `createRevision` were auto-fired, and it does not scale:

| Approach | Bytes per change (est.) | 200 changes | Notes |
|---|---|---|---|
| Full `PlanRevision` snapshot | ~60 KB | ~12 MB / event | `createRevision` stores `teams` *with nested items* **and** `items` separately — items are serialised twice. |
| Scoped ledger entry | ~0.3–0.8 KB | ~160 KB / event | Only the changed entity's changed fields. |

The 60 KB figure is an **estimate** derived from `Item`'s 45-column shape × 25 items, doubled for the
nested duplication, plus teams/days/conflicts/acknowledgements. **A2's first task is to measure it**
against the seeded Henderson fixture and record the real number in the ticket — this is exactly the
"predict numbers first, then measure" discipline from `gather-experiment-methodology`.

**Reachability.** Complete history is reachable two ways, both cheap:
- *Forward:* the `PlanSnapshot` written at DRAFT→CONFIRMING, plus entries 1..N applied.
- *Backward:* current state, with entries N+1..latest inverted (every entry carries `before`).

Neither requires storing a snapshot per change, and both satisfy the product constraint, which Hinge
§2 states is *"only completeness and reachability."*

**Deduplication.** None is applied, and none is needed. The unit of a version is a **persisted
mutation** — one successful API request that changed state — not a keystroke. Autosave already
batches at the API boundary, so the noise the dedup question anticipates does not reach the ledger.
Introducing a coalescing window would be the one mechanism that could violate "per-individual-change,"
so it is deliberately absent.

### 6.4 `PlanRevision`'s surviving role

Demoted from "the version system" to **coarse checkpoints for bulk operations**:

| Written at | Why a full snapshot earns its keep here |
|---|---|
| DRAFT → CONFIRMING (exists today, as `PlanSnapshot`) | Phase boundary; the forward-replay anchor. |
| The press | The as-sent plan — what every guest was actually asked for. Load-bearing for Kate's *"what did I send?"*. |
| Every AI regenerate (exists today) | A regenerate replaces the whole plan; a per-field ledger of that is 25 deletes and 25 creates, and the pre-regenerate plan is worth keeping whole. |

Changes required:
- `GET /api/events/[id]/revisions` **`take: 5` removed**, replaced by cursor pagination. Hinge §2:
  *"complete history always reachable whatever the display defaults to."* The UI may still show five;
  the API may not cap at five.
- `restoreFromRevision` survives unchanged as a pre-send tool. **Post-send it is a recall by another
  name** and must be blocked — Hinge §2 rules out undo *at the mechanism level*. Recommended: guard it
  with `!isSent(event)`. This is the one place in the plan where something is *added* to the
  post-send restriction list, and it is required by the spec, not by caution.

---

## 7. Question 6 — Removing the FROZEN→CONFIRMING unfreeze path

Hinge §2: *"The old FROZEN→CONFIRMING unfreeze path dies with FROZEN in the state-machine
reconciliation."*

### 7.1 What is deleted

| Site | Action |
|---|---|
| `api/h/[token]/status/route.ts` lines 35–67, 86–107 | The entire `status` branch, including the `unfreezeReason` requirement and the `OVERRIDE_UNFREEZE` audit write. The route keeps `guestCount` and its path (renaming a token route buys nothing). |
| `workflow.ts:233` `FROZEN: ['CONFIRMING', 'COMPLETE']` | Removed with the rest of `canTransition`. |
| `components/plan/UnfreezeSection.tsx` | File deleted. |
| God file 3402 (`UnfreezeSection` render gate), 2535 (Unfreeze modal), 2246 (Plan Frozen Card's unfreeze affordance) | Removed. |
| `h/[token]/page.tsx:289` (FROZEN→CONFIRMING confirmation), 465–474 | Removed. |

### 7.2 What replaces the "I made a mistake" case

Per Hinge §2, recovery is the **material-change machinery**: the host fixes the wrong date, and
everyone is re-asked against the correction — *"The mistake becomes a correction everyone sees, not an
event that pretends it didn't happen."* That is Moment 4 §8.5 and [[GTC-183]] (F1). **Building it is
explicitly out of A1–A3's scope.**

A1's job is to confirm the handoff point exists. It does, and it is concrete:

> `PATCH /api/events/[id]` is the only route that writes `startDate`, `endDate`, or `venue*`
> (lines 97, 98, 111). Under §5 T5, a post-send call to it requires a reason and writes a
> `MATERIAL_CHANGE` ledger entry. A3b adds a single no-op hook at that point —
> `onMaterialChange(eventId, changeSetId, fields)` — which F1 implements.

Today that route has **no status gating and no audit logging at all**. So this is not migration work;
it is the one genuinely new server behaviour Epic A introduces, and it is small.

### 7.3 The gap window, stated plainly

Between A3 landing and F1 landing, a post-send date change is **recorded but not re-asked**. Today
there is at least the unfreeze escape hatch; after A3 there is neither that nor the re-ask.

The alternative — keep unfreeze alive until F1 — is rejected: after A3 there is no FROZEN state to
un-freeze, so the transition is mechanically meaningless, and Hinge §2 rules the path out by name.

Recommended handling: A3d shows one plain sentence when a post-send date or venue change is saved —
*"Your guests won't be re-asked automatically yet."* A fact, not a challenge, not a block; permitted
by Moment 4 §7. And F1 ([[GTC-183]]) is promoted from a feature dependency to a **correctness**
dependency of Epic A in the roadmap.

---

## 8. Question 7 — Mini-sends: the data shape

Hinge §2, gap #5: people added post-send get *"the same three-movement message, the same machinery,
with the person's own clocks — nudge cadence and red-by-time run from **their** send date, truncated
by the event date."*

### 8.1 It requires a per-person timestamp — and one already exists, in the wrong place

**It cannot be derived.** Derivation would need "when was this person added," and `PersonEvent` has
no `createdAt`. Even with one, added ≠ sent-to: a person added at Moment 1 is sent to at the press,
days later. The two facts are independent, so the timestamp must be stored.

`Person.inviteAnchorAt` already **is** that timestamp, and the mini-send semantic is already
implemented around it: `api/events/[id]/people/route.ts:130` sets a newly-added person's anchor to
the event's send time, and lines 133–137 backfill it for people who predate the send. Four other
sites do the same (`batch-import:122`, `households:144`, `households/[householdId]:160`,
`reconcileMembers:170`).

### 8.2 But it is on the wrong model

`inviteAnchorAt` lives on **`Person`**, which is global across events. A person in two events has one
anchor. The guard at `people/route.ts:133` is `if (event.inviteSendConfirmedAt && !person.inviteAnchorAt)`
— *only sets if null* — so the first event's anchor silently becomes the second event's anchor, and
the second event's clocks are wrong from the start.

**Recommendation:**

| Field | From | To | Ticket |
|---|---|---|---|
| `inviteAnchorAt` | `Person` | **`PersonEvent.sentAt`** | A2 |
| `nudge24hSentAt`, `nudge48hSentAt` | `Person` | `PersonEvent` (same bug) | **Not A2** — see below |

A2 moves **only the anchor**. The two nudge-sent timestamps have the identical per-person-leak bug
(a person nudged in event A is never nudged in event B), but fixing them means touching nudge
scheduling, which is [[GTC-178]] (E1) and zone-7-adjacent. Moving the anchor alone leaves the
eligibility query coherent — it reads a per-event anchor and per-person send flags, which is exactly
what it does today. **Recommended: file the nudge-timestamp leak as its own bug ticket, sequenced
into E1.** It is a pre-existing defect this plan surfaces, not one it creates.

### 8.3 What the mini-send shape gives you, free

With `Event.sentAt` and `PersonEvent.sentAt` both present:

| Question | Answer |
|---|---|
| Has the press happened? | `Event.sentAt != null` |
| Has *this person* been sent to? | `PersonEvent.sentAt != null` |
| Was this a mini-send? | `PersonEvent.sentAt > Event.sentAt` — no extra field |
| When do their nudges fire? | `PersonEvent.sentAt + cadence`, per E1 |
| When does their red-by-time land? | `needed-by − K`, per §10.2 — where needed-by is `Item.dropOffAt ?? Event.endDate`. **`Item.dropOffAt` already exists.** |
| Is a nudge already past its window? | `PersonEvent.sentAt + cadence > needed-by − K` → skip to red. This is §2's *"a Bob added three days out may pass straight to Kate's line"*, and it falls out of the arithmetic with no special case. |

No new concepts, exactly as Hinge §2 requires. The `K` constant is deferred to ticket time with
founder sign-off per Moment 4 §10.2 — it belongs to [[GTC-180]] (E3), not here.

---

## 9. Question 8 — Migration and rollback safety

### 9.1 The principle

**Additive, then flip, then (much later) delete.** No step in Epic A destroys data or removes an enum
value. Every ticket is revertible by `git revert` with no down-migration.

### 9.2 The steps

| # | Step | Ticket | Reversible by |
|---|---|---|---|
| 1 | Add `Event.sentAt` (rename of `inviteSendConfirmedAt`, backfilled); add `PersonEvent.sentAt`; extend `AuditEntry`; add `lifecycle.ts` + `recordChange()`; uncap the revisions GET. | A2 | `git revert` — new columns are ignored by reverted code; the rename keeps its data. |
| 2 | Backfill `Event.sentAt` for historical rows (§9.3). | A2 | Idempotent; nothing reads it yet. |
| 3 | Flip server gating; flip ledger writes; flip UI. `isSent()` keeps the compat shim `sentAt != null \|\| status === 'FROZEN'`. | A3a–d | `git revert` — the enum still holds FROZEN, old rows still parse, old code still runs. |
| 4 | Data migration: `UPDATE "Event" SET status='CONFIRMING' WHERE status IN ('FROZEN','COMPLETE')`. Remove the compat shim. | **Not Epic A** | Requires a DB backup. One-way. |
| 5 | Drop `FROZEN` and `COMPLETE` from the `EventStatus` enum; drop `frozenAt`, `complianceAtFreeze`, `freezeReason`. | **Not Epic A** | One-way. |

**Epic A lands at step 3.** Steps 4–5 are a separate, later cleanup ticket (proposed as *A4*,
unfiled), best sequenced after Epic J when the new surfaces have been exercised. Rationale: Postgres
cannot drop an enum value while any row references it, so steps 4 and 5 are coupled and irreversible
together. Holding them back costs one dead enum value and buys a fully revertible epic.

### 9.3 Backfill rules for historical events

```
Event.sentAt        := inviteSendConfirmedAt          -- direct carry-over (the rename)
                    ?? frozenAt                        -- frozen without a recorded invite-send
                    ?? (status IN ('FROZEN','COMPLETE') ? updatedAt : NULL)   -- last resort
PersonEvent.sentAt  := Person.inviteAnchorAt           -- carried per membership
                    ?? Event.sentAt                    -- where the person predates anchoring
```

`Event.wrappedAt`, `frozenAt`, `complianceAtFreeze`, `freezeReason` are read-only survivors.

### 9.4 Read-compatibility for events already FROZEN or COMPLETE

Handled by the shim in `isSent()`/`isComplete()` for the whole of Epic A. After step 4, historical
rows are indistinguishable from new ones. No screen ever shows a `null` phase.

### 9.5 The behaviour change on deploy, stated honestly

Existing events with `status = 'CONFIRMING'` **and** `inviteSendConfirmedAt` set are promoted to
`SENT`. From the deploy forward, reassignments on those events will ask for a why and write ledger
entries.

This is correct — those events' invites *are* out; guests *have* claimed things; drift under their
feet *should* carry a story. But it is a behaviour change to live data on first deploy, and it should
not arrive as a surprise. Blast radius is small (a prototype with the Henderson demo event and the
security fixtures), and nothing about it can block a host. Logged as an interpretation in §13.5.

### 9.6 Rollback in one sentence

> At every commit in Epic A, `git revert` alone restores working behaviour, because the enum keeps its
> values, historical rows keep their data, and every new column is nullable and additive.

---

## 10. The experiment branch, and what "measured" means

### 10.1 Branch

**`experiment/send-lock-ledger`**, per the GTC-145/146 pattern
(`gather-experiment-methodology`, `gather-change-control`):

- A2 and A3a–d all commit to this branch, each with `[EXPERIMENTAL]` in the message.
- The branch is never deployed and never merged piecemeal.
- A **single merge ticket** (proposed *A-merge*, unfiled) cherry-picks the series onto
  `feat/moment-one-redesign`, strips the `[EXPERIMENTAL]` tags, and carries the measured results — the
  GTC-146 shape exactly.
- Dead-code removal (`frozen-edit`, `UnfreezeSection`, `FrozenEditModal`, `ReadyToFreezeIndicator`)
  lands as its **own commit** on the merge, not folded into the behaviour change. GTC-146's rule:
  *"removing dead code is not the same change as introducing the new architecture."*

### 10.2 What "measured" means for a correctness change

This is not a product-quality experiment; there is no 86→25 to report. The measurements are about
**coverage and residue** — did every site move, and is anything left behind that contradicts the spec?
Predict first, then measure, per house methodology.

| Metric | How | Target |
|---|---|---|
| **Site coverage** | Sites identified in §4.2 vs migrated vs explicitly deferred | 145 accounted for; 0 silently skipped |
| **FROZEN residue** | `grep -rn "FROZEN" src \| grep -v lifecycle.ts \| wc -l` | **0** outside the compat shim |
| **Guard residue** | `grep -rn "requireNotFrozen\|canFreeze\|isEditBlockedByFreeze" src` | **0** |
| **Hard-block count** | Scripted post-send mutation attempt against every route in §4.2 Layer 1; count non-2xx responses caused by lifecycle state | **0** (Moment 4 §7) |
| **Why-scope precision** | Fixture run of 20 mutations spanning all §5 triggers and non-triggers; count reason prompts | Exactly the T1–T5 subset. Today: 3 required (all in `frozen-edit`), ~8 owed → wrong in both directions |
| **Ledger completeness** | Same fixture; count entries | 1 per changed field; `changeSetId` groups match request count |
| **Ledger size** | Measure bytes/entry on the Henderson fixture | < 1 KB p95 (prediction: 0.3–0.8 KB). **Also measure the `PlanRevision` blob** to confirm or correct the ~60 KB estimate in §6.3 |
| **Nudge predicate** | Sent event with a live date yields candidates; complete event yields none | Both true (today the first is false) |
| **Regression** | `npx tsc --noEmit`; `npm run format:check`; `npx next build`; `npm run test:security` | All clean / exit 0 |
| **Browser walk** | Host dashboard (A3c) + 4 token surfaces (A3d) per GTC-169's acceptance | All pass |

---

## 11. Recommended re-scoping of A2 and A3

Per the ticket, A2/A3 do not start until they are rescoped against this plan. Recommended shape:

| Ticket | Scope | Effort |
|---|---|---|
| [[GTC-168]] (A2) | Unchanged in intent; scope confirmed as §4.2 Layer 0 + §6.2 + §8.2. Add: measure the two storage numbers before writing the migration. **Stop Condition 7 applies — schema migration.** | max |
| [[GTC-169]] (A3) | **Split. Recommended: yes.** See below. | — |
| A3a — server gating | §4.2 Layer 1, ~39 sites / 16 files. Security-relevant. **Blocked on §12.1's resolution.** | high |
| A3b — ledger wiring | §4.2 Layer 2, ~30 sites, incl. deleting `frozen-edit` and the F1 hook. | xhigh |
| A3c — host UI | §4.2 Layer 3, god file + 11 components. | xhigh |
| A3d — token-route UI | §4.2 Layer 4, 5 pages / 4 surfaces. | high |
| A-merge (unfiled) | Cherry-pick onto `feat/moment-one-redesign`; dead-code removal as a separate commit; carries §10.2's numbers. | medium |
| A4 (unfiled) | §9.2 steps 4–5: data migration + enum drop. Sequence after Epic J. | medium |

**The A3 split question, answered:** split it, into four. GTC-169 anticipated a two-way split (routes
vs UI); the measured surface argues for four. The seam that matters most is **A3a vs A3b** — A3a is a
small, high-risk diff that changes what the system *permits* and rewrites security-suite assertions;
A3b is a large, low-risk diff that changes what the system *records*. Reviewing them as one ticket
would bury the dangerous 39 lines inside a thousand mechanical ones. The A3c/A3d seam is cheaper but
still worth it: they have different verification surfaces (one host browser walk vs four token-route
walks), and A3c alone touches the god file.

---

## 12. STOP — decisions escalated to Nigel

Per GTC-167's Stop Conditions and the house rule that a plan which guesses past an unknown is worse
than one that stops. **A2 and A3a should not start until 12.1 and 12.2 are answered.** 12.3 blocks
A3b only.

### 12.1 The security suite's FROZEN assertions must be rewritten — Do-Not-Touch zone 6

**Stop Condition 3.** `tests/security-validation.ts` asserts the current contract in four places:

- Test 1.2 — *"requireNotFrozen blocks FROZEN event"* (lines 62–108)
- Test 1.4 — *"requireNotFrozen allows FROZEN with override"* (lines 160–206)
- Test 3.4 — *"Coordinator items route has frozen validation"* (lines 386–403)
- Test 3.5 — *"Coordinator item edit route has frozen validation"* (line 414)

`tests/security-fixtures.ts` also seeds a `Security Test Event (FROZEN)` (lines 205–212).

Zone 6's rule is *"NEVER weaken or skip assertions to make tests pass — fix the underlying issue."*
Here the underlying contract is what changed, by founder ruling. The assertions are not wrong; they
are **superseded**. They must be *replaced* with assertions of the new contract, not deleted:

| Old assertion | Proposed replacement |
|---|---|
| `requireNotFrozen` blocks FROZEN | A post-send mutation on a coordinator route **succeeds** and **writes a ledger entry** |
| `requireNotFrozen` allows with override | *(no successor — override was a FROZEN concept)* |
| Coordinator routes have frozen validation | Coordinator routes call `recordChange()` on every mutation path |
| — *(new)* | `restoreFromRevision` is **refused** post-send (the only new post-send restriction, per Hinge §2's no-undo-at-the-mechanism-level) |
| — *(new)* | No lifecycle-derived 4xx on any Layer-1 route post-send |

**What I need from you:** explicit approval to modify `tests/security-validation.ts` and
`tests/security-fixtures.ts` under a dedicated ticket, with the replacement assertions above (or your
corrections to them). I have not touched either file. Without this, A3a cannot land — deleting
`requireNotFrozen` breaks the preflight gate.

### 12.2 Coordinator authority after the send — genuinely underdetermined

Today, `requireNotFrozen` + `canMutate` hard-block **coordinators** from creating, editing, deleting,
and assigning items once an event is FROZEN (7 call sites across the three `c/[token]/items/*`
routes). Both specs speak exclusively about Kate. Neither says what a coordinator may do after the
press.

Two defensible readings:

**(a) Coordinators get the same always-allow + ledger treatment as the host.** Moment 4 §7's stated
reason for the lock is *"drift under their feet must carry a story"* — the reason is about the
guests' experience of drift, and a coordinator's drift is identical in kind. The plan is one plan; the
lock is one mechanism.

**(b) The lock stays a wall for coordinators; only the host gets always-allow.** The "never
hard-block" rule is stated about the host. A coordinator is a delegate, and the send is a reasonable
place for delegation to become read-only.

**My recommendation: (a).** It is more consistent with the ledger's whole premise, it avoids two
different meanings for one lock, and it keeps `recordChange()` as the single mutation path. But (b) is
the current behaviour, it is a security-relevant authority change to token routes, and I am not
willing to widen coordinator write access across a sent plan on an inference.

**What I need from you:** (a) or (b).

### 12.3 Post-send AI regeneration — no spec covers it

`POST /api/events/[id]/regenerate` calls `createRevision`, then replaces the entire plan. Post-send,
that orphans every assignment and invalidates every yes at once. Neither spec addresses whether the
plan may be regenerated after the press.

Three options:

- **(a) Allow.** One `PlanRevision` checkpoint, one ledger entry per resulting change, one why for the
  changeSet. Consistent with *"post-press, Kate can change anything."*
- **(b) Refuse post-send.** Cleanest for the ledger and for the guests, but it is a hard block on the
  host, which Moment 4 §7 forbids.
- **(c) Allow, and treat it as a material change** — it fires [[GTC-183]] (F1)'s re-ask for everyone
  whose item changed. Most faithful to §8.5's opt-out-reconfirmation model, and the most work.

**My recommendation: (a) for Epic A, with a note that (c) is where it should end up once F1 exists.**
That keeps A3b unblocked and defers the product decision to F1's ticket rather than pre-empting it.

**What I need from you:** confirmation of (a)-now-(c)-later, or a different call. This blocks A3b's
treatment of `regenerate`/`generate`/`finalize-plan` only; A2 and A3a are unaffected.

---

## 13. Interpretations taken (not stops — but worth your eye)

These are decisions I made *from* the specs where the specs did not spell out the mechanics. Each is
reversible without redesigning the plan.

**13.1 "Required" reason never blocks the change.** Hinge §2 says the why is *required* for
touching-someone changes; Moment 4 §7 says the product *"never… demands justification."* Resolution:
the reason is required *of the flow* (the UI always asks) and never *of the server* (a reason-less
change lands, with `reasonRequired: true, reason: null` recorded). This is why `AuditEntry.reason` is
nullable and `reasonRequired` exists. Hinge §2's own gloss supports it: *"The reason is not compliance
— it's her own memory."* A 400 would make it compliance.

**13.2 The why-requirement is post-send only; versioning granularity differs pre- and post-send.**
Moment 4 §7: *"The audit trail starts at the send."* Hinge §2's universal-silent-per-change ruling
sits under "What the press commits," so it is scoped to post-press by its own placement. Pre-send,
versioning stays at today's checkpoint granularity (`PlanRevision` on regenerate / phase boundary).

**13.3 Criticality toggles owe no why.** Directly from Moment 4 §8.3 (*"criticality does exactly two
things… touches nothing else"*), but it reverses current behaviour, so it is called out.

**13.4 `changeSetId` groups one request's field deltas.** Granularity remains per-individual-change;
the grouping is a display key so "renamed and re-quantified the pavlova" reads as one step. If you
read gap #3 as forbidding any grouping, drop the column — the plan survives, the history is just
noisier to read.

**13.5 Existing CONFIRMING events with invites out are promoted to SENT on migration.** §9.5.

**13.6 The CONFIRMING critical-delete block is removed** even though it sits outside the FROZEN map.
§4.5. It is unreachable dead code encoding a forbidden behaviour.

**13.7 `restoreFromRevision` is blocked post-send.** The plan's only *new* post-send restriction,
required by Hinge §2's no-undo-at-the-mechanism-level ruling. §6.4.

---

## 14. Corrections owed to other documents

Not made by this ticket. Listed so they are not lost.

| Document | Correction |
|---|---|
| `moment4-hinge-discovery-report.md` Task 1 §1 | "~30 call sites" undercounts by ~2×. Real surface: 85 non-comment `FROZEN` occurrences across 26 files; ~145 decision sites across 56 files once ledger wiring is included. Add `src/lib/sms/nudge-eligibility.ts`, `proxy-nudge-eligibility.ts`, `api/events/[id]/route.ts` PATCH, and both `confirm-invites-sent` routes to the consumer map. |
| Same, Task 1 §1 | Add the finding that `Event.inviteSendConfirmedAt` is the send's existing ancestor, and that freezing currently *stops* nudges. |
| `gather-architecture-contract/SKILL.md` §5 | Owed a full rewrite once Epic A lands — already flagged by GTC-166 as deliberately deferred. This plan is the FROM→TO map it will need. |
| `gather-architecture-contract/SKILL.md` §10 | Add weak point: `Person.inviteAnchorAt` / `nudge24hSentAt` / `nudge48hSentAt` are per-person for a per-event fact. §8.2. |
| [[GTC-178]] (E1) | Inherits the nudge-timestamp per-person-leak bug (§8.2) and the cadence rebuild on top of the new `SENT_AND_LIVE` predicate. |
| [[GTC-183]] (F1) | Promoted from feature dependency to **correctness** dependency of Epic A. §7.3. |
| [[GTC-186]] (H1) | Inherits the calendar-driven COMPLETE predicate and the sweep-may-create-work-never-set-phase rule. §3.1. |
| [[GTC-189]] (I2) | Supersedes both `confirm-invites-sent` routes with the real press; `Event.sentAt` is the field it stamps. |

---

## 15. Out of scope for A1–A3, confirmed

Epic F's re-ask machinery; Epic E's cadence, red-by-time constant, and bounce detection; Epic D's
yes/no/maybe unification and decide-by clock; Epic H's thank-you offer; Epic I's pre-flight, press,
and guest message; Epic J's screen and runbook; the `DRAFT`/`CONFIRMING` naming question versus Moment
vocabulary; the `EventStatus`-enum drop (A4). Each is named above at the point where Epic A hands off.
