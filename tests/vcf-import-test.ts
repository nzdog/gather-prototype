/**
 * GTC-082 — VCF Contact Import
 *
 * Tests the parseVCF pure function. UI assertions are verified by inspection
 * and by the typecheck gate; the parser is the load-bearing new logic.
 *
 * Covers:
 *  - vCard 3.0 parsing (assertion 1)
 *  - vCard 4.0 parsing (assertion 2)
 *  - Multi-contact files (assertion 3)
 *  - Māori macron characters via quoted-printable (assertion 4)
 *  - Skip contacts with no email and no phone (assertion 5)
 *  - Multi-value EMAIL with PREF (assertion 6)
 */
import { parseVCF } from '../src/lib/vcard';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    process.stdout.write(`  ✓ ${message}\n`);
  } else {
    failed++;
    process.stdout.write(`  ✗ ${message}\n`);
  }
}

function section(title: string) {
  process.stdout.write(`\n${title}\n`);
}

// ---------------------------------------------------------------------------
// Assertion 1: vCard 3.0 single contact
// ---------------------------------------------------------------------------
section('Assertion 1: vCard 3.0 single contact');
{
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Jane Doe',
    'N:Doe;Jane;;;',
    'EMAIL;TYPE=WORK:jane@example.com',
    'TEL;TYPE=CELL:021 555 1234',
    'END:VCARD',
  ].join('\r\n');

  const result = parseVCF(vcf);
  assert(result.contacts.length === 1, 'exactly one contact parsed');
  assert(
    result.contacts[0].name === 'Jane Doe',
    `name is "Jane Doe" (got "${result.contacts[0].name}")`
  );
  assert(
    result.contacts[0].email === 'jane@example.com',
    `email is jane@example.com (got ${result.contacts[0].email})`
  );
  assert(
    result.contacts[0].phone === '+64215551234',
    `phone normalised to +64215551234 (got ${result.contacts[0].phone})`
  );
}

// ---------------------------------------------------------------------------
// Assertion 2: vCard 4.0 single contact
// ---------------------------------------------------------------------------
section('Assertion 2: vCard 4.0 single contact');
{
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'FN:Alex Smith',
    'N:Smith;Alex;;;',
    'EMAIL:alex@example.co.nz',
    'TEL:+64 27 555 9988',
    'END:VCARD',
  ].join('\r\n');

  const result = parseVCF(vcf);
  assert(result.contacts.length === 1, 'exactly one contact parsed');
  assert(
    result.contacts[0].name === 'Alex Smith',
    `name is "Alex Smith" (got "${result.contacts[0].name}")`
  );
  assert(
    result.contacts[0].email === 'alex@example.co.nz',
    `email is alex@example.co.nz (got ${result.contacts[0].email})`
  );
  assert(
    result.contacts[0].phone === '+64275559988',
    `phone normalised to +64275559988 (got ${result.contacts[0].phone})`
  );
}

// ---------------------------------------------------------------------------
// Assertion 3: multi-contact VCF (12 contacts)
// ---------------------------------------------------------------------------
section('Assertion 3: multi-contact VCF file');
{
  const cards: string[] = [];
  for (let i = 1; i <= 12; i++) {
    cards.push(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:Person ${i}`,
        `N:Last${i};First${i};;;`,
        `EMAIL:person${i}@example.com`,
        `TEL:+64 21 555 ${String(1000 + i).padStart(4, '0')}`,
        'END:VCARD',
      ].join('\r\n')
    );
  }
  const vcf = cards.join('\r\n');
  const result = parseVCF(vcf);
  assert(result.totalFound === 12, `totalFound === 12 (got ${result.totalFound})`);
  assert(result.contacts.length === 12, `12 contacts parsed (got ${result.contacts.length})`);
  assert(result.contacts[0].name === 'Person 1', 'first contact name correct');
  assert(result.contacts[11].name === 'Person 12', 'last contact name correct');
  assert(
    result.contacts[5].email === 'person6@example.com',
    'middle contact email correct (one-to-one association preserved)'
  );
}

// ---------------------------------------------------------------------------
// Assertion 4: Māori macron characters via quoted-printable (vCard 3.0)
// ---------------------------------------------------------------------------
section('Assertion 4: Māori macron characters (quoted-printable)');
{
  // "Māui Pōtiki" → UTF-8 bytes encoded as QP:
  //   M  = 4D
  //   ā  = C4 81
  //   u  = 75
  //   i  = 69
  //   (space) = 20 (can stay literal)
  //   P  = 50
  //   ō  = C5 8D
  //   t  = 74
  //   i  = 69
  //   k  = 6B
  //   i  = 69
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4D=C4=81ui =50=C5=8Dtiki',
    'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=50=C5=8Dtiki;=4D=C4=81ui;;;',
    'EMAIL:maui@example.co.nz',
    'TEL:+64212223333',
    'END:VCARD',
  ].join('\r\n');

  const result = parseVCF(vcf);
  assert(result.contacts.length === 1, 'one contact parsed');
  assert(
    result.contacts[0].name === 'Māui Pōtiki',
    `name decoded to "Māui Pōtiki" (got "${result.contacts[0].name}")`
  );
  assert(result.contacts[0].email === 'maui@example.co.nz', 'email imported alongside macron name');

  // Also test a pure plain UTF-8 vCard 4.0 with macrons (no QP encoding)
  const utf8Vcf = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'FN:Tūhoe Rangi',
    'EMAIL:tuhoe@example.co.nz',
    'END:VCARD',
  ].join('\r\n');
  const utf8Result = parseVCF(utf8Vcf);
  assert(
    utf8Result.contacts[0]?.name === 'Tūhoe Rangi',
    `plain UTF-8 macron name preserved (got "${utf8Result.contacts[0]?.name}")`
  );
}

// ---------------------------------------------------------------------------
// Assertion 5: Skip contacts with no email AND no phone
// ---------------------------------------------------------------------------
section('Assertion 5: skip contacts with no email AND no phone');
{
  const vcf = [
    // Valid contact
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Good Contact',
    'EMAIL:good@example.com',
    'END:VCARD',
    // Skippable: no email, no phone
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:No Contact Info',
    'END:VCARD',
    // Another valid contact
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Phone Only',
    'TEL:021 999 8888',
    'END:VCARD',
  ].join('\r\n');

  const result = parseVCF(vcf);
  assert(result.totalFound === 3, `3 vCards found (got ${result.totalFound})`);
  assert(result.contacts.length === 2, `2 contacts kept (got ${result.contacts.length})`);
  assert(result.skippedCount === 1, `1 contact skipped (got ${result.skippedCount})`);
  assert(
    result.contacts.find((c) => c.name === 'Good Contact') !== undefined,
    'kept contact with email only'
  );
  assert(
    result.contacts.find((c) => c.name === 'Phone Only') !== undefined,
    'kept contact with phone only'
  );
  assert(
    result.contacts.find((c) => c.name === 'No Contact Info') === undefined,
    'dropped contact with no email or phone'
  );
}

// ---------------------------------------------------------------------------
// Assertion 6: Multi-value EMAIL with PREF preference
// ---------------------------------------------------------------------------
section('Assertion 6: multi-value EMAIL — PREF wins');
{
  // PREF declared via TYPE=PREF on the second email
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Multi Email',
    'EMAIL;TYPE=WORK:work@example.com',
    'EMAIL;TYPE=HOME,PREF:home@example.com',
    'EMAIL;TYPE=OTHER:other@example.com',
    'END:VCARD',
  ].join('\r\n');

  const result = parseVCF(vcf);
  assert(result.contacts.length === 1, 'one contact parsed');
  assert(
    result.contacts[0].email === 'home@example.com',
    `PREF email selected (got ${result.contacts[0].email})`
  );

  // No PREF → first-listed wins
  const vcf2 = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:No Pref',
    'EMAIL;TYPE=WORK:first@example.com',
    'EMAIL;TYPE=HOME:second@example.com',
    'END:VCARD',
  ].join('\r\n');
  const result2 = parseVCF(vcf2);
  assert(
    result2.contacts[0].email === 'first@example.com',
    `without PREF, first-listed wins (got ${result2.contacts[0].email})`
  );

  // Multi-value TEL with PREF
  const vcf3 = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Multi Phone',
    'TEL;TYPE=WORK:021 111 1111',
    'TEL;TYPE=CELL,PREF:022 222 2222',
    'END:VCARD',
  ].join('\r\n');
  const result3 = parseVCF(vcf3);
  assert(
    result3.contacts[0].phone === '+64222222222',
    `PREF phone selected and normalised (got ${result3.contacts[0].phone})`
  );
}

// ---------------------------------------------------------------------------
// Assertion (bonus): N-only fallback when FN missing
// ---------------------------------------------------------------------------
section('Bonus: N field fallback when FN missing');
{
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Brown;Charlie;;;',
    'EMAIL:charlie@example.com',
    'END:VCARD',
  ].join('\r\n');
  const result = parseVCF(vcf);
  assert(result.contacts.length === 1, 'contact parsed from N field only');
  assert(
    result.contacts[0].name === 'Charlie Brown',
    `assembled as "Charlie Brown" (got "${result.contacts[0].name}")`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
process.stdout.write(`\n──────────────────────────\n`);
process.stdout.write(`Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
