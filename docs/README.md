# Gather Documentation

**Reorganized:** 2026-01-18

## Structure

This documentation follows a numbered taxonomy for easy navigation:

- **00_overview/** — Project context & onboarding
  Start here if you're new to the project

- **01_product/** — Product vision & positioning
  What we're building and why

- **02_ux/** — User experience & design
  How it should look, feel, and behave

- **03_specs/** — Technical specifications
  How to build it (current spec + version history)

- **04_roadmap/** — Planning, phases & tickets
  When/what's next, organized by phase

- **05_ops/** — Operations & testing
  How to run, test, and deploy

- **07_meetings/** — Meeting notes & decisions
  Feedback, discussions, and integration reports

- **assets/** — Diagrams, images & code samples
  Visual and code assets

- **_inbox/** — Unsorted new docs
  Temporary holding area for uncategorized docs

- **_archive/** — Historical & deprecated
  Old versions, legacy formats, and superseded docs

## File Naming Conventions

- **kebab-case**: `my-document.md` (not `My Document.md` or `My_Document.md`)
- **Always include extensions**: `.md` for markdown
- **Versions**: `document-v1.2.3.md`
- **Tickets**: `ticket-X.Y-description.md`
- **No spaces** in filenames

## Quick Links

### Just Starting?
→ `00_overview/onboarding-report.md`

### Current Technical Spec?
→ `03_specs/builder-spec-v1.3.3.md`

### Building a Feature?
→ `04_roadmap/tickets/` (find your phase)

### Testing/QA?
→ `05_ops/testing/`

### Design Questions?
→ `02_ux/ui-protocol.md` or `02_ux/figma-spec.md`

### Phase Status?
→ `04_roadmap/phase-X-completion.md`

## Maintenance

- **Add new docs to `_inbox/`** first, then categorize weekly
- **Don't let `_inbox/` accumulate** more than 5 files
- **Archive superseded versions** to `03_specs/_versions/` or `_archive/`
- **Review `_archive/` every 6 months** and prune if needed
- **Keep `.DS_Store` files out** (.gitignore configured)
