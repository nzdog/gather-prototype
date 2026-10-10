<!-- Added to the repo 2026-10-02 from the founder's paste in Cowork, verbatim, so Claude Code can read it. Until now it lived only in the founder's vault. -->

# Moment 3 Flow Document — "Who's on what?"

*Generated from Lichen Protocol walk: "The Shape of the Ask"*
*Updated with dual-path architecture: direct assignment + teams*

---

## What Moment 3 Is

Moment 3 is where the plan solidifies from an idea into a useable
artefact. Kate decides who's on what and the weight transfers out
of her head and into Gather. When she's done, the plan is held.

This is Kate's last private moment with the plan. After this, it
becomes shared (Moment 4). The hard work — Kate's cognitive load —
is done here. The deciding is the hard part.

## The Act

Kate is **deciding**. She already has a loose idea in her head of
who should bring what. Dave always does the ribs. Sarah's good
with salads. Gather doesn't tell Kate these things — she already
knows. What Gather does is give her a place to put those decisions
down, one by one, until the picture in her head matches the
picture on the screen.

Each pairing — Dave on the ribs, Sarah on the salad — is a small
confirmation: *"yes, that's right."* Then she moves on to the
next one. Not delegating, not managing — deciding what she already
half-knows and making it concrete.

Kate has a loose idea of who's bringing what before she opens
Gather. Gather makes it solid. Gather crystallises, not creates.

## Two Paths

Not every event is the same size.

**Direct assignment** — the default. Kate assigns items directly
to people. "Dave — ribs." "Sarah — salad." Simple, fast, right
for events up to ~20 people. Most of Kate's events.

**Teams** — opt-in for larger or more complex events. Kate builds
teams with leaders. "Dave leads Mains." "Sarah and Tom are on
his team." The leader manages who brings what within the team.
Right for 30+ people, weddings, community events.

Direct assignment is always available. Teams are an upgrade
when the scale demands it — not a replacement.

## The Sentence

*"Now. Who's on what."*

The full stop after "Now" marks the shift from Moment 2 (the what)
to Moment 3 (the who). Works for both paths.

## Two Kinds of Knowledge

**Structural knowledge** — Gather has this now. Items, quantities,
dietary requirements, who hasn't been assigned yet, what's
uncovered.

**Relational knowledge** — Kate seeds this. Who makes the best
trifle, who does a good roast, who can't be near Uncle Steve,
family dynamics. Gather may learn this over time through repeated
events, but for now Kate is the source.

## Gather's Role

Gather assists, doesn't lead. Suggestions are opt-in — Kate
chooses whether to invite Gather into the deciding or do it
herself.

What Gather does without asking: tracks unassigned items,
unplaced people, dietary compatibility, balance.

What Gather never does without Kate: put a person's name next to
an item, or put a person on a team. Every pairing goes through
her.

## The Weight Transfer

The weight transfers when Kate makes the last decision. Not to the
guests — they don't know yet. To Gather. The plan moves from
Kate's head into Gather, and Kate gets space.

Open questions are heavier than made decisions. Kate's load
lightens at the moment of deciding, not at the moment of asking
(Moment 4).

---

## Opening Screen

MomentArc at top:
```
① Who's coming? ✓       ② What's the plan? ✓
③ Who's on what? ←       ④ Is everyone sorted?
```

Below the arc:

*"Now. Who's on what."*

Below the sentence, the assignment interface loads directly in
direct assignment mode. No intermediate button — Kate is already
in motion from Moment 2.

A small link at the top right:

*"Set up teams instead →"*

Tapping switches to the team builder interface. Kate can switch
back at any time. Assignments made in direct mode carry over
to teams (assigned items stay assigned; Kate just organises
people into teams around them).

---

## Path 1: Direct Assignment

### Layout

Two panels on desktop. Single column on mobile.

**Left panel (or top on mobile): The Plan**
The plan from Moment 2, organised by category. Each item shows:
- Item name
- Quantity and unit
- Who's on it (name, or "unassigned")

**Right panel (or below on mobile): The People**
Kate's guest list from Moment 1. Each person shows:
- Name
- Household role icon (👫 partner, 👦 kid with job, 👤 guest)
- Number of items currently assigned to them
- Dietary flags if any

### Assigning

Kate taps an unassigned item. The people panel highlights
available people. Kate taps a person. The name appears next to
the item. Done.

Or: Kate taps a person first. The plan highlights unassigned
items. Kate taps an item. Same result, different direction.

Both paths work. Kate uses whichever feels natural.

When an assignment is made:
- The item shows the person's name
- The person's assignment count increases
- No confirmation toast. No "Updated." The visual change is
  the confirmation. Deciding should feel fluid, not interrupted.

### Unassigning

Kate taps an assigned item. The name is shown with a small ×.
Tapping × removes the assignment. The item returns to
"unassigned." No confirmation dialog.

### Multiple people per item

Some items may need multiple people. "Setup crew — 3 people"
might need Sarah, Dave, and Tom. Kate taps the item and assigns
multiple people. The item shows all names.

### One person, multiple items

A person can be assigned to multiple items across categories.
Their assignment count in the people panel reflects the total.

### Unassigned tracking

At the top of the plan panel, a soft counter:

*"[X] of [Y] items assigned."*

Not a progress bar. Just a count.

Items that are unassigned have a subtle visual indicator — a
dotted border or muted text — so Kate can scan for gaps.

### People with nothing assigned

In the people panel, people with zero assignments have a subtle
indicator. Kate can see who hasn't been asked for anything yet.

### People who don't need assignments

Not everyone needs to bring something. Some guests are just
coming to eat.

A small link on each person in the people panel:
*"Just attending"* — removes them from the unplaced count.

Kids without jobs are automatically "just attending" — they
don't appear in the people panel at all.

### Kids with jobs

Kids with jobs (from Moment 1) appear in the people panel.
They're assignable like any other person.

---

## Path 2: Team Builder

Accessed via *"Set up teams instead →"* from the direct
assignment view.

### Layout

Two panels on desktop. Single column on mobile.

**Left panel: The Teams**
One card per team, derived from the Moment 2 plan categories.
Each team card shows:
- Team name (matches category: Mains, Sides, Dessert, etc.)
- Team emoji
- Items in this team (from the plan)
- Team leader slot (empty or filled)
- Team member slots

**Right panel: The People**
Same as direct assignment — Kate's guest list with placement
status.

### Teams from categories

Teams are auto-created from the Moment 2 plan categories. Each
category becomes a team. The items within that category are the
team's responsibilities.

Kate can rename teams, merge teams, or create new teams.

### Assigning a team leader

Kate taps the leader slot on a team card. The people panel
highlights available people (not already leading another team).
Kate taps a person. Their name fills the leader slot.

The leader is visually distinct — bold name, crown or star icon.
The leader is the person Gather communicates with about this
team's items in Moment 4.

A person can only lead one team.

### Putting people on teams

Kate taps "+ Add member" on a team card. The people panel
highlights available people. Kate taps a person. They're added.

A person can be on multiple teams.

Or: Kate taps a person first, then taps a team. Both directions
work.

### The team card

```
┌─────────────────────────────────────────┐
│  🍖 Mains                              │
│                                         │
│  👑 Dave (leader)                       │
│  Sarah · Tom · Anika                    │
│                                         │
│  Items:                                 │
│  Smoked ribs      — 2.5 kg — feeds 12  │
│  Roast chicken    — 2 birds — feeds 12  │
│  Vege lasagne     — 1 tray — feeds 4   │
│                                         │
│  [+ Add member]                         │
└─────────────────────────────────────────┘
```

### Removing from a team

Tap a person's name on the card. Small × appears. Tap ×,
they're removed. No confirmation dialog.

### Switching back to direct

A link at the top: *"← Assign items directly"*

Switching back preserves any team assignments as direct item
assignments where possible (team members get assigned to items
in their team's category).

### Communication layers (Moment 4)

Teams create two communication layers:

**Kate → team leaders:**
"You're leading Mains. Here's what your team is responsible for."

**Team leaders → team members:**
"You're on the Mains team. Dave will let you know what to bring."

Gather handles both. Kate only decides the teams.

---

## Gather's Suggestions (Opt-in)

Available in both paths. A small link below the assignment or
placement counter:

**Direct mode:** *"Want me to suggest?"*
**Team mode:** *"Want me to suggest teams?"*

### Direct mode suggestions

For each unassigned item, Gather picks the person with the fewest
assignments who has no conflicting dietary requirements. Ghost
assignments appear in a lighter colour with ✓ to accept or ×
to dismiss.

### Team mode suggestions

Even distribution across teams, dietary compatibility, kids with
jobs on age-appropriate teams, leaders on the largest teams.
Ghost placements with ✓/× per person, plus "Accept all" /
"Dismiss all."

For v1, all suggestions are structural only. No AI call needed.
No relational knowledge. Kate will override most of them — the
suggestions are a starting point, not a decision.

---

## Behaviour Details

**No auto-save indicator:**
Each assignment or placement is saved immediately. The visual
update is the confirmation.

**Fluid interaction:**
No modals, no confirmation dialogs. Tap to assign, tap × to
remove. Kate is deciding — the interface should flow.

**Keyboard support:**
Arrow keys to navigate. Enter to select. Escape to deselect.

**Empty state:**
If Kate arrives with zero plan items (skipped Moment 2):
*"No plan items yet."*
With a link: "← Back to the plan"

**Responsive:**
On mobile, plan/teams shown first. People panel below. When
Kate taps an item or team slot, the people panel scrolls into
view. When she taps a person, the plan/team scrolls back.

---

## Moment 3 Completion

When Kate is satisfied, a primary button at the bottom:

**"All sorted →"**

Always visible. No minimum requirements.

**If unassigned items remain (direct mode):**

*"[X] items still unassigned. You can come back to these
anytime. Move on?"*

**"Move on →"** / **"Keep going"**

**If unplaced people remain (team mode):**

*"[X] people aren't on a team yet. That's fine — they can
just attend. Move on?"*

**"Move on →"** / **"Keep going"**

**If everything is decided:**

*"Everyone's sorted. [X] people, [X] items, all decided."*

*"The plan is held. Now let's make sure everyone knows."*

MomentArc updates: Moment 3 ✓ Done, Moment 4 ← You are here.

---

## Design References

- **Linear** — for the overall feeling (competent, clear)
- **Trello** — for the team card layout (team mode)
- **Splitwise** — for dense people-and-items display on mobile
- **Military squad structure** — for the team mode mental model

---

## Technical Notes

### Data model

Assignments and team memberships connect to **Person** records,
NOT PersonEvent records (PersonEvent IDs are unstable on
household edit — see GTC-104 known limitation).

CC must inspect the existing models:
- `Team` model — leader field? Members relation?
- `Item` model — assignedTo relation?
- Whether a join table exists for person ↔ item or person ↔ team

Likely schema additions:
- **Direct mode:** `ItemAssignment` join table (itemId, personId)
  or an `assignedTo` relation on Item → Person (many-to-many for
  items with multiple assignees)
- **Team mode:** `leaderId` on Team → Person relation, plus a
  `TeamMember` join table (teamId, personId)
- **Just attending:** `justAttending Boolean @default(false)` on
  PersonEvent, or tracked client-side

### API endpoints

**Direct mode:**
- `POST /api/events/[id]/items/[itemId]/assign` — assign person
- `DELETE /api/events/[id]/items/[itemId]/assign/[personId]` —
  unassign
- `GET /api/events/[id]/assignments` — all assignments

**Team mode:**
- `PUT /api/events/[id]/teams/[teamId]/leader` — assign leader
- `POST /api/events/[id]/teams/[teamId]/members` — add member
- `DELETE /api/events/[id]/teams/[teamId]/members/[personId]` —
  remove member
- `GET /api/events/[id]/teams` — all teams with members and items

**Both modes:**
- `POST /api/events/[id]/suggest-assignments` — structural
  suggestions (no AI call for v1)

CC should inspect existing endpoints before building new ones.

### Suggestion algorithm (v1)

**Direct mode:**
1. Get unassigned items and all people with assignment counts
2. For each unassigned item, pick the person with fewest
   assignments and no dietary conflicts
3. Return proposed assignments

**Team mode:**
1. Get all teams and item counts
2. Distribute people evenly
3. Check dietary compatibility
4. Assign leaders to largest/most complex teams
5. Place kids with jobs on age-appropriate teams

No AI call for v1. Structural matching only.

---

## What Stays From the Current Build

CC should inspect before building:
- The existing Team model and CRUD endpoints
- The existing Board view and assignment patterns
- The existing People modal and team connections
- The conflict system (auto-recheck after data changes)
- Any existing item assignment or person ↔ item relations

The existing conflict system's auto-recheck should fire after
assignments or team memberships change.

---

## Build Priority

**Phase 1 (launch):** Direct assignment only. This covers Kate's
most common event (12-20 people, family BBQ). Build the two-panel
interface, tap-to-assign, suggestions, completion.

**Phase 2 (post-launch):** Team builder. Add the "Set up teams
instead →" path. Build team cards, leader assignment, member
placement, team-mode suggestions, Moment 4 two-layer
communication.

Phase 1 is self-contained. Phase 2 extends it without replacing
it. Kate always has direct assignment available.
