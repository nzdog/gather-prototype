/**
 * GTC-312 — a number she can see and Gather cannot use.
 *
 * Two phone columns. `Person.phoneNumber` is what every sender reads; `Person.phone` is
 * what one capture path wrote and what four server sites served to the screens. Thirty-five
 * people carried a usable `+64` number in the column nothing reads, and were shown it anyway.
 *
 * Built on the founder's rulings of 2026-09-18, recorded at GTC-312 Unknowns 1 and 3:
 *
 *   Unknown 1  UNIFY, DROP HELD BACK. Backfill `phoneNumber` from `phone`, fix the one
 *              writer, fix the display — and drop `Person.phone` in a SEPARATE later
 *              migration, once a production population has been measured. Widening the
 *              readers was refused: every sender already reads `phoneNumber`, so widening
 *              is the larger change and it leaves two columns meaning one thing.
 *   Unknown 3  GTC-312 FIRST, before [[GTC-189]] slice 5 (its decision 32) and before
 *              GTC-295. Fixing the column now makes `contactMethod` correct while it
 *              still exists.
 *
 * NOT HERE, by those rulings and by the ticket's Do-Not-Touch list: dropping `Person.phone`;
 * `PersonEvent.contactMethod`, which is GTC-295's; widening `isValidNZNumber` or
 * `normalizePhoneNumber`, which is GTC-300's.
 *
 * Layers
 *   W  the write path — no server site writes or serves the legacy column. Discovered by
 *      walking `src/`, not from a list, so a site added later is caught.
 *   N  normalisation at the API boundary — batch-import normalises rather than trusting
 *      its caller. `ImportCSVModal` already normalises client-side, which is why every
 *      stored legacy number is valid; the route is still reachable without it.
 *   B  the backfill — against gather_dev, on real rows.
 *   Z  Zone 7 — no `SmsOptOut` row stops matching a person as a result of the change.
 *   C  controls and absences — each passes before the fix as well as after. A layer that
 *      can only pass after the change proves nothing about the change.
 *
 * ⚠ Layer W is STRUCTURAL because `POST` in batch-import reads a session cookie and cannot
 * be driven in-process — the treatment layer H of `tests/item-kind-capture-test.ts` gives
 * the host routes, for the same reason.
 *
 * ⚠ `src/components/` is deliberately outside layer W's walk. `ImportCSVModal` stages its
 * own parsed-CSV objects under a `phone` key that is not a `Person` row, so a walk that
 * included it would report a legacy read that does not exist.
 *
 * Run: npx tsx tests/phone-column-unification-test.ts
 * Read-only against gather_dev. Creates and deletes nothing.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { normalizePhoneNumber, isValidNZNumber } from '../src/lib/phone';

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

/** Source with comments removed — the same guard as `readCode` in tests/security-validation.ts. */
function readCode(file: string): string {
  return fs
    .readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every .ts/.tsx under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SERVER_DIRS = [path.join(ROOT, 'src/app/api'), path.join(ROOT, 'src/lib')];
const serverFiles = SERVER_DIRS.flatMap(walk);
const rel = (f: string) => path.relative(ROOT, f);

async function main() {
  // ── W — the write path and the serialisers ─────────────────────────────────
  console.log('\n\x1b[33mLayer W — no server site writes or serves Person.phone\x1b[0m');

  const selectsLegacy = serverFiles.filter((f) => /\bphone:\s*true\b/.test(readCode(f)));
  assert(
    'W',
    'no Prisma select asks for the legacy column (`phone: true`)',
    selectsLegacy.length === 0,
    selectsLegacy.map(rel).join(', ')
  );

  const readsLegacy = serverFiles.filter((f) =>
    /\.person\.phone\b(?!Number)|\bperson\.phone\b(?!Number)/.test(readCode(f))
  );
  assert(
    'W',
    'no server site reads `.person.phone` off a Prisma row',
    readsLegacy.length === 0,
    readsLegacy.map(rel).join(', ')
  );

  const BATCH = path.join(ROOT, 'src/app/api/events/[id]/people/batch-import/route.ts');
  const batch = readCode(BATCH);
  assert('W', 'batch-import writes `phoneNumber`', /phoneNumber:/.test(batch));
  assert(
    'W',
    'batch-import no longer writes the legacy column',
    !/\bphone:\s*personData\.phone\b/.test(batch)
  );

  // ── N — normalisation at the API boundary ──────────────────────────────────
  console.log('\n\x1b[33mLayer N — the route normalises, it does not trust its caller\x1b[0m');

  assert(
    'N',
    'batch-import calls `normalizePhoneNumber`',
    /normalizePhoneNumber/.test(batch),
    'a raw "021 123 4567" from a direct API call would fail isValidNZNumber and be untextable'
  );

  // ── B — the backfill ───────────────────────────────────────────────────────
  console.log('\n\x1b[33mLayer B — the backfill, against gather_dev\x1b[0m');

  const orphaned = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "Person"
    WHERE phone IS NOT NULL AND "phoneNumber" IS NULL`;
  assert(
    'B',
    'no person carries a number ONLY in the column nothing reads',
    Number(orphaned[0].n) === 0,
    `${orphaned[0].n} still legacy-only`
  );

  const mismatched = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "Person"
    WHERE phone IS NOT NULL AND "phoneNumber" IS DISTINCT FROM phone`;
  assert(
    'B',
    'every legacy number is carried across verbatim',
    Number(mismatched[0].n) === 0,
    `${mismatched[0].n} rows disagree between the two columns`
  );

  /*
   * The finding this backfill produces without touching the column it is about.
   * Ruling C of [[GTC-189]] says of a batch-imported row: "Such a row says `SMS` and can
   * never be texted." GTC-312 measured that at 35 of 35. After the backfill the sentence
   * is false for every row in the database — and NOT ONE `contactMethod` VALUE WAS
   * REWRITTEN. The claim became true because the number became readable.
   */
  const lyingRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n
    FROM "PersonEvent" pe JOIN "Person" p ON p.id = pe."personId"
    WHERE pe."contactMethod" = 'SMS'
      AND (p."phoneNumber" IS NULL OR p."phoneNumber" !~ '^\\+64[0-9]{8,10}$')`;
  assert(
    'B',
    'no membership claims `SMS` for a person the senders cannot text',
    Number(lyingRows[0].n) === 0,
    `${lyingRows[0].n} rows say SMS and cannot be texted`
  );

  // ── Z — Zone 7 ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[33mLayer Z — Zone 7: no opt-out stops matching\x1b[0m');

  const optOutReach = await prisma.$queryRaw<Array<{ via_either: bigint; via_new: bigint }>>`
    SELECT
      count(*) FILTER (WHERE p.phone = o."phoneNumber" OR p."phoneNumber" = o."phoneNumber")::bigint AS via_either,
      count(*) FILTER (WHERE p."phoneNumber" = o."phoneNumber")::bigint AS via_new
    FROM "SmsOptOut" o JOIN "Person" p
      ON p.phone = o."phoneNumber" OR p."phoneNumber" = o."phoneNumber"`;
  const { via_either, via_new } = optOutReach[0];
  assert(
    'Z',
    'every opt-out that matched a person by either column still matches by `phoneNumber`',
    via_either === via_new,
    `${via_either} matched before, ${via_new} match now — an opt-out has gone silent`
  );

  // ── C — controls and absences ──────────────────────────────────────────────
  console.log('\n\x1b[33mLayer C — controls: each passes before the fix as well as after\x1b[0m');

  const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf-8');
  assert(
    'C',
    'CONTROL: `Person.phone` still exists — the drop is held back to its own migration',
    /^\s*phone\s+String\?/m.test(schema),
    'the column was dropped here; Unknown 1 ruled that a separate later migration'
  );

  for (const route of [
    'src/app/api/events/[id]/export-text/route.ts',
    'src/app/api/h/[token]/export-text/route.ts',
  ]) {
    const src = readCode(path.join(ROOT, route));
    assert(
      'C',
      `CONTROL: ${path.basename(path.dirname(path.dirname(route)))}/export-text still serves \`phoneNumber\``,
      /person\.phoneNumber/.test(src),
      'this path was already correct; pinning it so a later change cannot undo it quietly'
    );
  }

  assert(
    'C',
    'CONTROL: `normalizePhoneNumber` still lifts a local 021 number to +64',
    normalizePhoneNumber('021 123 4567') === '+64211234567'
  );
  assert(
    'C',
    'CONTROL: `isValidNZNumber` still rejects an unlifted local number — GTC-300 owns widening it',
    isValidNZNumber('0211234567') === false
  );
  /*
   * ⚠ THIS ASSERTION REPLACED A FALSE ONE, and the RED run is what caught it.
   * The first version asserted `contactMethod` was ABSENT from batch-import. It is not,
   * and it should not be: the route legitimately sets it at creation. An absence
   * assertion about a thing that is legitimately present fails for the right reason and
   * proves nothing. What this ticket must not do is REPAIR an existing value — so what
   * is pinned is the rule's OUTPUT, unchanged in both branches, while the column it
   * reads moved. `PersonEvent.contactMethod` itself stays [[GTC-295]]'s.
   */
  const reachRule = batch.slice(batch.indexOf('let reachabilityTier'));
  assert(
    'C',
    "CONTROL: batch-import still computes contactMethod 'SMS' on a number and 'EMAIL' on an address",
    /contactMethod = 'SMS'/.test(reachRule) && /contactMethod = 'EMAIL'/.test(reachRule),
    'the rule changed; this ticket may move which column it reads, not what it decides'
  );
  assert(
    'C',
    'ABSENCE: this ticket repairs no stored `contactMethod` — the value is never written to an existing row here',
    !/personEvent\.update\([\s\S]{0,400}contactMethod/.test(batch)
  );

  console.log(`\n\x1b[1m=== ${passed} passed, ${failed} failed ===\x1b[0m`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
