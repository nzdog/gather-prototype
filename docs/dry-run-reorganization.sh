#!/usr/bin/env bash
set -euo pipefail

# dry-run-reorganization.sh
# Purpose: Preview all file moves without executing them

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════════════════════"
echo " DRY RUN: Documentation Reorganization"
echo " Date: $(date +%Y-%m-%d\ %H:%M:%S)"
echo " Directory: $SCRIPT_DIR"
echo "═══════════════════════════════════════════════════════"
echo

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

move_count=0
delete_count=0
create_count=0
collision_count=0

# Function to check if target exists
check_collision() {
    local target="$1"
    if [[ -e "$target" ]]; then
        echo -e "${RED}⚠️  COLLISION DETECTED${NC}"
        collision_count=$((collision_count + 1))
        return 0
    fi
    return 1
}

# Function to simulate git mv
simulate_mv() {
    local src="$1"
    local dest="$2"
    local reason="$3"

    echo -e "${BLUE}[MOVE]${NC} $src"
    echo -e "    → $dest"
    echo -e "    ${YELLOW}Reason:${NC} $reason"

    if check_collision "$dest"; then
        echo -e "    ${RED}Target exists! Would rename to: ${dest%.md}-conflict-$(date +%Y%m%d).md${NC}"
    fi

    move_count=$((move_count + 1))
    echo
}

# Function to simulate git rm
simulate_rm() {
    local file="$1"
    local reason="$2"

    echo -e "${RED}[DELETE]${NC} $file"
    echo -e "    ${YELLOW}Reason:${NC} $reason"
    delete_count=$((delete_count + 1))
    echo
}

# Function to simulate directory creation
simulate_mkdir() {
    local dir="$1"
    local reason="$2"

    if [[ ! -d "$dir" ]]; then
        echo -e "${GREEN}[CREATE DIR]${NC} $dir"
        echo -e "    ${YELLOW}Reason:${NC} $reason"
        create_count=$((create_count + 1))
        echo
    fi
}

# Start simulation

echo "━━━ PHASE 1: Directory Creation ━━━"
echo
simulate_mkdir "06_research" "Missing research folder from taxonomy"
simulate_mkdir "08_decisions" "Missing decisions/ADR folder from taxonomy"
simulate_mkdir "_archive/2026-01-18-reorganization" "Archive previous reorganization artifacts"
simulate_mkdir "assets/diagrams" "Future diagram storage"
simulate_mkdir "assets/images" "Future image storage"

echo "━━━ PHASE 2: Root Cleanup (High Priority) ━━━"
echo
simulate_rm "ONBOARDING_REPORT.md" "Duplicate of 00_overview/onboarding-report.md (43KB vs 43KB)"
simulate_rm "README copy.md" "Duplicate of README.md"
simulate_rm "TICKET_2.12_COMPLETE.md" "Duplicate of 04_roadmap/tickets/phase-2/TICKET_2.12_COMPLETE.md"

simulate_mv "CHANGES.md" "00_overview/changelog.md" "Changelog belongs in overview"
simulate_mv "CSV_IMPORT_README.md" "03_specs/csv-import-spec.md" "Feature specification"
simulate_mv "T1_IMPLEMENTATION_SUMMARY.md" "04_roadmap/phase-1-implementation-summary.md" "Phase 1 summary belongs in roadmap"
simulate_mv "phase-2-tickets 2-11.rtf" "_archive/legacy-formats/phase-2-tickets-2-11.rtf" "Legacy format + fix filename (remove space)"
simulate_mv "REORGANIZATION_SUMMARY.md" "_archive/2026-01-18-reorganization/REORGANIZATION_SUMMARY.md" "Archive previous reorg artifact"
simulate_mv "reorganize-execute.sh" "_archive/2026-01-18-reorganization/reorganize-execute.sh" "Archive previous reorg script"

echo "━━━ PHASE 3: Roadmap Cleanup ━━━"
echo
simulate_mv "04_roadmap/ticket-2.10-complete.md" "04_roadmap/tickets/phase-2/ticket-2.10-complete.md" "Move to proper ticket location"
simulate_mv "04_roadmap/gather-phase2-tickets.pages" "_archive/legacy-formats/gather-phase2-tickets.pages" "Archive large legacy Apple Pages file (809KB)"
simulate_mv "04_roadmap/phase-2-tickets.rtf" "_archive/legacy-formats/phase-2-tickets.rtf" "Archive legacy RTF format"

echo "━━━ PHASE 4: Filename Fixes ━━━"
echo
simulate_mv "04_roadmap/tickets/phase-2/ticket-2.4-comp;ete.md" "04_roadmap/tickets/phase-2/ticket-2.4-complete.md" "Fix typo (semicolon → 'l')"

echo "━━━ PHASE 5: Reclassification ━━━"
echo
simulate_mv "03_specs/_versions/MUP_V1_TEST_REPORT.md" "05_ops/testing/mup-v1-test-report.md" "Test report better suited for ops"

echo "━━━ PHASE 6: Legacy Format Archival ━━━"
echo
simulate_mv "01_product/monetisation-auth-architecture.docx" "_archive/legacy-formats/monetisation-auth-architecture.docx" "Archive DOCX format (consider converting to MD first)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Directories to create:${NC} $create_count"
echo -e "${BLUE}Files to move:${NC} $move_count"
echo -e "${RED}Files to delete:${NC} $delete_count"
echo -e "${YELLOW}Potential collisions:${NC} $collision_count"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $collision_count -gt 0 ]]; then
    echo -e "${RED}WARNING: Collisions detected! Review above before proceeding.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Dry run complete. No collisions detected.${NC}"
echo
echo "To execute, run: ./reorganize-execute-phase2.sh"
