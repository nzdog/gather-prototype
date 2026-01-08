# Gather UI Design Research Report

## Executive Summary

This research identifies interfaces and design philosophies that embody the principles established for Gather: recognition over orientation, calm over engagement, sufficiency without excess, task completion over feature discovery, and mobile-native simplicity.

The research reveals a coherent design movement emerging from multiple sources—government digital services, calm technology advocates, and independent product makers—all converging on similar principles: technology should disappear into its function.

---

## Part 1: Design Philosophy Sources

### 1.1 Calm Technology (Amber Case / Xerox PARC)

**Source:** Calm Tech Institute, calmtech.com

**Eight Principles of Calm Technology:**

1. Technology should require the smallest possible amount of attention
2. Technology should inform and create calm
3. Technology should make use of the periphery
4. Technology should amplify the best of technology and the best of humanity
5. Technology can communicate, but doesn't need to speak
6. Technology should work even when it fails
7. The right amount of technology is the minimum needed to solve the problem
8. Technology should respect social norms

**Relevance to Gather:**
- Principle 1 directly maps to Gather's "recognition over orientation"
- Principle 7 maps to "sufficiency without excess"
- The periphery concept (informing without overburdening) aligns with Gather's status visibility model

**Key Quote:** "A person's primary task should not be computing, but being human. Give people what they need to solve their problem, and nothing more."

**Certified Products:** The Calm Tech Institute now certifies products including mui Board, reMarkable Paper Pro, and Airthings monitors—all characterized by displays that appear only when needed.

---

### 1.2 GOV.UK Design System

**Source:** design-system.service.gov.uk, gov.uk/guidance/government-design-principles

**Core Principles:**

1. Start with user needs
2. Do less (government should only do what only government can do)
3. Design with data
4. Do the hard work to make things simple
5. Iterate. Then iterate again.
6. Build for everyone (accessibility)
7. Understand context
8. Build digital services, not websites
9. Be consistent, not uniform
10. Make things open

**Relevance to Gather:**
- "Do less" and "Do the hard work to make things simple" directly parallel Gather's approach
- Pattern library provides tested solutions for common tasks (asking for names, addresses, confirmations)
- Focus on services for "everyone" means no assumed technical sophistication

**Key Design Approach:**
- Every pattern is documented with "when to use this," "when not to use this," and research findings
- Patterns are named by function ("Check before you start") not by UI element
- Accessibility is not separate—it's built into every pattern

**Applicable Patterns:**
- Task list pattern (showing what needs to be done)
- Check answers pattern (confirmation before submission)
- Start page pattern (clarity on what service does before entering)

---

### 1.3 Center for Humane Technology / Time Well Spent

**Source:** humanetech.com, Tristan Harris

**Core Thesis:** Technology companies optimize for engagement at the expense of human wellbeing. Design choices like notifications, badges, infinite scroll, and social comparison are deliberately attention-harvesting.

**Anti-Patterns They Identify:**
- Red notification badges (make trivial seem urgent)
- Social comparison features
- Intermittent variable rewards (slot machine psychology)
- Infinite scroll (no natural stopping point)
- Engagement-maximizing algorithmic feeds

**Relevance to Gather:**
- Gather's explicit prohibition on notification badges, activity feeds, and social comparison aligns perfectly
- The principle that "your primary task should not be computing" maps to Gather's "disappearance is success"
- CHT's concern about surveillance parallels Gather's prohibition on behavioral visibility

**Key Insight:** Features that increase engagement metrics often decrease user satisfaction. Two-thirds of users report feeling dissatisfied after using the most "engaging" apps.

---

## Part 2: Strong Product Examples

### 2.1 Linear (Issue Tracking)

**What it is:** Project management tool for software teams

**Why it exemplifies Gather principles:**

| Principle | How Linear Embodies It |
|-----------|----------------------|
| Recognition over orientation | Cmd+K opens command menu—no hunting through menus |
| Calm over engaging | Described as "Scandinavian design philosophy—minimal, functional, calm" |
| Sufficiency without excess | "Very little visual noise" |
| Task completion | Keyboard-first means complete action and move on |
| Mobile simplicity | Touch interactions secondary to keyboard efficiency |

**Design Philosophy (from Linear Method):**
- "The quality of a product is driven by both the talent of its creators and how they feel while they're crafting it"
- Opinionated defaults reduce decision fatigue
- Speed is a feature—near-instant interactions

**What Gather Can Learn:**
- Opinionated defaults (Linear auto-moves issues through workflow states)
- Keyboard-first thinking translates to "thumb-first" on mobile
- Status visibility without activity surveillance

**Limitation for Gather:**
- Linear is still a power-user tool with learning curve
- Dashboard views exist (though minimal)
- Assumes repeated daily use

---

### 2.2 Stripe Checkout

**What it is:** Payment flow for completing purchases

**Why it exemplifies Gather principles:**

| Principle | How Stripe Embodies It |
|-----------|----------------------|
| Recognition over orientation | Immediately clear: "Pay $X for Y" |
| Calm over engaging | No upsells during checkout flow |
| Sufficiency without excess | Only fields necessary for transaction |
| Task completion | One job: complete payment and leave |
| Mobile simplicity | Touch-optimized, auto-advancing fields |

**Design Philosophy:**
- "At this stage, the user is executing a decision, not browsing. Don't interrupt them."
- "Ask only what's necessary. Remove optional or redundant fields."
- Guest checkout option (no forced account creation)

**Specific Techniques:**
- Auto-formatting card numbers into readable chunks
- Auto-advancing cursor between fields
- Smart defaults (billing same as shipping, pre-checked)
- Single prominent CTA ("Pay now")
- Lock icon for trust signal

**What Gather Can Learn:**
- The "executing a decision" framing—participant is confirming, not browsing
- Auto-advance and smart defaults reduce effort
- Single action per screen

**Limitation for Gather:**
- Checkout is transactional; Gather has informational component
- Stripe still has conversion optimization tension (they want completed purchases)

---

### 2.3 HEY Email (Basecamp)

**What it is:** Email service with radically different approach

**Why it exemplifies Gather principles:**

| Principle | How HEY Embodies It |
|-----------|----------------------|
| Recognition over orientation | "Imbox" shows only approved senders |
| Calm over engaging | Notifications OFF by default |
| Sufficiency without excess | Screener hides unknown senders entirely |
| Task completion | "Reply Later" pile—explicit parking |
| Mobile simplicity | Same calm approach on mobile |

**Design Philosophy:**
- "We intentionally don't include things like notification counts/badges, 3-column designs, or other distracting elements"
- "Always choosing clarity over being slick or fancy"
- "Prioritizing respectful interfaces that don't overwhelm or try to nag the user"

**The Screener Pattern:**
The most innovative feature—new senders don't reach your inbox until you approve them. This inverts the default: silence unless you opt in.

**Jonas Downey (Basecamp Designer):**
> "The magic combo is having simple interfaces paired with powerful capabilities below the surface. The interface itself is simple, but the thinking and the system behind it is complex."

**What Gather Can Learn:**
- Notifications off by default is radical but correct
- "Reply Later" as explicit deferred-action parking lot
- Simple interface / complex system underneath

**Limitation for Gather:**
- HEY has learning curve for email veterans
- Some users find UI quirky (Imbox, Paper Trail naming)
- Subscription cost creates barrier

---

### 2.4 reMarkable Paper Tablets

**What it is:** E-ink tablets for writing/reading without distractions

**Why it exemplifies Gather principles:**

| Principle | How reMarkable Embodies It |
|-----------|----------------------|
| Recognition over orientation | Paper metaphor—no learning needed |
| Calm over engaging | No apps, no notifications, no browser |
| Sufficiency without excess | Writing and reading only |
| Task completion | Complete thought, close device |
| Disappearance | "Distraction-free by design" |

**Design Philosophy:**
- "Think freely without apps, pop-ups or notifications"
- "The device's high price tag remains a major deterrent"—but users pay for removal of features
- "Focused hardware thesis"—less is the product

**Hardware as Constraint:**
reMarkable proves that removing capability can be the value proposition. Users pay $600+ specifically because the device can't do email, can't browse web, can't notify.

**What Gather Can Learn:**
- Absence of features is the feature
- "Distraction-free" as explicit product positioning
- Users will pay for calm

**Limitation for Gather:**
- Hardware has different constraint model than software
- reMarkable is for individual use; Gather is coordination
- Price point creates self-selecting user base

---

### 2.5 Plausible Analytics

**What it is:** Privacy-focused website analytics

**Why it exemplifies Gather principles:**

| Principle | How Plausible Embodies It |
|-----------|----------------------|
| Recognition over orientation | Single-screen dashboard, all stats at glance |
| Calm over engaging | No notifications, no alerts by default |
| Sufficiency without excess | "Cut through the noise" explicitly |
| Task completion | Check stats, leave—no rabbit holes |
| Disappearance | Invisible to site visitors (no cookie banner) |

**Design Philosophy:**
- "Get all the important web analytics at a glance so you can focus on creating a better site and a better business"
- "No layers of navigational menus, no need to create custom reports"
- Script is 75x smaller than Google Analytics

**Anti-Google Positioning:**
Plausible explicitly defines itself against Google Analytics complexity. This "anti-" positioning creates clear product boundaries.

**What Gather Can Learn:**
- Single-screen dashboard as radical simplicity
- Defining against bloated incumbent clarifies what you're not
- Privacy as feature (no surveillance = no cookie banner = calmer experience)

**Limitation for Gather:**
- Analytics is inherently viewing-focused; Gather requires action
- Plausible serves site owners; Gather serves event participants
- Power users sometimes want the complexity Plausible removes

---

### 2.6 Apple Wallet / Passes

**What it is:** Digital passes for boarding, tickets, memberships

**Why it exemplifies Gather principles:**

| Principle | How Apple Wallet Embodies It |
|-----------|----------------------|
| Recognition over orientation | Pass appears on lock screen when relevant |
| Calm over engaging | No notifications except relevance-based |
| Sufficiency without excess | "Keep the front of a pass uncluttered" |
| Task completion | Show pass, scan, done |
| Mobile simplicity | Native to phone; one-thumb operation |

**Design Guidelines (Apple HIG):**
- "People expect to glance at a pass and quickly get the information they need"
- "Design a clean, simple pass that looks at home in Wallet"
- "Use change messages only for updates to time-critical information"
- "Never use a change message for marketing"

**Information Hierarchy:**
- Primary fields: most important, shown prominently
- Secondary fields: less important, less prominent
- Auxiliary fields: even less prominent
- Header fields: visible when passes are stacked (use sparingly)

**Relevance-Based Appearance:**
Passes appear on lock screen based on time and location—they surface when needed without user action.

**What Gather Can Learn:**
- Pass metaphor: glance, scan, done
- Relevance-based surfacing (though Gather uses magic links instead)
- Strict information hierarchy
- "Never for marketing" principle

**Limitation for Gather:**
- Passes are mostly read-only; Gather requires acknowledge action
- Apple controls the template; Gather needs custom design
- Passes work within Apple ecosystem only

---

### 2.7 mui Board (Calm Tech Certified)

**What it is:** Wooden smart home display that disappears when not in use

**Why it exemplifies Gather principles:**

| Principle | How mui Board Embodies It |
|-----------|----------------------|
| Recognition over orientation | Interface appears only when you swipe |
| Calm over engaging | "Blends into surroundings as furniture" |
| Sufficiency without excess | Shows only what you need, then disappears |
| Task completion | Complete task, display vanishes |
| Disappearance | Literally disappears into wood grain |

**Design Philosophy:**
- "The most profound technology disappears"
- "Technology should perform in perfect harmony with humans"
- "Stop technology from continually grabbing our attention"

**Physical Calm:**
mui Board uses natural wood as display surface. When off, it's just a wooden panel. This physical calm parallels Gather's digital calm.

**What Gather Can Learn:**
- Display-then-disappear as interaction model
- Natural materials metaphor (what's the digital equivalent of wood?)
- "Perfect harmony" framing

**Limitation for Gather:**
- Physical product; different constraint space
- Smart home context vs. event coordination
- Hardware innovation not directly transferable

---

## Part 3: Status Page Design Pattern

**Exemplars:** GitHub Status, Atlassian Statuspage, Better Stack

**Why Status Pages Matter for Gather:**
Status pages solve a similar problem: showing system state without surveillance, providing glance-able information, and updating only when meaningful.

**Common Pattern:**
- Single status indicator at top (All Systems Operational / Issues Detected)
- Component list with individual status
- Color coding: green/yellow/red (always paired with text)
- No historical activity feed by default
- Subscribe option (user chooses notification)

**Design Principles from Status Pages:**
- "Current state only"—not history
- "Red/yellow/green at a glance"
- Status indicates state, not activity
- Updates interrupt only when necessary

**What Gather Can Learn:**
- Team status rows can mirror component status rows
- "All sorted" / "Gaps remain" as binary top-level indicator
- Subscribe model (users opt into notifications)
- Status without history

---

## Part 4: Anti-Patterns to Avoid

Based on research, these patterns directly contradict Gather principles:

### 4.1 Dashboards
- Create viewers, not participants
- Imply surveillance
- Encourage comparison
- Hide simple answers behind complex visualizations

**Research Finding:** Cognitive load research shows dashboards overwhelm users. "Extraneous load" from poor interface design impedes decision-making.

### 4.2 Activity Feeds
- Surface behavior, not state
- Create FOMO (fear of missing out)
- Enable surveillance by peers
- Privilege recency over relevance

### 4.3 Notification Badges
- "Make the trivial seem urgent" (CHT)
- Use intermittent variable rewards
- Create anxiety about unknown counts
- Demand attention whether deserved or not

### 4.4 Progress Bars / Leaderboards
- Enable judgment without context
- Create social comparison
- Imply pace expectations
- Gamify what shouldn't be gamified

### 4.5 Engagement Metrics Visible to Users
- Time on site
- "5 people are viewing this"
- "Last active" timestamps
- Streak counts

---

## Part 5: Applicable Design Patterns

### 5.1 The Screener Pattern (from HEY)
**What it is:** New items go to holding area until explicitly approved.
**Application to Gather:** Not directly applicable (items are assigned by coordinators), but the inversion of defaults is instructive—silence until opted in.

### 5.2 The Pass Pattern (from Apple Wallet)
**What it is:** Glance-able card with strict information hierarchy, relevance-based surfacing.
**Application to Gather:** Participant view as a "pass"—item name prominent, details beneath, appears when needed.

### 5.3 The Single-Screen Dashboard (from Plausible)
**What it is:** All relevant information on one screen, no drilling down required.
**Application to Gather:** Coordinator and Host views—everything needed without navigation.

### 5.4 The Confirmation Pattern (from Stripe)
**What it is:** Clear what you're confirming, single prominent action, immediate feedback.
**Application to Gather:** Participant acknowledge flow.

### 5.5 The Status Row Pattern (from Status Pages)
**What it is:** Component name + status indicator + optional detail.
**Application to Gather:** Team rows in Host view, Item rows in Coordinator view.

### 5.6 The Reply Later Pattern (from HEY)
**What it is:** Explicit parking lot for deferred action, visible but out of flow.
**Application to Gather:** Less relevant (no deferred actions in Gather's flow).

---

## Part 6: Essays and Resources

### 6.1 Primary Texts

**"Calm Technology" by Amber Case (O'Reilly, 2015)**
- Foundational text on attention-respecting design
- Includes exercises for "calming" existing products
- Patterns for status indicators, ambient awareness

**"Designing Calm Technology" by Mark Weiser & John Seely Brown (1995)**
- Origin of calm technology concept
- "LiveWire" example: network traffic shown via dangling string
- Periphery as information display

**GOV.UK Service Manual**
- Comprehensive pattern documentation
- Research-backed design decisions
- Accessibility-first approach

### 6.2 Design Manifestos

**Linear Method (linear.app/method)**
- "Practices for building"
- Opinionated product philosophy
- Speed and quality focus

**HEY Manifesto (hey.com/the-hey-way)**
- "Email deserved a fresh start"
- Privacy and respect positioning
- Anti-surveillance stance

### 6.3 Critical Perspectives

**Center for Humane Technology resources**
- "The Social Dilemma" documentary context
- Critique of attention economy
- Alternative incentive structures

**Stephen Few, "Information Dashboard Design"**
- Cognitive science applied to dashboards
- "Data-to-ink ratio" (minimize decoration)
- When dashboards fail

---

## Part 7: Synthesis for Gather

### What These Examples Share

1. **Intentional Limitation:** The best examples remove features rather than add them. HEY removes notifications. reMarkable removes apps. Plausible removes complexity. Linear removes configuration.

2. **Opacity to Others:** None of these tools let users see what other users are doing. Linear shows your issues. HEY shows your email. reMarkable is single-user. This matches Gather's prohibition on behavioral visibility.

3. **Completion as Goal:** Every example is designed for task completion and exit. Stripe wants you to pay and leave. Apple Wallet wants you to show the pass and put your phone away. This matches Gather's "disappearance is success."

4. **Calm as Feature:** Multiple products explicitly market "calm" as the value proposition. Users will pay for the absence of distraction.

5. **Defaults that Protect:** HEY's notifications-off default, reMarkable's absence of apps, Plausible's no-cookie approach—all protect users from surveillance and distraction by default.

### Specific Recommendations for Gather

| Gather Screen | Reference Pattern | Source |
|--------------|------------------|--------|
| Participant view | Pass card with info hierarchy | Apple Wallet |
| Acknowledge flow | Confirmation with single CTA | Stripe Checkout |
| Coordinator team overview | Status rows with color indicators | Status Pages |
| Host event overview | Single-screen dashboard | Plausible |
| Assignment drawer | Command palette emergence | Linear |

### Visual Design Direction

Based on research, Gather's visual design should:

- **Use white space as structure, not decoration** (GOV.UK, Plausible)
- **Color indicates status, never decoration** (Status Pages, Apple Wallet)
- **Typography hierarchy does the work** (all examples prioritize type over icons)
- **No illustrations, mascots, or branding prominence** (opposite of "delightful" apps)
- **Feel like paper or furniture—natural, settled** (reMarkable, mui Board)

### What Success Looks Like

The research confirms Gather's core thesis: success is measured by forgetting.

**From reMarkable:** "Distraction-free by design"
**From HEY:** "Notifications off by default"
**From Plausible:** "Cut through the noise"
**From Calm Tech:** "The most profound technology disappears"
**From GOV.UK:** "Do the hard work to make things simple"

If users remember the tool, the tool has failed. The ritual is successful. The tool is forgotten.

---

## Appendix: Quick Reference Links

### Design Systems
- GOV.UK Design System: https://design-system.service.gov.uk
- Apple Human Interface Guidelines (Wallet): https://developer.apple.com/design/human-interface-guidelines/wallet

### Products to Study
- Linear: https://linear.app
- HEY: https://hey.com
- Plausible: https://plausible.io
- reMarkable: https://remarkable.com
- mui Board: https://muilab.com

### Philosophy Resources
- Calm Tech Institute: https://calmtech.institute
- Center for Humane Technology: https://humanetech.com
- Linear Method: https://linear.app/method

### Status Page Examples
- GitHub Status: https://githubstatus.com
- Atlassian examples: https://www.atlassian.com/blog/statuspage/statuspage-examples

---

*Research completed December 2024*
