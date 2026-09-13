# The Moment arc promises two Moments that have no screen

**Product note, not a ticket.** Founder-owned by ruling, 2026-09-12: *"a ticket would sit open
forever misrepresenting itself as work."* Recorded here so the finding is not lost and is not
mistaken for something an executor can pick up.

Surfaced by [[GTC-235]] / [[GTC-237]], 2026-09-12.

## The finding

`MomentArc` renders four beats, and the plan view renders `MomentArc` — so the last screen of
the built flow shows the host, above her own plan:

- 1 — Who's coming? ✓
- 2 — What's the plan? (current)
- 3 — Who's bringing what?
- 4 — Is everyone sorted?

Moments 3 and 4 have no V2 screen. `src/components/plan/` contains `Moment1InputForm`,
`Moment1Summary`, `Moment2Opening`, `Moment2Step1Modal`, `Moment2Step2Skeleton` and
`Moment2PlanView`. There is no `Moment3*` and no `Moment4*`.

## No arrangement of links makes it honest

Two surfaces sit at roughly those beats, and both are V1-era answers:

- `/plan/[eventId]/pre-flight` ([[GTC-188]] / I1) — the last look before the send. It works;
  its Send button is hard-`disabled` until [[GTC-189]] ships the press. Linking it moves the
  dead end one screen later.
- `/plan/[eventId]/glance` ([[GTC-192]] / J1) — the live board. It works, it is read-only, and
  it is meaningful only after the send. Its own page header records that where the screen lives
  is still an open decision.

Neither is linked from anywhere in the tree, and [[GTC-235]] deliberately did not link them
(founder ruling 3, same day). What [[GTC-235]] did instead was give the plan view one labelled
exit to the V1 dashboard, which is where invites, people, nudges, conflicts and share links
actually live — and the V1 dashboard is not Moments 3 and 4, it is the surface they were meant
to replace.

## The shape of the decision, stated once

The arc is a promise the flow makes on its own last screen. Three ways to keep it, none of them
a bug fix:

- Build Moments 3 and 4 as V2 surfaces, and retire the V1 dashboard for V2 events.
- Adopt the pre-flight and the glance as those Moments, finish [[GTC-189]], and link them.
- Stop the arc at what exists, and let the plan view hand over to the dashboard without
  promising two more beats first.

[[GTC-233]]'s own closing section already lists the V1 post-plan surfaces V2 has no replacement
for — invites, people management, nudges, freeze, conflicts, share links — and notes that a V2
event's only route to them is `/plan/[eventId]`. That list and this note are the same problem
seen from the two ends.
