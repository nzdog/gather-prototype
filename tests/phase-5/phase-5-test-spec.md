# Phase 5: Templates & Memory - Test Specification

## Overview
This document outlines the test cases for Phase 5: Templates & Memory functionality.

## Test Environment Setup
1. Ensure database is seeded with Phase 1-4 data
2. Have at least one completed event in the database
3. Have a valid host user ID

---

## 1. Template Endpoints Tests

### 1.1 GET /api/templates
**Purpose:** List Host's saved templates

**Test Cases:**
- [ ] Returns empty array when host has no templates
- [ ] Returns only HOST templates for the specified hostId
- [ ] Does not return GATHER_CURATED templates
- [ ] Templates are ordered by createdAt DESC
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 1: Get templates for host (should be empty initially)
curl "http://localhost:3000/api/templates?hostId=<hostId>"

# Expected: { "templates": [] }
```

### 1.2 POST /api/templates
**Purpose:** Create template from completed event

**Test Cases:**
- [ ] Successfully creates StructureTemplate from event
- [ ] Extracts teams with names, scopes, domains
- [ ] Extracts items with names, dietaryTags, equipmentNeeds, critical flag
- [ ] Does NOT include dates, assignments, acknowledgements, quantities
- [ ] Creates QuantitiesProfile if guestCountConfidence is HIGH or MEDIUM
- [ ] Does NOT create QuantitiesProfile if guestCountConfidence is LOW
- [ ] Returns 400 if hostId, eventId, or name is missing
- [ ] Returns 404 if event doesn't exist
- [ ] Returns 403 if hostId doesn't match event.hostId

**Manual Test:**
```bash
# Test 2: Create template from event
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "hostId": "<hostId>",
    "eventId": "<eventId>",
    "name": "My Christmas Template"
  }'

# Expected: { "template": {...}, "quantitiesProfile": {...}, "message": "Template created successfully" }
```

### 1.3 GET /api/templates/gather
**Purpose:** List Gather curated templates

**Test Cases:**
- [ ] Returns only GATHER_CURATED templates
- [ ] Does not return HOST templates
- [ ] Templates are ordered by publishedAt DESC
- [ ] Returns empty array if no curated templates exist

**Manual Test:**
```bash
# Test 3: Get Gather curated templates
curl "http://localhost:3000/api/templates/gather"

# Expected: { "templates": [] } (or curated templates if any exist)
```

### 1.4 GET /api/templates/[id]
**Purpose:** Get template details

**Test Cases:**
- [ ] Returns template details for valid ID
- [ ] Returns 404 if template doesn't exist
- [ ] Returns 403 if accessing HOST template from different host
- [ ] Allows access to GATHER_CURATED templates without hostId check

**Manual Test:**
```bash
# Test 4: Get template by ID
curl "http://localhost:3000/api/templates/<templateId>?hostId=<hostId>"

# Expected: { "template": {...} }
```

### 1.5 DELETE /api/templates/[id]
**Purpose:** Delete template (HOST templates only)

**Test Cases:**
- [ ] Successfully deletes HOST template
- [ ] Returns 404 if template doesn't exist
- [ ] Returns 403 if hostId doesn't match
- [ ] Returns 403 if trying to delete GATHER_CURATED template
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 5: Delete template
curl -X DELETE http://localhost:3000/api/templates/<templateId> \
  -H "Content-Type: application/json" \
  -d '{"hostId": "<hostId>"}'

# Expected: { "message": "Template deleted successfully" }
```

### 1.6 POST /api/templates/[id]/clone
**Purpose:** Clone template to new event

**Test Cases:**
- [ ] Successfully creates new event from template
- [ ] Creates all teams from template
- [ ] Creates all items with source: 'TEMPLATE'
- [ ] Creates days from template
- [ ] All items are UNASSIGNED
- [ ] Applies quantity scaling when requested and QuantitiesProfile exists
- [ ] Does NOT apply scaling when applyQuantityScaling is false
- [ ] Returns new eventId
- [ ] Returns 404 if template doesn't exist
- [ ] Returns 403 if accessing HOST template from different host
- [ ] Returns 400 if required fields are missing

**Manual Test:**
```bash
# Test 6: Clone template
curl -X POST http://localhost:3000/api/templates/<templateId>/clone \
  -H "Content-Type: application/json" \
  -d '{
    "hostId": "<hostId>",
    "eventName": "Christmas 2026",
    "startDate": "2026-12-24",
    "endDate": "2026-12-26",
    "guestCount": 30,
    "applyQuantityScaling": true,
    "occasionType": "CHRISTMAS"
  }'

# Expected: { "eventId": "...", "event": {...}, "scalingApplied": true, "scalingRatio": ..., "message": "Template cloned successfully" }
```

---

## 2. Host Memory Endpoints Tests

### 2.1 GET /api/memory
**Purpose:** Get Host memory summary

**Test Cases:**
- [ ] Returns or creates HostMemory for the host
- [ ] Includes patterns, defaults, dismissedSuggestions
- [ ] Returns stats: completedEvents, templatesSaved, patternsLearned, defaultsSet
- [ ] Creates HostMemory with default settings if it doesn't exist
- [ ] Default settings: learningEnabled=false, aggregateContributionConsent=false
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 7: Get host memory
curl "http://localhost:3000/api/memory?hostId=<hostId>"

# Expected: { "hostMemory": {...}, "stats": {...} }
```

### 2.2 DELETE /api/memory
**Purpose:** Delete all Host memory

**Test Cases:**
- [ ] Deletes HostMemory and all related data
- [ ] Deletes all HOST templates
- [ ] Deletes all QuantitiesProfiles
- [ ] Creates DeletionReceipt with scope: 'ALL'
- [ ] DeletionReceipt includes all deleted IDs
- [ ] Returns 404 if HostMemory doesn't exist
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 8: Delete host memory
curl -X DELETE "http://localhost:3000/api/memory?hostId=<hostId>"

# Expected: { "message": "Host memory deleted successfully", "receipt": {...} }
```

### 2.3 GET /api/memory/patterns
**Purpose:** List learned patterns

**Test Cases:**
- [ ] Returns all patterns for the host
- [ ] Patterns are ordered by updatedAt DESC
- [ ] Returns empty array if no HostMemory exists
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 9: Get patterns
curl "http://localhost:3000/api/memory/patterns?hostId=<hostId>"

# Expected: { "patterns": [] } (or patterns if any exist)
```

### 2.4 PATCH /api/memory/settings
**Purpose:** Update memory settings

**Test Cases:**
- [ ] Creates HostMemory if it doesn't exist
- [ ] Updates learningEnabled setting
- [ ] Updates aggregateContributionConsent setting
- [ ] Updates useHistoryByDefault setting
- [ ] Only updates provided fields (partial update)
- [ ] Returns 400 if hostId is missing

**Manual Test:**
```bash
# Test 10: Update memory settings
curl -X PATCH http://localhost:3000/api/memory/settings \
  -H "Content-Type: application/json" \
  -d '{
    "hostId": "<hostId>",
    "learningEnabled": true,
    "aggregateContributionConsent": false
  }'

# Expected: { "hostMemory": {...}, "message": "Settings updated successfully" }
```

---

## 3. Integration Tests

### 3.1 Template Creation and Clone Workflow
**Test Steps:**
1. Create a template from a completed event
2. Verify template was created with correct structure
3. Clone the template to a new event
4. Verify new event was created with all teams and items
5. Verify all items have source: 'TEMPLATE' and status: 'UNASSIGNED'

### 3.2 Quantity Scaling Workflow
**Test Steps:**
1. Create a template from an event with guestCountConfidence: 'HIGH'
2. Verify QuantitiesProfile was created
3. Clone the template with applyQuantityScaling: true and different guest count
4. Verify quantities were scaled correctly

### 3.3 Host Memory Lifecycle
**Test Steps:**
1. Get host memory (should create with defaults)
2. Update settings to enable learning
3. Create some templates
4. Verify stats reflect created templates
5. Delete all host memory
6. Verify DeletionReceipt was created
7. Verify all templates were deleted

---

## 4. UI Component Tests

### 4.1 TemplateList Component
**Visual Tests:**
- [ ] Displays "My Templates" and "Gather Templates" tabs
- [ ] Shows correct count in each tab
- [ ] Displays template cards with name, occasion type, and team count
- [ ] "Use Template" button opens clone modal
- [ ] "Delete" button shows confirmation and deletes template
- [ ] Shows empty state message when no templates

### 4.2 SaveTemplateModal Component
**Visual Tests:**
- [ ] Shows modal when isOpen is true
- [ ] Displays what's included and what's NOT included
- [ ] Accepts template name input
- [ ] Save button is disabled when name is empty
- [ ] Shows loading state when saving
- [ ] Closes modal after successful save

### 4.3 CloneTemplateModal Component
**Visual Tests:**
- [ ] Displays template summary (teams, items, occasion)
- [ ] Accepts event name, start date, end date
- [ ] Shows quantity scaling checkbox when guest count is entered
- [ ] Displays what will be created
- [ ] Create button is disabled when required fields are missing
- [ ] Shows loading state when cloning
- [ ] Closes modal after successful clone

---

## 5. Consent Posture Tests (Theme 6)

### 5.1 Default Consent Settings
**Test Cases:**
- [ ] HostMemory created with learningEnabled: false by default
- [ ] HostMemory created with aggregateContributionConsent: false by default
- [ ] Requires explicit opt-in to enable aggregateContributionConsent

### 5.2 Purpose Limitation
**Test Cases:**
- [ ] Host memory only used for improving suggestions to that host
- [ ] Aggregate contribution requires explicit consent
- [ ] DeletionReceipt shows aggregateContributionPurged when consent was given

---

## Test Execution Checklist

- [ ] All template endpoints return correct status codes
- [ ] Template structure excludes dates, assignments, quantities
- [ ] QuantitiesProfile created only when guestCountConfidence is HIGH/MEDIUM
- [ ] Clone creates event with all items tagged as source: 'TEMPLATE'
- [ ] Clone respects quantity scaling when requested
- [ ] Host memory endpoints work correctly
- [ ] Memory deletion creates DeletionReceipt
- [ ] Default consent settings are correct (Theme 6)
- [ ] UI components render correctly
- [ ] UI components handle errors gracefully

---

## Test Results

### Phase 5 Acceptance Criteria
- [ ] Template endpoints functional (GET, POST, DELETE, clone)
- [ ] Structure Template extraction correct (teams, items, days - NO dates/assignments)
- [ ] Quantities Profile creation works with confidence check
- [ ] Clone workflow creates new event with scaled quantities
- [ ] Host Memory endpoints functional
- [ ] Consent posture follows Theme 6 (memory ON by default, aggregate contribution OFF)
- [ ] UI components display correctly and handle user interactions
- [ ] All tests pass

---

## Notes
- Manual tests can be run using curl commands above
- For automated testing, consider installing Jest or Vitest
- UI component tests require a React testing library (e.g., React Testing Library)
