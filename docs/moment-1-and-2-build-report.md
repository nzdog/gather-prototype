# Moment 1 & Moment 2 — What's Been Built

> **⚠ SUPERSEDED (recorded 2026-07-09, GTC-162).** The "Progressive AI
> generation" section below (GTC-121/127/128: `generate-section`,
> `EventSetup.generatedData` caching, per-section token caps) describes
> architecture that GTC-146 replaced with single-call generation and
> GTC-152 deleted outright. The "Reorder" bullet under Step 2 describes a
> capability GTC-141 removed entirely. **Do not implement from either.**
> See `gather-failure-archaeology` §5 for the full symptom → root cause →
> measured revert story (86→25 items), and `gather-ai-generation` for the
> current single-call pipeline.
>
> The rest of this report — the Moment 1 household/`PersonEvent` build
> narrative, opening screen, input flow, card list, and Step 2's
> non-generation interaction design — is historical build narrative not
> retold elsewhere and is kept for that reason. It reflects the state of
> the code as of the tickets cited, not necessarily today's; e.g. the
> household `PUT` behaviour it describes as "delete-and-recreate (simpler
> than diffing)" was replaced by a diff-based upsert in GTC-159/GTC-160.

*Source: tickets GTC-101 through GTC-131 in `docs/tickets/`. All
tickets below were closed against the `feat/moment-one-redesign` branch
unless noted. GTC-101–GTC-115 deliver Moment 1; GTC-116–GTC-131 deliver
Moment 2. Tickets below GTC-101 do not touch either moment.*

---

## At a glance

| Moment | Scope | Tickets | Status |
|---|---|---|---|
| 1 — "Who's coming?" | Household-based guest entry, summary, edits | GTC-101 → GTC-115 | All closed |
| 2 — "What's the plan?" | Step 1 accordion brief + Step 2 AI-generated editable plan | GTC-116 → GTC-128, 131 | All closed except GTC-130 (build hygiene, deferred) |

Moment 1 is feature-complete end-to-end. Moment 2 is feature-complete
across schema, AI generation pipeline, both UI steps, polish, and the
extracted `<OptionTree>` shared component (GTC-131) ready for reuse.
The only open item in the range is GTC-130 — an ESLint dependency
alignment, non-blocking and explicitly hygiene rather than functional.

---

## Moment 1 — "Who's coming?"

Kate's first job: get the people in her head onto the page as
households, then move on. The build replaces the old
proxy-Person/`HouseholdMember` model with a household-as-grouping shape
in which everyone is a `PersonEvent` with a `householdRole`.

### Data model (GTC-101)

The `Household` model was redesigned. It no longer carries a proxy
`Person` or per-member claim/nudge fields. Instead it is a thin grouping
that hangs off the `Event`, with members realised as `PersonEvent`
records carrying a new `HouseholdRole` enum (`PRIMARY_CONTACT`,
`PARTNER`, `GUEST`, with `CHILD` added later in GTC-112). Children were
initially stored as a single `childCount` integer on the household;
GTC-112 split this into named "kids with jobs" (helpers, full
`PersonEvent` records with role `CHILD`) and an unnamed `littleCount`
for kids without jobs. The migration renamed `childCount` to
`littleCount` cleanly. Old proxy-nudge claim/member endpoints were
stubbed to 501 — the new schema deliberately drops per-member nudge
tracking.

### Opening screen (GTC-102)

Visiting `/plan/[eventId]?setup=true` shows a full-screen opening
experience instead of the dashboard. It contains:

- The opening line: *"We're here to organise what could be described as
  a herd of cats. Let's get it done."*
- A new four-step `MomentArc` indicator with Moment 1 highlighted.
- A primary `"Ready to start herding →"` button which fades the screen
  out and hands off to the Moment 1 input form.

Two new components landed: `MomentArc.tsx` and `SetupOpeningScreen.tsx`.
The old auto-open-Edit-Event-modal behaviour was retired.

### The input flow (GTC-103, GTC-104, GTC-108, GTC-110, GTC-112–115)

`Moment1InputForm.tsx` is the heart of Moment 1. It works like a
quick brief, not a form. Per household Kate provides:

- **Primary contact:** name (required); email and phone optional with
  inline `"Skip for now →"`. Phone validation reuses `normalizePhoneNumber`
  from `src/lib/phone.ts`.
- **Partner** (max one, blue-bordered sub-form).
- **Kids with jobs** (helpers — full sub-form per child, name required,
  email and phone optional). Multiple allowed. Each one becomes a
  `PersonEvent` with `householdRole: CHILD`.
- **Kids without jobs** (`littleCount`, 1–20). Inline number input with
  no separate confirm step (GTC-108).
- **Guests** (full sub-form, multiple allowed).

New sub-forms prepend to the top of the members section, regardless of
type, and `autoFocus` lands on the newest entry — so Kate's cursor
never chases down the page (GTC-113, GTC-114, GTC-115). The
member-ordering bug from index-based React keys was fixed by giving
each sub-form a stable `id` (GTC-114).

`POST /api/events/[id]/households` was rewritten to accept the full
payload — primary contact, partner, helpers, `littleCount`, guests —
and create `Person` records with find-or-create-by-email, then the
`PersonEvent` rows with their household roles.

`PUT /api/events/[id]/households/[householdId]` updates the primary
contact in place and uses delete-and-recreate for the other roles
(simpler than diffing).

### Card list — "Ducks in row so far" (GTC-104, GTC-106, GTC-109)

`HouseholdCardList.tsx` shows saved households alongside the form
(two-column on desktop, cards-above-form on mobile). Each card shows:

- The primary contact name and a `+N` badge (counts partner + helpers
  + littles + guests).
- Emoji indicators: 👫 partner, 👦 each helper by name, 🧒 littles count,
  👤 each guest.
- An **Edit** link that populates the input form for in-place edits.
- A **Del** link that transforms the card inline into a `"Remove [name]?"`
  confirmation with `Remove` and `Keep` buttons — no modal, no browser
  `confirm()`. Hooked up to a new `DELETE` endpoint that removes
  `PersonEvent` rows then the `Household` row, preserving shared
  `Person` records.
- A 200 ms fade-in when added.

The card list and the form sit in a clear bounded workspace: the form
fields are wrapped in a `border border-gray-200 bg-white rounded-xl`
container, the card list has a `"Ducks in row so far"` heading
(GTC-106).

### Save errors and saving labels (GTC-107)

The two action buttons are now `Save & add another` and
`Save & move on →`. If `onAddPerson` rejects, an inline error
*"That didn't save — please try again."* appears above the buttons and
clears as Kate retypes the name. `Save & move on →` will not call
`onComplete()` if the underlying save fails — Kate stays on the form.

### Completion summary (GTC-105)

`Save & move on →` transitions the page to a summary phase, not out of
Moment 1. `Moment1Summary.tsx` shows:

- The `MomentArc` with Moment 1 ticked off and Moment 2 highlighted as
  current. (`MomentArc` was extended with a `completedMoments?` prop
  which renders green-circle checkmarks.)
- Headline stats: people count, household count, kids-with-jobs and
  kids-without-jobs (each omitted when zero), missing contacts.
- A "missing contacts" list with two affordances per person:
  - **Add now** — inline form for email/phone that PUTs the
    household and removes the person from the missing list.
  - **Skip for now →** — view-only dismissal.
- `+ Add more people` returns to the input phase with all households
  preserved.
- `On to the plan →` exits Moment 1 and transitions into Moment 2's
  opening screen (GTC-117).

### Polish (GTC-111)

`MomentArc` inactive moments were too faded to read (compounded
`opacity-40` plus `text-gray-400` ≈ 16% effective contrast). Bumped to
`opacity-70` and `text-gray-500` so the path ahead is clearly visible
without competing with the active step.

---

## Moment 2 — "What's the plan?"

Kate's second job: turn the event in her head into a categorised plan
with quantities. Two steps: Step 1 is a Typeform-style "shape" brief
(event type + accordion sections), Step 2 is the AI-generated editable
plan with quantities calculated from the Moment 1 guest count.

### Schema and persistence (GTC-116)

A new `EventSetup` model holds Kate's Step 1 answers as JSONB columns,
one per accordion section: `mainsData`, `sidesData`, `dessertsData`,
`drinksData`, `setupCleanupData`, `dietaryData`, `otherNotes`, plus
`eventType` / `eventTypeOther`. Unique on `eventId`, cascade-delete with
the `Event`. A second migration (GTC-121) added `generatedData` to
cache progressive AI output per section.

`GET/POST /api/events/[id]/setup` provides upsert reads and partial
writes, gated to `HOST` / `COHOST`, validating event type and dietary
shape.

### Opening screen (GTC-117)

After Kate clicks `On to the plan →` from the Moment 1 summary, she
lands on `Moment2Opening.tsx`:

- `MomentArc` with Moment 1 ✓ done, Moment 2 current.
- Assistant line: *"Let's get this plan out of your head and onto the
  page."*
- Single primary button `"Let's do this →"` which transitions to the
  Step 1 modal.

### Step 1 — accordion brief (GTC-118, GTC-119, GTC-122, GTC-123, GTC-126)

`Moment2Step1Modal.tsx` is the brief. Top of the modal: an event-type
selector with seven pills initially (BBQ, Roast dinner, Potluck,
Picnic, Kids party, Christmas, Other). GTC-123 expanded this to ten
NZ-specific occasion types (Casual BBQ, Birthday Kids, Birthday Adult,
Christmas, Easter, Wedding Reception, Baby Shower, Engagement Party,
Anniversary, Farewell) plus Other; legacy types are migrated to the
new keys on load.

Selecting a type immediately shows a context line with the headcount
from Moment 1 (e.g. *"Christmas for 16. Big one. Let's get it sorted."*)
and reveals the accordion sections. Each accordion is collapsed by
default; opening one is enough to indicate Kate cares about it.

Sections (after GTC-122 reordering): **Dietary requirements** (first,
so it informs every food prompt), Mains, Sides, Dessert, Drinks,
Setup & Cleanup, Other.

Per-section behaviour:

- **Food sections** are pre-populated with NZ-config defaults loaded
  through `src/lib/ai/config-loader.ts`. Each item has a checkbox:
  ticked = included, unticked = excluded but still visible
  (greyed/strike-through). An × button removes an item entirely.
  `+ Add your own` appends a custom item (defaulting to ticked, since
  Kate just typed it). GTC-126 flipped the default state for prepopulated
  food items to **unchecked** — opt-in rather than opt-out.
- **Setup & Cleanup** has three toggles (setup crew, cleanup crew,
  kids on dishes); the kids-on-dishes toggle shows the names of any
  helpers Kate added in Moment 1.
- **Dietary requirements** is a multi-select of Vegetarian, Vegan,
  Gluten-free, Dairy-free, Nut allergy plus an Other free text.
- **Other** is a multi-line free text.
- Most sections have a `"Still deciding?"` toggle that visually
  disables the inputs and tells the AI to skip generation for that
  section.

State is debounced (500 ms) and POSTed to `/api/events/[id]/setup` on
every change; existing setup data hydrates the modal on mount. The
toggle thumb-not-sliding bug from `translate-x-4.5` (an invalid
Tailwind class) was fixed in GTC-120 by switching to arbitrary values
`translate-x-[18px]` / `translate-x-[2px]`.

### Progressive AI generation (GTC-121, GTC-127, GTC-128)

When Kate closes an accordion section, the modal fires
`POST /api/events/[id]/generate-section` in the background — a single
Anthropic call (`claude-sonnet-4-6`) for that one section. The result
is cached on `EventSetup.generatedData` keyed by section. Per-section
state is tracked as `idle | generating | generated | failed`, with a
small dot indicator while running and a green tick when done. "Still
deciding" sections are skipped. Re-editing and re-closing a section
regenerates it (data-hash-tracked, so unchanged data won't waste a
call).

`POST /api/events/[id]/finalize-plan` is the assembly step. It pulls
together the cached sections, runs gap-fill AI calls for any sections
Kate skipped, runs a dietary-coverage check ("no gluten-free dessert
yet — add one?"), and produces the `"Things to consider"` checklist —
all inside the existing 10-call-per-event AI cap (worst case is 9).
Items persist to the existing `Team` and `Item` models.

GTC-127 raised the max-token caps that were causing regenerate
failures — `generate-section` 1024 → 4096, `finalize-plan` gap-fill
1024 → 2048, dietary coverage and considerations 512 → 1024 each. All
four caps are now centralised in `src/lib/ai/token-limits.ts` with
inline rationale, and `tests/measure-moment2-prompts.ts` reports input
sizes against any event for future audits. GTC-128 fixed a build
break introduced when GTC-127 had exported prompt builders from
`route.ts` (Next.js App Router only allows specific exports from route
files): the four prompt builders (`buildSectionPrompt`,
`buildGapPrompt`, `buildDietaryCoveragePrompt`,
`buildThingsToConsiderPrompt`) were extracted into
`src/lib/ai/prompts.ts`.

The skeleton screen `Moment2Step2Skeleton.tsx` opens immediately when
Kate clicks `"Generate plan"` and shows category placeholders that
fill in category-by-category as data arrives. The "Plan looks good"
button stays disabled until streaming finishes; an `onReady` prop
fires once the reveal is complete.

### Step 2 — editable plan view (GTC-124, GTC-125, GTC-126)

`Moment2PlanView.tsx` is the live, editable plan view. Each
category is a collapsible section with an emoji-based header (mapped
from team name; custom categories get 📋), the item count, and a list
of items. Each item shows its name, serving size, and a tap-to-edit
quantity badge.

Interactions:

- **Edit item** — tapping the name opens an inline form (Name,
  Quantity + Unit, Serves, Notes, Save / Cancel / Remove). Save calls
  `PATCH /api/events/[id]/items/[itemId]`.
- **Quantity inline edit** — tapping the quantity badge focuses a
  pre-selected number input; Enter / Tab / blur commits, Esc cancels.
- **Remove item** — `DELETE /api/events/[id]/items/[itemId]`, no
  confirmation dialog.
- **Add item** — per-category `"+ Add item"` opens an inline form.
  POST returns a `displayOrder` so the new item lands at the end.
- **Add category** — bottom-of-plan `"+ Add category"` POSTs a new
  `Team` (coordinator defaults to host).
- **Reorder** — up/down arrows on each row, revealed on hover. Swap
  is implemented as two parallel `PATCH` calls exchanging
  `Item.displayOrder` between adjacent rows. GTC-125 added the
  `Item.displayOrder` column with a backfill (`ROW_NUMBER()` over
  `createdAt`, 486 items / 62 teams cleaned), an index, and updated
  every read endpoint to sort by it. Reorders now persist across
  refresh.

The unit selector offers 17 common units plus a Custom… option;
custom units are stored as `quantityUnit='CUSTOM'` +
`quantityUnitCustom='<text>'`.

The footer has `← Back to event setup` (returns to Step 1, edits
preserved in the DB) and `Plan looks good →` (refresh + return to
main plan view, fires the existing `Plan approved.` toast).

GTC-126 made `ToastContext` accept a per-call `{ duration }`, and
the five short-acknowledgement toasts in the plan view (`Updated.`,
`Removed.`, `Added.`, `Category added.`, plus the inline
quantity-update toast) now fade after 2 seconds while everything else
keeps the global 4-second default.

### Shared infrastructure ready for reuse (GTC-131)

`<OptionTree>` was extracted into
`src/components/shared/OptionTree.tsx` — a fully controlled,
multi-level cascading option-tree component that ports the
`resolveOptionGroups` / `toggleOption` / `setFreeText` logic from
`GuidedPlanBuilder` and matches the `plan-option-tree-config.json`
shape verbatim. It's intentionally shipped unused — Path (b) in the
ticket — so existing GuidedPlanBuilder behaviour is untouched and a
follow-up (GTC-133, mentioned in the ticket) can wire it into the
Moment 2 accordion without behavioural risk.

### Open / deferred

- **GTC-130** — Align `eslint-config-next` with the installed Next.js
  major (currently `^16.2.2` against `next@^15.5.12`). Surfaces a
  non-fatal "circular structure" log on every build. Path A
  (downgrade) recommended; non-blocking.

---

## What's not in this report

A separate set of "follow-on moment" tickets (GTC-FM1, GTC-FM2,
GTC-FM3-FM5) exists for host nudges and post-event wrap-up — those
land downstream of Moments 1 and 2 (closer to Moment 4/5 of the
broader four-moment arc) and aren't part of the Moment 1 / Moment 2
build. They've been left out of this report deliberately. Tickets
below GTC-101 (GTC-028 to GTC-100, plus FM tickets and the GTC-081
spike) precede the moment-redesign branch and don't touch either
moment.
