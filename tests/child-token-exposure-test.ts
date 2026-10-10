/**
 * GTC-316 — the press mints a guest link for every child, and the directory publishes it.
 *
 * Issuance keys on `PersonEvent.role`; childness lives on `PersonEvent.householdRole`; step 4 never
 * reads it. So all 60 CHILD memberships in `gather_dev` are admitted, and
 * `GET /api/gather/[eventId]/directory` — unauthenticated, keyed on the event id alone — publishes
 * the token. It is [[GTC-262]]'s shape one role down: a credential that is never sent, published
 * anyway.
 *
 * ── UNKNOWN 1 RULED: WITHHOLD **AND** REVOKE ──────────────────────────────────
 *
 * Founder ruling, 2026-09-19: *"a token already minted is already published, so withholding alone
 * leaves every child currently holding one exposed and fixes only the future. Three exist in
 * gather_dev today and all three are lapsed, so the live cost is nil — which is exactly the moment
 * to take a one-way door, not after 5f makes it fifty-seven."*
 *
 * ⚠ THE REVOCATION RIDES ISSUANCE, WHICH IS [[GTC-256]] PHASE 3'S EXACT SHAPE — a `deleteMany`
 * inside `ensureEventTokens`, structurally symmetric with the COORDINATOR prune and the HOST sweep
 * beside it. No migration, no separate sweep, nothing wider in issuance semantics.
 *
 * ⚠ AND IT IS THEREFORE LAZY, WHICH IS NAMED RATHER THAN HIDDEN: a stale child token survives until
 * `ensureEventTokens` next runs on that event. What closes the EXPOSURE immediately is the
 * publication half — once the directory stops emitting a child's token, the rows stop mattering
 * whether or not they have been deleted yet. Both halves are here for that reason.
 *
 * ── ⚠ THE TRAP THIS SUITE EXISTS TO HOLD, AND IT IS MEASURED ──────────────────
 *
 * `child-exclusion.ts` documents why its gate is an ALLOWLIST and not `{ not: 'CHILD' }`: *"it
 * sidesteps SQL three-valued logic. `NOT (col = 'CHILD')` is NULL — not true"* for a NULL
 * `householdRole`.
 *
 * **Measured in `gather_dev`, 2026-09-19: 99 of 335 memberships have `householdRole: null`, and
 * `{ not: 'CHILD' }` matches only 176 of 335.** So the obvious filter silently removes 99 ADULTS
 * from the directory and from token issuance — the fix quietly becoming a worse defect than the one
 * it closes. Layer N holds it both ways.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 for the directory's HTTP assertions.
 *
 * Run: npx tsx tests/child-token-exposure-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC316';
const BASE = 'http://localhost:3000';

const TOKENS = 'src/lib/tokens.ts';
const EXPOSURE = 'src/lib/eligibility/shared-link-exposure.ts';
const CHILD = 'src/lib/eligibility/child-exclusion.ts';
const DIRECTORY = 'src/app/api/gather/[eventId]/directory/route.ts';
const CLAIM = 'src/app/api/join/[token]/claim/route.ts';

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

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    section('Layer 0: controls');

    const health = await fetch(`${BASE}/api/events`);
    assert('CONTROL: the dev server answers 401 with no cookie', health.status === 401);
    assert(
      'CONTROL: the file reader really reads',
      read(TOKENS).length > 0 && read('src/lib/nope.ts') === ''
    );
    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* householdRole */ const a = 1;').includes('householdRole') === false
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    async function person(name: string) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase()}+${stamp}@example.com`,
        },
      });
      createdPersonIds.push(p.id);
      return p;
    }

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const kid = await person('Kid');
    const staleKid = await person('StaleKid');
    const adultInHousehold = await person('AdultInHousehold');
    const adultNoHousehold = await person('AdultNoHousehold');
    const coordinator = await person('Coordinator');

    const event = await prisma.event.create({
      data: {
        name: `${TAG} child tokens`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);
    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });
    const household = await prisma.household.create({ data: { eventId: event.id } });

    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: event.id, role: 'HOST' },
    });
    const peAdult = await prisma.personEvent.create({
      data: {
        personId: adultInHousehold.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: household.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    await prisma.household.update({
      where: { id: household.id },
      data: { contactPersonEventId: peAdult.id },
    });
    /*
     * ⚠ NO householdRole AT ALL — this is the 99-row population the NULL trap would delete. It is
     * in the fixture on purpose, and layer N is where it earns its place.
     */
    await prisma.personEvent.create({
      data: { personId: adultNoHousehold.id, eventId: event.id, role: 'PARTICIPANT' },
    });
    await prisma.personEvent.create({
      data: {
        personId: kid.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: household.id,
        householdRole: 'CHILD',
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: staleKid.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: household.id,
        householdRole: 'CHILD',
      },
    });
    await prisma.personEvent.create({
      data: { personId: coordinator.id, eventId: event.id, role: 'COORDINATOR', teamId: team.id },
    });
    for (const p of [adultInHousehold, adultNoHousehold, kid, staleKid, coordinator]) {
      const item = await prisma.item.create({
        data: { name: `${TAG} ${p.name} dish`, teamId: team.id, status: 'ASSIGNED' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: 'PENDING' },
      });
    }

    /*
     * A STALE CHILD TOKEN, planted so the REVOKE half has something to revoke. This is the state
     * GTC-316 measured three of in `gather_dev` — minted by an earlier `ensureEventTokens` call and
     * never taken away, because nothing revoked one.
     */
    await prisma.accessToken.create({
      data: {
        token: `${TAG}-stale-child-${stamp}`,
        scope: 'PARTICIPANT',
        personId: staleKid.id,
        eventId: event.id,
        teamId: null,
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
    });

    section('Layer 0b: the fixture holds one of every case the gate must tell apart');
    assert(
      'CONTROL: a stale CHILD token exists before issuance runs — so the revoke half is exercised ' +
        'rather than asserted of an empty set',
      (await prisma.accessToken.count({
        where: { eventId: event.id, personId: staleKid.id, scope: 'PARTICIPANT' },
      })) === 1
    );

    const { ensureEventTokens } = await import('../src/lib/tokens');
    await ensureEventTokens(event.id);

    const tokenCount = async (personId: string) =>
      prisma.accessToken.count({
        where: { eventId: event.id, personId, scope: 'PARTICIPANT' },
      });

    // ── Layer W: withhold ────────────────────────────────────────────────
    section('Layer W: a CHILD membership is issued no PARTICIPANT token');

    assert(
      '⚠ THE CHILD GETS NO TOKEN, though its PersonEvent.role is PARTICIPANT like every other ' +
        'child in the database — issuance now reads householdRole, which step 4 never did',
      (await tokenCount(kid.id)) === 0
    );

    // ── Layer V: revoke ──────────────────────────────────────────────────
    section('Layer V: and a stale one is REVOKED, not merely not re-issued');

    assert(
      '⚠ THE STALE CHILD TOKEN IS GONE. Founder ruling: "a token already minted is already ' +
        'published, so withholding alone leaves every child currently holding one exposed and fixes ' +
        'only the future." GTC-256 build decision 3\'s rule, one role down: declining to issue is ' +
        'construction-deep only while none exists, and three existed',
      (await tokenCount(staleKid.id)) === 0
    );

    // ── Layer A: the adjacent cases, and the NULL trap ───────────────────
    section('Layer A: every adult still gets theirs — including the ones with no household');

    assert(
      'an adult in a household is issued a PARTICIPANT token exactly as before',
      (await tokenCount(adultInHousehold.id)) === 1
    );
    assert(
      '⚠ AND SO IS AN ADULT WITH NO householdRole AT ALL. This is the 99-of-335 population in ' +
        "`gather_dev` that `{ not: 'CHILD' }` silently deletes, because NOT(NULL = 'CHILD') is " +
        'NULL and not true. The fix quietly becoming a worse defect than the one it closes',
      (await tokenCount(adultNoHousehold.id)) === 1
    );
    assert(
      "⚠ AND GTC-294's STEP 4b SURVIVES: the coordinator keeps a PARTICIPANT token beside her " +
        'COORDINATOR one, because "the job should not cost them the ask"',
      (await tokenCount(coordinator.id)) === 1
    );
    assert(
      '⚠ AND GTC-256 RULING 5 IS UNTOUCHED: the host holds none',
      (await tokenCount(hostPerson.id)) === 0
    );

    // ── Layer D: the directory ───────────────────────────────────────────
    section('Layer D: the unauthenticated directory publishes no child');

    const dirRes = await fetch(`${BASE}/api/gather/${event.id}/directory`);
    const dir = await dirRes.json();
    assert(
      'CONTROL: the directory answers 200 with no cookie at all — it is the unauthenticated ' +
        'surface this is about, and the assertions below read a real payload',
      dirRes.status === 200 && Array.isArray(dir.people)
    );
    const names = (dir.people ?? []).map((p: any) => p.name as string);
    assert(
      "⚠ THE CHILD IS NOT IN THE DIRECTORY AT ALL — filtered IN THE QUERY, which is GTC-262's own " +
        'precedent and its stated reason: "restricting leaves the mechanism standing as dead code, ' +
        'and the dead code is the mechanism"',
      !names.some((n: string) => n.includes('Kid'))
    );
    assert(
      '⚠ AND EVERY ADULT IS STILL THERE, the no-household one included — the NULL trap again, on ' +
        'the surface where it would have been a silent deletion rather than a missing token',
      names.some((n: string) => n.includes('AdultInHousehold')) &&
        names.some((n: string) => n.includes('AdultNoHousehold')) &&
        names.some((n: string) => n.includes('Coordinator'))
    );
    assert(
      'and the host is still absent, as GTC-256 phase 3 left her',
      !names.some((n: string) => n.includes('Kate'))
    );
    const emitted = JSON.stringify(dir);
    assert(
      "⚠ AND NO CHILD'S TOKEN IS ANYWHERE IN THE PAYLOAD — asserted over the whole response body " +
        'rather than over the mapped rows, because the defect was a token riding a row nobody ' +
        'looked at',
      !emitted.includes(`${TAG}-stale-child-${stamp}`)
    );

    // ── Layer C: the claim route ──────────────────────────────────────────
    section('Layer C: the claim gate refuses a child row');

    let exposure: any = null;
    try {
      exposure = await import('../src/lib/eligibility/shared-link-exposure');
    } catch {
      exposure = null;
    }
    assert(
      '⚠ THE CLAIM PREDICATE READS householdRole AS WELL AS role. A role-only check admits every ' +
        "child, because every child's PersonEvent.role is PARTICIPANT",
      ok(
        () =>
          exposure.isClaimableMembership({ role: 'PARTICIPANT', householdRole: 'CHILD' }) === false
      )
    );
    assert(
      'an ordinary participant is still claimable, with a household role and without one',
      ok(
        () =>
          exposure.isClaimableMembership({
            role: 'PARTICIPANT',
            householdRole: 'PRIMARY_CONTACT',
          }) === true &&
          exposure.isClaimableMembership({ role: 'PARTICIPANT', householdRole: null }) === true
      )
    );
    assert(
      'and a coordinator and a host are still refused — GTC-262 unnarrowed',
      ok(
        () =>
          exposure.isClaimableMembership({ role: 'COORDINATOR', householdRole: null }) === false &&
          exposure.isClaimableMembership({ role: 'HOST', householdRole: null }) === false
      )
    );
    assert(
      'the claim route calls the membership predicate, so the refusal is reachable and not merely ' +
        'defined',
      stripComments(read(CLAIM)).includes('isClaimableMembership')
    );

    // ── Layer N: the NULL trap, structurally ─────────────────────────────
    section('Layer N: nothing anywhere filters children with { not: CHILD }');

    for (const [path, src] of [
      [TOKENS, stripComments(read(TOKENS))],
      [EXPOSURE, stripComments(read(EXPOSURE))],
      [DIRECTORY, stripComments(read(DIRECTORY))],
      [CLAIM, stripComments(read(CLAIM))],
    ] as const) {
      assert(
        `⚠ ${path.replace('src/', '')} uses no NULL-unsafe child filter — NOT(NULL = 'CHILD') is ` +
          'NULL, so 99 of 335 memberships would vanish',
        src.length > 0 && !/not:\s*'CHILD'/.test(src) && !/!==\s*'CHILD'/.test(src)
      );
    }
    assert(
      'CONTROL: the NULL-unsafe matcher really matches — asserted against planted sources, because ' +
        'an absence found by a broken pattern is the shape slice 4a got wrong',
      /not:\s*'CHILD'/.test("householdRole: { not: 'CHILD' }") &&
        /!==\s*'CHILD'/.test("if (r !== 'CHILD')")
    );
    assert(
      '⚠ AND CHILDNESS IS DEFINED IN ONE PLACE — child-exclusion.ts, where it already lives. Two ' +
        'readings of "is this a child" is the drift this ledger keeps catching',
      read(CHILD).includes('NON_CHILD') || read(CHILD).includes('isChildMembership')
    );

    // ── Layer Z: what must not have moved ────────────────────────────────
    section('Layer Z: the neighbours are untouched');

    const tokensSrc = stripComments(read(TOKENS));
    assert("GTC-256's HOST revocation is still there", tokensSrc.includes('hostRowPersonIds'));
    assert(
      "GTC-294's step 4b is still there, keyed on the role",
      tokensSrc.includes("pe.role === 'COORDINATOR'")
    );
    assert(
      '⚠ AND `isMessageableRole` IS NOT IMPORTED INTO ISSUANCE OR PUBLICATION. GTC-207 fences it as ' +
        'MESSAGE-ONLY, and neither minting a credential nor publishing one is messaging — the ' +
        'question here is what a stranger may be handed, not who may be written to',
      !tokensSrc.includes('isMessageableRole') &&
        !stripComments(read(EXPOSURE)).includes('isMessageableRole')
    );
    assert(
      'no schema and no migration is part of this fix',
      !fs.existsSync('prisma/migrations/.gtc316') &&
        !stripComments(read(TOKENS)).includes('prisma migrate')
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
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
