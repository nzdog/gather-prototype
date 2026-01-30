

⸻

Setting the Monetisation Strategy of Gather

(Lichen Protocol Template — Future Focus Embedded in All Outcomes)

Purpose

To set a coherent monetisation strategy for Gather by deciding who pays, for what value, when payment is triggered, how pricing scales, and how Stripe is implemented, so that revenue reinforces trust, adoption, and coordination outcomes—without distorting the core loop of inviting, confirming, and organising.

Why This Matters

Monetisation is not a pricing detail—it is Gather’s incentive architecture. It determines what the product optimises for, what users trust, and which behaviours become easy or hard.

If monetisation is unclear, the build drifts: features get shaped around imagined revenue rather than real coordination needs. If monetisation is imposed poorly, the product becomes socially awkward (invitees feel paywalled), hosts feel burdened, and word-of-mouth dies. If monetisation is avoided, revenue pressure arrives later and forces a trust-breaking redesign.

This protocol creates a clean, testable, implementable monetisation stance—so Gather can grow with integrity and fund reliability as usage increases.

Use Case

Use this protocol when:
	•	A NZ-first launch needs a simple monetisation stance that can be explained in one sentence.
	•	Multiple monetisation options are competing (subscription vs per-event vs add-ons) and product decisions are starting to wobble.
	•	Stripe implementation choices are imminent (Products/Prices, Checkout, webhooks, taxes) and need to map to a stable model.
	•	A decision is required that can hold for the next 6–12 months without constant re-litigation.

Outcomes (Future-Oriented)

Poor: Monetisation is copied from another product category or delayed indefinitely, creating a future where pricing feels arbitrary, trust erodes, conversion is weak, and late-stage revenue pressure forces disruptive paywalls and rework.

Expected: A simple, testable model is selected (who pays / what for / when), creating a future where Gather can ship billing with Stripe cleanly, learn from real behaviour, and iterate without business-model churn.

Excellent: Monetisation aligns with the core coordination loop and host relief, creating a future where payment feels fair and obvious, retention improves, support burden is manageable, and growth and revenue reinforce each other.

Transcendent: Monetisation becomes a coherence engine—funding reliability, support, and product quality while keeping invitees frictionless—creating a future where Gather compounds trust, word-of-mouth, and resilience as events and households scale.

⸻

Theme 1 — Buyer, Beneficiary, and the Value Moment

Purpose

To identify the true payer (buyer), the primary beneficiary, and the specific moment when value becomes undeniable—so the charging model matches lived reality.

Why This Matters

If the wrong party is asked to pay, Gather becomes socially contaminated: hosts feel embarrassed, invitees feel extracted from, or the group dynamic becomes awkward. Correct buyer selection keeps adoption clean and preserves the core coordination loop.

Outcomes (Future-Oriented)

Poor: The payer is chosen by assumption (or aspiration), creating a future where the product contorts around reluctance and pricing becomes a constant source of friction and explanation.

Expected: The payer and value moment are explicitly named, creating a future where the paywall sits naturally and the product story stays simple.

Excellent: The model matches the person who feels the pain most (and receives the relief), creating a future where conversion is driven by gratitude rather than persuasion.

Transcendent: The monetisation stance strengthens the social field of the gathering—payment supports care and coordination without introducing status, shame, or extraction—creating a future where Gather becomes culturally easy to recommend.

Guiding Questions
	•	Who experiences the highest “coordination load” today: host, coordinator, or the group? (Unknown until segment is locked.)
	•	What is the clearest “value moment” that would justify payment (e.g., freeze, reassignment clarity, reduced host chasing, certainty on critical items)?
	•	Who would feel most comfortable paying without needing social negotiation?
	•	What must remain free for invitees to keep participation frictionless?

Theme Completion Prompt

A single sentence exists that names: who pays, why they pay, and when they pay.

⸻

Theme 2 — Choose the Monetisation Shape

Purpose

To choose the charging shape that best fits Gather’s usage pattern: per-event, subscription, or hybrid.

Why This Matters

The monetisation shape sets the product’s gravity. Subscription models pull toward retention mechanics and ongoing use. Per-event models pull toward completion and peak-season spikes. A hybrid model can work—but only if it stays simple and non-clever.

Outcomes (Future-Oriented)

Poor: The shape is chosen for “SaaS correctness” rather than user rhythm, creating a future where billing feels mismatched, churn is high, and the product narrative becomes complicated.

Expected: A single primary shape is chosen with a clear rationale, creating a future where implementation and messaging are straightforward and testable.

Excellent: The shape matches host frequency and seasonal reality, creating a future where revenue is stable enough to fund reliability while adoption remains easy.

Transcendent: The chosen shape becomes an invisible support structure—hosts pay in a way that mirrors their real-life rhythm—creating a future where Gather scales across households without monetisation becoming a psychological hurdle.

Guiding Questions
	•	Is the primary customer a “once-a-year big event host” or a “multi-event organiser”? (Unknown)
	•	Which model produces the least awkwardness: paying once per event, or paying to be an ongoing organiser?
	•	Does Gather’s value concentrate at event-time (per-event), or persist as an organising layer (subscription)?
	•	If hybrid: what is the simplest rule that prevents confusion?

Theme Completion Prompt

One monetisation shape is chosen and written as: Primary model + optional secondary model (if any), with a one-line rationale.

⸻

Theme 3 — Packaging and Pricing Architecture

Purpose

To set pricing and packaging that are simple, fair, and scalable: one price vs tiers, thresholds, and what “paid” unlocks.

Why This Matters

Pricing communicates identity. If it is too complex, Gather becomes a negotiation. If it is too cheap, it signals fragility. If it is too expensive, it stalls adoption. The goal is a price that feels like relief—not a purchase debate.

Outcomes (Future-Oriented)

Poor: Pricing is set without anchors or tests, creating a future where every conversation becomes a discount request and revenue becomes fragile.

Expected: A clear starting price (or small set of prices) is defined with simple packaging, creating a future where the product can charge cleanly and learn fast.

Excellent: Pricing aligns with perceived relief and scales with event complexity, creating a future where high-need events subsidise support and reliability without penalising small gatherings.

Transcendent: Pricing becomes self-explanatory in the culture—people feel it is “obviously worth it” because it protects relationships and time—creating a future where Gather’s brand compounds through trust.

Guiding Questions
	•	What is Gather replacing: spreadsheets, group chats, stress, and last-minute failure—what is that worth to hosts?
	•	Should pricing scale by number of invitees, number of teams/items, event duration, or be flat? (Unknown)
	•	Is one price better for clarity, at least in NZ launch?
	•	What is the minimum “paid unlock” set that genuinely changes outcomes (not just features)?

Theme Completion Prompt

A pricing decision exists in a form that engineering can implement: Price(s), what they unlock, and any thresholds.

⸻

Theme 4 — Paywall Placement and Friction Budget

Purpose

To decide exactly when payment is required and what must remain frictionless, especially for invitees.

Why This Matters

Gather’s product is a coordination loop. A badly placed paywall breaks the loop and kills adoption. A well-placed paywall arrives at a moment of relief—when the host already knows they want the system to carry the load.

Outcomes (Future-Oriented)

Poor: Payment interrupts the invite/RSVP flow, creating a future where drop-off rises, hosts revert to old tools, and Gather gains a reputation for awkward friction.

Expected: Payment is triggered at a clean, defensible moment, creating a future where conversion is measurable and the core loop stays intact.

Excellent: The paywall is positioned at the natural “commitment moment” (e.g., freeze, finalise, or advanced coordination), creating a future where payment feels like a sensible step toward certainty.

Transcendent: Gather maintains social grace at scale—invitees experience simplicity, hosts experience relief—creating a future where Gather becomes the default coordination layer without paywall resentment.

Guiding Questions
	•	What must always remain free: viewing invites, RSVP, accepting/declining items? (Assumption: invitee flow should remain free unless proven otherwise.)
	•	What is the cleanest “host value moment” to charge: event creation, sending invites, freezing, post-event export, premium reminders? (Unknown)
	•	Is there a “free threshold” that protects small events without confusing larger ones? (Unknown)
	•	What is the maximum acceptable friction for the host before conversion tanks?

Theme Completion Prompt

A specific paywall rule is written as: Trigger + who pays + what happens if unpaid + what remains free.

⸻

Theme 5 — Stripe Implementation Mapping

Purpose

To map the chosen monetisation model into Stripe primitives and clean app states, so billing is reliable, testable, and low-maintenance.

Why This Matters

Monetisation that cannot be implemented cleanly becomes support debt and trust erosion. Stripe reduces complexity—but only if the product model is translated into simple, explicit Stripe objects and webhook-driven states.

Outcomes (Future-Oriented)

Poor: Stripe is bolted on with ad-hoc logic, creating a future where edge cases (refunds, failed payments, status drift) break access control and generate customer support drag.

Expected: Stripe objects and app states are mapped cleanly (Products/Prices + Checkout + webhooks), creating a future where payment status is authoritative and billing incidents are manageable.

Excellent: Stripe integration supports clear lifecycle states (trial, paid, past_due, cancelled) and clean entitlements, creating a future where monetisation can evolve without rewiring the whole system.

Transcendent: Billing becomes invisible infrastructure—reliable, auditable, and calm—creating a future where product energy stays on coordination outcomes, not payment firefighting.

Guiding Questions
	•	Is the model one-time per event (Stripe Checkout payment) or recurring (Stripe Subscription)? (Unknown until Theme 2 is locked.)
	•	What is the entitlement key: event-level access, host-level access, or organisation-level access? (Unknown)
	•	Which Stripe features will be used: coupons, trials, customer portal, invoice PDFs, Stripe Tax? (Unknown)
	•	What webhook events are required to keep state accurate (e.g., checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated)?

Theme Completion Prompt

A Stripe mapping exists that engineering can follow: Stripe objects + webhook events + in-app entitlement state machine.

⸻

Theme 6 — NZ GST and Commercial Integrity

Purpose

To ensure pricing and receipts are GST-aware and operationally clean for NZ from day one.

Why This Matters

GST mistakes create distrust, rework, and admin fatigue. A clean approach protects both customer experience and internal bookkeeping.

Outcomes (Future-Oriented)

Poor: GST handling is ambiguous or inconsistent, creating a future where invoices are questioned, refunds are messy, and finance work becomes a recurring drain.

Expected: A clear GST stance is chosen (inclusive/exclusive, invoicing approach), creating a future where customers understand what they are paying and reconciliation is straightforward.

Excellent: GST handling is embedded into Stripe configuration and internal reporting, creating a future where compliance is calm and scales with revenue.

Transcendent: Commercial integrity becomes part of the product’s trust signature—customers feel the business is honest and clean—creating a future where Gather is recommended not just for functionality but for reliability.

Guiding Questions
	•	Are prices shown GST-inclusive by default for NZ customers? (Unknown)
	•	Will Stripe Tax be used, or will GST be handled manually via configured tax rates? (Unknown)
	•	What is the refund policy and how does GST behave on refunds? (Unknown)
	•	What does the customer receive: receipt only, tax invoice, both?

Theme Completion Prompt

A written GST stance exists: price display rule + invoicing/receipt approach + refund handling rule.

⸻

Theme 7 — Validation Loop and Decision Lock

Purpose

To define how the monetisation strategy will be validated quickly in the NZ launch—and to lock a decision horizon to prevent endless churn.

Why This Matters

Without a validation loop, monetisation becomes opinion warfare. Without a lock, every new user anecdote reopens the decision. This theme creates a clean learning plan and protects momentum.

Outcomes (Future-Oriented)

Poor: Monetisation is changed reactively, creating a future where messaging is unstable, engineering rework grows, and users lose confidence.

Expected: A small set of metrics and a short test plan are defined, creating a future where monetisation decisions are evidence-led and iteration is bounded.

Excellent: Experiments are designed to isolate variables (price vs placement vs packaging), creating a future where learning compounds and the model strengthens with minimal disruption.

Transcendent: The monetisation strategy becomes a stable economic foundation that evolves gracefully—without breaking trust—creating a future where Gather can scale beyond NZ with a proven, coherent engine.

Guiding Questions
	•	What is the single primary monetisation metric for the next phase (conversion rate, revenue per active host, retention, support load)? (Unknown)
	•	What is the minimum cohort required to trust the signal? (Unknown)
	•	What is the lock period (e.g., 6–8 weeks) where the model will not change except for bug fixes? (Unknown)
	•	What is the “kill/keep/iterate” rule at the end of the test?

Theme Completion Prompt

A validation plan exists with: metric(s), cohort, timeline, and decision rule—plus a lock period.

⸻

Completion Prompts

Protocol Completion Prompt (the “done” test)

This protocol is complete when a one-page monetisation decision exists that includes:
	•	Who pays (buyer) and why (value moment)
	•	Model shape (per-event / subscription / hybrid)
	•	Price(s) and what they unlock
	•	Paywall trigger that preserves the core loop
	•	Stripe mapping (objects, webhooks, entitlement states)
	•	NZ GST stance (inclusive/exclusive + receipts/invoices + refunds)
	•	Validation plan (metric, cohort, lock period, decision rule)

Final Reflection Prompt

If this monetisation model became permanent, would it create a future where:
	•	Hosts feel relief and trust, not friction and explanation?
	•	Invitees remain frictionless and unextracted from?
	•	The business can fund reliability without distorting the product?
If any answer is “no,” return to the theme where the distortion originates and re-lock the decision.

⸻