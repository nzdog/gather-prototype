# The Hinge — The Send
## Specification v1

**Status:** Record of decisions from the Hinge protocol walk (3 August 2026), plus the maybe-state ruling and the discovery-gap rulings folded the same day (release-absolute, why-scope, per-change versioning, mini-sends, and the one-tap model in §2–§3; the remaining gap rulings live in the Moment 4 spec §10). **No open questions remain in this spec.**

**What the Hinge is:** The send, recognised as its own moment in the host journey — not Moment 3's last act, not Moment 4's first, but the threshold between them. Not an instant: a carefully communicated phase in which Kate is reassured, told what's next, puts her stamp on the messages, and hands the event to the system on purpose, knowing what she's handing and to whom.

**Correction (2026-08-30) — the system's-on-it colour is AMBER, and the calm opening survives as a tint.** Founder Ruling 13 on [[GTC-192]]: **one state, one name — amber, everywhere.** This spec previously called that state **yellow** at six sites, and its §7 defined the word as *"the Moment 4 walk's orange; same axis, calmer opening shade."* Ruling 12 had already renamed the Moment 4 spec's orange/yellow to amber, which would have left §7 saying *"amber = the Moment 4 walk's amber."* Ruling 13 resolves it: **the Hinge's design idea survives the rename.** The send opens with a **lighter tint of amber** that **deepens as waiting becomes real** — same axis, same state, a **volume knob on the shade**, not a second colour and not a second state. All six sites are corrected in place, each with an inline marker, and §7's definition is rewritten to say what it now means.

**Source of authority:** The walk. This spec extends and in places closes the Moment 4 spec (`gather-moment-4-spec-v1.md`); where the two disagree, this spec wins on the Hinge's territory (the threshold, the outgoing messages, the minutes after the press, send failure). Where both are silent, the walk transcripts are the tiebreaker before any inference.

---

## 1. The pre-flight (Kate's side of the threshold)

The threshold is not a summary screen before a button. It is a **guided check Gather does with her** — and as she moves through it, the weight lifts. Reaching the end means something because the check has an end.

**What the check is:** a hunt for absence, not a verification of contents. She trusts what's in the plan — she built and approved it through three Moments. What she's checking for is holes: the thing she hasn't thought of, the gap she can't see, the dietary not covered, the missing addition. Completeness is Gather's expertise (the Moment 2 division of labour: her expertise is people, Gather's is logistics and completeness) — so the pre-flight is that division arriving at the threshold: Gather sweeps for gaps, and each "no holes here" is weight down.

**The pre-flight explicitly includes:**
- **Coverage** — everyone and everything accounted for: every person, every item, every task has its place; nothing unassigned that she doesn't already know about.
- **Dietaries** — re-verified by name. Dietary needs are a safety condition in this product, not a preference; the last check before exposure re-confirms the one thing that must never be wrong.
- **The message, shown** — she reads exactly what each person will receive before it goes. The cure for "what will this thing say to my mother" is reading it first. What Kate reads at the pre-flight IS what the guest receives — one shape, two sides.
- **Recipients confirmed** — who gets what, per household, per the Moment 1 toggles (§4). "Contacted in a way Kate approves of" includes *reached the way each household should be reached*.

**Ground truth honoured:** her old ritual, pre-Gather, was rereading the message and double-checking every address in the sixty seconds before pressing send. The pre-flight is that ritual, picked up and done with her, with the parts she couldn't do alone added.

**The last check, named (walk finding):** *seeing that everyone and everything is accounted for, and will be contacted and talked to in a way that Kate approves of.* Coverage and voice. The threshold holds both or it isn't the check.

**Hesitation and its cures:** The hesitations at the threshold are real and each has a design answer — she doesn't yet trust the system acting in her name (cure: the pre-flight itself, and sight of the message); she hasn't seen the message (cure: it's shown); the ask's framing (cure: §5 — the ask is an offer wearing specifics); timing doubt (the system may advise on send timing); and the quiet loss of finishing (no build item — but the threshold's tone knows it's there). **Refused as a real hesitation:** social irreversibility — Kate isn't hesitating over having asked; asking is what hosts do.

---

## 2. The press

**What the press commits:**
- **The release.** The messages go. Release is release — no recall window, no undo, **at the mechanism level too** (ruled 3 Aug 2026, discovery gap #1): there is no unsend for the disaster case. A wrong-date send is recovered through the material-change machinery (Moment 4 §8.5) — the moment Kate fixes the date, everyone is re-asked against the correction. The mistake becomes a correction everyone sees, not an event that pretends it didn't happen. The old FROZEN→CONFIRMING unfreeze path dies with FROZEN in the state-machine reconciliation.
- **The lock, as a ledger.** The plan locks — but the lock was never a wall. Post-press, Kate can change **anything**. **The why is required only for changes that touch someone** (ruled, gap #2): reassignment, removal, a quantity someone claimed against, date/venue. A typo fix gets a version and no interrogation — the ledger stays meaningful because it is never asked to hold noise. The reason is not compliance — it's her own memory, kept at the only moment it's cheap to keep ("Why did I reassign the beef?" — "Pete couldn't do it").
- **Versions — universal, silent, per-change** (ruled, gaps #2–3). Every mutation is versioned automatically; the why is scoped, the version never is. Granularity is per-individual-change — "versions ARE the steps" read literally — with the **complete history always reachable** whatever the display defaults to. Storage mechanics (diffs, deduplication) are the reconciliation ticket's to solve; the product constraint is only completeness and reachability. Reasons explain the steps; versions ARE the steps. Nothing is ever lost by moving forward — which is exactly what makes no-undo safe to live with.
- **The audit trail begins** (this is the Moment 4 spec's freeze-dissolves-into-the-send, now with its mechanics: version always, why when it touches someone).
- **People added after the send are per-person mini-sends** (ruled, gap #5): the same three-movement message, the same machinery, with the person's own clocks — nudge cadence and red-by-time run from *their* send date, truncated by the event date as always (a Bob added three days out may pass straight to Kate's line). Adding a person with an assignment post-send touches someone, so it carries its why. The pre-flight for one person collapses to the message preview. No new concepts.

**What is true the instant after the press** (the walk's inventory): the messages are away; the asks exist in the world; guests' claims are in limbo until each guest opens their message (one act for her, many arrivals for them); she can still wander the plan freely (the lock constrains change, not access); she is now public; and — the felt truths — she is *lighter*, *buttoned down*, *in control*. The press must PRODUCE that feeling: the Hinge inverts the old emotional physics. The spreadsheet send was release into a void — control gone. This press is release into a system: out of her hands, but not out of hands.

**What the threshold says — the complete script, two sentences:**
1. *"You can still change anything — I'll just keep the history."*
2. *"You'll start to see replies coming in. I'll track them and flag anything that needs you."*

Sentence 2 is deliberate in what it omits: it leads with what she'll watch (replies, greens, the buzz), never mentions chasing — the nudges vanish into "I'll track them" and introduce themselves later through results.

**Refused at the threshold:** a roadmap/options door showing the machine's plan (cadences, escalation, tone-over-time). Behaviours seen in advance are pre-worry material; coverage-sight discharges weight, machine-sight opens questions. The compressed sentence carries the roadmap's feeling — the machine has a plan — without the inventory. Commitments now; behaviours introduce themselves when they happen.

---

## 3. What arrives (the guest's side)

**What the message is:** a personal ask from Kate that **answers an obligation the guest already carried.** Anyone invited to Christmas already feels they should bring something — usually as a nagging question (*what should I bring? should I text her?*). The message doesn't assign homework; it discharges homework the guest already had. Felt response: *oh, that's really simple.*

**Contents — complete and closed:**
- A personalised message from Kate inviting them to the event
- What they've been asked to bring
- The item carrying its own logistics: quantity, where to drop off, when
- One decision: **yes / no / maybe** — a single tap
- Nothing else. No app download, no account, no "see full event details," no plan. The guest's thirty seconds need nothing outside the message.

**The one action is a decision — and it answers the whole ask** (ruled 3 Aug 2026, gap #10): **the tap is the item ask, and attendance is inferred from it.** Yes-to-the-pavlova is yes-to-coming — nobody brings a dessert to a party they're skipping. A **no** to the item is ambiguous ("can't bring that" vs "can't come"), so the no path — and only the no path — gets one conditional follow-up in the same interaction: *no worries — still coming?* Guests with no item assigned receive the attendance-only degenerate case of the same message. A **maybe** stays purely an item-maybe; attendance is unknown until the decide-by resolves it. **This supersedes event-level RSVP as a guest-facing question**: the existing `PersonEvent.rsvpStatus` model stops being something guests are asked and becomes derived state — the guest never sees an attendance question except on the no path or the itemless case. Gather asks guests for decisions, never for effort. The ask is closed; the response is open: after a **yes**, the assistant makes its first offer — *want a reminder closer to the day?* Jake's to take or leave, costing nothing to decline. A requested reminder is the guest inviting Gather's voice back — it serves, where a nudge chases. This is also the only lever the product will ever have on Kate's deepest unknowable: *will they actually bring it.*

**Agency:** yes/no/maybe means the ask is **an offer wearing specifics.** Kate decided what would help; the guest decides whether it's them. She's done the thinking; he keeps the choice.

**OPEN — the maybe state (§8).**

---

## 4. Recipients — Kate's toggle

- **Who receives messages, per household, is Kate's toggle, set at Moment 1.** Not a system rule — a hosting judgement made when the people go in. She knows the Hendersons message Matt and Matt handles it; she knows which household needs both adults asked. The system's job is the toggle; the wisdom is hers.
- **The toggled recipients ARE the household's voice.** A decision from any of them is the household deciding — the proxy-response question is answered by placement, not machinery.
- **Owner and channel are separate fields.** Grandma has no phone: her ask routes to the person Kate always reaches her through — but the pavlova remains *Grandma's*, her name on the amber box *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]* and on the fridge. The system never needs to know she has no phone; it only needs to know who Kate said to talk to.
- **This closes most of Moment 4 open question 8.7:** children work the same way — owners of tasks, never recipients of messages; their channel is a parent, by the same toggle. (The residue of 8.7 — whether a child's row can go red — remains with the Moment 4 spec.)
- **Moment 1 build implication:** per-person message toggles are added to Moment 1's household capture, and the pre-flight sweeps them.

---

## 5. The voice at the door

**The message has three movements, seam deliberately visible:**
1. **Kate speaks first, fully hers.** She says all she wants to say. Her movement is authored — hers to write, or hers to wave through if a drafted starting point serves her. The product does not permit or approve this movement, because it was never the product's: *of course* she can add her line — it's her event, and the message comes from her.
2. **The handover: Kate introduces Gather.** The load-bearing beat — the guest doesn't meet an app, he meets something his host vouched for. The introduction travels on her credibility.
3. **Gather takes over in its own voice** — what to expect, the roadmap from here.

**The guest can tell whose words are whose — and that's the design.** The ask stays Kate's (the obligation-relief keeps its source); the machinery is Gather's from minute one (the nudge in four days is a voice already met — continuous, not intrusive).

**Continuity by declaration:** Gather *says* it will check back. The later nudge arrives as a kept promise, not a cold contact — intrusion is contact you weren't told to expect. The first message is thereby the consent moment: everything the machinery does afterward traces to a moment the guest was informed, inside Kate's introduction.

**Gather explains itself by contrast, not description.** The message never says what Gather is. Against the remembered spreadsheet (find your name, work out what's yours, reply-all into the void), *"hey, can you bring the potatoes?"* IS the explanation. The introduction budget: Kate's vouching, one name, what-happens-next. The moment the message describes the product, it stops being a personal ask.

**Asymmetry, on the record:** the guest gets a roadmap at the door; Kate got two sentences and no machine-tour. Deliberate — Kate has three Moments of trust and pre-worry to protect; the guest has thirty seconds and a stranger's voice to normalise.

---

## 6. The minutes after (the gap)

**The reframe (walk finding):** the gap is not about the guests and what they're doing — she never had control there, and they were never watchable. **The gap is the system telling Kate what it's going to do next.** Attention points at the one actor she can actually see.

**On the press landing:** no delivery board, no per-person status. The assistant asserts, one voice: ***"All fourteen are away. I'll tell you the moment anything comes back."*** The system keeps its layer-knowledge (sent/arrived/seen) and hands her one fact plus one promise.

**"I'll tell you" is a push.** The first response comes TO her — the wondering's break doesn't wait for her next anxious visit. This is the watch-handover made real in the first minutes: she can close the laptop because the news will find her.

**The screen in the gap:** the amber grid — every box the system's-on-it colour, opened at a **lighter tint of amber** that **deepens as waiting becomes real** (same axis and the same single state as Moment 4's amber throughout; a volume knob on the shade, not a second colour and not a second state) *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]* — under the assistant's line: *nothing for Kate to do; all fourteen are away; I'll tell you the moment anything comes back.* Grid and sentence answer the four-second contract with the same word: rest. Nothing grey, nothing pending-shaped, no absence rendered as failure — the screen never showed response-completeness, so a wall of zero responses was never possible.

**Ground truth (Kate's last Christmas, email sent 8:58am):** replies at 9:39, 9:50, 10:48 same day; two more on day 3; stragglers from day 7 on. **The first response came in 41 minutes.** The dangerous void is short — one cup of tea — and the real exposure is the tail, which the Moment 4 machinery (nudges, colours, the door) already owns. The day-4/day-7 nudge illustration maps the actual straggler pattern (evidence toward Moment 4 open question 8.3, not a closure of it). Expectation-setting, if given, must match the data's shape: *a few will come quickly; the rest can take a week, and that's normal* — never "replies usually take a day or two."

**"Seen" is refused, with its reason:** seen-without-response *starts stories in her head* — which may or may not be true, and all of which she then carries. Seen-status doesn't inform; it manufactures wondering at higher resolution, and the product exists to end wondering. **What replaces it: the nudge-clock.** Each amber box *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]* quietly shows what the system will do next and when (*nudge in 2 days*). Information about the system, not about the guest — the future is occupied, so the stories can't start.

**The rule, for the spec's permanent record:** *the screen shows what the system will do, never what the guest did short of deciding.* Decisions surface; behaviour stays the system's business.

**What lets her close the laptop:** ***"I'll be in touch if there's something you need to do."*** Scoped exactly to the colour rule — not "if anything happens" (replies will happen all day and none of them need her); only red, only what's hers, will reach her. The contract is complete: nothing that matters can happen without finding her, therefore nothing requires her to watch.

**The passage's full script — four assistant sentences:** *All fourteen are away. Nothing for you to do. I'll tell you the moment anything comes back — and I'll be in touch if something needs you.*

---

## 7. Mechanics and failure

**The constitution (walk finding, closing sentence):** ***The system does what the system does. Anything it can't do, it notes and sends to Kate.*** Every failure mode in both walks reduces to this rule.

- **The send happens once, for her.** Mechanically it may be many messages over an hour with retries; experientially it is one act, one sentence, one handover. The rollout is the system's business — her clock and the network's clock are never confused. The Hinge presents as atomic and absorbs its own reality.
- **Bounces are red on arrival.** A bounce is not a silence — it's a dead channel; nudging it sends more messages into the same void. The system is out of moves *immediately*, so the ask goes red at once, transparently: she sees exactly what's going on — *twelve are away, two bounced.* The assistant says ***"these need you."***
- **The bounce door is the Moment 4 door, met early.** Tapping the red opens the same two-way handover built for exhausted silences: let the system try again, or take it herself — manually, outside the system (ring him, ask his mum, fix the number). When the fix is a phone call, Gather doesn't try to become the phone call: it marks the ask as hers-in-motion and waits to be told. One door shape everywhere; bounces just reach it faster.
- **The colours know the difference.** Never-reached (red at once) can never be mistaken for reached-and-quiet (amber, with its nudge-clock) *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]*. No silence gets nudged into a void for days and goes red for the wrong reason.
- **No-channel people are not failures** — they're the recipient toggle working at its far end (§4). The send routes their ask to their human channel; nothing bounces because nothing was ever sent to a dead end.

---

## 8. The maybe state — RESOLVED

*Raised in Theme 3 as the walk's one open question; ruled 3 August 2026.*

**What a maybe is: a decision to decide later.** Not a silence (the guest engaged, tapped, said where they stand) and not a claim (the item isn't secured). By the §6 rule — decisions surface, behaviour stays the system's business — a maybe **surfaces**: the box says maybe. It passes the stories test: "Jake said maybe" is actionable information, not fiction fuel — he told her the state himself.

**Colour: amber.** *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]* The system can work a maybe — just not with the silence machinery.

**No nudges — a decide-by clock.** The silence cadence asks *did you see this?*; wrong question — he saw it. A maybe needs *time to decide*, and the system knows when the answer is needed (the item carries its logistics; the event has a date). The maybe's clock counts toward a **decide-by point**: **derived by the system from item logistics and event date, with Kate able to override per item.** Near the decide-by, one follow-up in the same voice: *still good for the pavlova? Kate needs to know by Thursday.* If the decide-by passes unanswered, the maybe goes red through the standard door — the system out of moves, *this one needs you*. The §7 constitution holds; no new machinery.

**The item is held softly.** It stays the guest's — a maybe is more claim than silence, and treating it as loose would make tapping maybe worse than saying nothing. Nothing blocks Kate: she can reassign anytime, with her why, as with any silence. **When she reassigns a maybe'd item, the system closes the loop with the released guest** — *all good, the pavlova's covered* — releasing them is something the system can do, so it does. (This also dissolves the duplicate-item edge case: nobody arrives with a second dessert.)

**One line for the build:** a maybe is a surfaced decision, amber *[amber — was "yellow"; renamed by founder ruling, GTC-192 Ruling 13, 2026-08-30]*, on a derived-with-override decide-by clock instead of a nudge cadence; red through the standard door if the clock expires; the item held softly — Kate can reassign with a why, and the system notifies the released guest.

---

## 9. Effects on the Moment 4 spec's open questions

For the discovery pass, the Hinge walk moved these:

- **8.7 (minors and the unreachable)** — largely closed by §4: owner/channel separation and the Moment 1 toggle. Residue (can a child's row go red) stays open.
- **8.3 (nudge cadence)** — not closed, but evidenced: the real reply distribution (41 min / day 3 / day 7+) supports the day-4/day-7 shape. Ruling still Nigel's.
- **8.1 (red by time)** — untouched directly, but the bounce decision establishes that red's meaning is "the system is out of moves," which is an exhaustion semantic, not a calendar one. Relevant, not decisive.
- **The proxy-response edge case** (from the edge-case analysis, not a numbered open) — closed by §4: toggled recipients are the household's voice.
- **8.5 (date change / re-send)** — untouched. Note the ledger rule (§2) is its floor: whatever re-notification a date change needs sits on top of change-plus-why.

## 10. Feature tests (inherited and extended)

The Moment 4 spec's three tests (the assistant test, the four-second test, the refusal test) govern the Hinge too. This walk adds two:

4. **The stories test:** does this surface hand Kate information she can act on, or raw material for fiction? (Seen-status failed it; the nudge-clock passes.)
5. **The one-act test:** does this preserve the send as one act, one moment, for Kate — or does it leak the system's process into her experience? (Delivery boards fail it; *all fourteen are away* passes.)
