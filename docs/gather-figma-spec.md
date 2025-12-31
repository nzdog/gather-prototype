# Gather UI — Figma Specification

## Governing Laws

Every design decision in this document is constrained by ten laws established through protocol. These are not preferences — they are structural requirements. Any element that violates a law must be rejected.

| # | Law | Test |
|---|-----|------|
| 1 | **Emotional Contract** | Does this produce recognition and release, not vigilance? |
| 2 | **Question Purity** | Does this answer a responsibility question, not a who/when/behavior question? |
| 3 | **Non-Social Visibility** | Can this role act on this information without becoming social? |
| 4 | **Sufficiency Is Falsifiable** | If removed, what question goes unanswered? If none, remove it. |
| 5 | **Jobs Earn Screens** | Is this a new job (screen) or response to existing job (surface)? |
| 6 | **Question-First Hierarchy** | Does the first glance answer the question alive at entry? |
| 7 | **Effort Matches Consequence** | Is effort proportional? Is speed acceptable given undo cost? |
| 8 | **No Judgment Without Repair** | Does this enable judgment without enabling repair? If yes, disallow. |
| 9 | **Mobile Is Truth** | Does this work one-handed, distracted, and interruptible? |
| 10 | **Disappearance** | Will users remember this, or only their task? |

---

## System Overview

### Total Screens: 4

| Screen | Role | Primary Job |
|--------|------|-------------|
| Assignments | Participant | "See what you're bringing" |
| Team Overview | Coordinator | "See your team's items" |
| Event Overview | Host | "See if we're ready" |
| Team Drill-down | Host | "See one team's details" |

### Contextual Surfaces (Not Screens)

| Surface | Appears On | Trigger |
|---------|------------|---------|
| Assignment Drawer | Coordinator | Tap item row |
| Add Item Form | Coordinator | Tap add button |
| Edit Item Form | Coordinator | Tap edit icon on item |
| Freeze Confirmation | Host | Tap freeze button |
| Guest Count Edit | Host | Tap guest count |

---

## Global Design Tokens

### Spacing

```
--space-xs: 4px
--space-sm: 8px
--space-md: 16px
--space-lg: 24px
--space-xl: 32px
```

### Typography

```
--text-headline: 24px / 700 weight
--text-title: 18px / 600 weight
--text-body: 16px / 400 weight
--text-caption: 14px / 400 weight
--text-small: 12px / 400 weight
```

### Colors

```
--color-surface: #FFFFFF
--color-background: #F5F5F5
--color-text-primary: #1A1A1A
--color-text-secondary: #666666
--color-text-tertiary: #999999

--color-status-sorted: #22C55E (green)
--color-status-gap: #F59E0B (amber)
--color-status-critical: #EF4444 (red)

--color-action-primary: #2563EB (blue)
--color-action-primary-text: #FFFFFF
--color-action-secondary: transparent
--color-action-secondary-text: #2563EB
```

### Interactive Elements

```
Minimum tap target: 56px height
Button border-radius: 8px
Card border-radius: 12px
Drawer border-radius: 16px 16px 0 0
```

---

## Screen 1: Participant — Assignments

### Purpose
Show the participant exactly what they're bringing, with all details needed to deliver it, and provide a single acknowledgment action.

### Layout Structure

```
┌─────────────────────────────────────┐
│ HEADER (fixed)                      │
│ Event name · Event dates            │
│ 27 guests                           │
├─────────────────────────────────────┤
│ CONTENT (scrollable)                │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ITEM CARD                       │ │
│ │                                 │ │
│ │ Pavlova                    ×2   │ │
│ │                                 │ │
│ │ 📅 Christmas Day, 12:00pm       │ │
│ │ 📍 Marquee                      │ │
│ │                                 │ │
│ │ [Notes if present]              │ │
│ │                                 │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │     I've got this ✓         │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Additional item cards if any]      │
│                                     │
├─────────────────────────────────────┤
│ FOOTER (fixed)                      │
│ Questions? Contact [Coordinator]    │
└─────────────────────────────────────┘
```

### Header

| Element | Spec |
|---------|------|
| Event name | --text-title, --color-text-primary |
| Event dates | --text-caption, --color-text-secondary, same line as name with · separator |
| Guest count | --text-body, --color-text-primary, "27 guests" |
| Height | 80px |
| Background | --color-surface |
| Bottom border | 1px solid #E5E5E5 |

### Item Card

| Element | Spec |
|---------|------|
| Container | --color-surface, --space-lg padding, 12px border-radius, subtle shadow |
| Item name | --text-headline, --color-text-primary |
| Quantity | --text-title, --color-text-secondary, right-aligned on same line as name |
| Drop-off date/time | --text-body, --color-text-primary, calendar icon prefix |
| Drop-off location | --text-body, --color-text-primary, pin icon prefix |
| Drop-off note | --text-caption, --color-text-secondary, only if present |
| Item notes | --text-body, --color-text-secondary, only if present |
| Card margin | --space-md between cards |

### Acknowledge Button

| State | Spec |
|-------|------|
| Unconfirmed | Full width, 56px height, --color-action-primary background, white text, "I've got this" |
| Confirmed | Full width, 56px height, --color-status-sorted background, white text, "Confirmed ✓", disabled state |
| Position | Bottom of item card, inside card container |

### Footer

| Element | Spec |
|---------|------|
| Height | 60px |
| Background | --color-surface |
| Top border | 1px solid #E5E5E5 |
| Text | --text-caption, --color-text-secondary, centered |
| Coordinator name | --color-action-primary, tappable to reveal contact |

### Responsive Behavior

- Single column, full width
- Cards stack vertically
- Header and footer fixed
- Content scrolls between
- On very small screens, item name can wrap to second line

### States

**Empty state:** Should never occur — participants only receive links if they have assignments.

**Single item:** Card displays centered vertically if space allows.

**Multiple items:** Cards stack, each with own acknowledge button.

---

## Screen 2: Coordinator — Team Overview

### Purpose
Show the coordinator their team's items, highlight gaps, enable assignment actions.

### Layout Structure

```
┌─────────────────────────────────────┐
│ HEADER (fixed)                      │
│ Team Name                           │
│ CONFIRMING · 27 guests              │
├─────────────────────────────────────┤
│ STATUS BAR                          │
│ ● 2 items need assignment           │
│ [or] ✓ All items assigned           │
├─────────────────────────────────────┤
│ CONTENT (scrollable)                │
│                                     │
│ [Unassigned items first]            │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⚠ Ham                      ×1   │ │
│ │ Christmas Day · Marquee         │ │
│ │ Unassigned                      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Pavlova                    ×2   │ │
│ │ Christmas Day · Marquee         │ │
│ │ Kate                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Additional items...]               │
│                                     │
├─────────────────────────────────────┤
│ BOTTOM BAR (fixed)                  │
│ [+ Add Item]                        │
└─────────────────────────────────────┘
```

### Header

| Element | Spec |
|---------|------|
| Team name | --text-headline, --color-text-primary |
| Event status | --text-caption, --color-text-secondary, "CONFIRMING" or "FROZEN" badge |
| Guest count | --text-caption, --color-text-secondary, "27 guests" |
| Height | 80px |
| Background | --color-surface |

### Status Bar

| State | Spec |
|-------|------|
| Has gaps | --color-status-gap background (light), amber icon, "[n] items need assignment" |
| Has critical gaps | --color-status-critical background (light), red icon, "[n] critical items need assignment" |
| All assigned | --color-status-sorted background (light), green checkmark, "All items assigned" |
| Height | 48px |
| Text | --text-body |

### Item Row

| Element | Spec |
|---------|------|
| Container | --color-surface, 56px minimum height, full width tap target |
| Critical indicator | ⚠ icon, --color-status-critical, only on critical items |
| Item name | --text-body, --color-text-primary, 600 weight |
| Quantity | --text-body, --color-text-secondary, right side of name line |
| Drop-off summary | --text-caption, --color-text-secondary, "Christmas Day · Marquee" |
| Assignee (if assigned) | --text-body, --color-text-primary |
| Unassigned state | --text-body, --color-status-gap, "Unassigned" |
| Row padding | --space-md horizontal, --space-sm vertical |
| Divider | 1px solid #E5E5E5 between rows |

### Sort Order

1. Unassigned critical items (--color-status-critical left border)
2. Unassigned non-critical items (--color-status-gap left border)
3. Assigned items (no left border)

Within each group, sort by day, then alphabetically.

### Bottom Bar

| Element | Spec |
|---------|------|
| Height | 72px (includes safe area padding) |
| Background | --color-surface |
| Top border | 1px solid #E5E5E5 |
| Add button | Secondary style, left-aligned, "+ Add Item" |

### Item Row Tap → Assignment Drawer

When coordinator taps an item row, the Assignment Drawer appears.

---

## Surface: Assignment Drawer

### Purpose
Allow coordinator to assign or reassign an item to a team member.

### Layout Structure

```
┌─────────────────────────────────────┐
│ ─────── (drag indicator)            │
│                                     │
│ Assign: Pavlova                     │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Kate                            │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Sarah                           │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Mike                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [If already assigned:]              │
│ ┌─────────────────────────────────┐ │
│ │ Remove Assignment               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ (safe area)                         │
└─────────────────────────────────────┘
```

### Specs

| Element | Spec |
|---------|------|
| Drawer | Slides from bottom, 16px top radius, --color-surface |
| Drag indicator | 40px wide, 4px tall, centered, --color-text-tertiary |
| Title | --text-title, "Assign: [Item name]" |
| Person row | 56px height, full width, --text-body |
| Current assignee | Highlighted with checkmark, --color-action-primary text |
| Remove button | Only if currently assigned, --color-status-critical text, "Remove Assignment" |
| Backdrop | 50% black overlay on screen behind |

### Behavior

- Tap person → assigns immediately (2-tap flow)
- Tap current assignee → no change
- Tap "Remove Assignment" → unassigns, closes drawer
- Tap backdrop → closes drawer without action
- Swipe down → closes drawer without action

---

## Surface: Add Item Form

### Purpose
Allow coordinator to add a new item to their team.

### Layout Structure

```
┌─────────────────────────────────────┐
│ ─────── (drag indicator)            │
│                                     │
│ Add Item                            │
│                                     │
│ Item name *                         │
│ ┌─────────────────────────────────┐ │
│ │ [text input]                    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Quantity                            │
│ [Serves 10] [Serves 20] [Custom]    │
│                                     │
│ Day                                 │
│ [Christmas Eve] [Christmas Day] ... │
│                                     │
│ Drop-off                            │
│ [5:30pm Kate's] [12pm Marquee] ...  │
│                                     │
│ ☐ Critical item                     │
│                                     │
│ Notes (optional)                    │
│ ┌─────────────────────────────────┐ │
│ │ [text input]                    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │         Add Item                │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Specs

| Element | Spec |
|---------|------|
| Title | --text-title, "Add Item" |
| Required field | Label with asterisk |
| Text input | 48px height, 8px border-radius, 1px border |
| Chip selector | Horizontal scroll, 40px height chips, 8px radius |
| Checkbox | 24px, --color-action-primary when checked |
| Submit button | Primary style, full width, 56px, disabled until name entered |

### Defaults

- Quantity: None selected (optional field)
- Day: Main event day (Christmas Day)
- Drop-off: Default slot for selected day
- Critical: Unchecked

### Behavior

- Only item name is required
- Form submits on button tap
- Success closes drawer, shows item in list
- Form clears on close (no draft persistence)

---

## Screen 3: Host — Event Overview

### Purpose
Show the host whether the event is ready to freeze and which teams need attention.

### Layout Structure

```
┌─────────────────────────────────────┐
│ HEADER (fixed)                      │
│ Richardson Family Christmas         │
│ Dec 24-26 · 27 guests [edit]        │
├─────────────────────────────────────┤
│ STATUS BANNER                       │
│ ⚠ 3 critical gaps remain            │
│ [or] ✓ Ready to freeze              │
├─────────────────────────────────────┤
│ CONTENT (scrollable)                │
│                                     │
│ Teams                               │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔴 Puddings                     │ │
│ │ Ian · 4 critical gaps           │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🟡 Later Food                   │ │
│ │ Nigel · 1 gap                   │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🟢 Mains – Proteins             │ │
│ │ Kate · All assigned             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Additional teams...]               │
│                                     │
├─────────────────────────────────────┤
│ BOTTOM BAR (fixed)                  │
│ [Freeze Event] (disabled if gaps)   │
└─────────────────────────────────────┘
```

### Header

| Element | Spec |
|---------|------|
| Event name | --text-headline, --color-text-primary |
| Date range | --text-caption, --color-text-secondary |
| Guest count | --text-caption, --color-text-secondary, with [edit] affordance |
| Height | 80px |

### Status Banner

| State | Spec |
|-------|------|
| Has critical gaps | --color-status-critical background (light), "⚠ [n] critical gaps remain" |
| Has non-critical gaps only | --color-status-gap background (light), "Ready to freeze ([n] non-critical gaps)" |
| All assigned | --color-status-sorted background (light), "✓ Ready to freeze" |
| Event frozen | --color-action-primary background (light), "🔒 Event is frozen" |
| Height | 56px |
| Text | --text-body, 600 weight |

### Team Row

| Element | Spec |
|---------|------|
| Container | --color-surface, 72px height, full width tap target |
| Status dot | 12px circle, left side, color by status |
| Team name | --text-body, 600 weight, --color-text-primary |
| Coordinator name | --text-caption, --color-text-secondary |
| Status text | --text-caption, right side, color by status |
| Chevron | Right edge, indicates drillable |

### Status Colors

| Status | Dot | Text |
|--------|-----|------|
| CRITICAL_GAP | --color-status-critical | "[n] critical gaps" |
| GAP | --color-status-gap | "[n] gaps" |
| SORTED | --color-status-sorted | "All assigned" |

### Sort Order

1. Teams with CRITICAL_GAP
2. Teams with GAP
3. Teams SORTED

Within each group, alphabetical.

### Bottom Bar

| Element | Spec |
|---------|------|
| Height | 72px |
| Freeze button | Primary style, centered, "Freeze Event" |
| Disabled state | If critical gaps exist, button is disabled with reduced opacity |
| Frozen state | Button changes to "Unfreeze Event", secondary style |

### Team Row Tap → Team Drill-down

---

## Screen 4: Host — Team Drill-down

### Purpose
Show the host all items in a specific team to diagnose gaps.

### Layout Structure

```
┌─────────────────────────────────────┐
│ HEADER (fixed)                      │
│ ← Puddings                          │
│ Coordinator: Ian                    │
├─────────────────────────────────────┤
│ STATUS BAR                          │
│ ⚠ 4 critical items unassigned       │
├─────────────────────────────────────┤
│ CONTENT (scrollable)                │
│                                     │
│ [Items sorted: unassigned first]    │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⚠ Christmas Pudding        ×1   │ │
│ │ Christmas Day · Marquee         │ │
│ │ Unassigned                      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Pavlova                    ×2   │ │
│ │ Christmas Day · Marquee         │ │
│ │ Kate                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Additional items...]               │
│                                     │
└─────────────────────────────────────┘
```

### Header

| Element | Spec |
|---------|------|
| Back button | ← arrow, left aligned, tappable |
| Team name | --text-title, --color-text-primary |
| Coordinator | --text-caption, --color-text-secondary, "Coordinator: [Name]" |
| Height | 80px |

### Status Bar

Same as Coordinator Team Overview status bar.

### Item Row

Same spec as Coordinator item row, but:
- **Read-only** — no tap action
- **No edit affordances** — host sees state, doesn't modify

### Sort Order

Same as Coordinator: unassigned critical first, then unassigned, then assigned.

### Navigation

- Back button returns to Event Overview
- Swipe right returns to Event Overview (iOS)
- System back returns to Event Overview (Android)

---

## Surface: Freeze Confirmation

### Purpose
Confirm the host's intent to freeze (or unfreeze) the event.

### Layout

```
┌─────────────────────────────────────┐
│                                     │
│         Freeze Event?               │
│                                     │
│   This will lock all assignments.   │
│   Coordinators won't be able to     │
│   make changes.                     │
│                                     │
│   ┌───────────┐  ┌───────────────┐  │
│   │  Cancel   │  │    Freeze     │  │
│   └───────────┘  └───────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### Specs

| Element | Spec |
|---------|------|
| Container | Centered modal, 16px radius, --color-surface |
| Title | --text-title, centered |
| Body | --text-body, --color-text-secondary, centered |
| Cancel button | Secondary style, 50% width |
| Confirm button | Primary style, 50% width |
| Backdrop | 50% black, tap to cancel |

### Unfreeze Variant

Title: "Unfreeze Event?"
Body: "This will unlock assignments. Coordinators will be able to make changes again."
Confirm: "Unfreeze"

---

## Surface: Guest Count Edit

### Purpose
Allow host to update the guest count.

### Layout

```
┌─────────────────────────────────────┐
│                                     │
│         Guest Count                 │
│                                     │
│      [ - ]     27     [ + ]         │
│                                     │
│          ┌───────────┐              │
│          │   Done    │              │
│          └───────────┘              │
│                                     │
└─────────────────────────────────────┘
```

### Specs

| Element | Spec |
|---------|------|
| Container | Centered modal or bottom drawer |
| Title | --text-title, centered |
| Stepper | 56px height buttons, large tappable +/- |
| Count | --text-headline, centered between steppers |
| Done button | Primary style, closes modal |

### Behavior

- Each +/- tap immediately updates the count
- Done closes the modal
- Tap outside closes the modal
- No cancel needed — changes are instant but trivial to adjust

---

## Interaction Specifications

### Tap Targets

All interactive elements: **minimum 56px height**

This applies to:
- Item rows
- Team rows
- Buttons
- Person rows in assignment drawer
- Stepper buttons

### Thumb Zones

Primary actions are placed in the **bottom third** of the screen:
- Acknowledge button (bottom of item card)
- Add Item button (bottom bar)
- Freeze button (bottom bar)
- Assignment drawer (slides from bottom)

### Loading States

| Screen | Loading |
|--------|---------|
| Participant | Full-screen skeleton with card shape |
| Coordinator | Skeleton item rows |
| Host Overview | Skeleton team rows |
| Host Drill-down | Skeleton item rows |

Keep skeletons structural, not decorative. No spinners — they create waiting anxiety.

### Error States

| Error | Display |
|-------|---------|
| Network failure | Inline banner at top, "Couldn't load. Tap to retry." |
| Action failure | Toast at bottom, "Couldn't save. Try again." |
| Token invalid | Full screen, "This link has expired." |

Errors are informational, not alarmist. No red alerts. No exclamation marks.

### Empty States

| Screen | Empty State |
|--------|-------------|
| Participant | Should never occur |
| Coordinator (no items) | "No items yet. Add your first item." with prominent Add button |
| Host (no teams) | Should never occur in seeded data |

---

## Animation Specifications

### Principles

- Animations confirm action, never decorate
- Duration: 200ms for most transitions
- Easing: ease-out for entrances, ease-in for exits
- No bounces, no overshoots, no playfulness

### Specific Animations

| Element | Animation |
|---------|-----------|
| Drawer open | Slide up from bottom, 200ms, ease-out |
| Drawer close | Slide down, 150ms, ease-in |
| Modal open | Fade in + scale from 95%, 200ms |
| Modal close | Fade out, 150ms |
| Acknowledge button | Background color transition, 200ms |
| List reorder (on assignment) | Items slide to new position, 200ms |

### Prohibited

- Skeleton shimmer effects
- Confetti or celebration animations
- Pull-to-refresh rubber banding
- Page transitions (screens load instantly or show skeleton)

---

## Typography Scale

### Applied Hierarchy

| Role | Element | Style |
|------|---------|-------|
| Participant | Item name | --text-headline (24px/700) |
| Participant | Drop-off details | --text-body (16px/400) |
| Participant | Event context | --text-caption (14px/400) |
| Coordinator | Item name in row | --text-body (16px/600) |
| Coordinator | Assignee | --text-body (16px/400) |
| Coordinator | Status | --text-body (16px/600) |
| Host | Team name | --text-body (16px/600) |
| Host | Coordinator name | --text-caption (14px/400) |
| Host | Status banner | --text-body (16px/600) |

---

## Color Usage

### Status Communication

Status is communicated through color consistently across all views:

| Status | Color | Used On |
|--------|-------|---------|
| Critical gap | --color-status-critical | Dots, badges, left borders, text |
| Gap | --color-status-gap | Dots, badges, left borders, text |
| Sorted | --color-status-sorted | Dots, badges, text |

### Backgrounds

- Light tints of status colors for banners (10% opacity)
- Never use status colors as full backgrounds
- Primary surfaces are white or near-white

### Text

- Primary content: --color-text-primary
- Supporting content: --color-text-secondary
- Disabled/tertiary: --color-text-tertiary
- Never use color alone to convey meaning (always pair with icon or text)

---

## Accessibility Requirements

### Contrast

- All text meets WCAG AA (4.5:1 for body, 3:1 for large)
- Interactive elements have visible focus states
- Status colors are distinguishable for colorblind users (dots + text labels)

### Touch

- 56px minimum touch targets
- 8px minimum spacing between targets
- No hover-dependent interactions

### Screen Readers

- All interactive elements have accessible labels
- Status is announced (not just color)
- Drawer and modal focus is trapped appropriately

---

## Responsive Breakpoints

### Mobile (Primary): 320px - 428px

All specifications above are for mobile. This is the design target.

### Tablet: 429px - 1024px

- Same layouts, wider cards with max-width
- Item cards: max-width 600px, centered
- Team rows: max-width 800px, centered
- Increased horizontal padding

### Desktop: 1025px+

- Centered content container, max-width 800px
- Optional: side-by-side layout for Host (teams left, drill-down right)
- Otherwise identical to tablet

**Note:** Desktop is acceptable, not optimized. Mobile is the truth case.

---

## Component Checklist

### Required Components

- [ ] Header (3 variants: Participant, Coordinator, Host)
- [ ] Item Card (Participant)
- [ ] Item Row (Coordinator/Host)
- [ ] Team Row (Host)
- [ ] Status Banner
- [ ] Status Dot
- [ ] Button (Primary, Secondary, Disabled)
- [ ] Bottom Bar
- [ ] Drawer Container
- [ ] Modal Container
- [ ] Person Row (Assignment drawer)
- [ ] Text Input
- [ ] Chip Selector
- [ ] Checkbox
- [ ] Stepper
- [ ] Back Button

### Prohibited Components

- Dashboards
- Data tables
- Progress bars
- Activity feeds
- Notification badges
- Avatars
- Timestamps
- Leaderboards
- Charts

---

## File Deliverables

### Figma Structure

```
📁 Gather UI
├── 📄 Cover
├── 📁 Foundations
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   └── Icons
├── 📁 Components
│   ├── Buttons
│   ├── Inputs
│   ├── Cards
│   ├── Rows
│   ├── Headers
│   ├── Banners
│   └── Modals
├── 📁 Screens
│   ├── Participant
│   ├── Coordinator
│   └── Host
└── 📁 Prototypes
    ├── Participant Flow
    ├── Coordinator Flow
    └── Host Flow
```

---

## Design Review Checklist

Before any screen is approved, verify:

- [ ] First glance answers the role's primary question
- [ ] All tap targets are 56px minimum
- [ ] Primary action is in thumb zone
- [ ] No information requires scrolling that should be above fold
- [ ] No timestamps visible anywhere
- [ ] No other-user behavior visible
- [ ] No decorative elements
- [ ] Status uses color + text (not color alone)
- [ ] Works on 320px width screen
- [ ] Forms are minimal (loss on interruption is trivial)
- [ ] Animation is confirmation, not decoration

If any check fails, the design violates protocol and must be revised.
