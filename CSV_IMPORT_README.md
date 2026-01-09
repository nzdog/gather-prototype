# CSV Import Feature

## Overview

The CSV import feature allows hosts to bulk import people into an event's Draft People list from a CSV file. This feature implements a 3-step flow with column mapping, validation, and selection.

## Feature Location

- **Entry Point**: Plan Editor → People Section → "Import CSV" button (purple button)
- **Status Requirement**: Event must be in DRAFT status
- **Access**: Plan editor page (`/plan/[eventId]`)

## User Flow

### Step 1: Upload CSV
- Click "Import CSV" button
- Upload a `.csv` file
- System automatically parses headers and rows
- Guidance shown: CSV should include names; email/phone optional

### Step 2: Map Columns
- Each CSV column is displayed with a dropdown to select target field
- **Smart suggestions** automatically map common column names:
  - "Name", "Full Name" → Name
  - "First Name", "Last Name", "fname" → Name
  - "Email", "E-mail", "mail" → Email
  - "Phone", "Mobile", "Tel" → Phone
- Can manually override any mapping
- Can set columns to "Ignore"
- Must map at least one column to "Name" to proceed

### Step 3: Review & Select
- Preview table shows all normalized people
- Each row has a checkbox for selection
- "Select All" checkbox in header
- Validation indicators for each row:
  - ✓ Green checkmark: Valid
  - ⚠ Yellow warning: Warnings (e.g., invalid email, duplicates)
  - ✗ Red error: Cannot import (e.g., missing name)
- Duplicate detection:
  - Same email = duplicate (strong signal)
  - Same name + phone = duplicate (medium signal)
- Download error report (CSV) button available
- "Import N People" button (only selected, valid rows)

## Validation Rules

### Hard Errors (Cannot Import)
- Missing name/displayName after normalization

### Soft Warnings (Can Import with Warning)
- Invalid email format
- Duplicate email
- Duplicate name+phone combination

## Normalization
- Whitespace trimmed on all fields
- Email normalized to lowercase
- Phone: spaces/dashes stripped for comparison, original format stored

## API Endpoint

### `POST /api/events/[id]/people/batch-import`

**Request Body:**
```json
{
  "people": [
    {
      "name": "John Smith",
      "email": "john@example.com",
      "phone": "021-555-0101",
      "role": "PARTICIPANT"
    }
  ]
}
```

**Response:**
```json
{
  "imported": 18,
  "skipped": 2,
  "errors": ["Error importing John Doe: Invalid team"]
}
```

**Business Logic:**
- Validates event exists and is in DRAFT status
- For each person:
  - Validates name is present
  - Validates team if teamId provided
  - Creates or finds Person by email
  - Skips if already in event (duplicate)
  - Creates PersonEvent linking person to event
- Returns summary with counts

## Test Data

Sample CSV files are provided in `/test-data/`:

1. **sample-people.csv** - Basic format with Name, Email, Phone
2. **sample-people-first-last.csv** - First Name + Last Name format
3. **sample-people-duplicates.csv** - Contains duplicate emails and name+phone
4. **sample-people-errors.csv** - Contains validation errors

## Files Modified/Created

### New Files
- `src/components/plan/ImportCSVModal.tsx` - Main modal component with 3-step flow
- `src/app/api/events/[id]/people/batch-import/route.ts` - Batch import API endpoint
- `test-data/*.csv` - Sample CSV files for testing

### Modified Files
- `src/components/plan/PeopleSection.tsx` - Added "Import CSV" button and modal integration

## Technical Implementation

### Component Architecture
- **ImportCSVModal**: Stateful modal managing 3-step wizard
- **Step 1**: File upload with CSV parsing (FileReader API)
- **Step 2**: Column mapping with smart suggestions
- **Step 3**: Preview table with checkboxes and validation

### State Management
- `step`: Current wizard step (1 | 2 | 3)
- `csvFile`: Uploaded file
- `csvHeaders`: Parsed CSV headers
- `csvRows`: Parsed CSV data rows
- `mappings`: Column-to-field mappings
- `parsedPeople`: Normalized and validated people with metadata

### Person Row Interface
```typescript
interface ParsedRow extends PersonRow {
  _rowIndex: number;           // Original CSV row number
  _selected: boolean;          // Checkbox state
  _validationErrors: string[]; // Hard errors
  _validationWarnings: string[]; // Soft warnings
  _isDuplicate?: boolean;      // Duplicate detection flag
}
```

## Acceptance Criteria Status

✅ 1. User can upload a .csv in Draft mode and reach a mapping screen
✅ 2. User can map CSV columns to target person fields
✅ 3. User can preview normalized rows in a table
✅ 4. Each row has a tick box; user can select/deselect; "Select all" works
✅ 5. Import action creates people entries for selected rows only
✅ 6. Rows missing a name cannot be imported with clear explanation
✅ 7. Duplicate detection produces warnings without forced merges
✅ 8. Import summary reports counts: imported / skipped / warned

## Future Enhancements (Not Implemented)

- CSV size limits/progress indicators for large files
- Auto-split full names (toggle exists but not implemented)
- Assignment to teams during import
- Role selection during import
- Global contact database sync
- Dietary requirements/allergies fields (unknown in current schema)

## Compliance Notes

- Import is explicit user action with full preview
- Selection is explicit (checkboxes)
- Personal data (name, email, phone) stored
- **Note**: Retention, deletion, and consent policies must be defined elsewhere
