 Project Overview

  Gather is a coordination app for multi-day gatherings (Christmas, reunions, retreats) that ensures everyone knows what they're responsible for without anyone holding the whole plan in their head. It's built with Next.js 14, Prisma/SQLite, and uses token-based magic link authentication.

  ---
  Core Foundation (Phases 1-6)

  Phase 1-2: Foundation & AI Integration

  - Event creation wizard with 3-step flow (basics, guests/dietary, venue/kitchen)
  - AI-powered plan generation with conflict detection
  - 4 conflict types: timing conflicts, dietary gaps, coverage gaps, placeholder quantities
  - Suggestions API with accept/dismiss functionality
  - Plan regeneration with user modifiers (e.g., "More vegetarian options")

  Phase 3: Conflict Management System

  - Full CRUD for conflicts with severity levels (Critical, Significant, Advisory)
  - Acknowledgement flow requiring 10-char minimum impact statements
  - Delegation to coordinators
  - Dismissal reset logic that reopens conflicts when inputs change
  - Conflict fingerprinting and affected party tracking

  Phase 4: Gate & Transition System

  - 5 blocking codes preventing premature transitions
  - Placeholder quantity workflow for critical items
  - "Enter Quantity" or "Defer to Coordinator" options
  - Gate check validation before DRAFT→CONFIRMING transition
  - PlanSnapshot creation preserving event state

  Phase 5-6: Templates & Refinement

  - Complete item data model (quantities, dietary tags, timing, criticality)
  - Revision system with manual creation and auto-revision before regeneration
  - Restore functionality to roll back to previous states
  - 91/91 tests passing across all phases

  ---
  Key Features Implemented

  Workflow State Machine

  - DRAFT → CONFIRMING → FROZEN → COMPLETE
  - EventStageProgress breadcrumb with visual indicators
  - Status-based UI visibility controls
  - Freeze/unfreeze with audit logging

  Role-Based Access (Token Authentication)

  - Host: Full oversight, team management, freeze controls
  - Coordinator: Team-specific item management, assignment tracking
  - Participant: View assignments, accept/decline items
  - Magic link system with TokenScope validation
  - Automatic token generation for all roles

  People & Team Management

  - Add/edit people with roles (HOST, COORDINATOR, PARTICIPANT)
  - CSV bulk import with column mapping and validation
  - Smart duplicate detection by email and name+phone
  - Table/Board view toggle with drag-and-drop people movement
  - Unassigned people support (nullable teamId)
  - Auto-assign with workload balancing algorithm

  Item Management

  - Full item CRUD with quantities, dietary tags, timing, location
  - Item source tracking (GENERATED, MANUAL, HOST_EDITED, TEMPLATE)
  - Batch ID tracking for AI generations
  - Assignment/unassignment with confirmation status
  - Quick-assign dropdown in team expanded view
  - Item status badges (Assigned/Unassigned, Confirmed/Not confirmed)

  Assignment & Confirmation Flow

  - Participant accept/decline system (replaced simple acknowledgement)
  - AssignmentResponse enum: PENDING/ACCEPTED/DECLINED
  - Real-time host dashboard with 3 counters (Pending, Accepted, Declined)
  - Auto-refresh every 5 seconds on host views
  - Declined items treated as gaps in coverage

  Coverage & Gate Checks

  - FreezeCheck component with coverage indicator
  - All items must be assigned before CONFIRMING→FROZEN
  - Critical gap counting and validation
  - Unassigned count badges on teams and items
  - Gate check prevents progression until requirements met

  AI Features

  - Item source tracking with generatedBatchId
  - Selective regeneration preserving host customizations (Rule A)
  - AI informed of preserved items during regeneration
  - Automatic conflict detection on "Check Plan"
  - Enhanced logging showing preservation breakdown

  UI/UX Improvements

  - Full-screen section expansion for all 8 major sections
  - Modal conflict prevention with ModalContext
  - URL state management (?expand=sectionId)
  - Team member count display on all cards
  - Clickable person names opening edit modals
  - Keyboard shortcuts (Cmd/Ctrl+Enter) for quick entry
  - Collapse/expand all toggle across all views
  - Responsive design with mobile fallbacks

  Developer Experience

  - GitHub Actions CI with typecheck, format, build, audit
  - ESLint + Prettier configuration
  - TypeScript strict mode with unused variable checking
  - Comprehensive test scripts for all phases
  - Seed script with incremental mode
  - PostgreSQL support for Railway deployment
  - Demo page with reset functionality

  ---
  Recent Additions (Last 10 Commits)

  1. Full-screen section expansion with modal blocking and URL state
  2. Clickable person names in board view for quick editing
  3. CSV import storing "Last, First" format for sortability
  4. CSV bulk import with 3-step wizard, validation, and duplicate detection
  5. View as Host opens in new tab with expanded cards
  6. Regenerate Plan button visibility in CONFIRMING status
  7. Auto-assign people with workload balancing algorithm
  8. Item status badges across all views
  9. Team Board drag & drop for people management
  10. Demo script with 40+ verification checkboxes

  ---
  Current State

  - Working prototype following spec v1.3.3
  - Real data: Richardson Family Christmas 2025 with 54 items across 8 teams
  - Full workflow from event creation → plan generation → assignments → confirmation → freeze
  - Production ready with Railway deployment configuration
  - Token persistence across reset operations

  This represents a comprehensive event coordination system built iteratively over 90+ commits, with careful attention to workflow gates, role separation, AI integration, and user experience refinement.

