#!/usr/bin/env bash
set -euo pipefail

# verify-reorganization.sh
# Purpose: Verify reorganization completed successfully

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0

check() {
    local name="$1"
    local condition="$2"

    if eval "$condition"; then
        echo -e "${GREEN}✅${NC} $name"
    else
        echo -e "${RED}❌${NC} $name"
        errors=$((errors + 1))
    fi
}

echo "════════════════════════════════════════"
echo " Reorganization Verification"
echo "════════════════════════════════════════"
echo

echo "━━━ Structure Checks ━━━"
check "00_overview exists" "[[ -d 00_overview ]]"
check "01_product exists" "[[ -d 01_product ]]"
check "02_ux exists" "[[ -d 02_ux ]]"
check "03_specs exists" "[[ -d 03_specs ]]"
check "04_roadmap exists" "[[ -d 04_roadmap ]]"
check "05_ops exists" "[[ -d 05_ops ]]"
check "06_research exists" "[[ -d 06_research ]]"
check "07_meetings exists" "[[ -d 07_meetings ]]"
check "08_decisions exists" "[[ -d 08_decisions ]]"
check "assets exists" "[[ -d assets ]]"
check "_inbox exists" "[[ -d _inbox ]]"
check "_archive exists" "[[ -d _archive ]]"
echo

echo "━━━ File Presence Checks ━━━"
check "README.md exists in root" "[[ -f README.md ]]"
check "changelog moved to overview" "[[ -f 00_overview/changelog.md ]]"
check "csv-import-spec moved to specs" "[[ -f 03_specs/csv-import-spec.md ]]"
check "phase-1-summary moved to roadmap" "[[ -f 04_roadmap/phase-1-implementation-summary.md ]]"
check "ticket-2.10 moved to tickets" "[[ -f 04_roadmap/tickets/phase-2/ticket-2.10-complete.md ]]"
check "ticket-2.4 typo fixed" "[[ -f 04_roadmap/tickets/phase-2/ticket-2.4-complete.md ]]"
check "MUP test report moved to ops" "[[ -f 05_ops/testing/mup-v1-test-report.md ]]"
check "research README exists" "[[ -f 06_research/README.md ]]"
check "decisions README exists" "[[ -f 08_decisions/README.md ]]"
echo

echo "━━━ Duplicate Removal Checks ━━━"
check "ONBOARDING_REPORT.md removed from root" "[[ ! -f ONBOARDING_REPORT.md ]]"
check "README copy.md removed" "[[ ! -f 'README copy.md' ]]"
check "TICKET_2.12_COMPLETE.md removed from root" "[[ ! -f TICKET_2.12_COMPLETE.md ]]"
echo

echo "━━━ Archive Checks ━━━"
check "Legacy formats archived" "[[ -d _archive/legacy-formats ]]"
check "Reorganization artifacts archived" "[[ -d _archive/2026-01-18-reorganization ]]"
check "phase-2-tickets archived" "[[ -f _archive/legacy-formats/phase-2-tickets-2-11.rtf ]]"
echo

echo "━━━ Naming Convention Checks ━━━"
bad_names=$(find . -type f -name "* *" -not -path '*/\.*' 2>/dev/null | wc -l)
check "No spaces in filenames" "[[ $bad_names -eq 0 ]]"
if [[ $bad_names -gt 0 ]]; then
    echo "  Files with spaces:"
    find . -type f -name "* *" -not -path '*/\.*' | sed 's/^/    /'
fi
echo

echo "━━━ File Count ━━━"
total_files=$(find . -type f -not -path '*/\.*' | wc -l)
echo "  Total files: $total_files"
echo

echo "════════════════════════════════════════"
if [[ $errors -eq 0 ]]; then
    echo -e "${GREEN}✅ All verification checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $errors verification check(s) failed${NC}"
    exit 1
fi
