import { prisma } from '@/lib/prisma';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import { isMessageableRole, CHILD_SKIP_REASON } from '@/lib/eligibility/child-exclusion';
import { decideBy, isDecideByFollowupDue } from '@/lib/decide-by';
import { EMAIL_OPT_OUT_SKIP_REASON, getEmailOptOut } from '@/lib/eligibility/email-opt-out';
import { readAskPreview, type AskPreview } from '@/lib/preflight/ask-preview';
import { CHASE_SKIP_REASON } from '@/lib/sms/nudge-eligibility';

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
 *
 * ── [[GTC-251]] SLICE 251b — ONE CHOOSER FOR BOTH LEGS ───────────────────────────────────
 *
 * Founder rulings Q4, Q4a and 4.5 (2026-09-29/30): the follow-up is sent the way the chase is
 * chosen — `readAskPreview`'s `chase.byMembership`, which is `chooseChaseRoute`. A maybe-guest
 * with no usable mobile is followed up by EMAIL; the chooser's every refusal stops the follow-up
 * too, so a marked guest (4.5(a)), a handed-over guest (Q4), a text-opted-out guest (Q4a, and the
 * `Person.smsOptedOut` flag counts, as `smsOptedOutFact` has it) and an unsubscribed, reported or
 * blocked address (Zone 9) get none. A `+61` number is emailed, as the chase emails it, until
 * [[GTC-300]] (4.5(b)). The phone is no longer required in SQL: the chooser decides the channel.
 */

export interface DecideByFollowupCandidate {
  personId: string;
  personName: string;
  /** [[GTC-251]] — the chooser's channel for this guest. */
  channel: 'TEXT' | 'EMAIL';
  /** Set for TEXT. */
  phoneNumber: string | null;
  /** Set for EMAIL: the address, and where a reply goes (the host's account email, ruling F). */
  email: string | null;
  replyTo: string | null;
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
/** [[GTC-251]] — the dispatcher's `NO_REPLY_TO`, as a recorded skip: no host email to reply to. */
export const NO_REPLY_TO_SKIP_REASON = 'No reply-to: the host has no account email';
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
    },
    select: {
      id: true,
      response: true,
      person: { select: { id: true, name: true, phoneNumber: true, email: true } },
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
    select: { id: true, personId: true, eventId: true, householdRole: true },
  });
  const roleByPair = new Map(
    memberships.map((m) => [`${m.personId}:${m.eventId}`, m.householdRole])
  );
  const membershipIdByPair = new Map(memberships.map((m) => [`${m.personId}:${m.eventId}`, m.id]));

  /*
   * [[GTC-251]] 4.5 — THE CHASE'S CHOOSER, ONCE PER EVENT. The same walk the chase finder, the
   * pre-flight and the board read, so all four give one answer about who Gather may follow up.
   */
  const previews = new Map<string, AskPreview | null>();
  for (const eventId of new Set(assignments.map((a) => a.item.team.event.id))) {
    previews.set(eventId, await readAskPreview(prisma, eventId, ''));
  }

  const tokens = await prisma.accessToken.findMany({
    where: {
      scope: 'PARTICIPANT',
      OR: pairs.map((p) => ({ personId: p.personId, eventId: p.eventId })),
    },
    select: { personId: true, eventId: true, token: true },
  });
  const tokenByPair = new Map(tokens.map((t) => [`${t.personId}:${t.eventId}`, t.token]));

  // Opt-out, batched by host rather than one findUnique per candidate. Only those with a number.
  const withPhone = assignments.filter((a) => !!a.person.phoneNumber);
  const optOutRows = withPhone.length
    ? await prisma.smsOptOut.findMany({
        where: {
          OR: withPhone.map((a) => ({
            phoneNumber: a.person.phoneNumber!,
            hostId: a.item.team.event.hostId,
          })),
        },
        select: { phoneNumber: true, hostId: true },
      })
    : [];
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

    const token = tokenByPair.get(pair);
    if (!token) {
      addSkip('No participant token');
      continue;
    }

    /*
     * 2. [[GTC-251]] 4.5 — THE CHANNEL IS THE CHOOSER'S. Its refusals are recorded in the chase's
     *    own words (`CHASE_SKIP_REASON`), so a run report reads the same for both. Its ladder puts
     *    the text opt-out first (Zone 7), then the email facts (Zone 9), then the mark — the order
     *    `nudge-mark.ts` requires.
     */
    const preview = previews.get(event.id) ?? null;
    const route = preview?.chase.byMembership[membershipIdByPair.get(pair)!];
    if (!preview || !route || route.kind !== 'DIRECT') {
      addSkip(route?.kind === 'NONE' ? CHASE_SKIP_REASON[route.why] : 'Not chased');
      continue;
    }

    if (route.channel === 'TEXT') {
      // 3. ZONE 7, BELT AND BRACES, as the chase finder keeps it: the per-host table re-read
      //    directly, so a regression in the chooser fails SAFE. `sendSms` checks again at send.
      if (!person.phoneNumber) {
        addSkip(NO_PHONE_SKIP_REASON);
        continue;
      }
      if (optedOut.has(`${person.phoneNumber}:${event.hostId}`)) {
        addSkip(OPTED_OUT_SKIP_REASON);
        continue;
      }
    } else if (!preview.replyTo) {
      // The email is hers (ruling F): with no address to reply to, it is not sent.
      addSkip(NO_REPLY_TO_SKIP_REASON);
      continue;
    }

    /*
     * 3b. ⚠ [[GTC-296]] RULING 3, THROUGH CORRECTION R2b — the decide-by follow-up is an
     *     AUTOMATIC chase, so an email unsubscribe for this event stops it like the other two.
     *     *"A no to one channel is treated as a no to being chased"*, and this is a chase.
     *
     *     Below Zone 7's gate directly above, which is the order correction R2 sets. Counted,
     *     never silent — the rule this whole ladder holds.
     */
    if (await getEmailOptOut(person.id, event.id)) {
      addSkip(EMAIL_OPT_OUT_SKIP_REASON);
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
        channel: route.channel,
        phoneNumber: route.channel === 'TEXT' ? person.phoneNumber : null,
        email: route.channel === 'EMAIL' ? person.email : null,
        replyTo: route.channel === 'EMAIL' ? preview.replyTo : null,
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
