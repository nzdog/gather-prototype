In one sentence: What is Gather, and what kind of real-world situation is it designed for (not “events” in general)?

Gather is a coordination system for host-led, multi-person gatherings (like Christmas/reunions/retreat weekends) where lots of people must confirm specific responsibilities, so the plan can “freeze” into shared reality without the host chasing.

18:26Gather is a coordination app for multi-day, multi-person gatherings—Christmas dinners, family reunions, retreats—where a host needs to distribute 50+ responsibilities across 10-50 participants and multiple teams without holding the entire plan in their head or chasing people through group chats.Update that to be also for single occasion events18:26Gather is a coordination app for family gatherings—whether a single birthday party or a multi-day Christmas reunion—where a host needs to distribute responsibilities across participants and teams without holding the entire plan in their head or chasing people through group chats.

Who is the primary user? Describe the “host pain” Gather removes that group chats and spreadsheets fail at.

Primary user: the family coordinator / host — the person who ends up organizing the gathering and carrying the invisible load.

Host pain Gather removes: group chats and spreadsheets force the host to be the “human sync engine” because people read but don’t respond, responses don’t equal specific commitments, confirmations are scattered, people change their minds silently, and the host must manually chase and mentally reconcile who’s bringing what—so the plan never becomes an external, trusted “confirmed state.”

18:27The primary user is the family coordinator—typically the person who ends up organizing every gathering because no one else will. Usually a woman, often undervalued for the invisible labor she performs.
The host pain Gather removes:
Group chats and spreadsheets fail because they require the host to be the central nervous system of the event. She sends the plan, but then:

People read it and don't respond
People respond but don't commit to specific items
People commit but she has no way to track who actually confirmed versus who just said "sounds good"
People change their minds silently
She has to manually chase 4-5 people to get a straight answer
She has to mentally reconcile who's bringing what across scattered messages
The plan lives in her head because no external system reflects the true confirmed state

Spreadsheets create the illusion of structure but have no enforcement—people don't update them, and she's back to chasing.
Group chats create noise without resolution—47 messages and she still doesn't know if Marcus is bringing the cooler.
Gather removes the need to be the human sync engine. The host distributes assignments, invitees confirm or decline with one tap via magic link, and the system surfaces gaps and tracks confirmed state in real-time. She can see the truth without asking anyone. The plan leaves her head and becomes a shared, frozen reality.


Happy path: Host creates → Plan Frozen

Phase 1 — DRAFT: Build the plan

What happens: Host runs the 3-step setup (basics → guest/dietary → logistics). AI generates the first-pass plan (items across teams).
Why it exists: Prevents blank-page planning; the host edits reality instead of inventing it.

Phase 2 — DRAFT: Make the plan structurally sound

What happens: Conflicts are detected and handled (timing/dietary/coverage/placeholder quantities). Host adds people, groups them into teams, and assigns coordinators.
Why it exists: You don’t ask humans to commit to a plan that still has holes. This phase is the “make it assignable” gate.

Phase 3 — CONFIRMING: Convert the plan into commitments

What happens: Host transitions to CONFIRMING, creating a PlanSnapshot and generating role-scoped magic links. Participants/coordinators open links and Accept/Decline assigned items. Declines and pending states stay visible as gaps.
Why it exists: This is the core product moment: replacing “chat noise” with recorded commitments and explicit gaps—without the host chasing.

Phase 4 — FROZEN: Seal shared reality

What happens: Once coverage is sufficient, the host freezes. Frozen becomes view-only; any change requires an explicit unfreeze with a logged reason.
Why it exists: Frozen is the psychological finish line: the plan is a stable, external source of truth, not something the host must keep re-checking in their head.


18:27Phase 1: DRAFT — Build the plan
Host creates event via 3-step wizard: basics (name, dates, occasion), guest details (count, dietary needs), and logistics (venue, kitchen equipment, timing). AI generates 50+ items across 8 teams based on these inputs—proteins, desserts, setup, etc.
Why this exists: The host shouldn't start from a blank page. AI does the first-pass thinking so she's editing a plan, not inventing one.
Phase 2: Still DRAFT — Resolve conflicts and assign structure
System runs conflict detection: timing clashes (two things need the oven at 2pm), dietary gaps (no vegetarian mains), coverage gaps (missing obvious items for this occasion type), placeholder quantities on critical items. Host reviews and either acknowledges, resolves, or delegates conflicts. Host adds people, assigns them to teams, and assigns team coordinators.
Why this exists: The plan needs to be structurally sound before invitees see it. You don't ask people to confirm assignments when the plan itself has holes. Gate check enforces this—5 blocking codes must clear before transition.
Phase 3: CONFIRMING — Get humans to commit
Host transitions the event. This creates a PlanSnapshot, locks structure editing, and auto-generates magic link tokens scoped by role (host, coordinator, participant). Host shares links. Each invitee opens their link, sees only their assignments, and taps Accept or Decline per item. Host dashboard shows real-time confirmation status: pending, accepted, declined. Declines surface as gaps to fill.
Why this exists: This is the core product moment. The system is now doing the chasing—invitees see exactly what's asked of them and must respond. Host watches confirmations roll in without sending follow-up texts.
Phase 4: FROZEN — Shared reality achieved
Once all items are assigned and confirmed (or host decides coverage is sufficient), host freezes the plan. Freeze locks the state—coordinators see "Plan is frozen" banner, participants can only view. Any post-freeze change requires explicit unfreeze with a logged reason.
Why this exists: Frozen is the psychological finish line. The plan is no longer in the host's head—it's a stable, external truth that everyone has signed off on. She can stop thinking about it until execution day.

What does the AI do vs what do humans do? Name what the AI generates and what the host/coordinators must still decide.

What the AI does (generates / analyzes)
	•	Generates the initial plan: ~50+ items across ~8 teams based on occasion type, guest count, dietary requirements, and kitchen constraints.
	•	Assigns structure to items: quantities, timing windows, dietary tags.
	•	Detects 4 conflict types: timing clashes (equipment capacity), dietary gaps, coverage gaps (nothing assigned), placeholder quantities on critical items.
	•	Suggests resolutions for conflicts.
	•	Regenerates the plan on demand, while preserving host-marked edits (HOST_EDITED items are not overwritten).

What humans still decide (judgment / commitments)

Host must decide:
	•	Who the people are (manual entry or CSV import)
	•	Who goes on which team
	•	Who coordinates each team
	•	Which AI-suggested items to keep / edit / delete
	•	How to resolve or acknowledge conflicts (AI suggests; host commits)
	•	Whether placeholder quantities are acceptable or need exact numbers
	•	When the plan is ready to transition to CONFIRMING
	•	When coverage is sufficient to freeze

Coordinators must decide:
	•	Which person takes which item
	•	Whether to add items the AI missed
	•	Whether to edit quantities/timing for their team’s items

Participants must decide:
	•	Accept or Decline their specific assignments

18:33What the AI does:

Generates initial plan: 50+ items across 8 teams based on occasion type, guest count, dietary requirements, and kitchen constraints
Assigns quantities, timing windows, and dietary tags to each item
Detects four conflict types: timing clashes (equipment capacity), dietary gaps (missing options for stated needs), coverage gaps (expected items missing for this occasion), placeholder quantities on critical items
Suggests resolutions for conflicts
Regenerates plan on demand—but respects Rule A: items marked HOST_EDITED are preserved, not overwritten

What humans must still decide:
Host decides:

Who the people are (manual entry or CSV import)
Who goes on which team
Who coordinates each team
Which items to keep, edit, or delete from AI suggestions
How to resolve or acknowledge conflicts (AI suggests, host commits)
Whether placeholder quantities are acceptable or need exact numbers
When the plan is ready to transition to CONFIRMING
When coverage is sufficient to freeze

Coordinators decide:

Which specific person on their team takes which item
Whether to add items the AI missed
Whether to edit quantities/timing for their team's items

Participants decide:

Accept or Decline their specific assignments

The division:
AI handles the generative and analytical load—first drafts, pattern detection, gap surfacing. Humans handle commitment and judgment—who does what, what's acceptable, when it's done. Gather never auto-assigns people to items. That's a human relationship decision.

What are “teams” and why do they exist? Give an example (e.g., Desserts) and explain how teams change coordination.

Teams are Gather’s way of chunking a big gathering plan into named domains of responsibility (each domain is a set of items), so the host can delegate ownership without losing the single source of truth.

Why they exist: without teams, the host is forced to manage a flat list of dozens of items and chase people across every domain; teams let the host hand off a whole domain to a coordinator while keeping everything inside one shared plan.

Example — “Desserts” team: the Desserts team might contain items like pavlova, fruit salad, ice cream, serving bowls, whipped cream, plates. The host assigns a Desserts coordinator; that coordinator assigns each dessert item to specific participants and handles declines/reassignments inside that domain.

How teams change coordination: they convert “host vs everyone” into “host + a few coordinators,” reduce cognitive load, and make “Frozen” achievable because each domain can reach coverage independently while still rolling up into one plan.

18:34What teams are:
Teams are responsibility clusters—groupings of related items that make sense to coordinate together. Proteins, Desserts, Drinks, Setup, Cleanup, Activities, etc. Each team can have a coordinator assigned by the host.
Example: Desserts team
The Desserts team might contain: Christmas pudding (1), pavlova (2), fruit platter (1), ice cream (3 tubs), whipped cream (2 cans), serving plates, dessert forks. Each item has quantities, timing (when it needs to arrive or be ready), dietary tags (gluten-free option marked), and eventually an assigned person who accepts or declines.
Why teams exist:

Cognitive chunking for the host. Instead of managing 50+ items as a flat list, she manages 8 team-shaped problems. "Desserts is handled" is easier to hold than "pavlova, pudding, fruit, ice cream, cream, plates, forks are each handled."
Delegation becomes possible. The host can assign Sarah as Desserts coordinator. Sarah now owns that chunk—she can assign items to people on her team, add missing items, edit quantities. The host doesn't need to know who's bringing the whipped cream. She just needs to know Sarah has Desserts covered.
Scoped visibility for coordinators. When Sarah opens her coordinator magic link, she only sees Desserts. She's not overwhelmed by the full event. Her job is clear: make sure every item in this team has an owner who's confirmed.
Parallelization of the coordination burden. Instead of one person (host) doing all the chasing and assigning, 8 coordinators can work simultaneously on their own chunks. The host's job shifts from "manage everything" to "manage the coordinators and watch for gaps."

Teams turn a monolithic coordination problem into a federated one—and that's what makes 50-person events tractable without the host burning out.What can a participant do from their link? List the core actions and what information they see for each assigned item (include drop-off details).18:35What a participant sees when they open their magic link:
Their scoped view shows only their assignments—not the full event plan. For each item assigned to them, they see:

Item name (e.g., "Cooler")
Quantity (e.g., "1 large")
Team it belongs to (e.g., "Equipment")
Dietary tags if relevant (e.g., "gluten-free")
Timing (e.g., "Needed by 11am Saturday")
Drop-off location (e.g., "Back patio near BBQ")
Notes from host or coordinator (e.g., "Pre-chill it before you come")

Core actions a participant can take:

Accept — One tap. "Yes, I'm bringing this." Confirmation recorded, visible to host in real-time.
Decline — One tap. "No, I can't do this." Item surfaces as a gap on host dashboard. Host or coordinator must reassign.

That's it. Two actions per item. No account creation, no password, no app download. Open link, see assignments, tap Accept or Decline, done.
What they cannot do:

Edit item details
Reassign to someone else
See other people's assignments (unless they access the Family Directory link)
Add new items
Change anything about the event structure

The participant experience is radically scoped by design. The less they can do, the more likely they will do the one thing that matters: confirm or decline so the host has truth.What can a coordinator do from their link that a participant cannot? Explain the boundary in responsibilities.18:35What a coordinator can do that a participant cannot:

See all items in their team — Not just their own assignments, but every item in the team (e.g., all 8 Desserts items), regardless of who's assigned.
Assign items to people — Quick-assign dropdown to allocate unassigned items to team members. This is the key delegation power.
Create new items — If the AI or host missed something (e.g., "We need serving spoons for the pavlova"), coordinator can add it. Only works in DRAFT status.
Delete items — Remove items that aren't needed. Only works in DRAFT status.
Edit item details — Change quantities, timing, dietary tags, drop-off location, notes. Source tracking flips to HOST_EDITED so AI won't overwrite on regeneration.
Track confirmations for their team — See which team members have accepted, declined, or are still pending.

The boundary in responsibilities:
ParticipantCoordinatorScopeOnly their assigned itemsAll items in their teamCore actionAccept/Decline own assignmentsAssign items to others, manage team coverageCreate/delete itemsNoYes (DRAFT only)Edit item detailsNoYesVisibility"What do I need to bring?""Is my team covered?"
Why this boundary exists:
The participant's job is compliance: respond to what's asked of you. The coordinator's job is coverage: make sure every item in your team has an owner who's confirmed.
This lets the host federate responsibility. She doesn't ask "Is Uncle Marcus bringing the cooler?" She asks "Is the Equipment team covered?" If not, she pings the Equipment coordinator, not Marcus. The coordinator handles the last mile.

Explain plan states: What’s the difference between DRAFT, CONFIRMING, and FROZEN in terms of what changes are allowed?

DRAFT — “Everything is still editable”

Allowed changes:
	•	Host (and coordinators if enabled) can freely add/edit/delete items, quantities, times, teams, people, and coordinator assignments.
	•	AI plan generation/regeneration and conflict fixes happen here.
Meaning: The plan is still being designed; nothing is being treated as a commitment yet.

CONFIRMING — “The plan is being turned into commitments”

Allowed changes:
	•	The system issues role-scoped links and collects Accept/Decline responses.
	•	Human commitments can change (someone declines, later accepts), and the host can reassign items.
	•	Structural plan edits should be constrained because people are responding to what they were shown.
Meaning: This is the compliance phase: the plan is “live” and responses are being gathered against a specific version (often via a snapshot).

FROZEN — “No silent change; shared reality is sealed”

Allowed changes:
	•	The plan is locked/read-only for normal use.
	•	Any change requires an explicit unfreeze (with a visible state shift) so people are not operating on outdated assumptions. (Exact unfreeze rules: Unknown)
Meaning: Frozen is the trust state: the host can stop thinking about it because the plan won’t drift underneath everyone.

If you want this to be test-proof: the sharp line is FROZEN prevents implicit edits; DRAFT allows them; CONFIRMING is the controlled bridge where commitments are collected against a known plan.

18:36DRAFT — The plan is malleable
Everything can change. This is the construction phase.
WhoWhat they can doHostEdit anything: items, teams, people, assignments, quantities, timing, structure. Run AI generation/regeneration. Add/remove people. Assign coordinators. Resolve conflicts.CoordinatorCreate items, delete items, edit item details, assign people to items within their team.ParticipantNothing. They don't have links yet—tokens aren't generated until transition.
The plan is not yet a promise. It's a draft.

CONFIRMING — The structure is locked, commitment is in progress
Transition to CONFIRMING creates a PlanSnapshot, generates magic link tokens, and locks structural editing.
WhoWhat they can doHostMonitor confirmations in real-time. See pending/accepted/declined counts. Cannot edit structure, add teams, or change items. Can still freeze or unfreeze.CoordinatorView team items and confirmation status. Assign items to people (if unassigned). Cannot create or delete items—structure is locked. Can edit item details (quantities, notes).ParticipantOpen their link. See assignments. Accept or Decline each item.
The plan is now a request for commitment. People are being asked to confirm.

FROZEN — The plan is a sealed contract
Host freezes when coverage is sufficient. This is the finish line.
WhoWhat they can doHostView only. To change anything, must explicitly unfreeze (requires 10-character reason, audit logged).CoordinatorView only. See "Plan is frozen" banner. Cannot assign or edit.ParticipantView only. Can see their confirmed assignments but cannot change responses.
The plan is done. It exists outside the host's head as a stable, shared reality. Any change is a deliberate disruption with a paper trail.

Why the state progression matters:
DRAFT → CONFIRMING prevents invitees from seeing a half-baked plan.
CONFIRMING → FROZEN prevents silent drift after people have committed.
Each gate exists to protect the host's sanity and the plan's integrity.

How does Gather prevent silent failure? Describe how it tracks confirmations (accept/decline) and how the host sees “what’s still not handled.”

Gather prevents silent failure by turning every responsibility into a tracked commitment state instead of “chat vibes.”

1) How confirmations are tracked
	•	Every assigned responsibility (item/task) has a status that can’t be faked by polite messages:
	•	Pending = link not actioned / no decision yet
	•	Accepted = “Yes, I’m doing this” (recorded, timestamped)
	•	Declined = “No, I can’t” (also recorded—this is still a completed action because ambiguity is removed)
	•	The key move: a Decline is not a dead end — it creates a visible gap that must be reassigned or explicitly absorbed.

2) How the host sees what’s “still not handled”

Instead of reading threads and guessing, the host gets a live truth surface:
	•	A single view of what’s still Pending (who hasn’t acted)
	•	A single view of what’s uncovered (items with no owner, or items declined without reassignment)
	•	A roll-up of coverage/compliance by team (e.g., Desserts: 7 accepted, 1 pending, 1 uncovered)
	•	This lets the host see, at a glance:
“These 3 items have no confirmed owner” and “These 4 people still haven’t responded.”

3) Why this kills “silent failure”

Silent failure in chat/spreadsheets looks like: “seen” + “sounds good” + silence later.
In Gather, silence stays red and unresolved (Pending). And when someone changes their mind, it doesn’t disappear into chat history—the status flips (Accepted → Declined) and the gap becomes explicit again (and, if frozen, it should force an unfreeze / visible break in shared reality—exact unfreeze rules: Unknown).

18:38How Gather tracks confirmations:
Every item has a response state per assigned person: Pending, Accepted, or Declined.
When an invitee opens their magic link and taps Accept or Decline, the system records that response via API (POST /api/c/[token]/items/[itemId]/assign with response: ACCEPTED|DECLINED). The response is timestamped and tied to the specific person-item assignment.
The host dashboard shows real-time confirmation status with auto-refresh every 5 seconds. No manual checking required.

What the host sees:
Three counts, always visible:
StatusMeaningPendingAssigned but no response yet. This person hasn't opened their link or hasn't acted.AcceptedPerson confirmed they'll do it. Item is covered.DeclinedPerson said no. Item is now a surfaced gap.

How gaps surface:
Silent failure in group chats looks like: Marcus never responds, Lisa assumes he saw it, nobody brings the cooler.
Gather makes silence visible:

Pending items don't disappear. They sit in the Pending count, visually unresolved. The host sees "4 pending" and knows 4 people haven't responded.
Declines become explicit gaps. If Marcus taps Decline on the cooler, the item isn't quietly dropped—it surfaces on the dashboard as declined/unassigned. The host or coordinator must reassign or acknowledge the gap.
Unassigned items are always visible. If an item has no owner at all, it shows as unassigned. The host can't accidentally freeze a plan with unassigned critical items—FreezeCheck validates all items are assigned before allowing freeze.


The key inversion:
Group chats require the host to ask to find out what's not handled.
Gather shows what's not handled without asking. The host's job shifts from "chase to discover state" to "look at dashboard and act on gaps."
Silence isn't assumed to be assent. Silence is Pending. Pending is visible. Visible means actionable.

What is Gather not? Name 2–3 adjacent products/categories it intentionally avoids being (and why that matters).

Gather is not:
	1.	An RSVP/ticketing/invitations tool (Eventbrite/Partiful/Paperless Post).
Because those systems optimize attendance + invites, while Gather optimizes confirmed ownership of responsibilities—attendance is secondary and often inferred from item commitments.
	2.	A project management tool (Asana/Trello/Monday).
Because PM tools are built for ongoing work, tasks, dependencies, and chatter; Gather is built for a single convergence with a fixed endpoint and a short lifecycle: plan → confirm → freeze → execute → done.
	3.	A group chat/messaging layer (WhatsApp/iMessage/Slack).
Because chat recreates the exact failure mode (ambiguity, silence, “seen”), whereas Gather’s power is eliminating negotiation as the coordination mechanism: Accept / Decline, gaps stay visible.

18:411. Gather is not a general event ticketing or RSVP tool.
It's not Eventbrite, Partiful, or Paperless Post. Those tools answer "who's coming?"—they collect attendance and manage invitations at scale for parties, weddings, public events.
Gather answers "who's doing what?"—it distributes and confirms ownership of specific responsibilities. An RSVP tool considers success as "50 people said they're coming." Gather considers success as "50 people have each confirmed the specific item they're bringing, and there are no gaps."
Why it matters: If Gather gets pulled toward being an RSVP tool, it loses the coordination depth that justifies its existence. Attendance is a byproduct of item confirmation, not the goal.

2. Gather is not a project management tool.
It's not Asana, Trello, or Monday. Those tools manage ongoing work across teams with tasks, deadlines, dependencies, sprints, and reporting.
Gather manages one-time convergence events with a fixed endpoint. There are no recurring tasks, no velocity tracking, no long-term workflows. The entire lifecycle is: plan → confirm → freeze → execute → done.
Why it matters: Project management tools are built for work that continues indefinitely. Gather is built for a moment in time when 20 people need to show up with the right things. Adding PM features would bloat the product and confuse the use case. Families don't need Gantt charts. They need to know who's bringing the cooler.

3. Gather is not a group chat or messaging layer.
It's not WhatsApp, iMessage, or Slack. Those tools enable open-ended conversation. Coordination happens as a side effect of discussion—if it happens at all.
Gather eliminates conversation as a coordination mechanism. The invitee's job isn't to discuss—it's to confirm. There's no reply, no thread, no negotiation surface inside the product. Accept or Decline. Done.
Why it matters: The moment Gather adds messaging, it becomes another place where Marcus can say "sounds good" without committing, and Lisa has to interpret what that means. The product's power is in removing ambiguity, not enabling more discussion.