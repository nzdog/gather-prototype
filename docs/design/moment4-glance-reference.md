# Moment 4 glance screen — design reference

Chosen direction, 30 August 2026, after eight mockup iterations. This is what GTC-192 builds toward.

**Correction (2026-08-30):** an earlier version of this reference asserted that GTC-192 carried twelve open decisions from an audit — it never has, in any of its four commits, and the itemless guest was GTC-187's decision, not GTC-192's; both claims are corrected below rather than preserved.

## The chosen layout: household cards with thin colour strips

A grid of neutral household cards. Each card carries the household name and one thin, full-width colour strip per member. The strip's tint is the person's state; the card itself stays quiet.

- Card: neutral surface, small radius, household name as a muted 12px label.
- Strip: one per person, full card width, ~28px tall, tinted background with matching dark text. Red = yours, amber = with Gather, green = settled, neutral outline = not chased.
- Summary sentence above the grid is the four-second answer: "3 need you. Gather is on 9. 28 settled."
- Unassigned critical items sit in their own alert strip above the grid (they have no person, so person-primary gives them no home).

## Why this won

It is the only layout of the eight that delivers both things at once:

1. **The four-second check.** Colour has area, so red pulls the eye from across the screen without any sorting or sectioning. Three red strips in a field of green find Kate; she doesn't hunt.
2. **The family geography.** Everyone stays in their house. Red arrives with its context attached — not "Amelia" but "the Turner situation." Mixed households read truthfully (the O'Briens: Connor chased, Aoife deliberately left alone), where a card-per-household colour had to paint the whole house by its worst member.

It also draws the data model: messages go to households, states belong to people. Card = channel, strip = person.

## The eight iterations and their trades

1. **Phone, sectioned cards with reasons** — reasons visible, but sections shout equally; green got boxes it didn't need.
2. **Phone, compressed (red cards / amber rows / green folded)** — constant height at any headcount, but folding buries family members.
3. **Phone, stable LED board** — spatial memory, red pops; but no whys, and a good week is a wall of lights rather than a sentence.
4. **Phone, LED grouped by colour** — triage order restores the check; loses stable geography; green wall is pure reassurance.
5. **Desktop, three-column triage** — reasons and clocks fit; columns imply equal weight they don't have.
6. **Desktop, all-LED** — calmest, shows the true proportions; loses every why and clock.
7. **Desktop, LED + amber clocks** — the clock lives where trust is needed; reds become the tersest entries, which may be wrong.
8. **Household cards, colour-carried-by-card** — reads at the level Kate thinks, but worst-state-wins hides individuals (Charlotte and James painted red by Amelia).

**Winner: household cards + thin strips** — #8's grouping with #7's per-person truth, and colour with enough area to shout.

## Variants to test before building

- **With and without why-lines.** Strips have room for "Amelia — quiet after 2 nudges" and "Sarah — deciding Fri." The spec (§8.3) wants the nudge promise visible; the amber clock line is where trust is earned. Test whether why-lines on red + clock-lines on amber crowd the strips or complete them. Green stays bare either way.
- **Strip as button.** Each strip is the natural door to the second layer: tap Amelia, get her story and the fix-it actions. The spec only ever described the first layer; this layout gives the second one an obvious shape.

## The arrival replay (founder direction, 30 Aug 2026)

When the host opens the screen after time away, it does not simply show the current state — it opens on the state as of her last visit and replays the changes since, in order. Ambers flip green one by one, each with a spark burst and a pop, and the summary counts update live ("Gather is on 9… 7… 4"). Watching five or six of her family say yes in sequence is the product's promise made visible: she rested, Gather worked.

Rules for the replay:

- **Celebrate only the good news.** Amber-to-green flips get the flourish (spark burst, expanding ring, scale pop). Anything that went red while she was away does NOT spark — reds land last, quietly, so the replay ends on the truth: "…and one thing needs you."
- **Never hold the answer hostage.** The whole replay runs under ~3 seconds, and the summary line is legible throughout. A host in a hurry gets the four-second check regardless.
- **No fake fireworks.** If nothing changed, nothing plays.
- **Live changes get the same flourish.** If a reply lands while she is on the screen, that strip celebrates in real time — this is arguably the product's best moment and implies live updates (polling or push), a build decision for GTC-192.

Build implication: the replay needs a per-host "last seen" record (e.g. a lastViewedAt on the host's relationship to the event) and a diff of state changes since. Small, but it is schema and belongs on GTC-192's migration list, ruled not discovered.

Animation spec as prototyped: ~18 particles per flip in the green/amber ramp hexes, thrown 35–80px, 0.9–1.3s, plus a 3px expanding ring and a scale pop to 1.12 with overshoot easing; background/colour transition 0.7s ease; flips staggered so overlapping bursts read as a sequence, not a mush.

## Open decisions this layout leaves (feed into GTC-192's ruling list)

**Ruled 2026-08-30** (founder rulings session). Items 1–6 are settled; each carries its ruling inline below. Item 7 is unaffected. Two further rulings from the same session settle the build questions left in *The arrival replay* above — the last-seen record exists (shape at build time, under Stop Condition 7, nothing about guests tracked), and live updates are **polling at ~20s, not push**. Full text of all ten: `docs/tickets/GTC-192.md`, "Founder rulings — the glance screen (Nigel, 2026-08-30)".

1. **Sort order.** Do red households float to the top-left, or do houses hold fixed positions? With strips this loud, fixed probably works — red finds you anyway — and fixed preserves learned geography. **RULED 2026-08-30 (Ruling 3): fixed positions, and the host's own household anchors first — the board is a map, not a queue.**
2. **Red terseness.** Bare red strip vs red strip with why-line. See variants. **RULED 2026-08-30 (Ruling 4): reds carry their why; amber and green stay bare.** A red is her move, and a move needs a direction. The amber clock-line remains a variant to test, not ruled.
3. **Green fold.** At very large events, does the settled field fold to a count, or stay as strips (warmth vs noise)? Unruled. **RULED 2026-08-30 (Ruling 5): green never folds, at any event size** — the green wall of actual names is the point; folding turns people into arithmetic.
4. **Uncle Ray's fade.** A "was in, now out" red: does it stay red until acknowledged, or fade to settled on its own? Spec red-source, behaviour unruled. **RULED 2026-08-30 (Ruling 6): red with its why, sticky until seen; plays last in the replay, quietly and without sparks; settles once played.** "Seen" means the replay played — no acknowledge button. Items the person held fall loose; criticals surface in the alert strip.
5. **Declined guests.** "Out — can't make it" currently reads as green/settled. Whether a no is rest or something Kate should see differently: unruled. **RULED 2026-08-30 (Ruling 7): declined guests fade — full grey including the text, absence receding to a ghost.** The fence: NOT-CHASED keeps its border and full-strength text (expected, just unbothered); OUT fades entirely (absent), with the "— out" text carrying the meaning. ⚠ **This supersedes the states table below**, which still shows "Settled — out" as a green success tint: OUT is not green.
6. **Unassigned critical items.** Rendered here as an alert strip above the grid. A genuine GTC-192-owned open decision — flagged downstream by GTC-187's "Flag for downstream, not a decision" note under "Founder ruling — multi-item ask construction" (Nigel, 2026-08-23): *"Where unassigned items surface in the grid is an open GTC-192 decision."* **RULED 2026-08-30 (Ruling 8): ruled IN — above the grid, criticals only, with a quiet door ("and N more unassigned") opening the non-critical list.** Ordinary unassigned items stay the plan's and pre-flight's business; the glance does not nag about what can wait.
7. **Household merge rule.** Deliberately NOT used — the card stays neutral precisely so no merge rule is needed. If a household-level colour ever returns (e.g. collapsed view), worst-state-wins must be ruled explicitly. *Unaffected by the 2026-08-30 rulings — still not-used-by-construction.*

## What this resolves from GTC-192's open items

GTC-192 has **never carried a numbered decisions list** — there is no audit section on that ticket in any of its four commits (`e5f6e82`, `898e729`, `59a4afb`, `3c8f29d`), and no twelve-item list for J1 exists anywhere in the repo. The corroborated open items it does own are **two**: the colour vocabulary, and where unassigned critical items surface.

- **Colour vocabulary — addressed here, not ruled.** GTC-175 records twice that *"J1 (GTC-192) owns the person-grid colour encoding."* This reference uses red/amber/green with a neutral fourth state for don't-chase ("not chased"). The spec's own inconsistency — §3 says orange, §8.2 and §8.5 say yellow — should be ruled once, here.
- **Unassigned critical items — proposed, not ruled.** See item 6 above for the corroboration and the proposal.
- **The itemless guest — not GTC-192's, and already ruled.** This was **GTC-187's Phase 1 audit decision 8**, ruled by the founder on 2026-08-23 ("Founder ruling — the itemless guest", which closed all eight of that audit's decisions). The layout observation stands on its own and is worth keeping: children and attendance-only people sit as ordinary strips in their house, so the itemless guest needs no special grid treatment. The attribution moves; the observation does not.
- **"Where does the grid live" — no referent.** The question appears nowhere else in the repo and no ticket poses it. It is a real *build* question — the Moment 4 screen does not exist in code at all — but it was never a recorded decision, so this layout neither resolves it nor leaves it open.

## States and their strips (as mocked)

| State | Strip | Text |
|---|---|---|
| Yours (red) | danger tint | name, weight 500 |
| With Gather (amber) | warning tint | name; clock line in variant |
| Settled — in (green) | success tint | name |
| Settled — out (green) | success tint | name (pending decision 5) |
| Not chased (grey) | neutral, hairline border | name |

Standalone viewable mockup: `moment4-glance-mockup.html` alongside this file.
