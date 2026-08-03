# Moment 4 — Is Everyone Sorted?
## Specification v1

**Status:** Record of decisions from the Moment 4 protocol walk (24 July 2026). All formerly open questions were ruled on 3 August 2026 (§8) — **no open questions remain.** The send is specified separately and fully in the Hinge spec (`gather-hinge-spec-v1.md`), which governs the threshold, the outgoing messages, the minutes after the press, and send failure.

**Source of authority:** The walk. Where this spec and any earlier document disagree (including the four-moment synthesis, the reconciliation campaign skill, or prior flow documents), this spec wins. Where this spec is silent, the walk transcript is the tiebreaker before any inference.

---

## 1. What the Moment is

Moment 4 is the host's experience between **the send** (end of Moment 3 — the plan released to people) and **the morning of the event**. It exists to end the wondering.

**The wondering, precisely:** After the send, everything is out of Kate's hands. She does not know: whether people will respond, whether they'll accept what they've been asked to bring, whether they're happy with it, and — resolvable only on the day — whether they'll actually bring it. She knows one thing with certainty: there is nothing more her own effort can do. That certainty is exactly what doesn't let her rest. Her historical coping is the laptop check — going over everything one more time. The coping manages the wondering; it never ends it.

**How the wondering moves:** It *breaks* at the first response (the silence breaks; the system is alive; the world caught what she threw). It *ends* when Kate declares sorted. These are different events, and the Moment lives between them.

**The governing analogy (walk finding, Theme 4):** The system is a really good assistant. It does the chasing, absorbs the social cost, speaks in its own voice to guests and plainly to the host, knows when to flag and when to stay quiet, and never bursts in. Every design question this spec doesn't answer should be tested against: *would a really good assistant do this?*

---

## 2. Sorted

- Sorted is **the host's decision, not a system fact.** Kate declares it on her criteria. Her criteria can include knowledge the system will never have (Pete always comes through).
- The system's role in the word: **show her the necessary info.** Not all info — the necessary. (The system knows response latencies to the millisecond; she doesn't need that.)
- The event **can be sorted with a permanent silence in it.** A non-response is not a blocker or a failure state — it is an open question Kate can close herself by reassigning whenever she stops waiting.
- There is no readiness score, no threshold, no completion nag, and nothing the system withholds pending "enough" confirmation. The freeze-warnings-only decision (GTC-156, 2026-07-09) was this principle arriving early.

---

## 3. The screen

**Purpose, one sentence:** The screen tells Kate if there's anything she has to do.

**The four-second contract:** Kate opens it while the kettle boils. Closing it, she must know: (a) is anything mine to do, and (b) is it moving. Anything on the surface not serving those two answers is in the way.

**The colour encoding — ownership, not status:**
- **Green** — nothing is yours.
- **Orange** — the system is on it (e.g. actively nudging a silence).
- **Red** — only you can do this; the system can't or has exhausted its moves.

Colours report *whose move it is*, not raw response state. The screen can never overwhelm the host with problems that aren't hers, because problems that aren't hers don't get the colour that means her.

**Surface holds:** the per-person/per-item state in the colour encoding, and nudge status (what the system is already doing — so a chased red doesn't read as her job). Plus subtle branding.

**Behind a tap:** all actions — remind, reassign, take over a silence. The surface shows states; the tap holds actions. Looking never becomes operating.

**Explicitly refused for this surface:** messaging/chat, countdown to event, activity feed, the plan content itself (Moment 2's material), analytics/response-rate reporting, progress bars or percentages (the lights already are the progress).

**The assistant's message:** When a critical item is red, one message appears on the screen — one message regardless of how many critical reds it covers ("two things need you"), in plain register (not the playful guest-facing voice), naming the thing, admitting what the system couldn't do, handing it over. It disappears when resolved. This is the only banner-class element the surface has.

---

## 4. Silence and the nudge machinery

- The system chases; Kate relates. Nudges go out in **Gather's voice** — playful, funny, allowed to get pointed — because Gather can spend what Kate can't. Every nudge in Kate's voice would burn her goodwill; in Gather's voice it costs nothing between her and her people. (This is also *why* messaging is refused on the screen: the moment Kate speaks through the product, the shield drops.)
- Cadence: first nudge, then a second at a later window, on the system's own schedule — Kate does not compose, time, or approve them. *(Illustrative numbers from the walk: days 4 and 7. Actual cadence is OPEN — see §8.3.)*
- **After the system's nudges are exhausted, the silence goes red** — it comes to Kate.
- **The door swings both ways at red:** tapping it, Kate can (a) flick it back to orange for more system tries, with a retry count she specifies, or (b) keep it red and handle it herself.
- The system never judges *which* silence threatens the event — it can't know Pete. It inherits that judgement from criticality (§5).

---

## 5. Criticality

- Criticality is decided **at the menu, in Moment 2** — when the plan is made, items are marked critical or not (the lamb roast, the birthday cake: critical; two bags of ice: not).
- Moment 4 does not judge stakes; it **inherits judgements.** A silence threatens the event only if it's holding something critical.
- A critical item going red triggers the assistant's one plain message (§3). Non-critical reds sit in the grid without a message.
- How critical items are *visually distinguished* in the grid, and whether criticality alters nudge cadence, are OPEN (§8.2, §8.3).

---

## 6. The runbook

- **What it is:** an ownership artifact, not an information artifact. Kate's spreadsheet's second half gave the kids jobs so the kids carried some of the day. Same job as the pavlova row, done with the washing-up.
- **Where it comes from:** tasks (day-of choreography — washing, drying, clearing) **enter the plan in Moment 2**, alongside the items — the plan knows the washing-up exists the way it knows the lamb exists. Ownership lands in **Moment 3** — tasks are **assigned and claimed** through the same machinery as items. No second surface, no separate mechanic: one assignment machine, two kinds of rows (items are owed *to* the day; tasks are owed *during* it).
- **Where it lives:** **on the fridge.** Gather produces a downloadable, printable run sheet — the day runs on paper. Nobody opens an app at 2pm with wet hands; everyone reads the fridge.
- **This resolves upstream questions:** the Moment 3 two-surface question dissolves (one surface, tasks as rows); the runbook-home question from the Moment 3 walk is closed.
- **The stop-line:** Gather's job before the day ends at the export. There is no day-of mode, no live check-off, no event-mode screen. The printout is the last artifact before the event.

---

## 7. Freeze, the ending, and after

**Freeze dissolves into the send.** There is no separate freeze ceremony and no freeze act inside Moment 4. The line is the send (end of Moment 3): the moment the plan is released to people, it locks — because people are now claiming things off the plan as sent, and drift under their feet must carry a story.

- **Post-send changes require a recorded reason.** "Why did I reassign the beef?" — "Pete couldn't do it." The audit trail starts at the send and gives Kate the history of why whatever happened happened.
- Responses, claims, and reassignments-with-reasons are not the plan changing; they are the plan being *answered*. Greens keep accumulating after the send — that's the Moment working, not a mutation of the locked plan.
- The product never contests the host at any threshold. It states facts plainly ("two items unassigned") and never says "hang on" or demands justification. The fact is welcome; the challenge is forbidden.
- **Build implication (architectural):** the current CONFIRMING→FROZEN transition and FROZEN state need reconciling with this. The send becomes the lock point; what FROZEN currently models either collapses into the send or is removed. This is a state-machine change and must be treated as such (Plan mode, max effort, review step).

**After the send, the screen's remaining life:** Kate opens it for the buzz — watching greens accumulate, the wondering unwinding in colour. Watching, not working. The assistant's critical message remains live throughout.

**The ending:** Moment 4 ends when **Kate walks into the event holding nothing.** The runbook is on the fridge; the ownership is distributed; there is nothing to check. The product's finished state is its own absence. The system's last act before the day is the printout.

**After the day:** one optional reach — a **thank-you**, a day or two later, **on Kate's request only** (the assistant may draft and offer; Kate says send). It is specific gratitude powered by the ownership records: *thank you for the pavlova.* The existing wrap-up messaging machinery (TNZ SMS) is the likely carrier. Voice is OPEN (§8.4).

---

## 8. FORMERLY OPEN QUESTIONS — ALL RESOLVED

*All eight ruled by Nigel, 3 August 2026. See also the Hinge spec (`gather-hinge-spec-v1.md`), whose walk closed 8.7's structure and evidenced 8.3 before these rulings.*

**8.1 Red by time — RESOLVED: yes, and the calendar is Kate's.** There is a point where "I'm still nudging" stops being true because there's no time left for nudging to work — and that point is set by Kate. The system enforces her line; it never judges how close is too close (that's relationship knowledge). Red's exhaustion semantics survive intact: at her line the system genuinely is out of moves — the calendar is a second way to exhaust, not a new meaning for red. A sensible system-proposed default with Kate's override (the derived-with-override pattern) applies.

**8.2 Critical items in the grid — RESOLVED: badge.** Critical items carry a badge (set at menu time, Moment 2) visible in the grid. No float-to-top, no message-only. Four seconds can tell the lamb from the ice before anything goes wrong; a badged yellow box still means rest. The assistant's one plain message remains the escalation when a critical goes red.

**8.3 Nudge cadence — RESOLVED: two nudges, days 4 and 7, adjustable; criticality does not compress.** The default is the 4/7 spacing (matching the real reply distribution: first response ~41 min, cluster same-day, day-3 pair, stragglers from day 7 — see Hinge spec §6). Kate can adjust the cadence per event or per person (which is also the home of the "go gentle on Mum" control). Channel: TNZ SMS as built. Critical items get the SAME schedule as everything else — **criticality does exactly two things (the badge, and the assistant's message at red) and touches nothing else. It is entirely a host-facing signal, never a guest-facing pressure.** The cadence truncates at Kate's 8.1 line: no nudge fires when there's no time left for it to work.

**8.4 The thank-you's voice — RESOLVED: Gather's by default; Kate can override to her own, or mix.** The mix reuses the Hinge message's architecture in reverse register: Gather's specific gratitude does the systematic work (*thanks for the pavlova*), with room for Kate's line where she wants one — the journey's first message and its last are the same instrument. Defaulting to Gather completes its arc with the guest: the character that chased also thanks. Kate's review pass before send stands regardless (the no-show must not get "thanks for coming").

**8.5 Material changes (date/venue) — RESOLVED: opt-out reconfirmation.** When Kate changes the date or venue: the system re-asks everyone (*the date's moved to the 27th — still good for the pavlova?*), and **claims hold unless people object** — silence means still-in; "can't anymore" releases them through the normal machinery. Nobody's yes is deleted; the grid never flushes to yellow; a sorted event doesn't un-sort because the venue moved. The system decides when a change is material enough to trigger the re-ask (derived-with-override), and Kate can set the weight per change — downgrade to just-tell-them, or upgrade to a hard re-confirm. The ledger rule (why + version, per the Hinge spec §2) sits underneath all of it.

**8.6 Green reverting — RESOLVED: green can un-happen, and it goes straight to Kate.** A withdrawn or broken claim (Sarah's ankle, three days out) reverts red at once, through the standard door — no re-entry into nudge machinery, no fresh cadence. The constitution applies: this isn't a silence to chase, it's a fact the system can't fix — it notes it and sends it to her. If the reverted item is critical, the badge is already on the box and the assistant's message fires. Reassignment runs the normal path: her why, the ledger, and the system closing the loop with anyone released.

**8.7 Minors and the unreachable — RESOLVED (structure in the Hinge spec §4; residue ruled here): the parent channel confirms the household.** The household's confirmation IS the children's confirmation — a child's task was never a separate claim awaiting its own yes. Therefore a child's row cannot go red: child-owned rows never run the escalation machinery at all. The kids exist as owners on the fridge, given jobs so they carry some of the day — never as participants in the response system. No-channel adults route via the Moment 1 recipient toggle (owner and channel are separate fields).

**8.8 The stale printout — RESOLVED: the sheet is designed to be written on.** The printed runbook carries a per-row mark-here affordance (a tick box or equivalent): when the day's problem arrives, Kate ticks it ON THE FRIDGE and keeps hosting — capture now, resolve in the system later, when she has it straight in her head. The paper was never supposed to stay synced; it holds the day, corrections included, in handwriting. The stop-line survives: Gather still ends at the export — it just prints paper that expects a pen. Floor retained for pre-day changes: print date on the sheet, and a changes-since-print reprint offer on the screen.

---

## 9. Feature tests this spec establishes

Any future proposal for this Moment must pass all three:

1. **The assistant test:** would a really good assistant do this?
2. **The four-second test:** does it serve "is anything mine to do, and is it moving" — or is it in the way?
3. **The refusal test:** the refusals have robust reasoning behind them and are a strength of the product. A proposal that re-introduces a refused thing (chat, progress bars, day-of mode, readiness judging, a freeze ceremony) must overturn the refusal's *reason*, not just re-request the feature.
