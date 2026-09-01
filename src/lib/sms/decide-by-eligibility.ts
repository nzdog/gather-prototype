import { prisma } from '@/lib/prisma';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import { isMessageableRole, CHILD_SKIP_REASON } from '@/lib/eligibility/child-exclusion';
import { decideBy, isDecideByFollowupDue } from '@/lib/decide-by';

/**
 * GTC-175 (D2) — who is due the single decide-by follow-up.
 *
 * DELIBERATELY A SEPARATE MODULE FROM nudge-eligibility.ts. GTC-175's Do-Not-Touch is
 * explicit: "a maybe explicitly does not use the nudge cadence; do not wire it into
 * nudge-eligibility.ts's candidate-finding." A maybe is not a silence — the silence
 * cadence asks "did you see this?", and he saw it. This finder shares the eligibility
 * GATES with that machinery (child rule, opt-out, quiet hours) and none of its CADENCE.
 *
 * The gates are not optional. This sends a real SMS to a real person, so GTC-172's §10.6
 * child rule, Do-Not-Touch zone 7's opt-out, and quiet hours all apply exactly as they
 * do to every other sender. What the ticket exempts D2 from is the cadence, not the
 * eligibility.
 */

export interface DecideByFollowupCandidate {
  personId: string;
  personName: string;
  phoneNumber: string;
  eventId: string;
  eventName: string;
  hostId: string;
  hostName: string;
  participantToken: string;
  /** The item named in the message — the one whose decide-by lands first. */
  itemName: string;
  /** That item's decide-by, the deadline the message quotes. */
  decideByAt: Date;
  /**
   * Every maybe collapsed into this one message. All of them get stamped on success —
   * otherwise the ones that went unnamed would be texted again on the next tick.
   */
  assignmentIds: string[];
}

export interface DecideByEligibilityResult {
  eligible: DecideByFollowupCandidate[];
  skipped: { reason: string; count: number }[];
}

/** A membership row was expected and is not there. NOT a child — see below. */
export const NO_MEMBERSHIP_SKIP_REASON = 'No event membership row (fails closed)';
const NO_PHONE_SKIP_REASON = 'No phone number';
const OPTED_OUT_SKIP_REASON = 'Opted out';
const NOT_YET_DUE_SKIP_REASON = 'Decide-by follow-up window not open yet';
const ALREADY_PASSED_SKIP_REASON = 'Decide-by already passed — not chased';

/**
 * Every maybe still awaiting its one follow-up, grouped into one message per person.
 *
 * `now` is injectable and defaults to the current instant — the same shape as
 * `isComplete(event, now)` and `dispatchPendingWrapUpMessages(now)`, and for the same
 * reason: without it a clock test can only assert whatever the wall clock happens to be
 * when CI runs. This is a clock feature; that is not optional.
 */
export async function findDecideByFollowupCandidates(
  now: Date = new Date()
): Promise<DecideByEligibilityResult> {
  const skipReasons: Map<string, number> = new Map();
  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  // Rooted on Assignment, because that is where the maybe lives (D1 put it there, and
  // Hinge §8 rules it an ITEM maybe). Rooting on Person instead would re-import the
  // cross-event leak the schema documents on Person.nudge24hSentAt.
  //
  // `MESSAGEABLE_PERSON_EVENT` IS DELIBERATELY ABSENT FROM THIS QUERY — see the child
  // gate note below. It was tried here as a narrowing belt and removed: its `some`
  // requires at least one membership row, so a person with NO membership row at all
  // vanished from the result set before the JS gate could name the skip. Failing closed
  // silently is still failing closed, but it hides the one case most worth seeing.
  const assignments = await prisma.assignment.findMany({
    where: {
      response: 'MAYBE',
      decideByFollowupSentAt: null,
      item: { team: { event: SENT_AND_LIVE(now) } },
      person: { phoneNumber: { not: null } },
    },
    select: {
      id: true,
      response: true,
      person: { select: { id: true, name: true, phoneNumber: true } },
      item: {
        select: {
          name: true,
          dropOffAt: true,
          decideByOffsetHours: true,
          team: {
            select: {
              event: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  sentAt: true,
                  endDate: true,
                  decideByOffsetHours: true,
                  hostId: true,
                  host: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (assignments.length === 0) {
    return { eligible: [], skipped: [] };
  }

  // ── THE CHILD GATE. READ THIS BEFORE CHANGING THE QUERY ABOVE. ────────────
  //
  // The precedent pair in nudge-eligibility.ts:82-94 / :149-152 puts the real gate in
  // SQL and re-checks in JS as belt and braces. THIS FINDER CANNOT DO THAT, and a reader
  // who assumes it does will loosen the wrong half.
  //
  // `householdRole` lives on PersonEvent, which is per (person, event). This query is
  // rooted on Assignment, and Prisma cannot correlate `person.eventMemberships.some({
  // event: <this assignment's own event> })` inside a single query. A `some` filter can
  // only mean "messageable in SOME event" — near-vacuous, since it would happily load a
  // person who is an adult guest at one event and a CHILD at this one, while dropping a
  // person with no membership row before anything could report it.
  //
  // Therefore the JS check below is AUTHORITATIVE, not belt and braces. It is exact
  // because PersonEvent carries @@unique([personId, eventId]), so this is a clean 1:1
  // lookup with no worst-role-wins ambiguity.
  //
  // AND IT MUST NOT CALL isMessageableRole ON A MISSING ROW. That function returns TRUE
  // for null/undefined — correctly, because NULL there means "adult added directly, not
  // captured via a household" (child-exclusion.ts:37-41). But a MISSING ROW is not a
  // null role; it is an absent fact, and treating it as messageable makes this gate fail
  // OPEN, inverting the fails-closed rationale the module was built on. Assignments
  // without a membership row are reachable: restoreRevision recreates them by personId
  // with no membership check, and there is no FK. They are skipped, under their own
  // reason, so a missing row never hides inside the child count.
  const pairs = Array.from(
    new Map(
      assignments.map((a) => [
        `${a.person.id}:${a.item.team.event.id}`,
        { personId: a.person.id, eventId: a.item.team.event.id },
      ])
    ).values()
  );

  const memberships = await prisma.personEvent.findMany({
    where: { OR: pairs.map((p) => ({ personId: p.personId, eventId: p.eventId })) },
    select: { personId: true, eventId: true, householdRole: true },
  });
  const roleByPair = new Map(
    memberships.map((m) => [`${m.personId}:${m.eventId}`, m.householdRole])
  );

  const tokens = await prisma.accessToken.findMany({
    where: {
      scope: 'PARTICIPANT',
      OR: pairs.map((p) => ({ personId: p.personId, eventId: p.eventId })),
    },
    select: { personId: true, eventId: true, token: true },
  });
  const tokenByPair = new Map(tokens.map((t) => [`${t.personId}:${t.eventId}`, t.token]));

  // Opt-out, batched by host rather than one findUnique per candidate.
  const optOutRows = await prisma.smsOptOut.findMany({
    where: {
      OR: assignments.map((a) => ({
        phoneNumber: a.person.phoneNumber!,
        hostId: a.item.team.event.hostId,
      })),
    },
    select: { phoneNumber: true, hostId: true },
  });
  const optedOut = new Set(optOutRows.map((r) => `${r.phoneNumber}:${r.hostId}`));

  /** One entry per (person, event); the earliest decide-by names the message. */
  const grouped = new Map<string, DecideByFollowupCandidate>();

  for (const assignment of assignments) {
    const event = assignment.item.team.event;
    const person = assignment.person;
    const pair = `${person.id}:${event.id}`;

    // 1. Child rule (§10.6). Absolute, and it precedes everything else.
    if (!roleByPair.has(pair)) {
      addSkip(NO_MEMBERSHIP_SKIP_REASON);
      continue;
    }
    if (!isMessageableRole(roleByPair.get(pair))) {
      addSkip(CHILD_SKIP_REASON);
      continue;
    }

    // 2. A reachable channel. E.164 validity and provider routing are `sendSms`'s job —
    //    deliberately not isValidNZNumber, which rejects the +61 numbers send-sms.ts
    //    routes to TNZ on purpose.
    if (!person.phoneNumber) {
      addSkip(NO_PHONE_SKIP_REASON);
      continue;
    }
    const token = tokenByPair.get(pair);
    if (!token) {
      addSkip('No participant token');
      continue;
    }

    // 3. Opt-out (Do-Not-Touch zone 7). `sendSms` checks again at send time; this is
    //    here so the skip is counted rather than showing up as a silent block.
    if (optedOut.has(`${person.phoneNumber}:${event.hostId}`)) {
      addSkip(OPTED_OUT_SKIP_REASON);
      continue;
    }

    // 4. The clock. Both halves are rulings: nothing before the window opens, and
    //    nothing once the decide-by has passed (see isDecideByFollowupDue).
    if (!isDecideByFollowupDue(assignment, assignment.item, event, now)) {
      addSkip(
        now.getTime() > decideBy(assignment.item, event).getTime()
          ? ALREADY_PASSED_SKIP_REASON
          : NOT_YET_DUE_SKIP_REASON
      );
      continue;
    }

    // 5. Collapse to one message per (person, event).
    //
    //    Not a micro-optimisation. `Item.dropOffAt` is not host-settable today, so
    //    neededBy() collapses to event.endDate for essentially every item and two maybes
    //    by one guest share a decide-by to the millisecond. Per-assignment messages would
    //    send that guest two near-identical texts 500ms apart. §8's copy names one thing
    //    ("still good for the pavlova?"), so the message names the item whose clock runs
    //    out first and every collapsed assignment is stamped with it.
    const decideByAt = decideBy(assignment.item, event);
    const existing = grouped.get(pair);

    if (!existing) {
      grouped.set(pair, {
        personId: person.id,
        personName: person.name,
        phoneNumber: person.phoneNumber,
        eventId: event.id,
        eventName: event.name,
        hostId: event.hostId,
        hostName: event.host.name,
        participantToken: token,
        itemName: assignment.item.name,
        decideByAt,
        assignmentIds: [assignment.id],
      });
      continue;
    }

    existing.assignmentIds.push(assignment.id);
    if (decideByAt.getTime() < existing.decideByAt.getTime()) {
      existing.itemName = assignment.item.name;
      existing.decideByAt = decideByAt;
    }
  }

  return {
    eligible: Array.from(grouped.values()),
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({ reason, count })),
  };
}

/** Re-exported so callers need not reach past this module for the opt-out check. */
export { isOptedOut };
