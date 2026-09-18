# Moment 4 + Hinge — Discovery Report

**Status:** Breakdown of record. Read-only discovery pass, completed 2026-08-03; landed in the repo via GTC-165 so it survives past the session that produced it.

**Source authority:** `docs/03_specs/gather-moment-4-spec-v1.md` and `docs/03_specs/gather-hinge-spec-v1.md` (both filed by GTC-163, updated by GTC-164 to the discovery-gap-ruled versions — Moment 4 spec §10, Hinge spec §2–§3). Both specs state **no open questions remain anywhere.**

**Process:** Read-only against the repo at the time of the pass. No code, ticket, or skill edits were made during discovery itself — those are tracked by the separate tickets this report links to (GTC-166 for skill corrections, GTC-167–169 for Epic A; further epics unfiled pending founder review).

---

## Task 1 — Decided vs Built

Classification taxonomy: (a) EXISTS and conforms, (b) EXISTS but contradicts the spec, (c) PARTIALLY EXISTS, (d) DOESN'T EXIST (greenfield).

### 1. State machine: CONFIRMING→FROZEN vs send-lock + ledger + versions (largest item)

| Spec decision | Classification | Detail |
|---|---|---|
| The send is the lock point | **(d) doesn't exist** | No `send`/`press`/`hinge` concept anywhere. `FROZEN` (reached via explicit host action, `canTransition` in `src/lib/workflow.ts`) is the only lock point today. Invite links exist independent of freezing — a plan can sit in CONFIRMING indefinitely while links go out. |
| Post-send: change anything, mandatory why **scoped to changes that touch someone** (Hinge §2, ruled gap #2) | **(c) partial, contradicted elsewhere** | `src/app/api/events/[id]/frozen-edit/route.ts` already does allow+reason for 3 mutation types (reassign/toggle_critical/edit_item), FROZEN-only, unconditionally requiring a reason regardless of whether the change "touches someone" — narrower AND stricter than the ruled model. Every other mutation route (`c/[token]/items/*`) calls `requireNotFrozen` → hard 403 block, the opposite of "never hard-block." |
| Every change versioned, **universal, silent, per-individual-change, complete history always reachable** (Hinge §2, ruled gaps #2–3) | **(c) partial** | `PlanRevision` + `createRevision`/`restoreFromRevision` exist but are manual/opt-in (`POST /api/events/[id]/revisions`) or auto-fired only before AI regenerate. Nothing calls `createRevision` from `frozen-edit` or any assignment mutation. `GET .../revisions` caps at last 5 — contradicts "complete history always reachable." Storage mechanics (diffs, dedup) are explicitly left to the reconciliation ticket by the spec itself. |
| Audit trail: why + version per change, why scoped to touching-someone changes | **(b) contradicts** | Two unlinked audit systems: `AuditEntry`/`logAudit` (structured, used by most of workflow.ts) vs `InviteEvent`/`logInviteEvent` (the one place `reason` is actually mandatory today — `frozen-edit` — writes into an untyped `metadata` JSON blob). Neither joins a reason to a `PlanRevision`. Nothing anchors to "the send" as an event. |
| **No unsend, even at the mechanism level** (Hinge §2, ruled gap #1) — a wrong-date send recovers through the material-change machinery (Moment 4 §8.5), never a recall | **(b) contradicts** | The current FROZEN→CONFIRMING "unfreeze" path (`src/app/api/h/[token]/status/route.ts`, mandatory `unfreezeReason`) is exactly the kind of recall/undo the spec now rules out. Per Hinge §2: "The old FROZEN→CONFIRMING unfreeze path dies with FROZEN in the state-machine reconciliation." |
| **COMPLETE survives; the transition is calendar-driven, not host-declared** (Moment 4 §10.1) | **(d) doesn't exist** | FROZEN→COMPLETE today is an explicit host action via the transition route. No date-based automatic transition exists. Wrap-up's current hard-requirement of FROZEN status needs to migrate to COMPLETE-gated per §10.1. |
| **People added after the send are per-person mini-sends** on their own clocks, truncated by the event date (Hinge §2, ruled gap #5) | **(d) doesn't exist** | No concept of a post-send addition triggering its own three-movement message and its own nudge/red-by-time clock. |
| FROZEN collapse/removal — consumer map | **(a) exists extensively** | ~30 call sites: `canTransition`, `canMutate`, `checkFreezeReadiness`, `requireNotFrozen` (guards.ts); routes `transition`, `frozen-edit`, `wrap-up` (hard-requires FROZEN), `shared-link`, `h/[token]/status`, `join/[token]/claim`, `p/[token]/ack/[assignmentId]`, `c/[token]/items/*`; pages `join/[token]`, `h/[token]`, `h/[token]/team/[teamId]`, `c/[token]`, `p/[token]`; components `SharedLinkSection`, `EventStageProgress`, `FreezeCheck`, `TransitionModal`, `InviteStatusSection`, `EditItemModal`, `UnfreezeSection`, `FrozenEditModal`; and 12+ branch sites in the god file (`src/app/plan/[eventId]/page.tsx`). Every one is a migration site. |
| Maybe-reassignment "her why, the ledger" | **(c) partial** | `handleReassign` in `frozen-edit/route.ts` already does the "why" + "notify the released guest" halves correctly — but writes to `InviteEvent`, not a real versioned ledger, and is gated to FROZEN only. |

**Now unblocked for ticketing:** all five previously-open questions in this territory (send-undo, why-scope, versioning granularity, COMPLETE's fate, mini-sends) are ruled. See Epic A tickets (GTC-167–169) below.

### 2. Wrap-up/TNZ messaging vs thank-you (§8.4/§10.4) + nudge cadence (§8.3/§10.2/§10.3)

| Spec decision | Classification | Detail |
|---|---|---|
| Two-nudge cadence (days 4/7, adjustable) | **(b) contradicts** | Real cron machinery exists (`nudge-scheduler.ts`, `nudge-eligibility.ts`, `nudge-sender.ts`) but runs on **24h/48h "opened but no response"** semantics, not day-4/7 "system's own schedule." A third auto-nudge (`sendRsvpFollowupNudge`) force-converts `NOT_SURE` RSVPs at 48h — contradicts the maybe-state's "no nudges" rule, and is further obsoleted by the one-tap model superseding `rsvpStatus` as a guest-facing question (Hinge §3). |
| Cadence controls: **pre-flight per-event pace (standard/relaxed/off) + per-person mark beside the recipient picker (go gentle/don't chase)** (Moment 4 §10.3) | **(d) doesn't exist** | No cadence config field anywhere. The only "gentle" concept is `HostNudgeVariant`, a message *tone* choice for one-off manual nudges — unrelated to cadence. Target UI is now specified: lives at the pre-flight (event-level) and beside the Moment 1 recipient picker (person-level), not a settings page. |
| Host-set "red by time" line, **derived from needed-by (item drop-off time, else event date), constant TBD at ticket time** (Moment 4 §10.2, shared derivation with the maybe decide-by) | **(d) doesn't exist** | No deadline/stop-nudging field on `Event` or `Person`. Derivation formula is now specified in shape (needed-by minus a to-be-set constant); the constant itself is explicitly deferred to ticket time with founder sign-off. |
| Nudge-clock display (§6) | **(c) partial** | Raw data exists (`nudge24hSentAt`/`nudge48hSentAt`, `nudgeSummary`) but nothing computes/shows a forward-looking "nudge in 2 days." |
| Guest-requested reminder (Hinge §3) | **(d) doesn't exist** | No post-yes reminder offer anywhere in `src/app/p/[token]/page.tsx`. |
| Thank-you: **offered once, a day or two after the date passes, in standard register, declinable and never repeated** (Moment 4 §10.4) | **(b) contradicts** | Real machinery exists (`WrapUpLink`, `generateWrapUpLinks`, cron dispatch, TNZ/Twilio carrier) but fires automatically on FROZEN→COMPLETE for all guests with no offer/review step. Timing trigger is now specified (date-passed + 1-2 days) — ties directly to §10.1's calendar-driven COMPLETE. |
| Bounce detection (§7) | **(d) doesn't exist — build instruction given, not blocked** (§10.9) | Zero bounce-handling code; no delivery-status webhook receiver on either TNZ or Twilio client. §10.9 makes this a two-step build: investigate TNZ delivery-receipt capability first; if absent, degrade gracefully (bounce travels the ordinary nudge path, reaches Kate later but nothing is lost) — document the fallback, never silently substitute it for the target. |
| "Seen" surfaced to host | **(b) contradicts** | `AccessToken.openedAt` is explicitly rendered to the host today — `InviteStatusSection.tsx`'s "Opened" stat tile, `PersonInviteDetailModal.tsx`'s "Link opened" timeline row. Hinge §6 explicitly refuses this. |

TNZ vs Twilio routing and quiet-hours logic are both real and working correctly — not in question.

### 3. RSVP/claim vs yes/no/maybe — **materially changed by the discovery-gap ruling**

| Spec decision | Classification | Detail |
|---|---|---|
| **The tap is the item ask; attendance is inferred from it. `PersonEvent.rsvpStatus` stops being guest-facing and becomes derived state** (Hinge §3, ruled gap #10) | **(b) contradicts** | This is a new, more specific target than the original v1 spec's "yes/no/maybe, single tap" framing. Today two independent guest-facing questions exist: `PersonEvent.rsvpStatus` (event attendance, asked directly via `PATCH /api/p/[token]`) and `Assignment.response` (per-item accept/decline, binary). Under the ruling, the guest is asked ONE question (the item), a **no** gets one conditional follow-up ("still coming?"), a **maybe** stays purely item-level, and itemless guests get the attendance-only degenerate case. `rsvpStatus` must become a derived field, not a directly-askable one. |
| Maybe state (decide-by clock, no nudges) | **(d) doesn't exist**, actively contradicted | `NOT_SURE` is force-converted via nudge at 48h — the opposite of the spec's ruling. No `decideBy` field anywhere. Derivation formula now specified (§10.2, shared with red-by-time). |
| "Held softly" reassignment semantics | **(d) doesn't exist** | No maybe state exists to hold softly; reassignment routes delete-then-create identically regardless of prior state. |
| Notify released guest on reassignment | **(d) doesn't exist** | Both assign routes are silent — no message sent to the previously-assigned person. |
| Green-reverting (§8.6) | **(d) doesn't exist as a guest action** | Guest can flip `Assignment.response` to DECLINED, but this only updates the field — `Item.status` stays ASSIGNED, item never reopens for reassignment, host isn't specially notified beyond an audit log line. Only a host-initiated `DELETE` reopens an item today. |
| Task rows sharing item machinery | **(d) doesn't exist** | No `Task` model or row-kind distinction anywhere in the schema. |
| Reassignment "why" capture, **scoped to touching-someone changes** | **(c) partial** | Exists cleanly in `frozen-edit`'s `handleReassign` (FROZEN-only, unconditional reason), but the actual day-to-day reassign routes (`items/[itemId]/assign`) capture no reason at all. |

### 4. Dietary three-state model vs pre-flight re-verify (Hinge §1, §10.5)

| Spec decision | Classification | Detail |
|---|---|---|
| Three-state dietary model | **(c) partial** | Real and well-built (`src/lib/dietary.ts`, GTC-150: `unanswered/confirmed_none/confirmed_needs`) but **event-scoped**, not per-person — `EventSetup.dietaryData` is one JSON blob per event. A second, independent legacy model also lives on: `Event.dietaryStatus` (`UNSPECIFIED/NONE/SPECIFIED`) + `Event.dietaryVegetarian/Vegan/GlutenFree/DairyFree` int counts — unreconciled with GTC-150's model. |
| **Per-person dietary captured at Moment 1** as an optional per-person note at household capture; Moment 2 consumes it plus the event-level answer; the three-state remains the safety gate; the pre-flight re-verify shows Kate what she entered, against the plan (Moment 4 §10.5) | **(d) doesn't exist** | No per-person dietary field exists on `Person`/`PersonEvent`/`Household` anywhere. Capture point is now specified precisely: Moment 1 household capture, optional, per-person. |
| Dietary-gap detection in `check.ts` | **(b) contradicts** | `detectDietaryGaps()` reads the **legacy** `Event.dietaryVegetarian`/`dietaryGlutenFree` counts — blind to GTC-150's `EventSetup.dietaryData`. A host's actual Moment 2 dietary answer never reaches conflict detection. |
| Review-before-send screen ancestor | **(d) doesn't exist** | No coverage sweep, no message-preview, no recipient-confirmation screen anywhere. |

### 5. Household/PersonEvent vs Moment 1 recipient toggle — **materially sharpened by the ruling**

| Spec decision | Classification | Detail |
|---|---|---|
| **Recipient control is a household contact picker**: "who should Gather talk to for this household?", defaulting to the primary contact, any adult addable, **cross-household capable** (Grandma's channel may live in another household — channel must be a Person reference, not a boolean), one decision per household (Moment 4 §10.7) | **(d) doesn't exist** | `Moment1InputForm.tsx` captures name/email/phone only. `reachabilityTier`/`contactMethod` are **auto-derived** from contact-info presence — a system inference, not a host judgement toggle. The cross-household-capable requirement (channel as a Person reference, not a boolean) is new, sharper detail versus the original spec's "owner and channel are separate fields" — it rules out a simple boolean flag design. |
| **Child rule is a HARD CONSTRAINT, absolute**: a CHILD-role person never receives system messages regardless of contact info on record; channel is always an adult via the picker; a genuinely-messageable teenager must be explicitly roled as an adult at capture, never inferred from phone presence (Moment 4 §10.6) | **(b) contradicts — explicitly flagged as a hard requirement of the fix** | `HouseholdRole.CHILD` exists with real Person/PersonEvent rows (distinct from pure-headcount `littleCount`). But nothing filters `CHILD` from message eligibility: a child with their own phone/email gets `reachabilityTier: DIRECT` and can be a direct SMS recipient today. §10.6 names this directly: "Current code contradicts this... fixing it is a hard requirement of the recipient-model ticket. No future session may soften this." |
| Reachability tiers as a solution | **(c) partial, doesn't solve it** | `PROXY` tier exists in the enum but is **never written** anywhere in code. Tiers answer "can we reach them," not "should we message them" or "who to talk to instead" — a different axis than the spec's picker. |

Correction to the architecture-contract skill's household-PUT claim: the route is **no longer** delete-and-recreate — GTC-159 (commit `b73f140`) replaced it with a diff-based `reconcileHouseholdMembers()`. Residual risk for new toggle fields: the reconcile path still runs with no transaction.

### 6. Items schema vs criticality badge + task rows + runbook (§5, §8.2, §6, §8.8)

| Spec decision | Classification | Detail |
|---|---|---|
| Criticality set at Moment 2 | **(b) contradicts** | Schema fully supports it (`Item.critical`, `criticalReason`, `criticalSource`, `criticalOverride`), and the **legacy** AI prompt path sets it — but the **live** single-call path (`finalize-plan/route.ts`, GTC-145/146) has no `critical` field in its output schema at all. Every AI-generated item under the live path defaults `critical: false`. |
| Criticality badge in grid, no float-to-top (§8.2) | **(b) contradicts** | Badge exists and renders correctly in the god file and `h/[token]`. But `src/app/c/[token]/page.tsx` (coordinator view) **also sorts unassigned critical items to the top** — directly contradicts §8.2. |
| Task rows sharing assignment machinery | **(d) doesn't exist** | No `Task` model, no row-kind distinction. Day-of choreography exists only as free text (`EventSetup.setUpData/cleanUpData/otherJobsOtherData`), and the live AI schema's category list has no Setup/Cleanup slot. |
| Export/print/runbook capability | **(c) partial** | A "Download PDF" button exists (browser print-to-PDF of a raw item table — no critical badges, no tasks, no tick-boxes, no print-date). A separate "Copy plan as text" clipboard export also exists. Both render raw plan content, which Moment 4 §3 explicitly refuses for the day-to-day screen. |
| Print-date + changes-since-print (§8.8) | **(d) doesn't exist** | No stamping, no reprint-detection anywhere. |
| Live day-of check-off | **(d) doesn't exist** — clean absence, consistent with the spec's refusal. No conflict. |

### 7. The screen (§3, §10.8) — no dedicated agent territory; noted here for completeness

| Spec decision | Classification | Detail |
|---|---|---|
| **Grid is person-primary**: people are the boxes, items live inside the person; a person holding items in different states shows the worst colour (Moment 4 §10.8) | **(d) doesn't exist** | The Moment 4 screen itself doesn't exist in code yet (confirmed across all territories above — no dedicated V2 component for Moment 3 or 4). This ruling fixes the target data shape once building starts: a person-keyed read API, not an item-keyed one. |

---

## Task 2 — Spec-Gap List: RESOLVED

All sixteen questions raised by the original discovery pass were ruled 3 August 2026. Ten rulings live in Moment 4 spec §10 (10.1–10.10); five live in the Hinge spec §2–§3 (release-absolute, why-scope, per-change versioning, mini-sends, the one-tap model); the child-contact-override question is folded into §10.6.

| # | Original question | Resolved by |
|---|---|---|
| 1 | Can a botched send ever be "unsent"? | Hinge §2 — no, not even at the mechanism level; recovery is through the material-change machinery |
| 2 | Does "why" apply to every post-send change or only some? | Hinge §2 — only changes that touch someone (reassignment, removal, a claimed quantity, date/venue); a typo gets a version, no interrogation |
| 3 | Is versioning per-change or batched? | Hinge §2 — universal, silent, per-individual-change; complete history always reachable; storage mechanics deferred to the reconciliation ticket |
| 4 | Does COMPLETE survive the new model? | Moment 4 §10.1 — yes, calendar-driven (event date passing), not host-declared; wrap-up migrates from FROZEN-gated to COMPLETE-gated |
| 5 | What happens when a person is added post-send? | Hinge §2 — a per-person mini-send, same three-movement message, own clocks truncated by the event date |
| 6 | What's the default "red by time" formula? | Moment 4 §10.2 — keyed to needed-by (item drop-off time, else event date); exact constant set at ticket time with founder sign-off |
| 7 | What's the cadence-adjustment UI? | Moment 4 §10.3 — per-event at the pre-flight (standard/relaxed/off); per-person beside the Moment 1 recipient picker (go gentle/don't chase) |
| 8 | When/how is the thank-you offered? | Moment 4 §10.4 — once, a day or two after the date passes, standard register, declinable, never repeated |
| 9 | Do TNZ/Twilio support bounce webhooks? | Moment 4 §10.9 — build instruction: investigate first; if unsupported, degrade gracefully (bounce travels the nudge path) rather than block |
| 10 | Does event RSVP merge with the item-level ask? | Hinge §3 — yes: the tap is the item ask, attendance is inferred; `rsvpStatus` becomes derived, not directly askable |
| 11 | What formula derives the maybe decide-by clock? | Moment 4 §10.2 — same derivation as #6 (needed-by minus a to-be-set constant) |
| 12 | Where is per-person dietary first captured? | Moment 4 §10.5 — Moment 1, optional per-person note at household capture |
| 13 | Does a phone override the child-channel rule? | Moment 4 §10.6 — no, absolute; a messageable teen must be explicitly roled as an adult at capture |
| 14 | What's the Moment 1 toggle's UI mechanic? | Moment 4 §10.7 — a per-household contact picker, cross-household capable, channel as a Person reference |
| 15 | Is the grid per-item, per-person, or a matrix? | Moment 4 §10.8 — person-primary; items live inside the person; worst-colour rule |
| 16 | What's the clone-review/ghost-guest guard? | Moment 4 §10.10 — cloning's first act is a mandatory people-review: old list presented for explicit confirm/remove/edit per household before anything else proceeds |

No gaps remain blocking ticket scoping. D1, C1, G1, E2, E3, K1 (see Task 3) are unblocked. E4's shape is set by §10.9. K1's source is §10.10.

---

## Task 3 — Ticket Breakdown Proposal (approved by Nigel, 2026-08-03)

Structure and effort levels as originally proposed; unblocked tickets now carry their resolving spec citation. **Epic A is filed as GTC-167–169** (see below); B–K remain unfiled pending further founder review, one epic-batch at a time.

**Epic A — The Hinge: Send-Lock & Ledger Architecture** *(foundational)* — **FILED: GTC-167 (A1), GTC-168 (A2), GTC-169 (A3).**

**Epic B — Item/Task/Criticality Foundation**
- B1 — Wire criticality into the live `finalize-plan` AI path; fix the coordinator-view float-to-top contradiction. Effort: high.
- B2 — Task-row data model. Effort: xhigh, schema.

**Epic C — Recipient Model: Owner/Channel Toggle** — **unblocked (§10.6, §10.7).**
- C1 — Household contact picker (§10.7: cross-household capable, channel as Person reference, one decision per household) + absolute child exclusion (§10.6: hard constraint, no phone-presence override). Effort: max, schema.
- C2 — Update `reconcileMembers.ts` to preserve new toggle fields given its non-transactional partial-write risk. Effort: medium.

**Epic D — Guest Response Model: Yes/No/Maybe** — **unblocked (Hinge §3 one-tap model, §10.2 decide-by derivation).**
- D1 — Unify `Assignment.response` into yes/no/maybe with attendance-inferred and `rsvpStatus` demoted to derived state (Hinge §3). Effort: max, schema.
- D2 — Decide-by clock (§10.2 shared derivation) + single follow-up; red through standard door on expiry. Effort: high.
- D3 — "Held softly" reassignment + release notification. Depends on D1, A2. Effort: high.
- D4 — Green-reverting: guest withdrawal reopens the item, routes directly to host. Effort: high.

**Epic E — Nudge Machinery Rebuild**
- E1 — Rebuild cadence to day-4/day-7 "system's own schedule"; remove NOT_SURE forced-conversion nudge (obsoleted twice over — by the maybe ruling and by the one-tap model). Effort: xhigh. ⚠ SMS opt-out zone.
- E2 — Cadence controls **unblocked (§10.3)**: pre-flight per-event pace selector + per-person go-gentle/don't-chase mark beside the recipient picker. Effort: high. ⚠ SMS opt-out zone.
- E3 — Host-set "red by time" line **unblocked (§10.2)**: needed-by-derived default, per-event/per-person/per-item override; constant TBD at ticket time with Nigel. Effort: high.
- E4 — Bounce detection, **shape set by §10.9**: investigate TNZ/Twilio delivery-receipt capability first; wire if present; else document graceful degradation (bounce travels the nudge path) rather than silently substituting it. Effort: medium.
- E5 — Remove host-facing "seen" status; add nudge-clock display. Effort: medium.

**Epic F — Material Change / Opt-Out Reconfirmation (§8.5)**
- F1 — Date/venue re-ask; also the recovery path for a wrong-date send per the ruled release-absolute model (Hinge §2, gap #1). Depends on A2, D1. Effort: high. ⚠ SMS opt-out zone.

**Epic G — Dietary Re-Verification** — **unblocked (§10.5).**
- G1 — Reconcile the two contradicting dietary models; add per-person dietary capture at Moment 1 household capture per §10.5. Effort: max, schema + AI prompt + conflict-detection.
- G2 — Per-person by-name re-verify screen at pre-flight. Depends on G1. Effort: high.

**Epic H — Thank-You / Wrap-Up Rebuild**
- H1 — Convert wrap-up to a once-only offer, a day or two after date-passed (§10.1 COMPLETE + §10.4 timing), with review before send. Depends on Epic A. Effort: high. ⚠ SMS opt-out zone.
- H2 — Dual-voice message architecture (Kate's line + Gather's line), shared with the Hinge ask (I2). Effort: medium.

**Epic I — The Hinge Experience Itself**
- I1 — Pre-flight screen (coverage, dietary re-verify, message preview, recipients confirmed, **now also the per-event cadence-pace selector, §10.3**). Depends on G2, C1. Effort: xhigh.
- I2 — The press: message construction (H2), atomic-feeling rollout, ledger-anchored send timestamp. Depends on A2, H2. Effort: xhigh. ⚠ SMS opt-out zone.
- I3 — Minutes-after screen: assertive push message, yellow grid, nudge-clock. Depends on E5. Effort: high.
- I4 — Guest-side message page: the one-tap ask with attendance inferred and the conditional no-follow-up (Hinge §3); post-yes reminder offer. Depends on D1. Effort: medium. ⚠ SMS opt-out zone.

**Epic J — Moment 4: The Screen & Runbook**
- J1 — The screen: **person-primary grid (§10.8)**, worst-colour rule, colour encoding, tap-for-actions, assistant's critical-red message. Depends on B1, D, E. Effort: xhigh.
- J2 — Criticality badge rendering. Depends on J1. Effort: high.
- J3 — The runbook: printable run sheet, task rows (B2), tick-box affordance, print-date + changes-since-print. Depends on J1. Effort: xhigh.

**Epic K — Clone-Review / Ghost-Guest Guard** — **unblocked, source is §10.10.**
- K1 — Cloning's first act is a mandatory people-review: old guest list presented for explicit confirm/remove/edit per household before anything else in the clone proceeds. Not optional, not skippable. Effort: high.

~28 tickets across 11 epics. Epic A is the hard dependency floor. B1/B2, C1, and G1 can start in parallel with A once filed. Guest-response-shaped work (D, E, F, I4) now has a clear target (Hinge §3) but still depends on A2 for the ledger. J and most of I are necessarily last.

---

## Task 4 — Skill Corrections: APPLIED (GTC-166)

`gather-domain-reference/SKILL.md` and `gather-frontier-and-roadmap/SKILL.md` corrected against GTC-163's superseded-reference scan, cross-verified against current file content. See GTC-166 for the full diff and rationale. `gather-architecture-contract/SKILL.md` section 5 and the RSVP/Assignment-response table in `gather-domain-reference` were deliberately NOT rewritten — both remain accurate descriptions of pre-reconciliation code; each now carries a forward-pointing note rather than a premature rewrite, to avoid documenting code that doesn't exist yet. Full rewrite is owed once Epic A (and Epic D for the RSVP axis) land. `gather-v1-v2-reconciliation-campaign/SKILL.md` needed no changes — confirmed no freeze-ceremony framing tied to its phases.
