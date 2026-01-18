# Gather UI — Build Checklist

## Purpose

This checklist ensures every implementation decision conforms to the protocol established through the 10-theme design walk. Each item is testable. Any failure indicates a protocol violation that must be resolved before shipping.

Use this checklist:
- During development (verify as you build)
- During code review (verify before merge)
- During QA (verify before release)
- During future changes (verify no regression)

---

## How To Use

Each item has:
- **Requirement**: What must be true
- **Test**: How to verify it
- **Violation Example**: What failure looks like

Mark items as:
- ✓ Pass
- ✗ Fail (must fix)
- N/A (not applicable to current work)

---

## Section 1: Emotional Contract (Theme 1)

### 1.1 Recognition Over Orientation

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 1.1.1 | Participant sees their item(s) immediately on load | Open participant link → item name visible without interaction | "Welcome to Gather" splash screen before items |
| 1.1.2 | Coordinator sees team status immediately on load | Open coordinator link → status banner visible without interaction | Loading spinner with no status indication |
| 1.1.3 | Host sees freeze readiness immediately on load | Open host link → "Ready to freeze" or gap count visible without interaction | Dashboard that requires scrolling to find status |

### 1.2 Release Over Vigilance

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 1.2.1 | No element encourages return visits | Audit all UI → no badges, counters, or "new" indicators | "3 updates since your last visit" |
| 1.2.2 | No element creates curiosity about others | Audit participant view → no reference to other participants or teams | "See who else is bringing items" |
| 1.2.3 | Confirmed state is visually settled | Tap acknowledge → button becomes calm completion state | Animated celebration or confetti |

---

## Section 2: Question Purity (Theme 2)

### 2.1 Responsibility Questions Answered

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 2.1.1 | Participant sees: what, how much, when, where | Check item card → all four elements present | Drop-off location missing |
| 2.1.2 | Participant sees guest count | Check participant view → "27 guests" visible | Guest count only in host view |
| 2.1.3 | Coordinator sees: item, status, assignee, critical flag | Check item row → all four visible without tap | Must tap item to see if assigned |
| 2.1.4 | Host sees: team, status, coordinator, freeze readiness | Check host view → all four visible | Coordinator name requires drill-down |

### 2.2 Behavior Questions Excluded

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 2.2.1 | No timestamps anywhere | Search codebase for timestamp display | "Assigned 2 hours ago" |
| 2.2.2 | No acknowledgment status visible to coordinator | Check coordinator view for confirmation indicators | "Kate ✓" or "Sarah (pending)" |
| 2.2.3 | No acknowledgment status visible to host | Check host drill-down for confirmation indicators | Progress bar showing "6/8 confirmed" |
| 2.2.4 | No history/previouslyAssignedTo visible | Check item displays → no "Previously: X" text | "Previously assigned to Sarah" |

---

## Section 3: Role-Bounded Visibility (Theme 3)

### 3.1 Participant Boundaries

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 3.1.1 | Participant sees only their own items | Log in as participant → verify only assigned items shown | "Other items in your team" section |
| 3.1.2 | Participant sees no other team members | Audit participant view → no names except coordinator contact | List of team members |
| 3.1.3 | Participant sees no team status | Audit participant view → no status indicators | "Your team has 2 gaps" |
| 3.1.4 | Participant sees no event status | Audit participant view → no CONFIRMING/FROZEN badge | "Event is frozen" banner |
| 3.1.5 | Participant sees no critical flags | Audit participant view → no critical indicators on their items | "⚠ Critical" badge on item |

### 3.2 Coordinator Boundaries

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 3.2.1 | Coordinator sees only their team's items | Log in as coordinator → verify only team items shown | Dropdown to view other teams |
| 3.2.2 | Coordinator sees no other teams' items | Audit coordinator view → other teams not listed | "Puddings" team with item list |
| 3.2.3 | Coordinator sees no other teams' status | Audit coordinator view → no other team status | "Other teams: 2 sorted, 1 has gaps" |
| 3.2.4 | Coordinator sees no acknowledgment states | Audit item rows → no confirmation indicators | Checkmark next to confirmed assignees |

### 3.3 Host Boundaries

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 3.3.1 | Host sees team status, not individual behavior | Check host overview → status per team, not per person | "Kate hasn't confirmed" |
| 3.3.2 | Host drill-down shows state, not history | Check drill-down → current assignments only | "Changed from Sarah to Kate" |
| 3.3.3 | Host cannot see audit log | Verify no audit log UI exists | "Activity" or "History" tab |

---

## Section 4: Sufficiency Without Excess (Theme 4)

### 4.1 Required Elements Present

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 4.1.1 | All commitment details on participant card | Check card has: name, quantity, date/time, location | Missing drop-off time |
| 4.1.2 | Guest count visible on all views | Check participant, coordinator, host → all show guest count | Guest count only on host view |
| 4.1.3 | Coordinator contact on participant view | Check participant view → coordinator name visible | No coordinator information |
| 4.1.4 | Event status on coordinator view | Check header → CONFIRMING/FROZEN visible | Status only visible after tap |

### 4.2 Excess Elements Removed

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 4.2.1 | No empty fields displayed | Check items with no notes → notes section absent | "Notes: (none)" |
| 4.2.2 | No redundant badges | Check assigned items → assignee name only, no "Assigned" badge | "Assigned" badge plus assignee name |
| 4.2.3 | No "non-critical" indicators | Check non-critical items → no badge | "Non-critical" badge |
| 4.2.4 | No day labels when single day | Check single-day items → no repeated day | "Christmas Day" on every item |

### 4.3 Conditional Visibility Works

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 4.3.1 | Drop-off note appears only when present | Create item with/without note → verify display | Empty "Drop-off note:" line |
| 4.3.2 | Item notes appear only when present | Create item with/without notes → verify display | Empty notes section |
| 4.3.3 | Day grouping appears only when multi-day | Check items spanning days vs single day | Day header for single-day event |

---

## Section 5: Screen Structure (Theme 5)

### 5.1 Screen Count

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 5.1.1 | Participant has exactly 1 screen | Audit participant routes → only /p/[token] | Settings or profile screen |
| 5.1.2 | Coordinator has exactly 1 screen | Audit coordinator routes → only /c/[token] | Separate "Team Members" screen |
| 5.1.3 | Host has exactly 2 screens | Audit host routes → overview + drill-down only | Audit log or settings screen |

### 5.2 Actions Are Surfaces, Not Screens

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 5.2.1 | Assignment is drawer, not page | Tap item to assign → drawer appears, no navigation | URL changes when assigning |
| 5.2.2 | Add item is form/drawer, not page | Tap add → form appears, no navigation | Separate /add-item route |
| 5.2.3 | Edit item is form/drawer, not page | Tap edit → form appears, no navigation | Separate /edit/[id] route |
| 5.2.4 | Freeze is confirmation, not page | Tap freeze → modal appears, no navigation | Separate freeze confirmation page |

### 5.3 One Job Per Screen

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 5.3.1 | Participant screen job: "See what you're bringing" | Verify screen shows only assignments + context | Settings mixed into same view |
| 5.3.2 | Coordinator screen job: "See your team's items" | Verify screen shows only team items + actions | Other teams visible |
| 5.3.3 | Host overview job: "See if we're ready" | Verify screen shows only team statuses + freeze | Item-level detail on overview |
| 5.3.4 | Host drill-down job: "See one team's details" | Verify screen shows only one team's items | Multiple teams on drill-down |

---

## Section 6: Information Hierarchy (Theme 6)

### 6.1 First Glance Answers Primary Question

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 6.1.1 | Participant first sees: item name | Load participant view → item name is largest/first element | Event name more prominent than item |
| 6.1.2 | Coordinator first sees: team status | Load coordinator view → status banner at top | Item list starts immediately |
| 6.1.3 | Host first sees: freeze readiness | Load host view → "Ready to freeze" or gap count at top | Team list starts immediately |

### 6.2 Clusters Stay Together

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 6.2.1 | Participant commitment cluster is unified | Check item card → name, quantity, time, location together | Time on different section than location |
| 6.2.2 | Coordinator item cluster is unified | Check item row → name, status, assignee visible together | Must scroll within row |
| 6.2.3 | Host team cluster is unified | Check team row → name, status, coordinator together | Coordinator name in different area |

### 6.3 Problems Surface First

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 6.3.1 | Unassigned items sort before assigned | Check coordinator view → unassigned at top | Alphabetical sort regardless of status |
| 6.3.2 | Critical gaps sort before non-critical | Check coordinator view → critical unassigned first | All unassigned mixed together |
| 6.3.3 | Teams with gaps sort before sorted teams | Check host view → CRITICAL_GAP, then GAP, then SORTED | Alphabetical team sort |

---

## Section 7: Effort and Friction (Theme 7)

### 7.1 Tap Counts

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 7.1.1 | Participant acknowledge: 1 tap | Count taps to confirm → exactly 1 | Confirmation dialog adds second tap |
| 7.1.2 | Coordinator assign: 2 taps | Count taps to assign → tap item, tap person | Three-step wizard |
| 7.1.3 | Host freeze: 2 taps | Count taps to freeze → tap freeze, tap confirm | Additional "are you sure?" |

### 7.2 Typing Minimized

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 7.2.1 | Participant never types | Audit participant actions → no text input | Comment field on acknowledgment |
| 7.2.2 | Drop-off is tap-selectable | Check add item form → drop-off is selector, not text | Free text field for drop-off |
| 7.2.3 | Quantity has presets | Check add item form → quantity presets available | Text-only quantity entry |
| 7.2.4 | Guest count uses stepper | Check host edit → stepper +/- available | Keyboard-only number entry |

### 7.3 Defaults Reduce Decisions

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 7.3.1 | Critical defaults to off | Add item without touching critical → unchecked | Critical defaults to checked |
| 7.3.2 | Day defaults to main event day | Add item without selecting day → Christmas Day selected | Required day selection |
| 7.3.3 | Drop-off defaults to standard slot | Add item without selecting drop-off → default slot selected | Required drop-off selection |

---

## Section 8: Social Safety (Theme 8)

### 8.1 No Behavioral Visibility

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 8.1.1 | No confirmation timestamps | Search codebase for acknowledgment time display | "Confirmed Dec 20 at 3pm" |
| 8.1.2 | No confirmation visible to coordinator | Check coordinator view → no confirmation indicators | "Kate ✓" badge |
| 8.1.3 | No confirmation visible to host | Check host view → no confirmation indicators | "8/10 confirmed" progress |
| 8.1.4 | No edit/change history visible | Check all views → no history UI | "Last edited by Kate" |

### 8.2 No Surveillance Affordances

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 8.2.1 | No audit log in UI | Search for audit log routes/components → none exist | "Activity" or "History" link |
| 8.2.2 | No "who changed what" visibility | Audit all views → no change attribution | "Reassigned by Kate" |
| 8.2.3 | No comparison data between teams | Check host view → no per-team metrics beyond status | "Mains: 90% confirmed" |

### 8.3 Acknowledgment Is Private

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 8.3.1 | Only participant sees their own ack state | Log in as participant → see confirmed state on their items | Anyone else can see participant's ack |
| 8.3.2 | Coordinator cannot see ack state | Log in as coordinator → no confirmation visibility | Coordinator sees who confirmed |
| 8.3.3 | Host cannot see ack state | Log in as host → no confirmation visibility | Host sees confirmation progress |

---

## Section 9: Mobile Fitness (Theme 9)

### 9.1 Tap Target Sizes

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 9.1.1 | All buttons minimum 56px height | Measure all buttons → all ≥ 56px | 40px height buttons |
| 9.1.2 | All item rows minimum 56px height | Measure all rows → all ≥ 56px | Cramped 44px rows |
| 9.1.3 | All selectable elements minimum 56px | Measure person rows, chips, etc. → all ≥ 56px | Small radio buttons |

### 9.2 Thumb Reachability

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 9.2.1 | Acknowledge button in thumb zone | Check button position → bottom of card | Button at top of screen |
| 9.2.2 | Add item button in thumb zone | Check button position → fixed bottom bar | Floating button top-right |
| 9.2.3 | Freeze button in thumb zone | Check button position → fixed bottom bar | Button in header |
| 9.2.4 | Assignment drawer from bottom | Trigger assignment → drawer slides from bottom | Modal appears centered |

### 9.3 Above-Fold Essentials

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 9.3.1 | Single participant item fits without scroll | Check 375px viewport → full item visible | Must scroll to see acknowledge button |
| 9.3.2 | Coordinator status + 3 items visible | Check 375px viewport → status + top items visible | Must scroll to see status |
| 9.3.3 | Host status + 4 teams visible | Check 375px viewport → status + top teams visible | Must scroll to see freeze readiness |

### 9.4 Interruption Recovery

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 9.4.1 | Participant can resume without confusion | Background app, return → same view, no confusion | Returns to splash screen |
| 9.4.2 | Coordinator drawer dismisses gracefully | Background during assignment → drawer closes | App crashes or corrupts state |
| 9.4.3 | Host returns to overview | Background during drill-down → returns to overview or drill-down | Returns to blank screen |
| 9.4.4 | Forms don't preserve complex state | Background during add item → form may reset | Corrupted partial form |

---

## Section 10: Disappearance (Theme 10)

### 10.1 No Memorable Friction

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 10.1.1 | No onboarding flow | First visit → immediately see content | "Let's get you set up" wizard |
| 10.1.2 | No feature explanations | Audit UI → no tooltips explaining features | "Tap here to confirm" tooltip |
| 10.1.3 | No branding prominence | Check UI → app name not emphasized | Large logo on every screen |
| 10.1.4 | No delight moments | Audit interactions → no celebration animations | Confetti on confirmation |

### 10.2 No System Chatter

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 10.2.1 | No notifications | Check notification implementation → none exists | "Don't forget to confirm!" push |
| 10.2.2 | No email reminders | Check email implementation → none exists | "You haven't confirmed yet" email |
| 10.2.3 | No in-app messages | Audit UI → no message center | "Welcome back!" banner |

### 10.3 Return Requires No Relearning

| # | Requirement | Test | Violation Example |
|---|-------------|------|-------------------|
| 10.3.1 | Same link works on return | Save link, revisit after time → same view works | "Your session expired" |
| 10.3.2 | Interface is immediately recognizable | Return visit → no learning required | Changed layout between visits |
| 10.3.3 | No "what's new" interruptions | Return visit → straight to content | "Check out our new features!" |

---

## Pre-Launch Verification

### Final Checklist

Before any release, verify all sections pass:

- [ ] Section 1: Emotional Contract (6 items)
- [ ] Section 2: Question Purity (7 items)
- [ ] Section 3: Role-Bounded Visibility (10 items)
- [ ] Section 4: Sufficiency Without Excess (10 items)
- [ ] Section 5: Screen Structure (10 items)
- [ ] Section 6: Information Hierarchy (9 items)
- [ ] Section 7: Effort and Friction (10 items)
- [ ] Section 8: Social Safety (9 items)
- [ ] Section 9: Mobile Fitness (13 items)
- [ ] Section 10: Disappearance (9 items)

**Total: 93 verification items**

### Regression Testing

For any change, re-verify:
1. Affected section(s) completely
2. Section 3 (Role-Bounded Visibility) — changes easily leak across roles
3. Section 8 (Social Safety) — behavioral data easily surfaces accidentally
4. Section 9.1-9.2 (Tap Targets and Thumb Zones) — layout changes often break these

---

## Violation Response

### Severity Levels

| Level | Definition | Response |
|-------|------------|----------|
| Critical | Violates Theme 3, 8 (visibility/surveillance) | Block release. Fix immediately. |
| High | Violates Theme 1, 2, 7 (emotion/questions/effort) | Fix before release. |
| Medium | Violates Theme 4, 5, 6 (structure/hierarchy) | Fix in current sprint. |
| Low | Violates Theme 9, 10 (mobile/disappearance polish) | Fix in next sprint. |

### Escalation

If a violation cannot be fixed without significant rework:
1. Document the specific violation
2. Assess user impact
3. If Theme 3 or 8, do not ship
4. If other themes, make explicit decision with documented tradeoff

---

## Checklist Maintenance

This checklist should be updated when:
- Protocol is amended
- New features are added (add verification items)
- Violations reveal gaps (add missing checks)
- False positives occur (clarify requirements)

Last updated: [Date]
Protocol version: 1.0
