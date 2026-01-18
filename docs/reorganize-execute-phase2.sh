#!/usr/bin/env bash
set -euo pipefail

# reorganize-execute-phase2.sh
# Purpose: Execute documentation reorganization safely with git mv

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_FILE="reorganization-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

# Safety checks
log "═══════════════════════════════════════════════════════"
log " Documentation Reorganization - Execution"
log " Date: $(date +%Y-%m-%d\ %H:%M:%S)"
log " Log file: $LOG_FILE"
log "═══════════════════════════════════════════════════════"
log ""

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Not in a git repository. Aborting."
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    log_info "Uncommitted changes detected. Creating backup branch..."
    BACKUP_BRANCH="docs/backup-before-reorg-$(date +%Y%m%d-%H%M%S)"
    git branch "$BACKUP_BRANCH"
    log_success "Backup branch created: $BACKUP_BRANCH"
fi

# Create new branch for reorganization
REORG_BRANCH="docs/reorganization-phase-2"
log_info "Creating reorganization branch: $REORG_BRANCH"
git checkout -b "$REORG_BRANCH" 2>/dev/null || git checkout "$REORG_BRANCH"

# Track operations
moved=0
deleted=0
created=0
errors=0

# Function to safely create directory
safe_mkdir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_success "Created directory: $dir"
        created=$((created + 1))
    fi
}

# Function to safely move file
safe_mv() {
    local src="$1"
    local dest="$2"

    if [[ ! -e "$src" ]]; then
        log_error "Source not found: $src"
        errors=$((errors + 1))
        return 1
    fi

    # Create parent directory if needed
    local dest_dir=$(dirname "$dest")
    safe_mkdir "$dest_dir"

    # Check for collision
    if [[ -e "$dest" ]]; then
        log_error "Collision detected: $dest already exists"
        local new_dest="${dest%.md}-conflict-$(date +%Y%m%d).md"
        log_info "Renaming to: $new_dest"
        dest="$new_dest"
    fi

    git mv "$src" "$dest"
    log_success "Moved: $src → $dest"
    moved=$((moved + 1))
}

# Function to safely delete file
safe_rm() {
    local file="$1"

    if [[ ! -e "$file" ]]; then
        log_error "File not found: $file"
        errors=$((errors + 1))
        return 1
    fi

    git rm "$file"
    log_success "Deleted: $file"
    deleted=$((deleted + 1))
}

# PHASE 1: Create directories
log ""
log "━━━ PHASE 1: Creating Directories ━━━"
safe_mkdir "06_research"
safe_mkdir "08_decisions"
safe_mkdir "_archive/2026-01-18-reorganization"
safe_mkdir "assets/diagrams"
safe_mkdir "assets/images"

# PHASE 2: Root cleanup (deletions)
log ""
log "━━━ PHASE 2: Removing Duplicates ━━━"
safe_rm "ONBOARDING_REPORT.md"
safe_rm "README copy.md"
safe_rm "TICKET_2.12_COMPLETE.md"

# PHASE 3: Root cleanup (moves)
log ""
log "━━━ PHASE 3: Moving Root Files ━━━"
safe_mv "CHANGES.md" "00_overview/changelog.md"
safe_mv "CSV_IMPORT_README.md" "03_specs/csv-import-spec.md"
safe_mv "T1_IMPLEMENTATION_SUMMARY.md" "04_roadmap/phase-1-implementation-summary.md"
safe_mv "phase-2-tickets 2-11.rtf" "_archive/legacy-formats/phase-2-tickets-2-11.rtf"
safe_mv "REORGANIZATION_SUMMARY.md" "_archive/2026-01-18-reorganization/REORGANIZATION_SUMMARY.md"
safe_mv "reorganize-execute.sh" "_archive/2026-01-18-reorganization/reorganize-execute.sh"

# PHASE 4: Roadmap cleanup
log ""
log "━━━ PHASE 4: Reorganizing Roadmap ━━━"
safe_mv "04_roadmap/ticket-2.10-complete.md" "04_roadmap/tickets/phase-2/ticket-2.10-complete.md"
safe_mv "04_roadmap/gather-phase2-tickets.pages" "_archive/legacy-formats/gather-phase2-tickets.pages"
safe_mv "04_roadmap/phase-2-tickets.rtf" "_archive/legacy-formats/phase-2-tickets.rtf"

# PHASE 5: Filename fixes
log ""
log "━━━ PHASE 5: Fixing Filenames ━━━"
safe_mv "04_roadmap/tickets/phase-2/ticket-2.4-comp;ete.md" "04_roadmap/tickets/phase-2/ticket-2.4-complete.md"

# PHASE 6: Reclassification
log ""
log "━━━ PHASE 6: Reclassifying Files ━━━"
safe_mv "03_specs/_versions/MUP_V1_TEST_REPORT.md" "05_ops/testing/mup-v1-test-report.md"

# PHASE 7: Archive legacy formats
log ""
log "━━━ PHASE 7: Archiving Legacy Formats ━━━"
safe_mv "01_product/monetisation-auth-architecture.docx" "_archive/legacy-formats/monetisation-auth-architecture.docx"

# PHASE 8: Create README files for new folders
log ""
log "━━━ PHASE 8: Creating README Files ━━━"

cat > "06_research/README.md" <<'EOF'
# Research

This folder contains:
- Tool evaluations and comparisons
- Technology spikes and investigations
- Research findings and recommendations

## Guidelines
- Add new research with date prefix: `YYYY-MM-DD-research-topic.md`
- Include decision outcomes if applicable
- Link to any ADRs in `08_decisions/` that resulted from research
EOF

cat > "08_decisions/README.md" <<'EOF'
# Architectural Decision Records (ADRs)

This folder contains records of significant architectural and technical decisions.

## Template

Use this format for new ADRs:

```markdown
# ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Deciders:** [Names/roles]

## Context
What is the issue we're facing?

## Decision
What did we decide?

## Consequences
What are the trade-offs and implications?

## Alternatives Considered
What other options did we evaluate?
```

## Naming
- Format: `adr-NNN-kebab-case-title.md`
- Number sequentially starting from 001
EOF

created=$((created + 2))
log_success "Created README files for new folders"

# Summary
log ""
log "═══════════════════════════════════════════════════════"
log "Summary:"
log "═══════════════════════════════════════════════════════"
log_success "Directories created: $created"
log_success "Files moved: $moved"
log_success "Files deleted: $deleted"
if [[ $errors -gt 0 ]]; then
    log_error "Errors encountered: $errors"
else
    log_success "No errors encountered"
fi
log ""

# Verify file count
FINAL_COUNT=$(find . -type f -not -path '*/\.*' | wc -l)
log_info "Final file count: $FINAL_COUNT"
log ""

# Commit changes
log_info "Creating commit..."
git add -A
git commit -m "docs: reorganize documentation structure phase 2

- Clean up root directory (remove duplicates, move misplaced files)
- Fix filename typos and naming convention violations
- Archive legacy formats (.rtf, .docx, .pages) to _archive/legacy-formats
- Create missing folders: 06_research, 08_decisions
- Reclassify test reports to ops/testing
- Add README files for new folders

Moved: $moved files
Deleted: $deleted duplicates
Created: $created directories

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

log_success "Commit created successfully"
log ""
log_info "Branch: $REORG_BRANCH"
log_info "Next steps:"
log "  1. Review changes: git diff HEAD~1"
log "  2. Review file tree: tree -L 3"
log "  3. Merge to main: git checkout <target-branch> && git merge $REORG_BRANCH"
log ""
log_success "Reorganization complete!"
