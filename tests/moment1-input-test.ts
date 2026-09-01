/**
 * GTC-103 / GTC-112 — Moment 1: "Who's coming?" input flow
 *
 * Tests validation logic and member counting for the household input form.
 * Updated for GTC-112: kids with jobs (helpers) and kids without jobs (littleCount).
 * Pure-logic tests — no React runtime required.
 */

import { normalizePhoneNumber, isInternationalNumber } from '../src/lib/phone';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}

// --- Validation helpers (mirroring API + component logic) ---

function validateEmail(email: string): boolean {
  if (!email) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLittleCount(count: number): boolean {
  return count >= 0 && count <= 20;
}

interface HouseholdInput {
  primaryContact: { name: string; email?: string; phone?: string };
  partner?: { name?: string; email?: string; phone?: string };
  helpers?: Array<{ name: string; email?: string; phone?: string }>;
  littleCount?: number;
  guests?: Array<{ name?: string; email?: string; phone?: string }>;
}

function countMembers(input: HouseholdInput): number {
  let count = 1; // primary contact
  if (input.partner?.name) count++;
  if (input.helpers) count += input.helpers.length;
  if (input.littleCount) count += input.littleCount;
  if (input.guests) count += input.guests.filter((g) => g.name).length;
  return count;
}

function validateHousehold(input: HouseholdInput): string | null {
  if (!input.primaryContact?.name?.trim()) return 'Primary contact name is required';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allMembers = [
    input.primaryContact,
    ...(input.partner ? [input.partner] : []),
    ...(input.helpers || []),
    ...(input.guests || []),
  ];
  for (const member of allMembers) {
    if (member.email && !emailRegex.test(member.email)) {
      return `Invalid email format: ${member.email}`;
    }
  }

  // Validate helper names (required for kids with jobs)
  if (input.helpers) {
    for (const helper of input.helpers) {
      if (!helper.name?.trim()) return 'Kid with a job must have a name';
    }
  }

  if (input.littleCount !== undefined && (input.littleCount < 0 || input.littleCount > 20)) {
    return 'Kids without jobs count must be between 0 and 20';
  }

  return null;
}

console.log('\x1b[33m=== GTC-103/112: Moment 1 Input Flow Tests ===\x1b[0m\n');

// --- Suite 1: Primary contact validation ---
console.log('\x1b[33mSuite 1: Primary contact validation\x1b[0m');

assert(
  '1.1 Name is required — empty name fails',
  validateHousehold({ primaryContact: { name: '' } }) === 'Primary contact name is required'
);

assert(
  '1.2 Name is required — whitespace-only fails',
  validateHousehold({ primaryContact: { name: '   ' } }) === 'Primary contact name is required'
);

assert(
  '1.3 Valid name-only contact passes',
  validateHousehold({ primaryContact: { name: 'Kate' } }) === null
);

assert(
  '1.4 Valid name + email passes',
  validateHousehold({ primaryContact: { name: 'Kate', email: 'kate@test.com' } }) === null
);

assert(
  '1.5 Invalid email format rejected',
  validateHousehold({ primaryContact: { name: 'Kate', email: 'notanemail' } })?.includes(
    'Invalid email'
  ) ?? false
);

// --- Suite 2: Phone validation ---
console.log('\n\x1b[33mSuite 2: Phone validation (NZ numbers)\x1b[0m');

assert(
  '2.1 Valid NZ mobile normalizes to E.164',
  normalizePhoneNumber('021 123 4567') === '+64211234567'
);

assert('2.2 Invalid phone returns null', normalizePhoneNumber('abc') === null);

assert('2.3 International number detected', isInternationalNumber('+44 7700 900000') === true);

assert(
  '2.4 NZ number not flagged as international',
  isInternationalNumber('+64211234567') === false
);

// --- Suite 3: Email validation ---
console.log('\n\x1b[33mSuite 3: Email validation\x1b[0m');

assert('3.1 Empty email is valid (optional)', validateEmail('') === true);
assert('3.2 Standard email is valid', validateEmail('kate@example.com') === true);
assert('3.3 No-domain email is invalid', validateEmail('kate@') === false);
assert('3.4 No-at email is invalid', validateEmail('kate') === false);

// --- Suite 4: littleCount validation ---
console.log('\n\x1b[33mSuite 4: Kids without jobs count bounds\x1b[0m');

assert('4.1 littleCount 0 is valid', validateLittleCount(0) === true);
assert('4.2 littleCount 20 is valid', validateLittleCount(20) === true);
assert('4.3 littleCount -1 is invalid', validateLittleCount(-1) === false);
assert('4.4 littleCount 21 is invalid', validateLittleCount(21) === false);
assert('4.5 littleCount 3 is valid', validateLittleCount(3) === true);

// --- Suite 5: Member counting ---
console.log('\n\x1b[33mSuite 5: Member counting\x1b[0m');

assert('5.1 Primary contact only = 1', countMembers({ primaryContact: { name: 'Kate' } }) === 1);

assert(
  '5.2 Primary + partner with name = 2',
  countMembers({
    primaryContact: { name: 'Kate' },
    partner: { name: 'Rob' },
  }) === 2
);

assert(
  '5.3 Primary + partner without name = 1 (unnamed partner not counted)',
  countMembers({
    primaryContact: { name: 'Kate' },
    partner: { email: 'anon@test.com' },
  }) === 1
);

assert(
  '5.4 Primary + 3 littles = 4',
  countMembers({
    primaryContact: { name: 'Kate' },
    littleCount: 3,
  }) === 4
);

assert(
  '5.5 Primary + partner + 2 helpers + 1 little + 1 guest = 6',
  countMembers({
    primaryContact: { name: 'Kate' },
    partner: { name: 'Rob' },
    helpers: [{ name: 'Sam' }, { name: 'Lily' }],
    littleCount: 1,
    guests: [{ name: 'Alex' }],
  }) === 6
);

assert(
  '5.6 Guests without names not counted',
  countMembers({
    primaryContact: { name: 'Kate' },
    guests: [{ name: 'Alex' }, { email: 'anon@test.com' }, { name: 'Sam' }],
  }) === 3
);

assert(
  '5.7 Helpers count individually (kids with jobs)',
  countMembers({
    primaryContact: { name: 'Kate' },
    helpers: [{ name: 'Sam' }, { name: 'Lily' }, { name: 'Max' }],
  }) === 4
);

// --- Suite 6: Full household validation ---
console.log('\n\x1b[33mSuite 6: Full household validation\x1b[0m');

assert(
  '6.1 Full valid household passes',
  validateHousehold({
    primaryContact: { name: 'Kate', email: 'kate@test.com', phone: '0211234567' },
    partner: { name: 'Rob', email: 'rob@test.com' },
    helpers: [{ name: 'Sam' }],
    littleCount: 2,
    guests: [{ name: 'Alex', email: 'alex@test.com' }],
  }) === null
);

assert(
  '6.2 Invalid guest email fails whole household',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    guests: [{ name: 'Alex', email: 'bademail' }],
  })?.includes('Invalid email') ?? false
);

assert(
  '6.3 Invalid partner email fails whole household',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    partner: { name: 'Rob', email: 'bademail' },
  })?.includes('Invalid email') ?? false
);

assert(
  '6.4 littleCount 21 fails validation',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    littleCount: 21,
  })?.includes('Kids without jobs') ?? false
);

assert(
  '6.5 Helper without name fails validation',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    helpers: [{ name: '' }],
  })?.includes('Kid with a job must have a name') ?? false
);

assert(
  '6.6 Helper with invalid email fails validation',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    helpers: [{ name: 'Sam', email: 'bademail' }],
  })?.includes('Invalid email') ?? false
);

assert(
  '6.7 Both helpers and littles coexist',
  validateHousehold({
    primaryContact: { name: 'Kate' },
    helpers: [{ name: 'Sam' }, { name: 'Lily' }],
    littleCount: 3,
  }) === null
);

// --- Summary ---
console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
process.exit(failed > 0 ? 1 : 0);
