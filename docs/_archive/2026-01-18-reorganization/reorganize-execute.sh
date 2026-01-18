#!/usr/bin/env bash
set -euo pipefail

# Gather Documentation Reorganization Script
# Date: 2026-01-18
# This script reorganizes the docs folder using git mv for safety

LOG_FILE="reorganization-log.txt"
ERROR_LOG="reorganization-errors.txt"

# Initialize logs
echo "=== GATHER DOCS REORGANIZATION ===" > "$LOG_FILE"
echo "Date: $(date)" >> "$LOG_FILE"
echo "Working directory: $(pwd)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Counters
MOVE_COUNT=0
ERROR_COUNT=0

echo "Starting reorganization..."
echo ""

# Function: Move file safely with git
safe_move() {
  local src="$1"
  local dst="$2"

  if [ ! -e "$src" ]; then
    echo "[SKIP] Source not found: $src"
    return 0
  fi

  if [ -e "$dst" ]; then
    if cmp -s "$src" "$dst" 2>/dev/null; then
      echo "[SKIP] Identical file exists: $dst"
      return 0
    else
      echo "[WARN] Collision detected: $dst"
      dst="${dst%.md}-conflict-$(date +%Y%m%d).md"
    fi
  fi

  git mv "$src" "$dst" 2>>"$ERROR_LOG" && {
    echo "[MOVED] $src → $dst"
    echo "[MOVED] $src → $dst" >> "$LOG_FILE"
    ((MOVE_COUNT++))
  } || {
    echo "[ERROR] Failed: $src → $dst"
    echo "[ERROR] Failed: $src → $dst" >> "$ERROR_LOG"
    ((ERROR_COUNT++))
  }
}

# Function: Create directory
safe_mkdir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir" && echo "[MKDIR] $dir" >> "$LOG_FILE"
  fi
}

echo "=== Phase 1: Creating directory structure ==="
safe_mkdir "00_overview"
safe_mkdir "01_product"
safe_mkdir "02_ux"
safe_mkdir "02_ux/research"
safe_mkdir "03_specs"
safe_mkdir "03_specs/_versions"
safe_mkdir "04_roadmap"
safe_mkdir "04_roadmap/tickets"
safe_mkdir "04_roadmap/tickets/phase-1"
safe_mkdir "04_roadmap/tickets/phase-2"
safe_mkdir "04_roadmap/tickets/mup-v1"
safe_mkdir "05_ops"
safe_mkdir "05_ops/testing"
safe_mkdir "07_meetings"
safe_mkdir "assets"
safe_mkdir "assets/code"
safe_mkdir "_inbox"
safe_mkdir "_archive"
safe_mkdir "_archive/2026-01-18-gatherfiles"
safe_mkdir "_archive/2026-01-18-mup-old"
safe_mkdir "_archive/legacy-formats"
safe_mkdir "_archive/debug-logs"

echo ""
echo "=== Phase 2: Moving files ==="

# Overview
safe_move "# Phase 1 Complete — Auth System.md" "04_roadmap/phase-1-complete.md"
safe_move "ONBOARDING_REPORT.md" "00_overview/onboarding-report.md"
safe_move "docs/gather/00_overview/Project Overview.md" "00_overview/project-overview.md"
safe_move "docs/gather/00_overview/Next Ten Steps (Theme 5)" "00_overview/next-ten-steps.md"

# Product
safe_move "Gather Scope Protocol.ini" "01_product/scope-protocol.ini"
safe_move "gather-monetisation-auth-architecture.docx" "01_product/monetisation-auth-architecture.docx"

# UX
safe_move "Gather UI Protocol.md" "02_ux/ui-protocol.md"
safe_move "gather-figma-spec.md" "02_ux/figma-spec.md"
safe_move "Gatherfiles/gather-design-research-brief.md" "02_ux/research/design-research-brief.md"
safe_move "Gatherfiles/gather-design-research-report.md" "02_ux/research/design-research-report.md"

# Specs
safe_move "gather-builder-spec-v1.3.3.md" "03_specs/builder-spec-v1.3.3.md"
safe_move "gather-implementation-plan-v1.3.3.md" "03_specs/implementation-plan-v1.3.3.md"
safe_move "gather-v1.3.2-to-v1.3.3.patch.md" "03_specs/_versions/v1.3.2-to-v1.3.3-patch.md"
safe_move "Gatherfiles/gather-builder-spec-v1.2.md" "03_specs/_versions/builder-spec-v1.2.md"
safe_move "Gatherfiles/gather-builder-spec-v1.3.md" "03_specs/_versions/builder-spec-v1.3.md"
safe_move "Gatherfiles/gather-builder-spec-v1.3.1.md" "03_specs/_versions/builder-spec-v1.3.1.md"
safe_move "Gatherfiles/gather-builder-spec-v1.3.2.md" "03_specs/_versions/builder-spec-v1.3.2.md"
safe_move "Gatherfiles/gather-implementation-plan-v1.3.2.md" "03_specs/_versions/implementation-plan-v1.3.2.md"

# Roadmap - Phase reports
safe_move "phase-4-completion-summary.md" "04_roadmap/phase-4-completion.md"
safe_move "phase-5-completion-report.md" "04_roadmap/phase-5-completion.md"
safe_move "phase-6-completion-report.md" "04_roadmap/phase-6-completion.md"
safe_move "PHASE-6-FINAL-REPORT.md" "04_roadmap/phase-6-final-report.md"
safe_move "gather-phase2-tickets.rtf" "04_roadmap/phase-2-tickets.rtf"

# Phase 1 tickets
safe_move "docs/gather/50_tickets/AuthTicket 1-2.md" "04_roadmap/tickets/phase-1/ticket-1.2-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-3.md" "04_roadmap/tickets/phase-1/ticket-1.3-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-4.md" "04_roadmap/tickets/phase-1/ticket-1.4-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-5.md" "04_roadmap/tickets/phase-1/ticket-1.5-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-6.md" "04_roadmap/tickets/phase-1/ticket-1.6-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-7.md" "04_roadmap/tickets/phase-1/ticket-1.7-auth.md"
safe_move "docs/gather/50_tickets/AuthTicket 1-8.md" "04_roadmap/tickets/phase-1/ticket-1.8-auth.md"

# Phase 2 tickets
safe_move "TICKET_2.1_COMPLETE.md" "04_roadmap/tickets/phase-2/ticket-2.1-subscription-schema.md"
safe_move "TICKET_2.2_COMPLETE.md" "04_roadmap/tickets/phase-2/ticket-2.2-stripe-integration.md"
safe_move "TICKET_2.3_COMPLETE.md" "04_roadmap/tickets/phase-2/ticket-2.3-billing-ui.md"
safe_move "TICKET_2.4_COMPLETE.md" "04_roadmap/tickets/phase-2/ticket-2.4-entitlements.md"
safe_move "TICKET_2.5_COMPLETE.md" "04_roadmap/tickets/phase-2/ticket-2.5-trial-flow.md"
safe_move "docs/gather/50_tickets/Phase 2 - Stripe/Phase 2 - stripe ticket 1" "04_roadmap/tickets/phase-2/stripe-ticket-1-spec.md"
safe_move "docs/gather/50_tickets/Phase 2 - Stripe/Phase 2 - stripe ticket 2" "04_roadmap/tickets/phase-2/stripe-ticket-2-spec.md"

# MUP tickets
safe_move "docs/gather/10_mup/Gather_MUP_v1_Step_Mapping.md" "04_roadmap/tickets/mup-v1/mup-step-mapping.md"
safe_move "docs/gather/50_tickets/Gather_MUP_v1_Build_Tickets.md" "04_roadmap/tickets/mup-v1/mup-build-tickets.md"
safe_move "docs/gather/50_tickets/Gather Team Drag & Drop Ticket.md" "04_roadmap/tickets/mup-v1/team-drag-drop-ticket.md"
safe_move "docs/gather/50_tickets/Gather item assigned unassigned confirmed non confirmed badge.md" "04_roadmap/tickets/mup-v1/item-badge-ticket.md"
safe_move "docs/gather/50_tickets/Build Ticket (Shape Pass) — Display \"Dro.md" "04_roadmap/tickets/mup-v1/shape-pass-ticket.md"
safe_move "docs/gather/50_tickets/Build Ticket (Shape) — Full-Screen \"Expa.ini" "04_roadmap/tickets/mup-v1/fullscreen-expand-ticket.md"

# Ops
safe_move "gather-build-checklist.md" "05_ops/build-checklist.md"
safe_move "gather-handoff-document.md" "05_ops/handoff-document.md"
safe_move "docs/gather/10_mup/MUP_v1_demo-script.md" "05_ops/mup-demo-script.md"
safe_move "docs/gather/10_mup/MUP_v1_done-checklist.md" "05_ops/mup-done-checklist.md"
safe_move "phase-3-testing-guide.md" "05_ops/testing/phase-3-testing-guide.md"
safe_move "phase-5-ui-testing-guide.md" "05_ops/testing/phase-5-ui-testing-guide.md"
safe_move "phase-5-ui-test-results.md" "05_ops/testing/phase-5-ui-test-results.md"
safe_move "phase-6-test-results.md" "05_ops/testing/phase-6-test-results.md"

# Meetings
safe_move "senior-dev-feedback.md" "07_meetings/senior-dev-feedback.md"
safe_move "claude-ai-integration-report.md" "07_meetings/claude-ai-integration-report.md"

# Assets
safe_move "Gatherfiles/gather-demo.jsx" "assets/code/gather-demo.jsx"

# Archives
safe_move "docs/gather/10_mup/archive/Gather_MUP_v1_Step_Mapping.md" "_archive/2026-01-18-mup-old/Gather_MUP_v1_Step_Mapping.md"
safe_move "Gatherfiles/gather-builder-spec.md" "_archive/2026-01-18-gatherfiles/builder-spec-v1.0.md"
safe_move "gather-magiclink-auth-phase1-tickets.docx" "_archive/legacy-formats/gather-magiclink-auth-phase1-tickets.docx"
safe_move "gather-magiclink-auth-phase1-tickets.rtf" "_archive/legacy-formats/gather-magiclink-auth-phase1-tickets.rtf"
safe_move "Gatherfiles.zip" "_archive/legacy-formats/Gatherfiles.zip"
safe_move "files.zip" "_archive/legacy-formats/files.zip"
safe_move "reset-button-debug-summary.md" "_archive/debug-logs/reset-button-debug-summary.md"

# Inbox
safe_move "docs/gather/HeaderBlock.md" "_inbox/header-block.md"

echo ""
echo "=== Phase 3: Cleanup duplicates ==="

# Remove duplicates (git rm)
git rm -f "Gatherfiles/gather-builder-spec-v1.3.3.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "Gatherfiles/gather-implementation-plan-v1.3.3.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "Gatherfiles/gather-figma-spec.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "Gatherfiles/gather-handoff-document.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "Gatherfiles/gather-build-checklist.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "Gatherfiles/gather-v1.3.2-to-v1.3.3.patch.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "gather/10_mup/MUP_v1_demo-script.md" 2>/dev/null && echo "[DELETED] Duplicate" || true
git rm -f "gather/10_mup/MUP_v1_done-checklist.md" 2>/dev/null && echo "[DELETED] Duplicate" || true

# Remove .DS_Store files
find . -name ".DS_Store" -exec git rm -f {} \; 2>/dev/null && echo "[DELETED] .DS_Store files" || true

# Remove empty directories
rmdir Gatherfiles 2>/dev/null && echo "[RMDIR] Gatherfiles/" || true
rmdir gather/10_mup 2>/dev/null && echo "[RMDIR] gather/10_mup/" || true
rmdir gather 2>/dev/null && echo "[RMDIR] gather/" || true
rmdir docs/gather/50_tickets/Phase\ 2\ -\ Stripe 2>/dev/null || true
rmdir docs/gather/50_tickets 2>/dev/null || true
rmdir docs/gather/10_mup/archive 2>/dev/null || true
rmdir docs/gather/10_mup 2>/dev/null || true
rmdir docs/gather/00_overview 2>/dev/null || true
rmdir docs/gather 2>/dev/null && echo "[RMDIR] docs/gather/" || true
rmdir docs 2>/dev/null && echo "[RMDIR] docs/" || true

echo ""
echo "=== REORGANIZATION COMPLETE ==="
echo "Files moved: $MOVE_COUNT"
echo "Errors: $ERROR_COUNT"
echo ""
echo "Log saved to: $LOG_FILE"
if [ -f "$ERROR_LOG" ]; then
  echo "Error log: $ERROR_LOG"
fi
