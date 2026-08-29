/**
 * GTC-256 (phase 3, commit 1) — the host's HOST magic link in the public directory.
 *
 * THE REGRESSION THIS PINS, AND IT IS A PHASE-2 ONE.
 *
 * `GET /api/gather/[eventId]/directory` is unauthenticated, keyed on the event id alone,
 * and iterates EVERY `PersonEvent` on the event, returning each person's access token and
 * a prefix for it — `h`, `c` or `p`. Before phase 2 the host had no `PersonEvent` on a
 * Moment-flow event, so she was not in that loop and her HOST token was not in the
 * response. Phase 2 gave her one (Rulings 1, 8, 10). Measured on 2026-08-29:
 *
 *   pre-capture   people=0                                     host present? false
 *   post-capture  Verify Host  tokenPrefix=h  token=0c0924b1…  host present? TRUE
 *
 * That is not a theoretical exposure. The V1 dashboard renders this URL under "Family
 * Directory Link" and tells the host "Share this single link with your whole family";
 * the page lists every returned person as a card under "Who are you?", and clicking one
 * routes to `/${tokenPrefix}/${token}`. So clicking the host's name signs the clicker in
 * AS THE HOST. Ruling 5 — "her name is not claimable through the shared link" — and
 * rather worse than a claim, because nothing is claimed: the link is simply handed over.
 *
 * Run: npx tsx tests/host-directory-exposure-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { createHostHousehold } from '../src/lib/households/hostHousehold';
import { ensureEventTokens } from '../src/lib/tokens';
import {
  isHostMembership,
  isAddressable,
  ADDRESSABLE_PERSON_EVENT,
} from '../src/lib/eligibility/host-exclusion';
import { GET as directoryGET } from '../src/app/api/gather/[eventId]/directory/route';

const prisma = new PrismaClient();

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

/** The route ignores its request argument, so the id in the params is the whole input. */
async function readDirectory(eventId: string) {
  const res = await directoryGET({} as any, { params: Promise.resolve({ eventId }) });
  return { status: res.status, body: (await res.json()) as any };
}

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: the predicate, before any database work ──────────────────
    //
    // Asserted first because everything below is one call site of it, and because the
    // TWO conditions are the whole of the design note in host-exclusion.ts: the FK is
    // load-bearing and the role is belt-and-braces.
    const HOST = 'host-person-id';

    assert(
      'Ruling 5: the row whose personId IS Event.hostId is the host — the durable half, ' +
        'which no route can write away',
      isHostMembership({ personId: HOST, role: 'PARTICIPANT' }, HOST) === true
    );
    assert(
      'Ruling 5: a row carrying role HOST is also the host — the belt-and-braces half, ' +
        'which covers Event.coHostId and clone/seed rows',
      isHostMembership({ personId: 'someone-else', role: 'HOST' }, HOST) === true
    );
    assert(
      'Ruling 5: and an ordinary guest is neither',
      isHostMembership({ personId: 'a-guest', role: 'PARTICIPANT' }, HOST) === false
    );
    assert(
      'Ruling 5: the role is optional — a caller that selected only personId still gets ' +
        'the Event.hostId half rather than a type error or a false negative',
      isHostMembership({ personId: HOST }, HOST) === true &&
        isHostMembership({ personId: 'a-guest' }, HOST) === false
    );
    assert(
      'isAddressable is the exact negation, so the two cannot drift',
      isAddressable({ personId: HOST }, HOST) === false &&
        isAddressable({ personId: 'a-guest' }, HOST) === true
    );

    const fragment = ADDRESSABLE_PERSON_EVENT(HOST);
    assert(
      'the SQL fragment excludes BOTH conditions with AND-of-negations, not Prisma NOT ' +
        '(which is NOT(a AND b) and would let a role-HOST row through)',
      JSON.stringify(fragment) ===
        JSON.stringify({ AND: [{ personId: { not: HOST } }, { role: { not: 'HOST' } }] })
    );

    // ── The fixture: an event exactly as phase 2 leaves one ───────────────
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: { email: `gtc256-dir+${stamp}@example.com` },
    });
    createdUserIds.push(user.id);

    const hostPerson = await prisma.person.create({
      data: {
        name: 'Kate Whittaker',
        email: user.email,
        phoneNumber: '+64211234567',
        userId: user.id,
      },
    });
    createdPersonIds.push(hostPerson.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const event = await prisma.event.create({
      data: {
        name: 'GTC-256 directory exposure test',
        startDate: start,
        endDate: start,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);

    // ── The control: BEFORE capture, she is not in the loop at all ────────
    //
    // This is what makes the exposure a phase-2 regression rather than a pre-existing
    // one on Moment-flow events, and it is asserted rather than asserted-in-prose.
    const before = await readDirectory(event.id);
    assert(
      'CONTROL: before phase-2 capture the host has no PersonEvent, so the directory ' +
        'cannot leak her — the loop has nothing to iterate',
      before.status === 200 && before.body.people.length === 0
    );

    await prisma.$transaction((tx) =>
      createHostHousehold(tx, {
        eventId: event.id,
        hostPersonId: hostPerson.id,
        sentAt: null,
        input: {
          alone: false,
          name: 'Kate Whittaker',
          phone: '021 123 4567',
          partner: {
            name: 'Sam Whittaker',
            email: `gtc256-dir-partner+${stamp}@example.com`,
            phone: '021 999 8888',
          },
        },
      })
    );

    const partner = await prisma.personEvent.findFirstOrThrow({
      where: { eventId: event.id, personId: { not: hostPerson.id } },
      include: { person: true },
    });
    createdPersonIds.push(partner.personId);

    await ensureEventTokens(event.id);

    const hostToken = await prisma.accessToken.findFirstOrThrow({
      where: { eventId: event.id, personId: hostPerson.id, scope: 'HOST' },
    });

    // ── THE FIX ───────────────────────────────────────────────────────────
    const after = await readDirectory(event.id);
    const people: Array<{
      id: string;
      name: string;
      token: string | null;
      tokenPrefix: string | null;
    }> = after.body.people;

    assert(
      'RULING 5: the host is not listed in the public directory — her name is not ' +
        'claimable through the shared link',
      people.every((p) => p.id !== hostPerson.id)
    );
    assert(
      'RULING 5: and her HOST token does not appear anywhere in the response, under any ' +
        'name — the token is the thing that grants access, so the assertion is on the ' +
        'token and not only on the row',
      !JSON.stringify(after.body).includes(hostToken.token)
    );
    assert(
      'no row in the response carries the HOST prefix, so nothing in this payload routes ' +
        'a clicker to /h/',
      people.every((p) => p.tokenPrefix !== 'h')
    );

    // ── The endpoint must still do its job ────────────────────────────────
    //
    // A directory that leaks nothing because it returns nothing is not a fix. The point
    // of the link is that the family can find themselves in it.
    assert(
      'the partner is still listed — the directory still works for the people it is for',
      people.some((p) => p.id === partner.personId)
    );
    assert(
      'and still carries her participant link, so the shared directory is still usable',
      people.find((p) => p.id === partner.personId)?.tokenPrefix === 'p' &&
        !!people.find((p) => p.id === partner.personId)?.token
    );
    assert(
      'the event envelope is unchanged — this fix narrows the people list and nothing else',
      after.body.event?.id === event.id && after.body.event?.name === event.name
    );
    assert(
      'and hostId — newly SELECTED so the filter can use it — is not emitted; the ' +
        'envelope is built field by field, and this asserts it stays that way',
      !('hostId' in (after.body.event ?? {}))
    );

    // ── The second condition, exercised against the database ──────────────
    //
    // A role-HOST row whose person is NOT Event.hostId: the co-host shape. The FK half of
    // the predicate cannot catch it, so this is the assertion that proves the role half
    // is doing work rather than being decorative.
    const coHostPerson = await prisma.person.create({
      data: { name: 'Co Host', email: `gtc256-dir-cohost+${stamp}@example.com` },
    });
    createdPersonIds.push(coHostPerson.id);
    await prisma.personEvent.create({
      data: { personId: coHostPerson.id, eventId: event.id, role: 'HOST' },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { coHostId: coHostPerson.id },
    });
    await ensureEventTokens(event.id);

    const withCoHost = await readDirectory(event.id);
    assert(
      'RULING 5, second condition: a role-HOST row whose person is NOT Event.hostId — ' +
        'the co-host — is excluded too, and her HOST token with her',
      withCoHost.body.people.every(
        (p: { id: string; tokenPrefix: string | null }) =>
          p.id !== coHostPerson.id && p.tokenPrefix !== 'h'
      )
    );

    // ── GTC-207's paired guard, in the mirror image ───────────────────────
    //
    // The child rule may never gate ASSIGNMENT; this module may never gate it either,
    // and for the opposite reason — Rulings 4 and 9 say the host MAY hold items. Asserted
    // structurally, the same way tests/child-assignment-eligibility-test.ts does, because
    // the failure it guards against is an import that type-checks perfectly.
    const fs = await import('fs');
    const assignmentPaths = [
      'src/app/api/events/[id]/items/[itemId]/assign/route.ts',
      'src/app/api/events/[id]/people/auto-assign/route.ts',
      'src/lib/auto-assign.ts',
    ];
    const leaked = assignmentPaths.filter(
      (p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('host-exclusion')
    );
    assert(
      'MESSAGE-ONLY: no assignment path imports host-exclusion — Ruling 4 says she may ' +
        "hold items, and Ruling 9 says auto-assign's existing role gate stays untouched",
      leaked.length === 0
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    for (const personId of createdPersonIds) {
      await prisma.person.deleteMany({ where: { id: personId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
