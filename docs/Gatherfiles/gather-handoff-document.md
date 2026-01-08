# Gather UI — Design & Development Handoff

## For Designers and Developers Executing This System

This document contains everything you need to build the Gather UI without diluting its integrity. It explains what to build, why each decision was made, and how to evaluate edge cases you'll encounter.

Read this document completely before starting. The "why" matters as much as the "what."

---

## Part 1: What You're Building

### The Product

Gather is a coordination system for multi-day gatherings (Christmas, reunions, retreats). It tells people what they're responsible for bringing, shows coordinators whether their team has gaps, and shows hosts whether the event is ready to lock.

### The Job To Be Done

> Make sure everyone knows what they're responsible for, without anyone having to hold the whole plan in their head.

That's the only job. Everything else is scope creep.

### The Three Roles

| Role | What They Do | What They See |
|------|--------------|---------------|
| **Participant** | Brings an item (pavlova, ham, chairs) | Only their assignment(s) |
| **Coordinator** | Manages one team's items and assignments | Only their team |
| **Host** | Oversees all teams, controls event lifecycle | All teams at status level |

Each role accesses the system via a unique magic link. There is no login, no account, no password.

### The Screens

| # | Screen | Role | URL Pattern |
|---|--------|------|-------------|
| 1 | Assignments | Participant | /p/[token] |
| 2 | Team Overview | Coordinator | /c/[token] |
| 3 | Event Overview | Host | /h/[token] |
| 4 | Team Drill-down | Host | /h/[token]/team/[teamId] |

Four screens. Total. Not four per role — four in the entire system.

---

## Part 2: The Success Criteria (Read This Carefully)

### What Success Looks Like

> "Everyone just knew what they were bringing."

Not "the app was really easy to use." That's failure — it means they noticed the app.

Success is when:
- Participants remember the pavlova, not the interface
- Coordinators remember their team being sorted, not the tool
- Hosts remember relief, not management
- Next year, no one hesitates or asks how

### What Failure Looks Like

- Someone sends a message asking "what am I bringing again?"
- Someone says "I couldn't figure out how to..."
- The host has to explain how to use it
- Anyone remembers the app by name
- The family group chat discusses the tool instead of Christmas

### The Emotional Contract

Every screen must produce:
1. **Recognition** — users instantly see their responsibility as already decided
2. **Containment** — users see only what they can act on
3. **Release** — users leave without uncertainty or obligation to return

The promise is not "you're doing a good job."
The promise is: **"This no longer needs you."**

---

## Part 3: The Ten Laws

These laws govern every decision. They are not preferences. They are structural requirements. If something violates a law, it's wrong — regardless of how reasonable it seems.

### Law 1: Recognition Over Orientation

The interface does not help users find information. It presents responsibility as already found. Users recognize their task; they don't discover it.

**Test:** Within 3 seconds of opening, does the user see the answer to their primary question?

### Law 2: Questions Must Be About Responsibility

The interface only answers: What? How much? When? Where? Who's responsible? Can I act?

It never answers: Who did what? When did they do it? How fast? What changed?

**Test:** Does this element answer a responsibility question or a behavior question?

### Law 3: No Information Without Agency

If a user can't act on information, they shouldn't see it. Information without agency creates anxiety.

**Test:** Can this role do something about this information? If no, remove it.

### Law 4: Sufficiency Is Falsifiable

Every element must answer a question. If removing an element leaves no question unanswered, the element shouldn't exist.

**Test:** Remove this element. What question is now unanswered? If none, delete it.

### Law 5: Jobs Earn Screens, Actions Earn Surfaces

A new screen is justified only by a new job. Actions (assign, add, edit, confirm) happen in drawers/modals on existing screens.

**Test:** Is this a new job or a response to an existing job?

### Law 6: Question-First Hierarchy

The first thing visible must answer the question alive at the moment of arrival. Not the most "important" information — the most immediately needed.

**Test:** What question is the user carrying when they open this screen? Does the first glance answer it?

### Law 7: Effort Matches Consequence

Trivial tasks should feel trivial. Consequential actions should feel deliberate. Speed is acceptable only when correction is cheap.

**Test:** Is the effort proportional to the consequence?

### Law 8: No Judgment Without Repair

If information lets someone judge another person's behavior but doesn't let them fix anything, it's surveillance. Surveillance is prohibited.

**Test:** Does this enable judgment without enabling repair?

### Law 9: Mobile Is Truth

If it doesn't work one-handed, distracted, and interruptible, it doesn't work. Design for the grocery store aisle, not the desk.

**Test:** Can every primary action be completed with one thumb while holding something?

### Law 10: Disappearance Is Success

The interface should leave no memory of itself. Users remember their task and its resolution, not the tool.

**Test:** Will users remember using this? If yes, we've failed.

---

## Part 4: What Each Role Sees (Detailed)

### Participant View

**Primary question at arrival:** "What am I bringing?"

**Answer:** Item name, immediately visible, largest text on screen.

**Complete information set:**

| Element | Required | Purpose |
|---------|----------|---------|
| Event name | Yes | Confirms right event |
| Event dates | Yes | Temporal context |
| Guest count | Yes | Portioning context ("feeds 27") |
| Item name | Yes | What they're bringing |
| Quantity | If applicable | How much |
| Drop-off date/time | Yes | When |
| Drop-off location | Yes | Where |
| Drop-off note | If present | Special instructions |
| Item notes | If present | Additional context |
| Acknowledge button | Yes | Completes handoff |
| Coordinator name | Yes | Escalation path |

**What they must NOT see:**
- Other participants (names, assignments, existence)
- Other items (not theirs)
- Team information (name, status, membership)
- Event status (CONFIRMING/FROZEN)
- Critical flags (pressure without agency)
- Timestamps of any kind
- Acknowledgment state of others

**Interaction:** One tap to acknowledge. That's it.

---

### Coordinator View

**Primary question at arrival:** "Do I have gaps?"

**Answer:** Status banner showing gap count or "all assigned."

**Complete information set:**

| Element | Required | Purpose |
|---------|----------|---------|
| Team name | Yes | Confirms right team |
| Event status | Yes | Can they act? |
| Guest count | Yes | Assignment context |
| Status banner | Yes | Answers primary question |
| Item list | Yes | Detail behind status |
| Per item: name | Yes | What |
| Per item: quantity | If applicable | How much |
| Per item: assignee or "Unassigned" | Yes | Responsibility state |
| Per item: critical flag | If critical | Priority |
| Per item: drop-off summary | Yes | Context for assignment |
| Team members | In assignment drawer | Who's available |
| Add item button | Yes | Create new items |

**What they must NOT see:**
- Other teams' items
- Other teams' status (even aggregate)
- Other coordinators' names
- Acknowledgment status of assignees
- Timestamps on anything
- Edit history / change log
- "Previously assigned to" data

**Interactions:**
- Tap item → assignment drawer (2 taps to assign)
- Tap add → add item form
- Tap edit → edit item form

---

### Host View (Overview)

**Primary question at arrival:** "Can we freeze?"

**Answer:** Status banner showing freeze readiness or gap count.

**Complete information set:**

| Element | Required | Purpose |
|---------|----------|---------|
| Event name | Yes | Confirms right event |
| Event dates | Yes | Context |
| Guest count | Yes, editable | Context |
| Event status | Yes | Current state |
| Freeze readiness banner | Yes | Answers primary question |
| Team list | Yes | Structure behind status |
| Per team: name | Yes | Identification |
| Per team: status | Yes | Health indicator |
| Per team: coordinator name | Yes | Escalation path |
| Freeze/unfreeze button | Yes | Primary action |

**What they must NOT see:**
- Individual confirmation status
- Who confirmed when
- Audit log / activity feed
- Change history
- Assignment changes over time
- Coordinator activity levels

**Interactions:**
- Tap team → drill-down (1 tap)
- Tap freeze → confirmation modal (2 taps total)
- Tap guest count → edit modal

---

### Host View (Team Drill-down)

**Purpose:** Diagnose gaps in a specific team.

**Content:** Same as coordinator item list, but read-only. No assignment capability.

**Why read-only:** The host sees state, not capability. They escalate to the coordinator to make changes.

---

## Part 5: Prohibited Patterns

These patterns violate the protocol. Do not implement them under any circumstances.

### Prohibited: Dashboards

No aggregated metrics. No charts. No "at a glance" statistics beyond simple status.

**Why:** Dashboards create viewers, not participants. They invite monitoring instead of doing.

### Prohibited: Progress Bars

No "6/8 confirmed." No completion percentages.

**Why:** Progress implies pace. Pace invites comparison. Comparison creates pressure.

### Prohibited: Activity Feeds

No "Kate assigned the ham." No "Sarah confirmed."

**Why:** Activity is behavior. Behavior visibility is surveillance.

### Prohibited: Timestamps

No "assigned 2 hours ago." No "confirmed yesterday." No "created Dec 15."

**Why:** Timestamps answer "when" questions about people, not responsibility.

### Prohibited: Audit Logs in UI

The audit log exists in the database for integrity. It never surfaces in any user view.

**Why:** Audit logs are surveillance infrastructure.

### Prohibited: Notifications

No push notifications. No email reminders. No "you haven't confirmed yet."

**Why:** Notifications create obligation to return. Return should be unnecessary.

### Prohibited: Leaderboards / Comparisons

No "your team vs other teams." No ranking by completion.

**Why:** Comparison is social judgment.

### Prohibited: Onboarding

No welcome screens. No feature tours. No "let's get started."

**Why:** If the interface requires explanation, the interface has failed.

### Prohibited: Celebration

No confetti. No "great job!" No animated success states.

**Why:** Celebration creates memory. Memory of the tool is failure.

---

## Part 6: Visual Design Principles

### Aesthetic: Calm, Not Minimal

The interface should feel calm, not sparse. There's a difference:
- **Sparse:** Missing things, feels incomplete
- **Calm:** Everything needed, nothing extra, feels settled

### Color Usage

| Color | Purpose |
|-------|---------|
| Green | Sorted, complete, good state |
| Amber | Gap, needs attention, not critical |
| Red | Critical gap, blocks freeze |
| Blue | Interactive elements, actions |
| Gray | Secondary text, disabled states |

Status is always communicated with **color + text**. Never color alone (accessibility).

### Typography Hierarchy

1. **Item name** (for participant) — largest, most prominent
2. **Status** (for coordinator/host) — prominent, color-coded
3. **Supporting details** — clear but not competing
4. **Context** — present but quiet

### Interaction Feedback

- **Taps:** Immediate visual response (color change, press state)
- **Success:** Settled state change (button becomes confirmed)
- **Loading:** Structural skeleton, no spinner
- **Errors:** Inline, informational, not alarming

### Animation Philosophy

Animation confirms completion. It does not decorate.

- **Allowed:** 200ms transitions on state changes
- **Prohibited:** Bounces, overshoots, playful motion, celebration

---

## Part 7: Mobile-First Specifications

### Tap Targets

Every interactive element: **minimum 56px height**

This is non-negotiable. Thumbs are imprecise. People are distracted.

### Thumb Zones

Primary actions live in the **bottom third** of the screen:
- Acknowledge button → bottom of item card
- Add item → fixed bottom bar
- Freeze → fixed bottom bar
- Drawers → slide from bottom

### Above-Fold Requirements

On a 375px wide × 667px tall viewport:

**Participant (single item):**
- Event context, item name, quantity, drop-off, acknowledge button — all visible without scroll

**Coordinator:**
- Status banner + first 3 items visible without scroll

**Host:**
- Freeze readiness + first 4 teams visible without scroll

### Interruption Recovery

Users will be interrupted. Design for it:

- **Participant:** No state to lose. Return = same view.
- **Coordinator:** Drawer closes on background. Form may reset. Re-entry is cheap.
- **Host:** Returns to overview (safe home state).

Never preserve complex state that corrupts on interruption.

---

## Part 8: Edge Cases & Decisions

### Edge Case: Participant has multiple items

Show each item as a separate card with its own acknowledge button. Sequential confirmation matches real cognition: "I'll get the pavlova... now the ham..."

Do NOT show a single "confirm all" button. Batch confirmation loses the felt acceptance of each item.

### Edge Case: Host is also a coordinator

Jacqui is host AND coordinates Setup & Cleanup. She has two roles.

**Decision:** Two separate links. Two separate views. Roles do not merge.

**Why:** Merging would combine jobs. One screen, one job.

### Edge Case: Item has no quantity

Don't display quantity. Don't display "Quantity: (none)" or "1".

**Why:** Empty fields violate sufficiency (answering no question).

### Edge Case: All teams sorted, no gaps

Show: "✓ Ready to freeze"

Freeze button is enabled. Status is celebration-free. Just factual.

### Edge Case: Coordinator has no items yet

Show: "No items yet" with prominent Add Item button.

This is the only "empty state" in the system.

### Edge Case: Person never confirms

The system does not track this. The system does not surface this.

If the pavlova doesn't arrive, that's a reality-level failure. The system's job was clarity. The human didn't follow through.

**Why:** Confirmation timing is a weak signal. Some people confirm immediately; some after shopping. The system trusts until reality fails.

---

## Part 9: How To Evaluate New Requests

During development, you'll encounter requests: "Can we add X?" "What if we show Y?"

Use this framework:

### Question 1: Does this answer a responsibility question?

If yes, consider it. If no, reject it.

### Question 2: Does this introduce the concept of other people?

If yes, reject it. (For participant view especially)

### Question 3: Does this enable judgment without repair?

If someone can judge but not fix, reject it.

### Question 4: If we remove this, what question goes unanswered?

If no question goes unanswered, reject it.

### Question 5: Will users remember this?

If yes, reconsider. The goal is forgettability.

### When In Doubt

Ask: "Does this serve the ritual of coordination, or does it serve the tool?"

If it serves the tool, reject it.

---

## Part 10: Technical Boundaries

### What the backend provides:

- Token-scoped API routes (see gather-builder-spec for details)
- Role resolution from token
- Assignment CRUD for coordinators
- Status transitions for host
- Audit logging (never surfaced to UI)

### What the frontend must NOT request:

- Other users' acknowledgment status
- Timestamps on any action
- Audit log entries
- Other teams' items (for coordinator)
- Historical state of any entity

### Defensive principle:

If the API returns data that violates these laws, the frontend must not display it. The frontend is the last line of defense.

---

## Part 11: Definition of Done

A screen is done when:

1. First glance answers the role's primary question
2. All required elements from Part 4 are present
3. All prohibited patterns from Part 5 are absent
4. All tap targets are 56px minimum
5. Primary action is in thumb zone
6. Works on 320px viewport
7. Interruption recovery works correctly
8. Build checklist passes for all applicable sections

### Regression definition:

A change is a regression if it:
- Introduces any prohibited pattern
- Surfaces behavioral information
- Increases tap count for primary actions
- Breaks mobile constraints
- Creates memory of the tool

---

## Part 12: Files To Use

| Document | Purpose |
|----------|---------|
| **gather-figma-spec.md** | Detailed screen specifications, layouts, tokens |
| **gather-build-checklist.md** | 93 testable verification items |
| **gather-builder-spec-v1.3.3.md** | Backend API and data model specification |
| **gather-implementation-plan-v1.3.3.md** | Phase-by-phase build sequence |

This handoff document is the "why." Those documents are the "what" and "how."

---

## Part 13: Questions You'll Have

### "Can I add a confirmation dialog for [action]?"

Only if the action has real consequences (freeze, unfreeze). Acknowledge doesn't get one — it's one tap, done.

### "Should I show loading states?"

Show skeleton structure. Never show spinners. Spinners create waiting anxiety.

### "What about error handling?"

Inline, informational, not alarming. "Couldn't save. Tap to retry." No exclamation marks. No red alerts.

### "Can the coordinator see who confirmed?"

No. Acknowledgment is between participant and system.

### "Can the host see team-level confirmation progress?"

No. Responsibility state only. Not behavior.

### "What if the user has no items assigned?"

For participant: shouldn't happen (they only get links if they have items).
For coordinator: empty state with "Add Item" button.
For host: teams always exist in seeded data.

### "Should we track usage/analytics?"

Not in the UI. If backend logs exist, they never surface. The system has no concept of "engagement."

### "Can we add a way to contact team members?"

No. Coordinator contact is the escalation path. The system doesn't facilitate lateral communication.

---

## Final Note

This system is designed to disappear.

If you find yourself adding something that makes the interface more noticeable, more memorable, or more "engaging" — stop. That's the wrong direction.

The goal is: people coordinate, the tool fades, Christmas happens.

Build for forgetting.
