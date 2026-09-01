# Gather — V1/V2 Diagnostic Brief

Prepared for architectural review (Claude Fable 5). This is a map of the territory, not a set of fixes. Where I am unsure, I say so. Where the structure does something I can't explain, I name it rather than smoothing it over.

A framing note before the map. The labels "V1" and "V2" are the reviewer's framing and mine; the codebase and docs do not use them. In the docs, "V1" is the original host-dashboard / 3-step-wizard / conflict-detection build described in `docs/GATHER_REPO_OVERVIEW.md` and `docs/SYSTEM_OVERVIEW.md`. "V2" is the **Moment flow** (Moment 1 = guest/household setup, Moment 2 = plan generation) built on `feat/moment-one-redesign` and described in `docs/moment-1-and-2-build-report.md`, `docs/moment-2-flow-document.md`, and tickets GTC-101 onward. The single most important structural fact for the review: **V2 is not a separate application or even a separate route. It is a redesigned front-of-funnel that shares V1's backend, V1's data tables (Team/Item/Assignment), and in places the very same React page component.** This is reconciliation-in-progress, not a clean cutover.

---

## Section 1: The V1/V2 map

### Routes — mostly shared, with V2 entered via a query param, not a path

There is no `/v2` or `/moment` route. The host planning surface for both versions is the same Next.js route, `src/app/plan/[eventId]/page.tsx`. V2 is entered by `?setup=true` on that same route (`docs/moment-1-and-2-build-report.md` describes the entry as `/plan/[eventId]?setup=true`), captured at `page.tsx:373` as `const [showSetup, setShowSetup] = useState(searchParams.get('setup') === 'true')`. The Moment flow then advances through React state flags (`showMoment1`, `showMoment2Opening`, `showMoment2Step1`, `showMoment2Step2Skeleton`, `showMoment2PlanView`) rather than navigation.

So at the route level this is **shared**. At the render level it is **duplicated with divergence inside one file** — see Components below.

Other route families and their status:

- `/plan/new`, `/plan/events`, `/plan/settings`, `/plan/templates` — V1 surfaces, **shared / unchanged** by the Moment work.
- `/h/[token]`, `/c/[token]`, `/p/[token]`, `/join/[token]` — token-based guest/coordinator/participant views. **V1-origin, still live, shared.** The repo overview calls `/h/[token]` a "legacy token-based host view" superseded by the session-based `/plan/[eventId]`, so there is already a V1-internal legacy layer beneath the V1/V2 split.
- `/start/[token]` — V2-era addition from the wrap-up/viral-loop work (GTC-FM2). **V2-only**, though it belongs to the later "Moment 4/5" arc, not Moment 1/2.
- `/gather/[eventId]`, `/demo`, `/billing/*`, `/auth/*` — **shared**.

### Components — this is where V1 and V2 diverge most visibly

`src/components/plan/` holds both generations side by side, undifferentiated by folder:

- **V1-only:** `EventStageProgress.tsx`, `GenerationReviewPanel.tsx`, `GuidedPlanBuilder.tsx`, `GateCheck.tsx`, `FreezeCheck.tsx`, `TransitionModal.tsx`, `ConflictList.tsx` / `ConflictCard.tsx`, `TeamBoard.tsx`, `PeopleSection.tsx`, `RegenerateModal.tsx`, `RegenerationPreview.tsx`, the various add/edit modals, etc.
- **V2-only:** `MomentArc.tsx`, `SetupOpeningScreen.tsx`, `Moment1InputForm.tsx`, `HouseholdCardList.tsx`, `Moment1Summary.tsx`, `Moment2Opening.tsx`, `Moment2Step1Modal.tsx`, `Moment2Step2Skeleton.tsx`, `Moment2PlanView.tsx`.
- **Shared/extracted:** `src/components/shared/OptionTree.tsx` was extracted from `GuidedPlanBuilder` (GTC-131) intended for reuse, and per the build report was "intentionally shipped unused" pending GTC-133 wiring. Worth confirming whether it is yet on a live path.

The page component `src/app/plan/[eventId]/page.tsx` is **3,851 lines** and imports *both* generations: `EventStageProgress` and `GenerationReviewPanel` (V1) alongside the full `Moment1*`/`Moment2*` set (V2). It chooses between them with a sequence of early `return` blocks: `if (showSetup)` (~line 1655) renders the V2 opening/Moment path; `if (showMoment2PlanView && event)` (~line 1801) renders the V2 plan view; the final `return (` (~line 2031) renders the V1 dashboard, which is where `EventStageProgress` (~2154) and `GenerationReviewPanel` (~2214) live. **This is the clearest single piece of evidence that V2 is a parallel implementation layered into V1, not a replacement of it.** Both code paths are reachable from the same mounted component depending on flags. This file is the reconciliation hot-spot.

### API layer — shared base, V2 added new endpoints, old ones stubbed

The API tree under `src/app/api/events/[id]/` is large (conflicts, revisions, freeze/gate/transition, teams, people, suggestions, wrap-up, etc.) and is **predominantly V1, shared by V2** because V2 writes into the same event/team/item model.

V2-specific additions:
- `GET/POST /api/events/[id]/setup` — reads/writes the `EventSetup` record (V2-only).
- `POST /api/events/[id]/finalize-plan` — the V2 single-call generation endpoint (V2-only; see Generation pipeline).
- `PUT`/`DELETE /api/events/[id]/households/[householdId]`, `POST /api/events/[id]/households`, `.../members`, `.../claim` — the redesigned household model (V2-only by intent, but reshaping data V1 also reads).

Divergence/decommission signals:
- `POST /api/events/[id]/generate-section/route.ts` was **deleted** by GTC-146 (the per-section generation route). Confirmed gone: the directory no longer exists. So there is a documented architecture (per-section) whose code has been removed, while docs that describe it (the build report, the flow doc) still stand.
- The build report states old proxy-nudge / per-member household endpoints were "stubbed to 501." I did not verify each stub individually; flagged for the reviewer if the old endpoints matter.

The legacy generation/regeneration routes are **untouched and still live**: `/api/events/[id]/generate` (V1 `GuidedPlanBuilder` path) and `/api/events/[id]/regenerate` + `/regenerate/preview` all call into `src/lib/ai/generate.ts`. GTC-146 explicitly left these alone as out of scope. So **two generation entry points coexist**: V1's `generate`/`regenerate` and V2's `finalize-plan`.

### Data models — shared core, V2 reshaped the people/household layer

`prisma/schema.prisma` is a single shared schema (~20 models). The split runs *through* the models, not around them:

- **Shared, unchanged:** `Event`, `Team`, `Item`, `Assignment`, `Day`, `AccessToken`, billing models. V2's plan output lands in `Team`/`Item`/`Assignment` exactly as V1's does.
- **Reshaped for V2 (divergence within a model):** `Household` and `PersonEvent`. The build report says V2 "replaces the old proxy-Person/`HouseholdMember` model with a household-as-grouping shape in which everyone is a `PersonEvent` with a `householdRole`" (`HouseholdRole` enum: `PRIMARY_CONTACT`/`PARTNER`/`GUEST`/`CHILD`). Note `PersonEvent` *also* still carries the V1 `role: PersonRole` (HOST/COORDINATOR/PARTICIPANT) and the proxy self-relation (`proxyPersonEventId`/`ProxyRelation`). So `PersonEvent` now carries **two role axes from two design generations at once** (`role` and `householdRole`), plus a proxy mechanism the new model is said to drop. This is duplication-with-divergence inside a single table.
- **V2-only:** `EventSetup` (JSONB columns: `mainsData`, `sidesData`, `dessertsData`, `drinksData`, `dietaryData`, `extendedCategoriesData`, `setUpData`/`cleanUpData`/`otherJobsOtherData`, `otherNotes`, `eventType`, and `generatedData`). `Household.littleCount` (renamed from V1-era `childCount`).
- **Dead-by-disuse:** `EventSetup.generatedData` — GTC-146 stopped writing it but kept the column ("deprecate-by-disuse"). It is a V2 column already orphaned by a V2 change.
- **Models that exist but appear unwired (V1-era, per repo overview):** `PlanRevision` (partial), `StructureChangeRequest`, `HostMemory`/`HostPattern`/`HostDefault`, `QuantitiesProfile`, `DeletionReceipt`. These are pre-existing scaffolding, not part of the V1/V2 split, but they add to the "models that don't all map to live code" surface a reviewer will hit.

### Generation pipeline — the most important divergence

There are effectively two AI generation architectures live in the repo, and a third (per-section) that was built and then deleted:

1. **V1 path:** `src/lib/ai/generate.ts` + `claude.ts` + `check.ts`, driven by `GuidedPlanBuilder` and the `/generate`, `/regenerate`, `/regenerate/preview`, conflict-`check`, and explanation routes. Prompts live in `src/lib/ai/prompts.ts` under the legacy surface (`PLAN_GENERATION_SYSTEM_PROMPT`, `PLAN_REGENERATION_SYSTEM_PROMPT`, `EXPLANATION_SYSTEM_PROMPT`, `SELECTIVE_REGENERATION_SYSTEM_PROMPT`, and their `build*` functions). **Still live.**
2. **V2 path (current):** a **single** Claude call from `POST /api/events/[id]/finalize-plan`, built by `buildPlanGenerationPrompt` in `prompts.ts`, capped by `MAX_TOKENS_FULL_PLAN`. GTC-146 made this canonical and deleted the per-section infrastructure.
3. **V2 path (former, deleted):** per-section generation on accordion-close (`generate-section` route, `buildSectionPrompt`/`buildGapPrompt`/`buildDietaryCoveragePrompt`/`buildThingsToConsiderPrompt`, per-section token caps). Built in GTC-116–128, removed in GTC-146.

`prompts.ts` therefore contains **both the entire legacy V1 prompt surface and the new V2 single-call prompt builder in one file**. This is duplication-with-divergence: the V2 builder is a clean reimplementation, but it sits next to the V1 surface it does not replace (because `generate.ts`/regenerate still import the V1 surface). The NZ cultural overrides (GTC-FM3-FM5: NZ Christmas ham/lamb rules, L&P drinks rule, seasonal suppression) were added to the **V1** `PLAN_GENERATION_SYSTEM_PROMPT`, and there is a separate `getNzNotes()` path used by the V2 `buildPlanGenerationPrompt`. Whether NZ rules are consistently applied across both generators is worth checking — they look like parallel, not shared, implementations of "NZ flavour."

`finalize-plan` writes results by **deleting all `source: 'GENERATED'` teams for the event and recreating them** (`finalize-plan/route.ts:272`), preserving hand-added teams. See Section 3 for the data-integrity consequence.

### Payment flow — shared, untouched by the split

Stripe checkout/webhooks/billing (`src/lib/stripe.ts`, `src/lib/billing/sync.ts`, `/api/billing/*`, `/api/webhooks/stripe`, `/api/entitlements/check-create`, `/app/billing/*`) and the $12-NZD-per-event entitlement gate are **shared and appear unaffected** by the Moment redesign. The `?setup=true` entry to V2 is described as the post-payment landing state, so payment feeds V2's entry but the payment code itself is common to both.

### One-line summary of the map

V2 (Moment) is a new front-of-funnel and people/household model **bolted onto V1's event/team/item backend and, in `plan/[eventId]/page.tsx`, into V1's own page component**. Some pieces are clean replacements (the single-call generator replacing per-section; the household model replacing proxy-Person). Others are parallel implementations awaiting reconciliation (two generation entry points, two role axes on `PersonEvent`, V1 and V2 both rendered by one 3,851-line component, NZ rules in two prompt surfaces).

---

## Section 2: Questions you cannot answer from the code alone

These are genuine unknowns. I am not guessing at answers.

1. **Is V1 still in active use, or dormant?** The V1 dashboard render path in `plan/[eventId]/page.tsx` is still reachable, and the `/generate` + `/regenerate` routes are live. Whether any real host still lands on the V1 dashboard, or whether every new event now goes through `?setup=true`, can't be read from the code. Pre-launch status makes this answerable only by the founder.

2. **Is the intent to delete V1 after V2 ships, or to run them in parallel?** This determines whether the duplication in `page.tsx`, `prompts.ts`, and `PersonEvent` is debt to be retired or a deliberate two-mode product. The whole reconciliation strategy hinges on this.

3. **Are the legacy `/generate` and `/regenerate` routes meant to keep working for V2 events?** GTC-146 left them on the V1 `generate.ts` path "out of scope." But a V2 event can presumably still hit "regenerate." Does regenerate-via-V1-path on a V2-generated plan produce coherent output, and is that an intended capability or an accident of leaving the route alone?

4. **Does the V1 prompt surface in `prompts.ts` still need to exist, or is it only kept alive by the untouched regenerate routes?** If those routes are themselves dormant, the entire legacy prompt surface may be deletable — but only the founder knows if anything still calls them in practice.

5. **Is `EventSetup.generatedData` safe to drop?** GTC-146 stopped writing it. Whether any read path or analytics/export still reads it is not something I traced exhaustively.

6. **What is the intended semantics of "I skipped the dietary section" vs "there are no dietary needs"?** The code collapses both to "Dietary requirements present: none" (see Section 3). Whether that collapse is acceptable product behaviour, or a real safety gap for a food-coordination app, is a product judgement.

7. **Is the household PUT delete-and-recreate acceptable given the downstream cascades?** The build report calls delete-and-recreate "simpler than diffing" — a deliberate choice. Whether the founder understood that it cascades to nudge history, wipes team membership on recreated `PersonEvent`s, and can orphan no-email Persons is unknown. It may be a known, accepted trade-off for pre-launch; it may be an unrecognised risk.

8. **Which document is the source of truth where they disagree?** The docs disagree on basic facts: Next.js 14.2.35 (repo overview / system overview) vs ^15.5.12 (build report) — and `CLAUDE.md` notes a Turbopack module-format issue that implies a newer Next; AI model "Claude 3.5 Haiku" (system overview, V1) vs `claude-sonnet-4-6` (V2 docs); schema "20 models / 50+ enums" vs "17 models / 30+ enums". A reviewer needs to know which docs are current before trusting any of them.

9. **Is `OptionTree.tsx` (the GTC-131 extraction) wired into any live path yet, or still the "intentionally unused" shipment?** Determines whether it's shared infrastructure or dead code.

10. **What is the test reality?** Docs claim "91/91 tests passing" and per-ticket suites (host-nudge 40/40, wrap-up 35/35), but the repo overview also says "No automated test suite found in /tests (only security validation scripts)" and "no E2E / no unit tests." I have not run the suite. A reviewer should not trust the green numbers without running them.

---

## Section 3: Suspected issues, flagged by confidence

### High confidence — I can point to the code

**1. Household PUT delete-and-recreate wipes team membership and cascades silently (the named gotcha, confirmed and worse than just assignments).**
`PUT /api/events/[id]/households/[householdId]` (route.ts:150–159) deletes every non-primary `PersonEvent` for the household, then recreates them via `createMember` (lines 195–261). Three concrete consequences:
- The recreated `PersonEvent` records are created with **no `teamId`** (lines 250–260 set `personId`, `eventId`, `role`, reachability, household fields — never `teamId`). So any non-primary household member who had been placed on a team loses that placement on every household edit. This matters because the assign route (`items/[itemId]/assign/route.ts:65`) **requires `personEvent.teamId === item.teamId`**. After a household edit, that person is no longer a valid assignee for their own team, silently.
- `NudgeLog.personEventId` has `onDelete: Cascade` (schema ~line 971). Deleting the `PersonEvent` **cascade-deletes that person's nudge history**, which is what cooldown/eligibility logic reads. Editing a household can therefore reset nudge state without anyone asking for it.
- The reviewer's framing ("items should be assigned to Person, not PersonEvent") is half-borne-out: `Assignment.personId` already points to **Person** (schema:245–247), so the assignment row itself survives the `PersonEvent` delete. The break is one level removed — the *team-membership* that makes the assignment valid is what gets destroyed, and the assignment is left pointing at a Person whose `PersonEvent` is now team-less.

**2. No-email household members are re-created as brand-new Person records on every edit.**
In `createMember` (route.ts:204–217), a Person is looked up only by email (`findUnique({ where: { email } })`). A member with no email skips the lookup entirely and **always hits `prisma.person.create`**. So every household PUT involving a no-email partner/child/guest mints a new Person row, orphaning the previous one (the old Person is not deleted) and orphaning any `Assignment.personId` that pointed to it. This is the same family of silent data-integrity risk as the gotcha, in the same handler. Given Gather's audience (families, kids without email), no-email members are the common case, not the edge case.

**3. `finalize-plan` re-runs destroy existing assignments on generated items.**
`finalize-plan/route.ts:272` does `prisma.team.deleteMany({ where: { eventId, source: 'GENERATED' } })` before recreating teams/items. `Item.teamId` cascades on team delete, and `Assignment.itemId` cascades on item delete (schema). So re-finalizing (or any second pass through V2 generation) **silently deletes every assignment made against AI-generated items**. The comment only worries about preserving hand-added *teams*; it does not address assignments on generated items. This is the delete-recreate pattern echoing again, at the plan level rather than the people level. Confidence is high on the mechanism; medium on impact, because it depends on whether the V2 flow lets a host assign and then re-generate (see Q3/Q7).

**4. Moment 2 dietary skip-path: food is generated with an explicit "no dietary requirements" signal when the host simply skips the section.**
Confirmed end to end. The dietary accordion's data type (`Moment2Step1Modal.tsx:42`, `DietaryData = { requirements, other }`) has **no `stillDeciding` field**, unlike every food category, which does. So dietary cannot be marked "still deciding" — it is either filled in or absent. In `finalize-plan/route.ts:129–134`, absent `dietaryData` yields `dietaryRequirements = []`. `buildPlanGenerationPrompt` (`prompts.ts:688–691`) then emits literally `Dietary requirements present: none`. Food categories have their own defaults and generate regardless. Net effect: a host who skips the dietary accordion gets a full food plan generated as if affirmatively no dietary needs exist, with no flag that this was never confirmed — and the bundled `dietaryCoverage` check passes trivially because there are zero requirements to cover. The design doc intended dietary to be answered first "so it informs every food prompt" and intended a "Still deciding" state to defer the question; neither protection exists on this path. This is the confirmed flaw the reviewer flagged; the code confirms it and locates it precisely.

**5. V1 and V2 are both rendered by one 3,851-line component.**
`src/app/plan/[eventId]/page.tsx` imports both generations and switches via early returns (V2 setup path ~1655, V2 plan view ~1801, V1 dashboard ~2031). Not a bug in itself, but a high-confidence structural liability: any change to shared state, data fetching, or the event object risks both products at once, and the file is large enough that the two paths' coupling is hard to reason about. This is the reconciliation surface.

### Medium confidence — looks wrong, needs more context

**6. GTC-146 single-call architecture: larger blast radius and a token ceiling the ticket itself flags.**
GTC-146's own "known limitations" admit: single-response error surface is larger than per-section and "production scale may need retry logic"; and the 16K token cap "may be insufficient at 50+ guest scale." `finalize-plan` makes **one** `callClaudeForJSON` with `temperature: 0.8` and `MAX_TOKENS_FULL_PLAN`, no retry, and parses the whole plan from a single JSON blob. The route guards `aiCallsUsed >= AI_CALL_LIMIT` but I see no truncation-recovery or partial-result handling — a truncated or malformed JSON at large guest counts looks like it would fail the whole generation. Whether this bites depends on real guest-count distributions (medium because I haven't load-tested it).

**7. `PersonEvent` carries two role systems plus a proxy mechanism the new model claims to drop.**
`role: PersonRole` (V1) and `householdRole: HouseholdRole?` (V2) coexist on the same record, alongside `proxyPersonEventId`/`ProxyRelation`. The current-data-model doc already flags `PersonRole.HOST` as "LEGACY... appears unused" and notes "dual coordinator systems." Stacking the V2 household axis on top without retiring the V1 axis is the kind of thing that produces "which field is authoritative?" bugs. Medium confidence because I haven't traced every consumer of `role` vs `householdRole`.

**8. NZ cultural rules appear to live in two prompt surfaces.**
GTC-FM3-FM5 added NZ Christmas/L&P/seasonal rules to the **V1** `PLAN_GENERATION_SYSTEM_PROMPT`. The V2 `buildPlanGenerationPrompt` uses a separate `getNzNotes()` mechanism. If both generators are reachable, NZ behaviour may differ between V1-regenerate and V2-finalize for the same event. Medium because I read the prompt structure, not a side-by-side output comparison.

**9. GTC-141 plan-view interactions: bulk delete is N sequential HTTP DELETEs with no confirmation.**
Confirmed in `Moment2PlanView.tsx:132–148` — `handleBulkRemove` loops `await onRemoveItem(id)` one request at a time. The ticket acknowledges this ("Slow for large selections but correct... no batch endpoint exists") and that "Quick delete has no confirmation step." Also confirmed: reorder was removed entirely (the ticket removed `onReorderItem` and a 71-line handler from `page.tsx`), while `Item.displayOrder` remains in the schema and is still written by `finalize-plan`. So the column persists with no UI to change it — not a bug, but a now-vestigial field worth noting. Medium because correctness is fine; the concerns are UX/perf and an orphaned capability, which need product weigh-in.

### Low confidence / worth a second look

**10. The docs describe a deleted architecture as if current.** `docs/moment-1-and-2-build-report.md` and `docs/moment-2-flow-document.md` describe per-section generation (`generate-section`, per-section caps, `generatedData` caching) in detail. GTC-146 deleted all of it. Anyone reviewing from those docs alone is working from a superseded design. Not a code bug, but a real hazard for the next reviewer — flagging so Fable 5 reads GTC-146 *before* the build report.

**11. Something about the `?setup=true` lifecycle feels fragile.** There are at least three places in `page.tsx` that read, strip, or carry `setup` from the URL (initial state at 373, a "clean ?setup=true from URL" effect ~558, and a comment ~1549 explaining that stripping it wrong "re-triggers the setup effect and opens EditEventModal instead"). The fact that the code already documents a footgun here suggests the query-param-as-mode-switch is doing more load-bearing work than is comfortable. I can't point to a live bug, but the density of defensive comments around one query param is a smell.

**12. `Household.littleCount` (un-named kids) is counted but never personified.** `finalize-plan` adds `littleCount` into `totalKids` for portion math (route.ts:152–153), which is right for quantities. But because little kids are not `PersonEvent` records, anything that iterates household members (nudges, reachability, "who's missing") cannot see them. Probably intended — but the asymmetry between "counted for food" and "invisible to coordination" is worth a second look for downstream features.

**13. The repo carries a lot of half-wired models** (`PlanRevision`, `StructureChangeRequest`, `HostMemory`/`HostPattern`/`HostDefault`, `QuantitiesProfile`, `DeletionReceipt`). These predate the V1/V2 split and aren't part of it, but they enlarge the "schema doesn't map cleanly to live code" problem. `DeletionReceipt` with "no GDPR flow implemented" is the one I'd personally look at twice given NZ/privacy obligations, but that's outside the stated scope and I'm flagging it only because it sits next to everything else here.

---

*End of brief. Diagnosis only — no fixes proposed, by design.*
