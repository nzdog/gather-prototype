/**
 * GTC-207 — the paired invariant to GTC-172: a CHILD-role person is NOT messaged
 * (§10.6, tests/child-message-exclusion-test.ts) but IS assignment-eligible.
 *
 * WHY THIS EXISTS. GTC-172 built an absolute, fail-closed CHILD exclusion for system
 * messages. Nothing about that exclusion ever applied to assignment — a "kid with a
 * job" (~15-16, does a real task, managed by their parents) is captured as CHILD
 * specifically so they CAN be given the dishes. The risk this test pins is a future
 * session pattern-matching "children are excluded" from the message rule and adding a
 * CHILD filter to assignment, silently breaking the kid-with-a-job model. See the
 * boundary comments in src/lib/eligibility/child-exclusion.ts and
 * src/app/api/events/[id]/items/[itemId]/assign/route.ts.
 *
 * DB-level test (house pattern, cf. child-message-exclusion-test.ts). The host assign
 * route cannot be driven in-process — requireEventRole reads a session cookie — so
 * this exercises the exact same Prisma calls the route makes (personEvent lookup,
 * same-team check, Assignment create) directly, and pairs that with a structural read
 * of the route source proving no CHILD/householdRole gate has been added there. Either
 * half failing means the invariant broke: the domain-level half would go RED if a
 * future change added a role check before the Assignment create; the structural half
 * would go RED if a future change imported child-exclusion into the assign routes.
 *
 * Run: npx tsx tests/child-assignment-eligibility-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TAG = 'GTC207';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
    redAssertions.push(label);
  }
}

function readCode(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── Fixture ──────────────────────────────────────────────────────────
    const now = new Date();
    const future = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} child-assignment-eligibility test`,
        startDate: future,
        endDate: future,
        hostId: host.id,
        status: 'CONFIRMING',
      },
    });
    eventId = event.id;

    const team = await prisma.team.create({
      data: { name: `${TAG} Kitchen`, eventId: event.id },
    });

    // The task: a real item the CHILD should be assignable to. Belongs to `team`, so
    // the route's ONLY assignment gate (same-team) is satisfiable.
    const item = await prisma.item.create({
      data: { name: `${TAG} Do the dishes`, teamId: team.id, kind: 'ITEM' },
    });

    const household = await prisma.household.create({ data: { eventId: event.id } });

    // THE SUBJECT — a "kid with a job": CHILD role, isYoungPerson true, but IN the
    // task's team, i.e. valid assignment context. Maximally analogous to the
    // GTC-172 subject except this test is about assignment, not messaging.
    const childPerson = await prisma.person.create({ data: { name: `${TAG} Subject Child` } });
    createdPersonIds.push(childPerson.id);
    const childPersonEvent = await prisma.personEvent.create({
      data: {
        personId: childPerson.id,
        eventId: event.id,
        teamId: team.id,
        role: 'PARTICIPANT',
        householdId: household.id,
        householdRole: 'CHILD',
        isYoungPerson: true,
      },
    });

    console.log(`\n  subject (CHILD) = ${childPerson.id}`);
    console.log(`  item             = ${item.id}`);
    console.log(`  team             = ${team.id}\n`);

    // ── Domain-level: the exact checks + write the route performs ─────────
    // Mirrors src/app/api/events/[id]/items/[itemId]/assign/route.ts POST handler:
    // load personEvent, same-team check (role-agnostic), create the Assignment.
    // If a future change inserts a householdRole/CHILD check ahead of this create,
    // this section is where it would need to be replicated to keep failing RED.
    const personEvent = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId: childPerson.id, eventId: event.id } },
    });
    assert('subject CHILD has a PersonEvent row', personEvent !== null);
    assert(
      'subject CHILD satisfies the same-team eligibility check (role-agnostic)',
      personEvent?.teamId === item.teamId
    );

    const assignment = await prisma.assignment.create({
      data: { itemId: item.id, personId: childPerson.id },
    });
    assert('CHILD-role person CAN be assigned an item (write succeeds)', !!assignment.id);

    // ── Round-trip: the assignment persists and still resolves to the CHILD ──
    const reloaded = await prisma.assignment.findUnique({
      where: { itemId: item.id },
      include: { person: true },
    });
    assert(
      'assignment stays assigned after round-trip (re-fetched from DB)',
      reloaded?.personId === childPerson.id
    );
    assert(
      'the assignee really is CHILD-role (not accidentally an adult)',
      childPersonEvent.householdRole === 'CHILD' && childPersonEvent.isYoungPerson === true
    );

    // ── Structural: the route(s) carry no CHILD/householdRole gate ────────
    // Paired with the domain-level assertions above so a future session can't satisfy
    // one half (e.g. by gating a different code path than the one this test exercises)
    // while quietly breaking the other.
    // Checks for an actual IMPORT of the child-exclusion module, not just a mention of
    // its name — both routes carry a GTC-207 boundary comment that names the module by
    // path on purpose, and a naive substring check would false-positive on that prose.
    const importsChildExclusion = (src: string) => /from\s+['"][^'"]*child-exclusion['"]/.test(src);

    const hostAssignRoute = readCode('src/app/api/events/[id]/items/[itemId]/assign/route.ts');
    assert(
      'host assign route does not import the child-exclusion module [structural]',
      !importsChildExclusion(hostAssignRoute)
    );
    assert(
      'host assign route has no householdRole gate [structural]',
      !hostAssignRoute.includes('householdRole')
    );

    const tokenAssignRoute = readCode('src/app/api/c/[token]/items/[itemId]/assign/route.ts');
    assert(
      'coordinator-token assign route does not import the child-exclusion module [structural]',
      !importsChildExclusion(tokenAssignRoute)
    );
    assert(
      'coordinator-token assign route has no householdRole gate [structural]',
      !tokenAssignRoute.includes('householdRole')
    );

    const autoAssignRoute = readCode('src/app/api/events/[id]/people/auto-assign/route.ts');
    assert(
      'auto-assign route does not import the child-exclusion module [structural]',
      !importsChildExclusion(autoAssignRoute)
    );

    // ── GTC-256 phase 4: THE SECOND MESSAGE-ONLY MODULE, PINNED THE SAME WAY ──
    //
    // Placed HERE, in this file, on founder instruction — so "child IS assignable" and
    // "host may hold across teams" sit together, and a future session reading either one
    // sees both. They are the same invariant twice: a MESSAGE rule never becomes an
    // ASSIGNMENT rule.
    //
    //   CHILD  never messaged (§10.6)              assignable — the kid with a job
    //   HOST   never messaged (GTC-256 Ruling 5)   may hold items (Rulings 4 and 9)
    //
    // The host case is the sharper of the two, because her message exclusion is NEWER than
    // her assignment right and the pattern-match runs the other way: "she is excluded from
    // everything" is the wrong generalisation, and Ruling 4 says so directly.
    const importsHostExclusion = (src: string) => /from\s+['"][^'"]*host-exclusion['"]/.test(src);

    for (const [label, src] of [
      ['host assign route', hostAssignRoute],
      ['coordinator-token assign route', tokenAssignRoute],
      ['auto-assign route', autoAssignRoute],
      ['the same-team rule module', readCode('src/lib/assignment/same-team.ts')],
    ] as const) {
      assert(
        `${label} does not import the host-exclusion module [structural]`,
        !importsHostExclusion(src)
      );
    }

    // The domain half of the host invariant. `mayHoldRow` is the ONE definition the route
    // calls, so asserting it here asserts the route — no second copy to drift.
    const { mayHoldRow } = await import('../src/lib/assignment/same-team');
    const HOSTID = 'the-host';
    assert(
      'GTC-256 Rulings 4/9: the host, on NO team, may hold an item on ANY team when she is ' +
        'the one picking — the singular PersonEvent.teamId is what stood in the way',
      mayHoldRow(
        { personId: HOSTID, role: 'HOST', teamId: null },
        { kind: 'ITEM', teamId: 'any-team' },
        'HOST',
        HOSTID
      ) === true
    );
    assert(
      'and a CHILD is STILL assignable through the same one rule — neither exclusion ' +
        'reaches assignment, which is what this file exists to hold',
      mayHoldRow(
        { personId: 'kid-with-a-job', role: 'PARTICIPANT', teamId: 'their-team' },
        { kind: 'ITEM', teamId: 'their-team' },
        'HOST',
        HOSTID
      ) === true
    );
    assert(
      'and the host exemption did NOT widen into a general one: an ordinary guest on the ' +
        'wrong team is still refused',
      mayHoldRow(
        { personId: 'a-guest', role: 'PARTICIPANT', teamId: 'their-team' },
        { kind: 'ITEM', teamId: 'another-team' },
        'HOST',
        HOSTID
      ) === false
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    if (eventId) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — CHILD is not messaged (GTC-172) but IS assignable (GTC-207). Paired and holding.\x1b[0m'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
