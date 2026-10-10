/**
 * GTC-325 — THE PRESS WRITES A ROW FOR THE PEOPLE IT DECIDED NOT TO MESSAGE.
 *
 * > YES, the press writes a withheld row for the host list. The reason: the outbound row is the
 * > record of what the press decided about a person, and deciding not to message someone is a
 * > decision about them. A population the press reasoned over and left no trace of is how the
 * > board and the press come to disagree, which is the defect this ticket has spent a week
 * > avoiding by construction.
 *
 * ── WHAT WAS BROKEN, AND IT IS THE WHOLE TICKET ───────────────────────────────
 *
 * Slice 7a reads the delivery fact OFF THE ROW, on a founder ruling, *"so the board and the press
 * cannot disagree by construction."* Ruling M's red is about *"a line on the host's list"*. **The
 * press wrote no row for a host-list person**, so `UNREACHABLE` fired for nobody: four people on
 * the one pressable board read AMBER — *with Gather* — about somebody Gather had already decided
 * it could not reach. The mechanism was right and the population was missing.
 *
 * ⚠ SO NOTHING IN SLICE 7a OR IN THE DRAIN CHANGES. `NO_CHANNEL` and its four siblings already map
 * to `UNREACHABLE`, waiting for a row that carries them. Layer U proves the red starts working
 * with no edit to the mapping at all, which is the point of the shape the founder chose.
 *
 * ── THE FOUR THINGS THIS HOLDS ────────────────────────────────────────────────
 *
 * 1 — THE ROW EXISTS, BORN FINISHED. `withheldAt` at creation, the chooser's OWN why-code, and a
 *   NULL channel — the founder refused `EMAIL` by convention and refused a `NONE` member by name.
 * 2 — THE DRAIN NEVER TOUCHES IT, and the refusal is a FENCE rather than a code path: the row is
 *   excluded by `findNeverAttempted`'s own predicate, AND `drainOnce` refuses a NULL channel
 *   rather than falling through to the text path — *"a NULL falling through would send a text to
 *   somebody the press decided had no channel at all."*
 * 3 — THE COUNTS STAY MESSAGE-COUNTS. The row count and the message count diverge here for the
 *   first time, and `recipientCount` and the ledger's `recipients` must go on meaning MESSAGES.
 * 4 — CHILDREN ARE EXCLUDED. A host-list line can be a child whose carrier route is closed, and
 *   that is GTC-325's **case 1, which the founder left OPEN**. Writing rows for them would answer
 *   it by building and would give children outbound rows for the first time, which several fences
 *   in this tree assert they do not have.
 *
 * ⚠ RUN IT AGAINST THE REHEARSAL CLONE, NOT `gather_dev`. The migration is HELD pending approval
 * (Zone 5: hold both the commit and the apply), so `gather_dev` still has `channel NOT NULL` and
 * every assertion here would fail against it for the right reason at the wrong time:
 *
 *   DATABASE_URL="postgresql://…/gather_gtc325_rehearsal" npx tsx tests/host-list-row-test.ts
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC325';

const PRESS = 'src/lib/press/press.ts';
const DISPATCH = 'src/lib/press/dispatch.ts';
const DELIVERY_FACT = 'src/lib/glance/delivery-fact.ts';
const SCHEMA = 'prisma/schema.prisma';

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
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function read(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const HOUR = 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];
  const stamp = Date.now();

  try {
    section('Layer 0: controls — the column, and the harness');

    const nullable = await prisma.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'OutboundMessage' AND column_name = 'channel'`
    );
    assert(
      '⚠ CONTROL, AND IT GATES EVERY ASSERTION BELOW: the database this suite is pointed at has ' +
        'the migration applied. Against an unmigrated `gather_dev` the press cannot write a NULL ' +
        'channel at all, and every failure below would be that fact wearing another name',
      nullable[0]?.is_nullable === 'YES'
    );
    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* a */ const b = 1;').includes('a') === false
    );
    assert('CONTROL: the file reader reads', read(PRESS).length > 0 && read('src/nope.ts') === '');

    let press: any = null;
    try {
      press = await import('../src/lib/press/press');
    } catch {
      press = null;
    }
    let dispatch: any = null;
    try {
      dispatch = await import('../src/lib/press/dispatch');
    } catch {
      dispatch = null;
    }
    let fact: any = null;
    try {
      fact = await import('../src/lib/glance/delivery-fact');
    } catch {
      fact = null;
    }

    // ── The fixture: one event with recipients AND a host list ───────────────
    const user = await prisma.user.create({
      data: { email: `${TAG.toLowerCase()}+host+${stamp}@example.com` },
    });
    createdUserIds.push(user.id);
    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Host`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} host-list fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: event.id, role: 'HOST' },
    });
    const team = await prisma.team.create({ data: { eventId: event.id, name: 'Mains' } });
    const household = await prisma.household.create({ data: { eventId: event.id } });

    async function member(
      name: string,
      opts: { email?: string | null; phone?: string | null; optedOut?: boolean; role?: string } = {}
    ) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email:
            opts.email === undefined
              ? `${TAG.toLowerCase()}+${name}+${stamp}@example.com`
              : opts.email,
          phoneNumber: opts.phone ?? null,
          smsOptedOut: opts.optedOut ?? false,
        },
      });
      createdPersonIds.push(person.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          householdId: household.id,
          householdRole: opts.role ?? 'GUEST',
        },
      });
      const item = await prisma.item.create({
        data: { teamId: team.id, name: `${name}'s dish`, kind: 'ITEM' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: person.id, response: 'PENDING' },
      });
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${name}-${stamp}`,
          scope: 'PARTICIPANT',
          eventId: event.id,
          personId: person.id,
        },
      });
      return { person, pe };
    }

    // Two who can be reached, three who cannot, one child whose carrier is unreachable.
    const reachable = await member('Reachable');
    const alsoReachable = await member('Alsoreachable');
    const noChannel = await member('Nochannel', { email: null, phone: null });
    const optedOut = await member('Optedout', {
      email: null,
      phone: '+64211234567',
      optedOut: true,
    });
    const aussie = await member('Aussie', { email: null, phone: '+61411234567' });
    const contact = await member('Contact', { email: null, phone: null, role: 'PRIMARY_CONTACT' });
    const child = await member('Childrow', { email: null, phone: null, role: 'CHILD' });
    await prisma.household.update({
      where: { id: household.id },
      data: { contactPersonEventId: contact.pe.id },
    });

    section('Layer P: the press writes a row for everybody it decided about');

    const outcome = press?.pressSend
      ? await press.pressSend(prisma, {
          eventId: event.id,
          actor: { id: hostPerson.id, kind: 'HOST', name: hostPerson.name },
          baseUrl: 'http://localhost:3000',
        })
      : { ok: false, code: 'MODULE_ABSENT' };
    assert(
      'the press succeeds on the fixture',
      ok(() => outcome.ok === true)
    );

    const rows = await prisma.outboundMessage.findMany({
      where: { eventId: event.id },
      select: {
        personEventId: true,
        channel: true,
        withheldAt: true,
        withheldWhy: true,
        attemptedAt: true,
        kind: true,
      },
    });
    const byPe = new Map(rows.map((r) => [r.personEventId, r]));

    assert(
      'the two reachable people get an addressed row, with a channel and no withholding',
      ok(() => {
        const a = byPe.get(reachable.pe.id);
        const b = byPe.get(alsoReachable.pe.id);
        return (
          a?.channel === 'EMAIL' &&
          a.withheldAt === null &&
          b?.channel === 'EMAIL' &&
          b.withheldAt === null
        );
      })
    );

    assert(
      '⚠ AND THE PEOPLE ON THE HOST LIST NOW GET A ROW AT ALL, which is the whole ticket: ' +
        'before this the press reasoned over them and left no trace',
      ok(
        () => !!byPe.get(noChannel.pe.id) && !!byPe.get(optedOut.pe.id) && !!byPe.get(aussie.pe.id)
      )
    );
    assert(
      'born FINISHED — `withheldAt` set at creation, never attempted, so the drain’s own ' +
        'predicate excludes them from the first tick',
      ok(() =>
        [noChannel.pe.id, optedOut.pe.id, aussie.pe.id].every((id) => {
          const r = byPe.get(id);
          return !!r && r.withheldAt !== null && r.attemptedAt === null;
        })
      )
    );
    assert(
      '⚠ CHANNEL IS NULL, WHICH IS A MEANING AND NOT AN ABSENCE: there was nobody to send to. ' +
        'The founder refused EMAIL by convention and refused a NONE member, in those words',
      ok(() =>
        [noChannel.pe.id, optedOut.pe.id, aussie.pe.id].every(
          (id) => byPe.get(id)?.channel === null
        )
      )
    );
    assert(
      '⚠ AND THE WHY IS THE CHOOSER’S OWN CODE, PASSED THROUGH RATHER THAN RE-DERIVED — three ' +
        'different people, three different true sentences, not one generic withholding',
      ok(
        () =>
          byPe.get(noChannel.pe.id)?.withheldWhy === 'NO_CHANNEL' &&
          byPe.get(optedOut.pe.id)?.withheldWhy === 'SMS_OPTED_OUT' &&
          byPe.get(aussie.pe.id)?.withheldWhy === 'PHONE_UNUSABLE'
      )
    );

    assert(
      '⚠ AND A CHILD GETS NO ROW. A host-list line can be a child whose carrier route is closed, ' +
        'and that is GTC-325’s case 1, which the founder left OPEN. Writing one would answer it ' +
        'by building, and would give children outbound rows for the first time',
      byPe.get(child.pe.id) === undefined
    );
    assert(
      'CONTROL: the child really was on the host list — their carrier holds no channel, so the ' +
        'row is absent by the exclusion rather than because the case never arose',
      ok(() => byPe.get(contact.pe.id)?.withheldWhy === 'NO_CHANNEL')
    );
    const hostRows = await prisma.outboundMessage.count({
      where: { eventId: event.id, personEvent: { personId: hostPerson.id } },
    });
    assert(
      'and the host herself still gets no row of any kind — GTC-256 ruling 5 is untouched, and ' +
        'she is not on the host list either: `readAskPreview` skips her on both sides',
      hostRows === 0
    );

    section('Layer C: the counts stay message-counts');

    const messageRows = rows.filter((r) => r.withheldAt === null).length;
    assert(
      '⚠ THE ROW COUNT AND THE MESSAGE COUNT DIVERGE HERE FOR THE FIRST TIME — the fixture is ' +
        'built so that they must, or the assertions below would pass on equal numbers',
      rows.length > messageRows
    );
    assert(
      '`recipientCount` is the MESSAGE count, not the row count',
      ok(() => outcome.recipientCount === messageRows)
    );
    const entry = await prisma.auditEntry.findFirst({
      where: { eventId: event.id, actionType: 'SEND_PRESSED' },
      select: { after: true },
    });
    assert(
      '⚠ AND SO IS THE LEDGER’S `recipients` — written inside the same transaction as the rows ' +
        'it counts (founder Q2), and still counting people messaged rather than rows written',
      ok(() => (entry?.after as { recipients?: number })?.recipients === messageRows)
    );

    section(
      'Layer D: the drain never touches them, and refuses a NULL rather than falling through'
    );

    const never = dispatch?.findNeverAttempted
      ? await dispatch.findNeverAttempted(prisma, 100)
      : [];
    const withheldIds = new Set([noChannel.pe.id, optedOut.pe.id, aussie.pe.id]);
    assert(
      'the never-attempted pass returns the addressed rows and NONE of the withheld ones — the ' +
        '`withheldAt: null` clause does it, with no new branch',
      ok(() => never.length > 0 && never.every((c: any) => !withheldIds.has(c.personEventId)))
    );
    const due = dispatch?.findDueForRetry ? await dispatch.findDueForRetry(prisma, 100) : [];
    assert(
      'and the retry pass returns none of them either — nothing ever sets `nextAttemptAt` on a ' +
        'row born finished',
      ok(() => due.every((c: any) => !withheldIds.has(c.personEventId)))
    );
    assert(
      '⚠ THE FENCE IS IN THE SOURCE, ABOVE THE CHANNEL BRANCH: `drainOnce` refuses a NULL rather ' +
        'than falling through to the text path. "A NULL falling through would send a text to ' +
        'somebody the press decided had no channel at all"',
      ok(() => {
        const src = stripComments(read(DISPATCH));
        const body = src.slice(src.indexOf('export async function drainOnce'));
        const guard = body.indexOf('if (!stored.channel) continue;');
        const quiet = body.indexOf('quietHoursDefers(');
        const emailBranch = body.indexOf("stored.channel === 'EMAIL'", guard);
        return guard > 0 && quiet > guard && emailBranch > guard;
      })
    );
    assert(
      'CONTROL: the two markers the guard is positioned against are really in that function, so ' +
        'the ordering assertion is an ordering and not two −1s',
      ok(() => {
        const src = stripComments(read(DISPATCH));
        const body = src.slice(src.indexOf('export async function drainOnce'));
        return body.includes('quietHoursDefers(') && body.includes("stored.channel === 'EMAIL'");
      })
    );

    section('Layer U: ruling M’s red starts firing, with no edit to the mapping');

    assert(
      '⚠ THE POINT OF THE SHAPE: slice 7a’s mapping is UNCHANGED and now sees these rows. ' +
        'NO_CHANNEL, SMS_OPTED_OUT and PHONE_UNUSABLE were already UNREACHABLE, waiting for a ' +
        'row that carried them',
      ok(
        () =>
          fact.WITHHELD_MEANS_UNREACHABLE.NO_CHANNEL === 'UNREACHABLE' &&
          fact.WITHHELD_MEANS_UNREACHABLE.SMS_OPTED_OUT === 'UNREACHABLE' &&
          fact.WITHHELD_MEANS_UNREACHABLE.PHONE_UNUSABLE === 'UNREACHABLE'
      )
    );
    const full = await prisma.outboundMessage.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        personEventId: true,
        createdAt: true,
        rejectedAt: true,
        withheldAt: true,
        withheldWhy: true,
        deliveryState: true,
      },
    });
    const latest = fact.latestRowByMembership(full);
    assert(
      '⚠ AND THE BOARD NOW READS UNREACHABLE FOR ALL THREE, where before the press wrote nothing ' +
        'and they read AMBER — "with Gather" — about a decision Gather had already made',
      ok(() =>
        [noChannel.pe.id, optedOut.pe.id, aussie.pe.id].every(
          (id) => fact.deliveryFactFrom(latest.get(id)).failure === 'UNREACHABLE'
        )
      )
    );
    assert(
      'CONTROL: and the addressed rows still read as no failure at all, so the assertion above ' +
        'is about the withheld rows and not about every row on the event',
      ok(() =>
        [reachable.pe.id, alsoReachable.pe.id].every(
          (id) => fact.deliveryFactFrom(latest.get(id)).failure === null
        )
      )
    );

    section('Layer S: the schema and the model say what they now mean');

    assert(
      'the column is nullable in the schema',
      ok(() => /channel\s+OutboundChannel\?/.test(read(SCHEMA)))
    );
    assert(
      '⚠ AND `OutboundChannel` GAINED NO THIRD MEMBER — the founder refused NONE by name, ' +
        'because it makes "no channel" a kind of channel',
      ok(() => {
        const src = read(SCHEMA);
        const body = src.slice(src.indexOf('enum OutboundChannel'));
        const block = body.slice(0, body.indexOf('}'));
        return block.includes('EMAIL') && block.includes('TEXT') && !/\bNONE\b/.test(block);
      })
    );
    assert(
      '⚠ AND THE PRESS NEVER WRITES A CHANNEL BY CONVENTION FOR A HOST-LIST ROW: the literal is ' +
        'null, not a string, in the branch that writes them',
      ok(() => {
        const src = stripComments(read(PRESS));
        const body = src.slice(src.indexOf('decidedAgainst'));
        return /channel:\s*null/.test(body) && !/channel:\s*'EMAIL'/.test(body);
      })
    );
    assert(
      'the docstring that equated rows with messages is corrected — the only place in the tree ' +
        'where the two were equated, and it was equated in prose rather than in arithmetic',
      ok(() => !/The number of `OutboundMessage` rows written/.test(read(PRESS)))
    );
    assert(
      'the mapping module is untouched by this ticket — no new entry, no widened value type',
      ok(() => {
        const src = read(DELIVERY_FACT);
        return src.includes("NO_CHANNEL: 'UNREACHABLE'") && !src.includes('GTC-325 adds');
      })
    );
  } finally {
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } }).catch(() => {});
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) process.exit(1);
  console.log(`\n\x1b[32m\x1b[1m✓ The press records what it decided\x1b[0m`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
