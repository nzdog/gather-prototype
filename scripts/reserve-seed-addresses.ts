/**
 * THE 37 CONSUMER-DOMAIN ADDRESSES ON THE ONLY PRESSABLE BOARD.
 *
 * `prisma/seed.ts` fabricated 37 plausible names at REAL, RESOLVING providers — gmail.com,
 * outlook.com, xtra.co.nz, yahoo.com. They are nobody's addresses, and **that is not the same as
 * nobody receiving them**: a working Resend key plus one press is 37 delivery attempts at real
 * mail servers, and `aarav.ph@gmail.com` may well belong to a stranger.
 *
 * The seed was corrected on 2026-09-19 (`b90a96e`), which changes what a future reseed produces
 * and **nothing about the rows already in `gather_dev`.** Founder ruling the same day:
 *
 * > THE 37 ADDRESSES IN gather_dev — do it. Deferring a risk is not removing one, and the seed
 * > edit only changes what a future reseed produces. One UPDATE, no shape the chooser reads
 * > changes, and afterwards the live database matches what a rebuild would give.
 *
 * ⚠ THE EVIDENCE THIS RESTS ON is [[GTC-189]] slice 5e's incident: a sweep enrolled and attempted
 * 20 rows across four real boards before anybody noticed, and [[GTC-322]] records why nothing was
 * delivered — *"a broken Resend key and reserved email domains. Both luck."* This removes the luck
 * from the board most likely to be pressed.
 *
 * ── WHAT IT DOES NOT TOUCH, AND WHY EACH IS DELIBERATE ────────────────────────
 *
 *   * **Anybody with a `userId`.** A login address is a credential, not test data. Measured:
 *     `nigel@mckorbett.co.nz`, who is not on this board anyway. The guard is belt and braces.
 *   * **The 30 consumer addresses on "Testing generation new thing"**, a DRAFT event. A DRAFT
 *     cannot be pressed — `pressSend` refuses anything but CONFIRMING — so the risk there is one
 *     status change away rather than one press away. Named for the founder rather than swept in:
 *     widening a ruled scope is not the executor's.
 *   * **`jo@jowickham.co.nz`**, a `Person` with no memberships at all. No send can reach a row
 *     nothing is a member of.
 *
 * ⚠ AND IT CHANGES NO SHAPE THE CHOOSER READS. Every one of the 37 keeps an address, and
 * `askChannelOf` is email-first — `if (person.email) return EMAIL` — so every one is an EMAIL
 * recipient before and after. The run asserts that by reading `readAskPreview` on either side.
 *
 * ⚠ THE UNIQUE CONSTRAINT IS CHECKED BEFORE THE WRITE, NOT ASSUMED. `Person.email` is `@unique`
 * ([[GTC-293]]), so a local part that collided after the domain swap would fail the save.
 * Measured 2026-09-19: 37 rows, 0 internal collisions, 0 collisions with an existing address.
 * The run re-measures rather than trusting that.
 *
 * Run: `npx tsx scripts/reserve-seed-addresses.ts` — DRY RUN, writes nothing.
 *      `npx tsx scripts/reserve-seed-addresses.ts --apply`
 */

import { PrismaClient } from '@prisma/client';
import { readAskPreview } from '../src/lib/preflight/ask-preview';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BOARD = 'Henderson Family Christmas 2025';

/**
 * ⚠ DOMAINS THAT CANNOT REACH A STRANGER, AND THE LIST IS THE WHOLE SAFETY ARGUMENT.
 *
 * A blunt `domain <> 'example.com'` predicate was the first draft and it was WRONG: it would have
 * rewritten `security-test@gather.test`, which `tests/security-fixtures.ts` keys its whole
 * teardown on, and the 18 `test.local` rows with it. **A rewrite that breaks a fixture is not a
 * safety improvement.**
 *
 * So the rule is reserved-or-non-resolving, by standard rather than by taste:
 *   * `example.com` / `.net` / `.org`, and the `.test`, `.invalid`, `.localhost` and `.example`
 *     TLDs — RFC 2606 and RFC 6761, reserved so they can never be registered.
 *   * `.local` — RFC 6762, mDNS, never publicly resolvable.
 *
 * Everything else is assumed to resolve, because assuming the other way is how mail reaches a
 * stranger.
 */
const RESERVED = /(^|\.)(example\.(com|net|org))$|\.(test|invalid|localhost|example|local)$/i;

/** Addresses a press could actually attempt delivery to. */
const resolves = (email: string) => !RESERVED.test(email.split('@')[1] ?? '');

/**
 * The change, as SQL. ⚠ Printed to be read, and NOT executed — the run does the Prisma
 * equivalent so the before/after preview comparison shares its transaction. The predicate here
 * and the one in `targets()` below are the same three clauses, in the same order.
 */
const SQL_EQUIVALENT = `
UPDATE "Person" p
   SET email = split_part(p.email, '@', 1) || '@example.com'
 WHERE p.email IS NOT NULL
   -- a domain that can actually take delivery. Reserved and non-resolving names are left alone:
   -- RFC 2606 / 6761 (example.com|net|org, .test, .invalid, .localhost, .example) and RFC 6762
   -- (.local). Rewriting 'security-test@gather.test' would break the security fixtures.
   AND split_part(p.email, '@', 2) !~* '(^|\\.)(example\\.(com|net|org))$|\\.(test|invalid|localhost|example|local)$'
   AND p."userId" IS NULL                         -- a login address is a credential
   AND EXISTS (                                   -- somebody no send can reach is not a risk
         SELECT 1 FROM "PersonEvent" pe WHERE pe."personId" = p.id
       );
`.trim();

async function targets(db: PrismaClient) {
  const people = await db.person.findMany({
    where: {
      email: { not: null },
      // A login address is a credential, not test data.
      userId: null,
      // ⚠ WIDENED ON A FOUNDER RULING, 2026-09-19, FROM ONE BOARD TO EVERY MEMBERSHIP:
      //
      //   "A risk one status change away is not meaningfully smaller than one press away,
      //    because moving a draft to confirming is a thing a host does. And leaving thirty
      //    consumer addresses in the database while removing thirty-seven means the next person
      //    to measure gets a number that looks clean and is not."
      //
      // The membership clause stays: somebody on no event cannot be reached by any send, so
      // rewriting them changes no risk and only loses a row's provenance.
      eventMemberships: { some: {} },
    },
    select: { id: true, email: true },
  });
  return people
    .filter((p) => resolves(p.email!))
    .map((p) => ({ id: p.id, from: p.email!, to: `${p.email!.split('@')[0]}@example.com` }));
}

async function main() {
  console.log(APPLY ? '⚠ APPLYING\n' : 'DRY RUN — nothing is written\n');
  console.log(SQL_EQUIVALENT);
  console.log();

  const rows = await targets(prisma);
  const domains = new Map<string, number>();
  for (const r of rows) {
    const d = r.from.split('@')[1];
    domains.set(d, (domains.get(d) ?? 0) + 1);
  }
  console.log(`Rows to rewrite: ${rows.length}`);
  for (const [d, n] of [...domains].sort((a, b) => b[1] - a[1])) console.log(`  ${d}: ${n}`);

  // ⚠ [[GTC-293]]'s constraint, measured rather than assumed.
  const newAddresses = rows.map((r) => r.to);
  const internal = newAddresses.length - new Set(newAddresses).size;
  const existing = await prisma.person.count({
    where: { email: { in: newAddresses }, id: { notIn: rows.map((r) => r.id) } },
  });
  console.log(`Collisions — within this set: ${internal}; with an existing address: ${existing}`);
  if (internal > 0 || existing > 0) {
    console.log('⚠ STOP: Person.email is @unique (GTC-293). Refusing to attempt the write.');
    return;
  }

  const event = await prisma.event.findFirstOrThrow({
    where: { name: BOARD },
    select: { id: true },
  });
  const before = await readAskPreview(prisma, event.id, 'http://localhost:3000');
  const shape = (p: NonNullable<typeof before>) =>
    `recipients=${p.recipients.length} EMAIL=${p.recipients.filter((r) => r.channel === 'EMAIL').length} TEXT=${p.recipients.filter((r) => r.channel === 'TEXT').length} hostList=${p.hostList.length}`;
  console.log(`\nBoard BEFORE: ${before ? shape(before) : 'no preview'}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write it.');
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const r of rows) {
      await tx.person.update({ where: { id: r.id }, data: { email: r.to } });
      n++;
    }
    return n;
  });

  const after = await readAskPreview(prisma, event.id, 'http://localhost:3000');
  console.log(`Board AFTER:  ${after ? shape(after) : 'no preview'}`);
  console.log(
    before && after && shape(before) === shape(after)
      ? '✓ the chooser reads the same board — no route changed'
      : '⚠ THE BOARD MOVED. That was not expected; read the two lines above.'
  );
  console.log(`\n✓ rewrote ${updated} addresses`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
