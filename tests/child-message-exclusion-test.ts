/**
 * GTC-172 (C1) — A CHILD-role person must never become a message recipient.
 *
 * Moment 4 spec §10.6, in those words: a CHILD-role person "never receives system
 * messages regardless of contact info on their record... No future session may soften
 * this." This test is the proof that the invariant holds, and the reason it is worth
 * having is that it FAILED before the fix — current code derives a DIRECT reachability
 * tier from phone presence for every role and no message-eligibility query filters on
 * householdRole at all.
 *
 * DB-level test (house pattern, cf. household-edit-preserves-membership-test.ts).
 * Exercises every real recipient-selection path against a real dev DB.
 *
 * GTC-175 (D2) added path 6, the maybe's decide-by follow-up. It is a real outbound SMS
 * to a real person, so §10.6 binds it exactly as it binds the others — the ticket
 * exempts a maybe from the nudge CADENCE, never from the eligibility gates. Any future
 * sender belongs in this list too.
 *
 * GTC-178 (E1, phase 1) removed path 2 — the RSVP follow-up sender no longer exists.
 * THE SURVIVING PATHS KEEP THEIR ORIGINAL NUMBERS (1, 3, 4, 5, 6) rather than closing
 * the gap: those labels are cited by number in GTC-172's and GTC-178's evidence, and
 * renumbering would silently repoint every one of them. The gap is the record.
 *
 * THE SUBJECT is a CHILD with a valid NZ phone AND an email AND reachabilityTier
 * DIRECT — i.e. maximally messageable by every signal except role.
 *
 * THE CONTROL is a re-roled former CHILD: identical contact info, identical clocks,
 * isYoungPerson still true, but householdRole GUEST. It MUST stay eligible. Without it
 * the subject assertions could be satisfied by a bug that simply stops messaging
 * everyone — the control is what proves the gate keys on ROLE and nothing else.
 *
 * Run: npx tsx tests/child-message-exclusion-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';
import { findProxyNudgeCandidates } from '../src/lib/sms/proxy-nudge-eligibility';
import { selectWrapUpRecipients } from '../src/lib/wrap-up';
import { resolveManualNudgeRecipient } from '../src/lib/sms/manual-nudge-recipient';
import { findDecideByFollowupCandidates } from '../src/lib/sms/decide-by-eligibility';

const prisma = new PrismaClient();

const TAG = 'GTC172';
/**
 * GTC-178 (E1, phase 5): was HOURS_72. The cadence retimed from 24h/48h to day 4/day 7
 * (Moment 4 §8.3), so a 72-hour-old clock is now BEFORE the first leg and every path-1
 * control assertion below would fail — not because the child rule broke, but because
 * nobody was due. Ten days puts the fixture clear of both legs with margin, so this file
 * keeps testing what it is for: that the gate keys on ROLE and nothing else.
 */
const DAYS_10 = 10 * 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(path: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${path}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${path}] ${label}`);
    failed++;
    redAssertions.push(`[${path}] ${label}`);
  }
}

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── Fixture ──────────────────────────────────────────────────────────
    const now = new Date();
    const anchor = new Date(now.getTime() - DAYS_10);
    const future = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} child-exclusion test`,
        startDate: future,
        endDate: future,
        hostId: host.id,
        status: 'CONFIRMING',
        // SENT_AND_LIVE: sentAt not null AND endDate in the future.
        sentAt: anchor,
      },
    });
    eventId = event.id;

    /** A person who is maximally messageable by every signal except role. */
    async function makeMember(opts: {
      name: string;
      phone: string;
      householdId: string | null;
      householdRole: 'PRIMARY_CONTACT' | 'CHILD' | 'GUEST' | null;
      isYoungPerson?: boolean;
    }) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${opts.name}`,
          email: `${TAG.toLowerCase()}-${opts.name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
          phoneNumber: opts.phone,
          // GTC-178 (E1, phase 2): retained-but-unread by the nudge path — the clock is
          // PersonEvent.sentAt below. Kept set so this fixture proves the child gate, not
          // an accidental null-anchor exclusion.
          inviteAnchorAt: anchor,
        },
      });
      createdPersonIds.push(person.id);

      const personEvent = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          // The exact contradiction §10.6 names: contact info present, so the
          // derivation hands even a CHILD a DIRECT tier.
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          householdId: opts.householdId,
          householdRole: opts.householdRole,
          isYoungPerson: opts.isYoungPerson ?? false,
          sentAt: anchor,
        },
      });

      // A PARTICIPANT token is a hard precondition of findNudgeCandidates.
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${person.id}`,
          scope: 'PARTICIPANT',
          eventId: event.id,
          personId: person.id,
          openedAt: null,
        },
      });

      return { person, personEvent };
    }

    // Household A — the subject's household.
    const householdA = await prisma.household.create({ data: { eventId: event.id } });
    const adultA = await makeMember({
      name: 'Adult A',
      phone: '+64211111111',
      householdId: householdA.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    const subject = await makeMember({
      name: 'Subject Child',
      phone: '+64211234567',
      householdId: householdA.id,
      householdRole: 'CHILD',
      isYoungPerson: true,
    });
    const control = await makeMember({
      name: 'Control Reroled',
      phone: '+64211234568',
      householdId: householdA.id,
      // Deliberately re-roled by the host at capture: still a young person for
      // display, but an adult for messaging.
      householdRole: 'GUEST',
      isYoungPerson: true,
    });

    // Household B — "Grandma", for the cross-household picker assertion.
    const householdB = await prisma.household.create({ data: { eventId: event.id } });
    const grandma = await makeMember({
      name: 'Grandma',
      phone: '+64213333333',
      householdId: householdB.id,
      householdRole: 'PRIMARY_CONTACT',
    });

    // SECOND CONTROL — a directly-added participant with NO household at all, so
    // householdRole is NULL. people/route.ts and batch-import create people this way.
    // The allowlist must treat NULL as messageable; if it did not, this fix would
    // silently stop nudging a large slice of real adult guests. That failure mode is
    // invisible without this control, because nothing errors — the nudges just stop.
    const nullRoleControl = await makeMember({
      name: 'Direct Add',
      phone: '+64214444444',
      householdId: null,
      householdRole: null,
    });

    console.log(`\n  subject (CHILD)  = ${subject.person.id}`);
    console.log(`  control (GUEST)  = ${control.person.id}`);
    console.log(`  grandma (picker) = ${grandma.person.id}\n`);

    // ── PATH 1 — findNudgeCandidates (day-4 / day-7 nudges) ──────────────
    const nudges = await findNudgeCandidates();
    const inFirst = (id: string) => nudges.eligibleFirst.some((c) => c.personId === id);
    const inSecond = (id: string) => nudges.eligibleSecond.some((c) => c.personId === id);

    assert('path 1', 'subject CHILD excluded from eligibleFirst', !inFirst(subject.person.id));
    assert('path 1', 'subject CHILD excluded from eligibleSecond', !inSecond(subject.person.id));
    assert('path 1 control', 're-roled adult IS in eligibleFirst', inFirst(control.person.id));

    // GTC-179 (E2, phase 3), Ruling 7(b): AT MOST ONE NUDGE PER PERSON PER RUN, so an
    // unstamped person past both legs is now a FIRST-leg candidate only. The second-leg
    // assertions below therefore need the first leg already stamped — that is the state
    // in which leg two is the earliest OUTSTANDING leg, which is what they were always
    // really about. Stamp, re-sweep, assert. Nothing here is weakened: the precondition
    // was previously supplied by a double-send the sweep no longer performs.
    // The CHILD subject is deliberately NOT stamped: its exclusion must keep turning on
    // the role, and a stamp would give it a second reason to be absent.
    await prisma.personEvent.updateMany({
      where: { id: { in: [control.personEvent.id, nullRoleControl.personEvent.id] } },
      data: { firstNudgeSentAt: new Date() },
    });
    const nudgesAfterFirst = await findNudgeCandidates();
    const inSecondAfter = (id: string) =>
      nudgesAfterFirst.eligibleSecond.some((c) => c.personId === id);

    assert(
      'path 1',
      'subject CHILD still excluded from eligibleSecond once the controls advance',
      !inSecondAfter(subject.person.id)
    );
    assert(
      'path 1 control',
      're-roled adult IS in eligibleSecond',
      inSecondAfter(control.person.id)
    );
    assert(
      'path 1 control',
      'NULL-role direct-add adult IS still nudged (allowlist did not over-exclude)',
      inFirst(nullRoleControl.person.id) && inSecondAfter(nullRoleControl.person.id)
    );

    // ── PATH 2 — REMOVED (GTC-178, phase 1) ──────────────────────────────
    // findRsvpFollowupCandidates and sendRsvpFollowupNudge are gone. GTC-174 (D1) had
    // already neutralised the finder to always return [], which left the two control
    // assertions here asserting that a control IS an RSVP-follow-up candidate — RED and
    // unfixable, because no candidate could exist. Deleting the path deletes the
    // assertions with it. The remaining five paths still cover §10.6; a maybe's real
    // follow-up is path 6 (decide-by), which is a different mechanism and unaffected.

    // ── PATH 3 — findProxyNudgeCandidates (household channel) ────────────
    // 3a: baseline, no channel picked — the child must never be the recipient.
    const proxyBaseline = await findProxyNudgeCandidates();
    const candidateA = () => proxyBaseline.eligible.find((c) => c.householdId === householdA.id);
    assert(
      'path 3a',
      'child is not the household recipient (no channel picked)',
      candidateA()?.primaryContactPersonId !== subject.person.id
    );

    // 3b: the picker is CONSUMED, and is cross-household capable — household A's
    // channel is Grandma, who lives in household B (§10.7).
    await prisma.household.update({
      where: { id: householdA.id },
      data: { contactPersonEventId: grandma.personEvent.id },
    });
    const proxyPicked = await findProxyNudgeCandidates();
    const pickedA = proxyPicked.eligible.find((c) => c.householdId === householdA.id);
    assert(
      'path 3b',
      'picked cross-household channel (Grandma) IS the recipient',
      pickedA?.primaryContactPersonId === grandma.person.id
    );

    // 3c/3d: a channel pointing at a CHILD must never send, and must fail CLOSED
    // rather than silently falling back to someone the host did not pick.
    await prisma.household.update({
      where: { id: householdA.id },
      data: { contactPersonEventId: subject.personEvent.id },
    });
    const proxyChild = await findProxyNudgeCandidates();
    const childPickedA = proxyChild.eligible.find((c) => c.householdId === householdA.id);
    assert(
      'path 3c',
      'child channel never becomes the recipient',
      childPickedA?.primaryContactPersonId !== subject.person.id
    );
    assert(
      'path 3d',
      'child channel skips the household (fails closed, no silent fallback)',
      childPickedA === undefined
    );

    await prisma.household.update({
      where: { id: householdA.id },
      data: { contactPersonEventId: null },
    });

    // ── PATH 4 — selectWrapUpRecipients (thank-you messages) ─────────────
    // Must gate here: WrapUpLink denormalises phone/email, so role is gone by dispatch.
    const wrapUpEvent = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        people: {
          include: { person: { include: { assignments: { include: { item: true } } } } },
        },
      },
    });
    const wrapUpRecipients = selectWrapUpRecipients(wrapUpEvent.people, wrapUpEvent.hostId);
    const inWrapUp = (id: string) => wrapUpRecipients.some((g) => g.person.id === id);

    assert(
      'path 4',
      'subject CHILD excluded from wrap-up recipients',
      !inWrapUp(subject.person.id)
    );
    assert('path 4 control', 're-roled adult IS a wrap-up recipient', inWrapUp(control.person.id));
    assert(
      'path 4 control',
      'NULL-role direct-add adult IS still a wrap-up recipient',
      inWrapUp(nullRoleControl.person.id)
    );

    // ── PATH 5 — resolveManualNudgeRecipient (host-triggered nudge) ──────
    // A host action is not an exemption from §10.6.
    const manualChild = await resolveManualNudgeRecipient(event.id, subject.person.id);
    const manualControl = await resolveManualNudgeRecipient(event.id, control.person.id);

    assert('path 5', 'host manual nudge REJECTS a CHILD', manualChild.ok === false);
    assert(
      'path 5 control',
      'host manual nudge allows the re-roled adult',
      manualControl.ok === true
    );

    // ── PATH 6 — findDecideByFollowupCandidates (GTC-175 / D2) ───────────
    // A maybe gets a decide-by clock instead of a nudge cadence — but the clock still
    // ends in an SMS, so §10.6 binds it. The event ends 14 days out, so with the 5-day
    // default the decide-by lands at +9d and the follow-up window opens at +8d; the
    // clock is advanced rather than the fixture rewritten.
    const team = await prisma.team.create({
      data: { name: `${TAG} Team`, eventId: event.id },
    });
    for (const member of [subject, control, nullRoleControl]) {
      const maybeItem = await prisma.item.create({
        data: { name: `${TAG} item for ${member.person.id}`, teamId: team.id, status: 'ASSIGNED' },
      });
      await prisma.assignment.create({
        data: { itemId: maybeItem.id, personId: member.person.id, response: 'MAYBE' },
      });
    }

    const decideBySweep = await findDecideByFollowupCandidates(
      new Date(now.getTime() + 8.5 * 24 * 60 * 60 * 1000)
    );
    const inDecideBy = (id: string) => decideBySweep.eligible.some((c) => c.personId === id);

    assert(
      'path 6',
      'subject CHILD excluded from the decide-by follow-up',
      !inDecideBy(subject.person.id)
    );
    assert(
      'path 6 control',
      're-roled adult IS due the decide-by follow-up',
      inDecideBy(control.person.id)
    );
    assert(
      'path 6 control',
      'NULL-role direct-add adult IS still due the decide-by follow-up',
      inDecideBy(nullRoleControl.person.id)
    );

    // ── Sanity: the subject really is maximally messageable but for role ──
    const subjectRow = await prisma.personEvent.findUniqueOrThrow({
      where: { id: subject.personEvent.id },
      include: { person: true },
    });
    assert(
      'fixture',
      'subject still has phone + email + DIRECT tier (exclusion is not data-driven)',
      subjectRow.person.phoneNumber === '+64211234567' &&
        !!subjectRow.person.email &&
        subjectRow.reachabilityTier === 'DIRECT' &&
        subjectRow.householdRole === 'CHILD'
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    if (eventId) {
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.wrapUpLink.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
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
  console.log('\x1b[32mGREEN — the child rule holds on every message-eligibility path.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
