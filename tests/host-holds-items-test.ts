/**
 * GTC-256 (phase 4) — the host may hold items, and picks them herself.
 *
 * Ruling 4: "the host may hold items. She holds them SILENTLY: they appear on her own plan
 * rather than arriving as an ask."
 * Ruling 9: "the host holds items by an explicit toggle she controls. Off by default. The
 * system never assigns her anything… She opts in and chooses her own items."
 *
 * ── WHAT PHASE 4 TURNED OUT TO BE, AND WHAT IT DID NOT ────────────────────────
 *
 * Almost all of Ruling 9 was already true and needed no code:
 *
 *   the system never assigns her  auto-assign excludes her TWICE — `role: 'PARTICIPANT'`
 *                                 AND `id: notIn hostPersonEventIds`. Untouched.
 *   items appear on her plan      /api/h/[token] already returns every team's items with
 *                                 their named assignee. Free.
 *   no role gate on assignment    the assign route never refused her for BEING host.
 *
 * One thing was genuinely broken: `PersonEvent.teamId` is SINGULAR, and the host is on no
 * team, so the same-team rule let her reach task rows and nothing else. That is this phase.
 *
 * ⚠ "OFF BY DEFAULT" IS A STARTING STATE, NOT A STORED SETTING (founder, 2026-08-29). She
 * holds nothing until she picks; the affordance is a per-item "assign to me", always
 * available, never pre-selected. No column, no migration. That narrows the ticket's "three
 * switches" observation to two — see the ticket.
 *
 * Run: npx tsx tests/host-holds-items-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { createHostHousehold } from '../src/lib/households/hostHousehold';
import { ensureEventTokens } from '../src/lib/tokens';
import { mayHoldRow, isHostSelfPick } from '../src/lib/assignment/same-team';
import { findNudgeCandidatesForEvent } from '../src/lib/sms/nudge-eligibility';
import { findDecideByFollowupCandidates } from '../src/lib/sms/decide-by-eligibility';

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

const HOST = 'host-person-id';
const MAINS = 'team-mains';
const DESSERTS = 'team-desserts';

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: the rule as a pure function ─────────────────────────────
    const hostRow = { personId: HOST, role: 'HOST', teamId: null };
    const guestOnMains = { personId: 'a-guest', role: 'PARTICIPANT', teamId: MAINS };
    const guestNoTeam = { personId: 'another-guest', role: 'PARTICIPANT', teamId: null };
    const mainsItem = { kind: 'ITEM', teamId: MAINS };
    const dessertItem = { kind: 'ITEM', teamId: DESSERTS };
    const task = { kind: 'TASK', teamId: 'team-setup' };

    assert(
      'GTC-171 SURVIVES: an ordinary guest may hold an item on their OWN team',
      mayHoldRow(guestOnMains, mainsItem, 'HOST', HOST) === true
    );
    assert(
      'GTC-171 SURVIVES: and may NOT hold one on another team — the rule still scopes ' +
        'coordinators, which is what it is for',
      mayHoldRow(guestOnMains, dessertItem, 'HOST', HOST) === false
    );
    assert(
      'GTC-171 SURVIVES: a guest on NO team may still hold nothing',
      mayHoldRow(guestNoTeam, mainsItem, 'HOST', HOST) === false
    );
    assert(
      'GTC-171 SURVIVES: task rows are exempt for everybody — a task team can never have ' +
        'members, so gating them would make every task permanently unassignable',
      mayHoldRow(guestNoTeam, task, 'HOST', HOST) === true
    );

    assert(
      'RULING 4/9: the host, on no team, MAY hold an item — the singular teamId is what ' +
        'stood in the way, and she is deliberately on no team',
      mayHoldRow(hostRow, mainsItem, 'HOST', HOST) === true
    );
    assert(
      'RULING 4/9: and on ANY team, so her choice is not bounded to one of them',
      mayHoldRow(hostRow, dessertItem, 'HOST', HOST) === true
    );
    assert(
      'RULING 9, second half: a COORDINATOR gets no exemption — "she opts in and chooses ' +
        'her own items" is about who may place her, not only which rows',
      mayHoldRow(hostRow, mainsItem, 'COORDINATOR', HOST) === false
    );
    assert(
      'a COHOST does: a co-owner of the event is not "the system" — the system is ' +
        'auto-assign, which excludes her twice and is untouched',
      mayHoldRow(hostRow, dessertItem, 'COHOST', HOST) === true
    );
    assert(
      'the host is recognised by Event.hostId even on a row whose role was written away',
      isHostSelfPick({ personId: HOST, role: 'PARTICIPANT', teamId: null }, 'HOST', HOST) === true
    );
    assert(
      'and by role: HOST even when the person is not Event.hostId — the co-host shape',
      isHostSelfPick({ personId: 'someone', role: 'HOST', teamId: null }, 'HOST', HOST) === true
    );
    assert(
      'the exemption does not leak to an ordinary guest under host authority',
      isHostSelfPick(guestOnMains, 'HOST', HOST) === false
    );

    // ── The fixture ───────────────────────────────────────────────────────
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `gtc256-p4+${stamp}@example.com` } });
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

    const sentAt = new Date();
    sentAt.setDate(sentAt.getDate() - 10);
    const endDate = new Date();
    endDate.setTime(endDate.getTime() + 130 * 60 * 60 * 1000);

    const event = await prisma.event.create({
      data: {
        name: 'GTC-256 host-holds-items test',
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(event.id);

    await prisma.$transaction((tx) =>
      createHostHousehold(tx, {
        eventId: event.id,
        hostPersonId: hostPerson.id,
        sentAt,
        input: {
          alone: false,
          name: 'Kate Whittaker',
          phone: '021 123 4567',
          partner: {
            name: 'Sam Whittaker',
            email: `gtc256-p4-p+${stamp}@example.com`,
            phone: '021 999 8888',
          },
        },
      })
    );

    const hostPE = await prisma.personEvent.findUniqueOrThrow({
      where: { personId_eventId: { personId: hostPerson.id, eventId: event.id } },
    });
    const partnerPE = await prisma.personEvent.findFirstOrThrow({
      where: { eventId: event.id, personId: { not: hostPerson.id } },
    });
    createdPersonIds.push(partnerPE.personId);
    await ensureEventTokens(event.id);

    const mains = await prisma.team.create({ data: { eventId: event.id, name: 'Mains' } });
    const desserts = await prisma.team.create({ data: { eventId: event.id, name: 'Desserts' } });
    const setup = await prisma.team.create({
      data: { eventId: event.id, name: 'Set up', domain: 'SETUP' },
    });
    const ham = await prisma.item.create({
      data: { teamId: mains.id, name: 'The ham', kind: 'ITEM', critical: true },
    });
    const pav = await prisma.item.create({
      data: { teamId: desserts.id, name: 'The pavlova', kind: 'ITEM', critical: true },
    });
    const chairs = await prisma.item.create({
      data: { teamId: setup.id, name: 'Put out chairs', kind: 'TASK' },
    });

    // ── Against real rows: she holds across two teams at once ─────────────
    //
    // This is the shape the singular teamId made impossible, and it is asserted against
    // the database rather than the predicate so the Assignment rows are real.
    const hostSubject = {
      personId: hostPE.personId,
      role: hostPE.role,
      teamId: hostPE.teamId,
    };

    assert(
      'her membership carries teamId: null — the state everything below depends on',
      hostPE.teamId === null && hostPE.role === 'HOST'
    );

    const picks = [ham, pav, chairs].filter((i) =>
      mayHoldRow(hostSubject, { kind: i.kind, teamId: i.teamId }, 'HOST', event.hostId)
    );
    assert(
      'RULING 4: all three rows are hers to pick — two items on two DIFFERENT teams, plus ' +
        'a task. Before phase 4 only the task was reachable.',
      picks.length === 3
    );

    for (const item of picks) {
      await prisma.assignment.create({ data: { itemId: item.id, personId: hostPerson.id } });
    }

    const held = await prisma.assignment.findMany({
      where: { personId: hostPerson.id },
      include: { item: { include: { team: true } } },
    });
    const heldTeams = new Set(held.map((a) => a.item.team.id));
    assert(
      'she holds rows on three different teams at once, which one singular teamId could ' +
        'never have expressed',
      held.length === 3 && heldTeams.size === 3
    );

    const stillNull = await prisma.personEvent.findUniqueOrThrow({ where: { id: hostPE.id } });
    assert(
      '⚠ AND HER teamId IS STILL NULL. Nothing wrote it. That is what keeps a later team ' +
        'change from deleting everything she holds, and keeps her out of the coordinator ' +
        "route's reach",
      stillNull.teamId === null
    );

    // ── The measured reason teamId must stay null ─────────────────────────
    //
    // Not a hypothetical: the people PATCH drops every assignment in the event when a
    // person's team changes. Demonstrated on the PARTNER so the host's rows survive for
    // the Ruling 5 assertions below.
    await prisma.personEvent.update({ where: { id: partnerPE.id }, data: { teamId: mains.id } });
    const spare = await prisma.item.create({
      data: { teamId: mains.id, name: 'The bread', kind: 'ITEM' },
    });
    await prisma.assignment.create({ data: { itemId: spare.id, personId: partnerPE.personId } });
    const partnerBefore = await prisma.assignment.count({
      where: { personId: partnerPE.personId },
    });
    // What PATCH /people/[personId] does on a team change, in the same order.
    await prisma.assignment.deleteMany({
      where: { personId: partnerPE.personId, item: { team: { eventId: event.id } } },
    });
    await prisma.personEvent.update({
      where: { id: partnerPE.id },
      data: { teamId: desserts.id },
    });
    const partnerAfter = await prisma.assignment.count({ where: { personId: partnerPE.personId } });
    assert(
      'THE HAZARD, PINNED: a team change deletes every assignment the person holds ' +
        `(${partnerBefore} -> ${partnerAfter}). A write-teamId-with-the-pick design would ` +
        "have destroyed the host's holdings on every pick from a second team",
      partnerBefore === 1 && partnerAfter === 0
    );

    // ── Ruling 5 is untouched by any of this ──────────────────────────────
    //
    // The whole point of Ruling 4 being "silently": holding is not being asked. She now
    // holds three rows and has answered MAYBE on all of them, which is the exact state
    // that would chase an ordinary guest down both paths.
    await prisma.assignment.updateMany({
      where: { personId: hostPerson.id },
      data: { response: 'MAYBE' },
    });

    const nudge = await findNudgeCandidatesForEvent(event.id);
    assert(
      'RULING 5 HOLDS: she holds three rows and is not an auto-nudge candidate',
      ![...nudge.eligibleFirst, ...nudge.eligibleSecond].some((c) => c.personId === hostPerson.id)
    );
    const decide = await findDecideByFollowupCandidates(new Date());
    assert(
      'RULING 5 HOLDS: she answered MAYBE on all three inside the follow-up window and the ' +
        'decide-by finder does not chase her — "she gets no ask, whatever she is holding"',
      !decide.eligible.some((c) => c.personId === hostPerson.id && c.eventId === event.id)
    );
    const tokens = await prisma.accessToken.findMany({
      where: { eventId: event.id, personId: hostPerson.id },
      select: { scope: true },
    });
    assert(
      'RULING 8 HOLDS: holding items issued her no PARTICIPANT token',
      tokens.length === 1 && tokens[0].scope === 'HOST'
    );

    // ── Auto-assign still cannot reach her ────────────────────────────────
    const pool = await prisma.personEvent.findMany({
      where: { eventId: event.id, role: 'PARTICIPANT', teamId: null },
      select: { personId: true },
    });
    assert(
      "RULING 9: auto-assign's participant pool still excludes her, with no change — the " +
        'existing rule stays exactly as it is',
      !pool.some((p) => p.personId === hostPerson.id)
    );

    // ── Structural: the boundary GTC-207 owns, now carrying both rules ────
    const importsHostExclusion = (src: string) => /from\s+['"][^'"]*host-exclusion['"]/.test(src);
    const assignmentPaths = [
      'src/app/api/events/[id]/items/[itemId]/assign/route.ts',
      'src/app/api/c/[token]/items/[itemId]/assign/route.ts',
      'src/app/api/events/[id]/people/auto-assign/route.ts',
      'src/lib/auto-assign.ts',
      'src/lib/assignment/same-team.ts',
    ];
    const leaked = assignmentPaths.filter(
      (p) => fs.existsSync(p) && importsHostExclusion(fs.readFileSync(p, 'utf8'))
    );
    assert(
      `MESSAGE-ONLY: no assignment path imports host-exclusion — holding an item does not ` +
        `make her an addressee (leaked: ${leaked.join(', ') || 'none'})`,
      leaked.length === 0
    );
    assert(
      'the rule has ONE definition: the host assign route calls the module rather than ' +
        'carrying its own copy of the same-team condition',
      /from\s+['"][^'"]*assignment\/same-team['"]/.test(
        fs.readFileSync('src/app/api/events/[id]/items/[itemId]/assign/route.ts', 'utf8')
      )
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
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
