# Moment 2 Flow Document — "What's the plan?"

*Generated from Lichen Protocol walk: "The Shape of the Plan"*

---

## What Moment 2 Is

Gather is Kate's organisation engine. It takes what's in her head
and turns it into a plan she can see, reference, and use. The plan
moves from inside Kate's head to in front of her. It stops being
a burden and becomes an asset.

Moment 2 removes the cognitive load of completeness from Kate.
Gather thinks of everything so she doesn't have to.

## The Two Steps

**Step 1 — Kate gives Gather the shape.**
The character of her event. What kind of food, dietary constraints,
specific dishes (Aunt Carol's Christmas Trifle), whether there's a
setup crew or kids on dishes. This is authorship, not burden. Kate
is the only one who knows this. Gather can't guess it.

**Step 2 — Gather generates the completeness.**
Quantities calculated from the Moment 1 guest count. Full item
lists across every category. Nothing missed. Kate reviews and
approves. Nothing gets into the final plan without her say.

## The Line

Kate supplies the knowledge. Gather does the maths and catches
the gaps. Quantities are the one autonomous decision — Gather
calculates them from the guest count without asking Kate. Everything
else goes through Kate.

The plan is Kate's because nothing gets in without her approval.
Gather proposes. Kate approves.

## The Sentence

*"Let's get this plan out of your head and onto the page."*

## The Promise

Your event is taken care of. Your evening will be enjoyable
instead of hectic.

---

## Opening Screen

MomentArc at top:
```
① Who's coming? ✓       ② What's the plan? ←
③ Who's bringing what?   ④ Is everyone sorted?
```

Below the arc:

*"Let's get this plan out of your head and onto the page."*

Button: **"Let's do this →"**

---

## Step 1 — The Shape

Kate clicks "Let's do this →" and enters Step 1. A modal opens
with accordion sections — one per category. Kate opens what she
cares about, skips what she doesn't. She works at her own pace.

Fast Kate powers through in 30 seconds. Careful Kate takes her
time on each section. Neither is forced into the other's pace.

### Opening line

At the top of the modal:

*"What kind of event are you planning?"*

A single selector before the accordions: BBQ / Roast dinner /
Potluck / Picnic / Kids party / Christmas / Other (free text)

This sets the template — Gather uses it to populate the accordion
sections with relevant defaults and to generate the right
categories in Step 2.

**Per-selection feedback:**

When Kate picks an event type, Gather responds immediately with a
context-specific line before the accordions appear:

- BBQ → *"A BBQ for [X] people. Let's sort out what you need."*
- Roast dinner → *"A roast for [X]. I'll help you get it all covered."*
- Potluck → *"A potluck for [X]. Let's figure out who brings what."*
- Picnic → *"A picnic for [X]. Let's pack the basket."*
- Kids party → *"A kids party for [X]. Let's keep it simple."*
- Christmas → *"Christmas for [X]. Big one. Let's get it sorted."*
- Other → *"Got it. Let's figure out what this needs."*

The line should be short, specific, and free of exclamation marks
or congratulation. It's Gather acknowledging what it heard and
moving forward. The guest count comes from Moment 1.

### Accordion sections

After Kate selects the event type, the accordions appear. Each
section is collapsed by default. Kate opens the ones she wants.

Each accordion has three states:

- **Closed (default)** — Kate hasn't engaged. Gather will use
  event-type defaults.
- **Open and edited** — Kate has opened it and made choices. Gather
  uses her input.
- **"Still deciding"** — Kate has explicitly marked this section as
  unresolved. Gather knows not to assume and will flag this in
  Moment 4 for later attention.

Each open accordion has a small toggle at the top: **"Still
deciding?"** — one click marks the section unresolved. This is
different from skipping, because it tells Gather to remember
that Kate hasn't made up her mind yet rather than assuming
the defaults are fine.

**🍖 Mains**
- Default suggestions based on event type (pre-populated, editable)
- "+ Add a dish" — free text for must-haves ("Dave's smoked ribs")
- Remove any suggested item she doesn't want
- "Still deciding?" toggle

**🥗 Sides**
- Same pattern — defaults plus add/remove
- "Still deciding?" toggle

**🍰 Dessert**
- Same pattern
- Must-have dishes go here ("Aunt Carol's Christmas Trifle")
- "Still deciding?" toggle

**🍺 Drinks**
- Same pattern — beer, wine, soft drinks, water
- Kate can add or remove
- "Still deciding?" toggle

**🧹 Setup & Cleanup**
- Toggles: Setup crew? Cleanup crew? Kids on dishes?
- If Kate added kids with jobs in Moment 1, Gather notes:
  *"You've got [X] kids with jobs — [names]. I'll include
  tasks they can handle."*
- "Still deciding?" toggle

**⚠️ Dietary requirements**
- Multi-select: Vegetarian / Vegan / Gluten-free / Dairy-free /
  Nut allergy / Other (free text)
- These become constraints Gather checks in Step 2

**Other**
- Free text for anything that doesn't fit the above categories
- Music, decorations, specific equipment, etc.

### Step 1 behaviour

- All accordions are optional. Kate can skip every section and
  hit "Generate plan" — Gather will produce a plan based on the
  event type alone.
- Accordions Kate opens and interacts with inform the AI. Sections
  she doesn't touch get Gather's best guess based on event type.
- "Skip for now →" is implicit in the accordion pattern — if she
  doesn't open it, she's skipping it.
- The modal should feel like a quick brief, not a form. Light,
  fast, skippable.

### Progressive generation

When Kate closes an accordion section (or opens the next one),
Gather fires an AI call in the background to generate the plan
for that section — items, quantities, units. The result is stored
in memory until Kate clicks "Generate plan →".

This means:
- Kate finishes Mains, opens Dessert → Mains generation starts
  in the background
- Kate finishes Dessert, opens Drinks → Dessert generation starts
- By the time Kate clicks "Generate plan →", most sections are
  already generated

The final "Generate plan" call only needs to:
1. Generate any sections Kate skipped (Gather's best guess)
2. Assemble all pre-computed sections into the full plan
3. Run the dietary requirement coverage check
4. Generate the "Things to consider" checklist

This should reduce the wait from 90 seconds to near-instant for
most events. Kate was never waiting because Gather was working
while she was thinking.

Each background call counts toward the 10 AI calls per event cap.
CC should track usage and ensure progressive calls are small and
efficient — one focused call per section, not the full plan prompt
each time.

### Step 1 completion

At the bottom of the modal:

**"Generate plan →"**

Kate clicks it. The modal closes. Gather confirms:

*"Got it. Give me a moment to put this together."*

If most sections were pre-generated, this takes 1-2 seconds —
just assembly and gap-filling. If Kate skipped everything and
Gather has to generate from scratch, it may take longer.

**Skeleton preview during wait:**

Instead of a blank loading state, Step 2 opens immediately with
the structure of the plan visible — category headings, empty
item slots, a placeholder Things to Consider section. Everything
is greyed out or shown as skeleton placeholders.

```
🍖 Mains
  ────────────  — feeds [X] — ───
  ────────────  — feeds [X] — ───
  
🥗 Sides
  ────────────  — feeds [X] — ───
  ────────────  — feeds [X] — ───
```

As the AI generates, items stream in one category at a time.
Kate sees the shape of the plan before the content arrives. She
knows what's coming and where it will land.

For any wait over 2 seconds, this streaming approach is essential.
Kate is never staring at a spinner — she's watching the plan fill
in. Gather is visibly working.

---

## Step 2 — The Plan

Gather presents the generated plan. This is where the cognitive
load lifts. Kate sees everything laid out — categories, items,
quantities — and she didn't have to think of any of it.

### Plan display

The plan is organised by category. Each category is a section:

```
🍖 Mains
  Smoked ribs (Dave's)          — feeds 12 — 2.5 kg
  Roast chicken                 — feeds 12 — 2 birds
  Vegetarian lasagne            — feeds 4  — 1 tray
  
🥗 Sides
  Green salad                   — feeds 16 — 2 bowls
  Potato salad                  — feeds 16 — 1.5 kg
  Bread rolls                   — feeds 16 — 24 rolls

🍰 Dessert
  Aunt Carol's Christmas Trifle — feeds 16 — 1 (large)
  Fruit platter                 — feeds 16 — 2 platters

🍺 Drinks
  Beer                          — 16 adults — 48 bottles
  Wine                          — 16 adults — 6 bottles
  Juice                         — 6 kids   — 4 litres
  Water                         — all       — 8 litres

🧹 Setup & Cleanup
  Setup crew                    — 3 people
  Cleanup crew                  — 4 people
  Plates & cutlery              — 20 sets
```

### Quantities

Calculated automatically from the Moment 1 guest count. Gather
decides these without asking Kate. The calculation accounts for:
- Total adults (primary contacts + partners + guests + kids with
  jobs who are old enough)
- Total children (kids without jobs)
- Dietary requirements (from Step 1)

Quantities are shown as real units — kg, litres, bottles, trays —
not abstract numbers. Kate should be able to read the plan and
go shopping from it.

### Kate's controls

Each item is editable:
- **Tap item name** → edit name, quantity, or serving size
- **Swap** → replace this item with something else. Gather
  suggests alternatives based on the event type and category.
  Kate picks one or types her own. The slot stays, the content
  changes.
- **Swipe or click ×** → remove item from plan
- **"+ Add item"** at bottom of each category → add a custom item

Each category is editable:
- **"+ Add category"** at bottom of the plan → add a new section

Kate can also:
- **Tap a quantity** → override Gather's calculation directly
- **Reorder items** within a category (drag or long-press)

### Things to consider

Below the main plan, a separate section:

*"Things to consider"*

A checklist of items Gather thinks Kate might need based on the
event type — things she didn't ask for but that events like hers
typically require. All unchecked by default.

```
💡 Things to consider
  ☐ Napkins
  ☐ Paper plates
  ☐ Plastic cutlery
  ☐ Serving spoons
  ☐ Ice
  ☐ Rubbish bags
  ☐ Sunscreen
  ☐ Bug spray
```

Kate ticks what she wants. Ticked items move into the main plan
(into the appropriate category or a new "Extras" category).
Unticked items stay in the list but don't clutter the plan.

This is Gather catching the gaps without making decisions. Kate
decides. Gather just makes sure she's seen the options.

The list is generated by the AI alongside the main plan, based
on event type, season, and whether the event is indoor or outdoor
(if known). It should feel like a thoughtful nudge, not an
exhaustive inventory.

### Dietary requirement coverage

If Kate specified dietary requirements in Step 1, Gather marks
which items cover them. If a requirement isn't covered, Gather
flags it:

*"No gluten-free dessert option yet — add one?"*

This is the completeness promise in action. Kate doesn't have
to mentally check every requirement against every item. Gather
does it.

### Voice in Step 2

Gather presents the plan without fanfare:

*"Here's what I'd suggest for [eventName]. [X] items across
[X] categories, based on [X] guests."*

No "Great news!" No "I've created an amazing plan!" Just: here's
the work. Review it.

If Kate changes something, Gather confirms:
*"Updated."* / *"Removed."* / *"Added."*

Not: *"Great choice!"*

---

## Moment 2 Completion

When Kate is satisfied with the plan, she clicks:

**"Plan looks good →"**

Primary style. This is the forward action.

Gather confirms:

*"[X] items across [X] categories. [X] guests to feed.
Now let's figure out who's bringing what."*

MomentArc updates: Moment 2 ✓ Done, Moment 3 ← You are here.

### Edge cases

**Kate changes nothing:**
The plan was right. Gather got it. Kate clicks "Plan looks
good →" immediately. No blocking, no "are you sure?". Trust
her.

**Kate removes everything:**
Kate can empty the plan entirely. If she clicks forward with
zero items, the completion message adjusts:
*"No items yet. You can always come back and add them."*
She proceeds to Moment 3 anyway.

**Kate wants to go back:**
"← Back to guest list" link visible throughout Moment 2.
Returns to Moment 1 with households intact.

---

## Design references

Same as Moment 1:
- **Linear** — for the overall feeling (competent, clear)
- **Airtable** — for the Step 2 plan display density
- The existing accordion modal pattern in the current Gather build
  — for Step 1's category selection

---

## Technical notes

### AI generation

Step 2 calls the Anthropic API (claude-sonnet-4-6) to generate
the plan. The prompt should include:
- Event name and type (from Step 1)
- Guest count breakdown (adults, children, dietary requirements)
- Must-have dishes (from Step 1)
- Non-food categories (from Step 1)
- Kids with jobs (names and count)

The AI returns structured data — categories, items, quantities,
units. Not free text. The response is parsed and rendered as
editable plan items.

Existing AI call cap applies: 10 calls per event, warning at 3
remaining.

### Data model

The existing plan generation flow stores items in the database.
Inspect the current Team and Item models before building. The
Step 2 plan display reads from and writes to these existing
models.

Kate's Step 1 answers need to be stored — either on the Event
record (new fields) or in a separate EventSetup model. CC should
inspect the schema and decide the cleanest approach.

### API endpoints

- `POST /api/events/[id]/setup` — stores Kate's Step 1 answers
- `POST /api/events/[id]/generate-plan` — triggers AI plan
  generation (may already exist — CC must inspect)
- Existing item/team CRUD endpoints for Kate's edits in Step 2

---

## What stays from the current build

The existing plan generation and review flow in Gather already
does some of this. CC should inspect what exists before building
from scratch. Specifically:
- The AI plan generation call and prompt
- The GenerationReviewPanel component
- The Team and Item models
- The existing edit/add/remove item flows

What changes is the wrapper — the two-step structure, the
Typeform-style Step 1, the voice, the presentation. The
underlying data model and AI call may be reusable.
