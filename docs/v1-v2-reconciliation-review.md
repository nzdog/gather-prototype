# Gather V1/V2 reconciliation — architectural review

Prepared against `feat/moment-one-redesign` (HEAD `5068020`). All file/line references are to that tree. Call graphs were traced by import and fetch-site analysis, not by runtime instrumentation; where a classification rests on a single piece of evidence, the evidence is named so it can be checked.

Two structural findings frame everything below. They change the shape of the prune list, so they come first.

**Finding 1: every new event enters V2, and every approved V2 plan exits into V1.** `/plan/new/page.tsx:147` redirects every newly created event to `/plan/[eventId]?setup=true` — the V2 entry. At the other end, the V2 plan view's approve handler (`page.tsx:1927–1938`) reloads event/teams/items/conflicts and sets `showMoment2PlanView(false)`, which falls through to the final return — the V1 dashboard. V2 has no invite, share, people-assignment, nudge, freeze, or conflict surface of its own: `Moment2PlanView.tsx` imports only `MomentArc` and toast context, and the only UI that hands out links — `SharedLinkSection` (rendered at `page.tsx:3409`), `InviteStatusSection` (`:3415`), the "View as Host" button (`:2064`) — lives in the V1 dashboard. `ensureEventTokens` (`src/lib/tokens.ts:34`) is invoked only from the transition workflow (`workflow.ts:746`), the people route (`people/[personId]/route.ts:233`), and the tokens route (`tokens/route.ts:52,78`), all driven from V1 surfaces.

So "V1" is two different things fused in one file: a **dead generation pipeline** (GuidedPlanBuilder → `/generate`/`/regenerate`) that V2 has replaced, and a **live coordination surface** (invites, people, nudges, freeze, conflicts) that is currently the back half of V2's own journey. The first is prunable; the second is load-bearing until V2 grows its own coordination surface, which is a product milestone, not a refactor.

**Finding 2: the V1 regenerate path is hot on every V2 event, and it's worse than "left alone."** The "Regenerate Plan" button renders for any non-demo event in DRAFT/CONFIRMING with teams (`page.tsx:2102–2122`) — which is exactly the state every approved V2 plan is in. It drives `regeneratePlan` in `src/lib/ai/generate.ts` using `PLAN_REGENERATION_SYSTEM_PROMPT`, i.e. the V1 prompt regime, over V2-generated data — with the *other* NZ-rules implementation (hardcoded in `PLAN_GENERATION_SYSTEM_PROMPT`, `prompts.ts:10–20`, vs. the config-driven `getNzNotes()` at `config-loader.ts:181` consumed by the V2 builder at `prompts.ts:631`). This answers the brief's Q3: regenerate-via-V1 on a V2 plan is an accident of leaving the route alone, and the two prompt regimes are not coherent with each other.

---

## 1. The prune list

Three tiers: deletable now on the evidence; deletable after one named product decision; and not deletable despite the V1 label.

### Tier 1 — safe to delete now (no live caller)

**`/api/events/[id]/suggestions/*`** — all five routes (list, `[suggestionId]`, accept, dismiss, explain). No fetch to any of them exists anywhere in `src/`. The conflict UI uses a different family: `ResolveWithAIModal.tsx:50` calls `conflicts/[conflictId]/suggest-resolution`, which has its own inline prompt and does not touch `generate.ts`. Deleting the explain route also frees `generateExplanation` (`generate.ts:184`), and `EXPLANATION_SYSTEM_PROMPT` + `buildExplanationPrompt` (`prompts.ts:235, 513`), whose only importer is `suggestions/[suggestionId]/explain/route.ts:4`.

**`EventSetup.generatedData`** (`schema.prisma:997`) — zero reads or writes across `src/`, `scripts/`, and `tests/`. GTC-146 stopped writing it; nothing ever read it back after that. Safe to drop. Migration shape: single nullable-Json column drop; rollback is re-adding the column (the cached data is not restorable, which is acceptable — it was a cache for an architecture that no longer exists).

**`StructureChangeRequest`** (`schema.prisma:488–505`) — zero `prisma.structureChangeRequest` references in `src/`. Its only relation is a cascade from Event. Safe to drop the table.

**`POST /api/events/[id]/households/[householdId]/members`** — confirmed stubbed to 501 ("being redesigned for the new household model"). Delete the file; household member writes go through the household PUT.

**Possibly dead, lower confidence:** `/api/events/[id]/days` is fetched at `page.tsx:678` but the result appears unused in any render path. Verify before deleting; cheap to leave.

### Tier 2 — deletable as a unit, after one product decision

The decision: **what does "regenerate" mean for a V2 event?** Either route the dashboard's Regenerate button to a V2 re-finalize (or remove it), or accept that V1 regeneration stays alive indefinitely. Once decided in V2's favour, this entire subgraph deletes together, because its internal references are closed:

- **Routes:** `/api/events/[id]/generate`, `/regenerate`, `/regenerate/preview`. Their only library is `generate.ts` (imports at `generate/route.ts:9`, `regenerate/route.ts:5`, `regenerate/preview/route.ts:4`).
- **`src/lib/ai/generate.ts`** entirely — its four consumers are the three routes above plus the Tier-1 explain route.
- **Legacy prompt surface in `prompts.ts`:** `PLAN_GENERATION_SYSTEM_PROMPT` (:8), `PLAN_REGENERATION_SYSTEM_PROMPT` (:173), `SELECTIVE_REGENERATION_SYSTEM_PROMPT` (:262), `buildGenerationPrompt` (:304), `buildRegenerationPrompt` (:408), `buildSelectiveRegenerationPrompt` (:555). Sole importer of all six: `generate.ts`. A side benefit falls out for free: after this deletion, the config-driven `getNzNotes()` path is the *only* NZ-rules surface, resolving the brief's two-implementations concern (issue 8) without a reconciliation project.
- **Components:** `HostDescriptionModal` (rendered `page.tsx:2591`) and `GuidedPlanBuilder` (only importer: HostDescriptionModal); `RegenerateModal` (`page.tsx:2581`) and `RegenerationPreview` (only importer: RegenerateModal); `GenerationReviewPanel` and the `reviewMode` block (`page.tsx:2204+`); the "Generate Plan" button block (`page.tsx:2082–2101`, renders only when `status === 'DRAFT' && teams.length === 0` — a state V2 events occupy only if the host abandons setup).
- **Caveat — the demo:** `/demo/review/page.tsx:62` calls `/generate`, and the demo review page imports `GenerationReviewPanel` and `ItemReviewCard`. The same product decision must cover the demo: port it to finalize-plan, keep it pinned to V1, or retire the demo review flow. Don't delete the routes out from under it.
- **`PlanRevision`** — *still referenced; not part of this deletion yet.* It is written live by the transition workflow snapshot (`workflow.ts:839`) and read by the revisions routes and `RevisionHistory` (V1-only component, `page.tsx:2528, 3801`). If revision history goes, delete the routes and component *and* the snapshot write at `workflow.ts:800–892` together; only then is the table droppable. Until then it is live V1-coordination code, not dead code.

### Tier 3 — V1-labeled, but load-bearing; do not delete

- **The V1 dashboard's coordination surface** — `PeopleSection` (+ its modals, TeamBoard), `InviteStatusSection`/`InviteFunnel`/`WhosMissing`/`SharedLinkSection`/`CopyPlanAsText`, `NudgeComposer`/`PersonInviteDetailModal`, `GateCheck`/`FreezeCheck`/`TransitionModal`/`UnfreezeSection`/`FrozenEditModal`, `ConflictList`/`ConflictCard`/`ResolveWithAIModal` with the `check` and `conflicts/*` endpoints, `EventStageProgress`/`NextStepBanner`/`SetupChecklistBanner`/`useEventSetupProgress`. This is the only implementation of everything that happens after "Plan approved." Evidence: Finding 1.
- **Token routes — all four stay.** `/join/[token]` is the shared-link mechanism, minted by `shared-link/route.ts:103` and surfaced only through `SharedLinkSection`. `/p/[token]` links are embedded in SMS nudges (`nudge-sender.ts:43, 177`) independent of any UI. `/c/[token]` is the coordinator surface. `/h/[token]` is still wired into the live dashboard ("View as Host", `page.tsx:2064`) and hosts `FrozenEditModal` and a `TransitionModal` usage. `/h` is a legitimate *V1-internal* retirement candidate (the repo overview already calls it superseded by session-based `/plan`), but that is orthogonal to V2 reconciliation — don't bundle it into this prune.
- **`OptionTree.tsx` is live**, answering the brief's Q9: imported and rendered by `Moment2Step1Modal` (imports at :12–15, rendered at :517, :527, :559, :632, :830). GTC-133 did wire it. It is V2 infrastructure now, not dead code.
- **Proxy-nudge code is live** despite having no client-side callers: `nudge-scheduler.ts:3–4` imports `findProxyNudgeCandidates` and `processProxyNudges`, on the cron path. The `proxyPersonEventId` self-relation on PersonEvent is therefore still consumed; retiring the proxy mechanism is a nudge-system decision, not a V1/V2 one.
- **Half-wired models, individually:** `HostMemory`/`HostPattern`/`HostDefault` — live via `/api/memory*` routes, consumed by the `/plan/settings` page; keep. `QuantitiesProfile` — written on template save (`templates/route.ts:135`), read on clone (`templates/[id]/clone/route.ts:87`), deleted with memory (`memory/route.ts:117`); keep while templates exist. `DeletionReceipt` — written at `memory/route.ts:127` as the audit record of a memory deletion; keep (it is the only thing resembling a privacy-deletion trail). `PlanRevision` — see Tier 2. `StructureChangeRequest` — Tier 1, drop.
- **`PersonEvent`'s two role axes** — `role` still drives token scoping (`tokens.ts:164–217`) and nudge eligibility; `householdRole` drives V2. Reconciling them is real but is not deletion work; nothing here is prunable today.

---

## 2. The delete-and-recreate pattern

These are one class: write handlers treat dependent rows as value objects — things you can destroy and re-mint from the request payload — while the rest of the system hangs identity-keyed state off those rows. The state that breaks, per row type: `PersonEvent.id` carries team placement (`teamId`, required by the assign route's check at `items/[itemId]/assign/route.ts:65`) and nudge history (`NudgeLog.personEventId`, `onDelete: Cascade`, `schema.prisma:971`); `Person.id` carries assignments (`Assignment.personId`, `schema.prisma:245–247`, no cascade — orphans silently); `Team.id`/`Item.id` carry assignments transitively (`Item.teamId` cascade `schema.prisma:235`, `Assignment.itemId` cascade `:246`).

**One finding the brief missed, and it upgrades the severity of the finalize-plan instance:** `PersonEvent.team` is `onDelete: Cascade` (`schema.prisma:170`). `finalize-plan`'s `team.deleteMany({ eventId, source: 'GENERATED' })` (`finalize-plan/route.ts:272`) therefore doesn't just destroy assignments on generated items — it **deletes the PersonEvent row of every person placed on a generated team**. Those people vanish from the event: household membership, RSVP state, and (via the NudgeLog cascade) their entire nudge history. Re-running generation can silently remove guests.

The cheapest correct pattern is upsert-with-diff keyed on identifiers the client already holds. Per instance:

**(a) Household PUT** (`households/[householdId]/route.ts`, delete at :150–159, recreate via `createMember` :195–261). The GET already returns `members[].id` (the PersonEvent id) and nested person ids (`households/route.ts:17–25`); the PUT body shape (:6–22) simply doesn't round-trip them. Migration shape: add optional `personEventId` to each member in the request; server diffs — update matched rows in place (Person name/email/phone; `householdRole` on the PersonEvent), create payload members without an id, delete only DB members absent from the payload. Team placement and nudge history survive edits untouched. No schema migration; pure handler + form change, trivially rollback-able. The PUT already returns the full updated household (:293–311), so the client refreshes ids from the response it already receives.

**(b) finalize-plan re-runs.** Two layers, and the first should happen regardless of anything else:

1. *Schema guard:* change `PersonEvent.team` from `onDelete: Cascade` to `SetNull` (`schema.prisma:170`). Migration shape: alter one FK constraint; no data movement; rollback is re-altering the constraint. With Cascade in place, any generated-team deletion anywhere silently deletes people — this is a standing landmine independent of the write-pattern fix.
2. *Write-path diff:* stamp each generated team with its canonical category key — `Team.scope` (`schema.prisma:106`) is an existing nullable string, so no migration — then diff by key instead of delete-all: for matched teams, delete only items where `aiGenerated && !userConfirmed` and no assignment exists, insert the new generated items, and leave assigned or user-confirmed items in place; delete unmatched old generated teams only when they contain no assigned items. (Matching by team *name* is fragile because the name comes from model output.)

   A legitimate pre-launch shortcut, if the diff feels heavy: keep delete-and-recreate but refuse to run when any generated item carries an assignment, returning a "re-generating will remove assignments" error that the UI surfaces with an explicit confirm. Less correct, much cheaper; whether re-finalize-after-assignment is a real flow is the founder's call (today the V2 UI only re-enters generation via Step 1's back path, before approval — but the regenerate button from Finding 2 makes a second pass reachable on every event).

**(c) No-email member identity.** Identity should be the **PersonEvent id round-tripped by the client**, which fix (a) already establishes. It exists, it's stable, and it's guaranteed unique per person-per-event (`@@unique([personId, eventId])`, `schema.prisma:174`). The alternatives are worse: a composite key on household + name + role collides for two guests named Sam and breaks on rename (renames are exactly what edit flows do); a client-minted UUID adds a second identity scheme when the server already issued one the client demonstrably receives. Email lookup (`route.ts:206`) remains useful as dedupe for *newly added* members only. Two follow-ons worth one line each: the existing orphan Person rows from past edits should be counted before being cleaned (rows with no PersonEvent, no assignments, no hosted events), and `createMember`'s cross-household guard (:241 — a member already in another household is silently left there) deserves a deliberate behaviour rather than an accidental one.

---

## 3. The reconciliation hot-spot: `plan/[eventId]/page.tsx`

Recommendation: **extract V2 to its own route** (e.g. `/plan/[eventId]/setup`), now — not after V1 deletion.

Why this is the cheapest correct move:

- **The handoff is already fetch-shaped, not state-shaped.** `onApprove` (`page.tsx:1927–1938`) re-fetches event, teams, items, and conflicts from the APIs before dropping into the dashboard; no in-memory state crosses the V1/V2 boundary that a `router.push('/plan/[eventId]')` wouldn't reproduce. The expensive case for route extraction — shared mutable state — doesn't exist here.
- **The V2 state machine is self-contained.** Six booleans (`showSetup`, `showMoment1`, `showMoment2Opening`, `showMoment2Step1`, `showMoment2Step2Skeleton`, `showMoment2PlanView`, declared at :373–380) plus the Moment-2 plan state, with data needs limited to event, households, setup, and the team/item mappers for the plan view.
- **It deletes the documented footgun class outright.** The three sites defending `?setup=true` (initial state :373, the URL-cleaning effect ~:556, and the comment at ~:1549 explaining how stripping it wrong re-opens EditEventModal) all exist because *mode lives in a query param on a stateful page*. A path makes the mode declarative; `/plan/new:147` changes by one string.
- **It converts the eventual V1 prune into a file-local shrink.** After extraction, `page.tsx` is V1-only; deleting the Tier-2 generation surface becomes mechanical, and the file stops being a place where a V2 change can regress the dashboard V2 itself depends on.

The cost is mild duplication of data-loading and auth plumbing between the two routes; extract the few fetch helpers (`loadEvent`, `loadTeams`, `loadItems`, `loadHouseholds`) into a small hook or lib module as part of the move. That is plumbing, not an abstraction layer.

The others: **extract-shared-primitives** is the most expensive option and builds abstractions over a surface half of which is scheduled for deletion — you would be designing shared primitives around `GenerationReviewPanel` and `RegenerateModal` the week before deleting them. It becomes the right altitude only *after* the prune, if the V2 plan view and the dashboard genuinely converge. **Accept-as-is** is free today but keeps both generations coupled through exactly the period of heaviest V2 churn, pre-launch, with no test suite as a net (noted, not blocking); and the query-param lifecycle stays load-bearing the whole time.

---

## 4. The dietary skip-path

Confirmed end to end as the brief located it: `DietaryData` (`Moment2Step1Modal.tsx:42–45`) has no `stillDeciding`; absent `dietaryData` collapses to `dietaryRequirements = []` (`finalize-plan/route.ts:129–134`); the prompt then asserts `Dietary requirements present: none` (`prompts.ts:688–691`); and the bundled `dietaryCoverage` check passes vacuously (zero requirements to cover), so nothing downstream ever flags it. The founder's reclassification is right: for a food-coordination app this is an affirmative false statement generated from silence.

One fact makes the fix cheaper than it looks: the dietary accordion already renders through the same `AccordionShell` as the food categories and passes `stillDeciding={false}` with a no-op toggle (`Moment2Step1Modal.tsx:904–908`); the shell already renders the "Still deciding?" affordance (:789). And the prompt builder already has the skip machinery (`stillDeciding` categories are filtered at `prompts.ts:670` and listed as "skip these" at :710). This is wiring, not building.

**The fix:**

1. **Add `stillDeciding` to `DietaryData`**, persisted inside the existing `dietaryData` Json column — no schema migration. But note the real shape of the problem: dietary has *three* states — confirmed needs, confirmed none, unconfirmed — and a boolean defaulting to `false` only renames the silent skip. So: **default `stillDeciding: true` for new setups**, cleared when the host either selects requirements / enters "other" text, or ticks an explicit "No dietary requirements" option added to `DIETARY_OPTIONS` (:142). Untouched means unconfirmed; "none" becomes something a host must say, not something the system infers. Legacy `dietaryData` rows lacking the key should read as `stillDeciding: true` (safety-first); the founder should expect existing test events to start showing the pending state.

2. **`finalize-plan` when still-deciding: generate with a pending flag, don't gate.** Replace the :688–691 block with an explicit pending state: dietary requirements are *not yet confirmed*; prefer naturally flexible items; tag dietary-relevant items; and return `dietaryCoverage` containing a single entry `{ requirement: "Dietary requirements unconfirmed", covered: false }` so the coverage check cannot pass trivially (`route.ts:243`, displayed at `Moment2Step2Skeleton.tsx:173–186`, which currently hides itself when coverage is empty — the pending entry makes it render). Gating generation entirely would reintroduce the friction Moment 2 exists to remove, and "I'm waiting on replies about allergies" is a normal, legitimate state to generate a draft plan in. The named product judgement that remains: whether unresolved dietary should *hard-block* approve/share, or soft-block. Recommendation: soft-block — approve stays enabled behind an explicit confirm ("Dietary needs are still unconfirmed — share anyway?").

3. **What the host sees:** a persistent amber banner on `Moment2PlanView` — "Dietary needs still being confirmed — resolve before sharing" — whose action returns to the Step 1 modal with the dietary accordion open (the back path already exists, `page.tsx:1939–1943`), plus the always-rendered uncovered entry in the coverage block from (2), plus the approve-time confirm. Carrying the banner onto the dashboard after approval (via `NextStepBanner`) is a sensible follow-up, not part of the minimum fix.

4. **Sequencing dependency on deliverable 2:** "resolve dietary, then regenerate" runs `finalize-plan` again, which today is the destructive write from section 2(b) — on an approved plan it would delete placed guests and assignments. The schema guard (PersonEvent `SetNull`) and at minimum the assignment-guard shortcut should land before or with this fix, or resolving dietary late becomes the trigger for the data-loss path.

---

## Product judgements named (where code judgement stops)

1. **Regenerate semantics for V2 events** — re-finalize, or remove the button? Unlocks all of Tier 2.
2. **The demo's fate** — `/demo/review` is the second consumer of `/generate` and `GenerationReviewPanel`.
3. **Hard vs. soft block on sharing with unconfirmed dietary** — recommendation is soft, but it's a safety-posture call.
4. **Re-finalize with assignments present** — full diff or block-with-confirm; depends on whether regenerate-after-assignment is a flow worth preserving.

Test reality, noted without blocking: the per-ticket suites in `tests/` are standalone scripts, not a wired test runner; none of the deletions above are protected by automation. The prune order that minimizes risk is Tier 1 → page split (section 3) → Tier 2, verifying the V2 happy path manually after each.
