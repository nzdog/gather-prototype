import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOptOutStatuses } from '@/lib/sms/opt-out-service';
import { requireEventRole } from '@/lib/auth/guards';
import { deriveAttendance, type Attendance } from '@/lib/attendance';
import { isChaseable } from '@/lib/eligibility/nudge-mark';
import { isPaceOff } from '@/lib/eligibility/nudge-pace';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';

export type InviteStatus = 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';

/**
 * GTC-178 (E1, phase 4): the stamps live on the PersonEvent row, so this takes the
 * membership and the person separately rather than one `person` carrying both facts.
 *
 * GTC-179 (E2, phase 5): ORDINAL, AND IT NO LONGER SAYS "PENDING" WHEN NOTHING IS.
 *
 * These strings used to be "day 4 sent" / "day 7 sent". GTC-178 flagged them as the first
 * of the sites E2 would have to revisit, and the reason has now arrived: the cadence is
 * adjustable per event and per person, so the moment a host picks "relaxed" a day number
 * is a lie. The stored columns were named ordinally to avoid exactly this (GTC-178
 * Ruling 7); this copy now follows them. WHICH nudge, never when.
 *
 * ⚠ API CONTRACT VALUE CHANGE. `nudgeStatus` is a shipped field on this payload and three
 * of its possible values are new strings. Grep-verified at the time of the change: the
 * only consumer is `InviteStatusSection.tsx`, which declares it optionally on its person
 * type and does not render it — so nothing on screen moves today, and a future renderer
 * gets the honest string. Called out because a value change is not a copy change:
 * anything matching on the old literals would break silently.
 *
 * 'not chasing' IS RULING 9 (2026-08-27), and it replaces a falsehood rather than a
 * label. A don't-chase person would have read "pending" forever, which says something is
 * coming; nothing is.
 *
 * IT ALSO COVERS AN OFF EVENT, WHICH RULING 9 DID NOT NAME. Ruling 11 makes "nothing is
 * pending" true for those people too — it stops counting them in `nudgeSummary` below —
 * so leaving them on "pending" would ship a payload that contradicts itself for the same
 * person in two fields. Flagged rather than assumed: this is Ruling 9's principle applied
 * to the case Ruling 11 created, not a second ruling invented here.
 *
 * ONE STRING FOR BOTH CAUSES, deliberately, where `skipped` uses two. That array is
 * operator-facing and the cause is the point; this is host-facing, where "the system is
 * not chasing this person" is the whole meaning and the mechanism behind it would be
 * noise.
 */
function getNudgeStatus(personEvent: any, person: any, event: any): string {
  if (personEvent.secondNudgeSentAt) return 'second reminder sent';
  if (personEvent.firstNudgeSentAt) return 'first reminder sent';
  if (!person.phoneNumber) return 'no phone';
  if (!isChaseable(personEvent.nudgeMark) || isPaceOff(event.nudgePace)) return 'not chasing';
  return 'pending';
}

interface PersonInviteStatus {
  id: string;
  name: string;
  status: InviteStatus;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
  /** GTC-174 (D1): derived, never stored. See src/lib/attendance.ts. */
  attendance: Attendance;
  inviteAnchorAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  hasPhone: boolean;
  phoneNumber: string | null;
  smsOptedOut: boolean;
  canReceiveSms: boolean;
  claimedAt: string | null;
  claimedBy: string | null;
  /**
   * GTC-256 (phase 3), Ruling 5. The host is IN this list — she is in the guest list and
   * counted (Rulings 1 and 3) — and is not an addressee, so the nudge and SMS summaries
   * below exclude her. Exposed on the wire so the screen can tell the two apart without
   * re-deriving the rule client-side.
   */
  isHost: boolean;
  /**
   * GTC-178 (E1, phase 4): sourced from PersonEvent.firstNudgeSentAt /
   * secondNudgeSentAt — the wire name matches where the value comes from.
   */
  firstNudgeSentAt: string | null;
  secondNudgeSentAt: string | null;
  /**
   * GTC-179 (E2, phase 3): the host's per-person mark (Moment 4 §10.3), or null for no
   * mark. Additive to this payload. GTC-179 phase 4 sets it beside the recipient picker
   * and phase 5 revisits the labels around it.
   */
  nudgeMark: 'GENTLE' | 'DONT_CHASE' | null;
  /**
   * GTC-179 (E2, phase 5): ordinal, and 'not chasing' where nothing is pending. See
   * getNudgeStatus — this is an API contract VALUE change, not a copy change.
   */
  nudgeStatus: string;
  reachabilityTier: 'DIRECT' | 'PROXY' | 'SHARED' | 'UNTRACKABLE';
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  // Two authentication methods supported (mirrors /api/events/[id]/tokens/route.ts):
  // 1. Session-based auth via requireEventRole (hosts with active sessions)
  // 2. ?hostId= query param (hosts visiting via token link, no session)
  const { searchParams } = new URL(_request.url);
  const hostIdParam = searchParams.get('hostId');

  if (hostIdParam) {
    // Method 2: hostId query param auth
    const eventForAuth = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, coHostId: true },
    });

    if (!eventForAuth) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (eventForAuth.hostId !== hostIdParam && eventForAuth.coHostId !== hostIdParam) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  } else {
    // Method 1: Session-based auth
    let auth;
    try {
      auth = await requireEventRole(eventId, ['HOST']);
      if (auth instanceof NextResponse) return auth;
    } catch (authError) {
      console.error('Auth check error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        people: {
          select: {
            reachabilityTier: true,
            // GTC-178 (E1, phase 4): the nudge stamps are per-event and live here now.
            firstNudgeSentAt: true,
            secondNudgeSentAt: true,
            // GTC-179 (E2, phase 3): needed by the pending counts below, which must not
            // report a reminder for somebody the sweep will never send one to.
            nudgeMark: true,
            // GTC-174 (D1): the stored attendance ANSWER only. rsvpStatus /
            // rsvpRespondedAt are retained-but-unwritten and no longer selected —
            // attendance is derived below.
            attendanceAnswer: true,
            person: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                inviteAnchorAt: true,
                tokens: {
                  where: {
                    scope: 'PARTICIPANT',
                    eventId: eventId,
                  },
                  select: {
                    openedAt: true,
                    claimedAt: true,
                    claimedBy: true,
                  },
                },
                assignments: {
                  where: {
                    item: {
                      team: {
                        eventId: eventId,
                      },
                    },
                  },
                  select: {
                    response: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get opt-out statuses for people with phones (per-host)
    const phonesInEvent = event.people
      .map((pe: any) => pe.person.phoneNumber)
      .filter((phone: string | null) => !!phone) as string[];

    const optOutStatuses = await getOptOutStatuses(phonesInEvent, event.hostId);

    // Calculate status for each person
    const peopleStatus: PersonInviteStatus[] = event.people.map((personEvent: any) => {
      const person = personEvent.person;
      const token = person.tokens[0];
      const hasResponded = person.assignments.some((a: any) => a.response !== 'PENDING');
      const respondedAssignment = person.assignments.find((a: any) => a.response !== 'PENDING');

      // Determine status (hierarchy: RESPONDED > OPENED > SENT > NOT_SENT)
      let status: InviteStatus;
      if (hasResponded) {
        status = 'RESPONDED';
      } else if (token?.openedAt) {
        status = 'OPENED';
      } else if (person.inviteAnchorAt) {
        status = 'SENT';
      } else {
        status = 'NOT_SENT';
      }

      const hasOptedOut = person.phoneNumber
        ? optOutStatuses.get(person.phoneNumber) || false
        : false;

      // Determine overall response (if any assignment is ACCEPTED, consider confirmed; if any DECLINED, consider declined)
      //
      // GTC-174 (D1): MAYBE ranks above DECLINED — Hinge §8 holds a maybe'd item softly
      // (it is still the guest's), where a decline has released it. Same precedence as
      // the /api/h/[token] rollup; the two must not disagree.
      let response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE' = 'PENDING';
      if (person.assignments.length > 0) {
        const responses = person.assignments.map((a: any) => a.response);
        if (responses.every((r: string) => r === 'ACCEPTED')) {
          response = 'ACCEPTED';
        } else if (responses.some((r: string) => r === 'DECLINED')) {
          response = 'DECLINED';
        } else if (responses.some((r: string) => r === 'MAYBE')) {
          response = 'MAYBE';
        }
      }

      return {
        id: person.id,
        name: person.name,
        status,
        response,
        attendance: deriveAttendance(person.assignments, personEvent.attendanceAnswer),
        inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
        openedAt: token?.openedAt?.toISOString() || null,
        respondedAt: respondedAssignment?.createdAt?.toISOString() || null,
        hasPhone: !!person.phoneNumber,
        phoneNumber: person.phoneNumber,
        smsOptedOut: hasOptedOut,
        canReceiveSms: !!person.phoneNumber && !hasOptedOut,
        claimedAt: token?.claimedAt?.toISOString() || null,
        claimedBy: token?.claimedBy || null,
        isHost: isHostMembership({ personId: person.id, role: personEvent.role }, event.hostId),
        firstNudgeSentAt: personEvent.firstNudgeSentAt?.toISOString() || null,
        secondNudgeSentAt: personEvent.secondNudgeSentAt?.toISOString() || null,
        nudgeMark: personEvent.nudgeMark ?? null,
        nudgeStatus: getNudgeStatus(personEvent, person, event),
        reachabilityTier: personEvent.reachabilityTier as
          | 'DIRECT'
          | 'PROXY'
          | 'SHARED'
          | 'UNTRACKABLE',
      };
    });

    // Aggregate counts
    const counts = {
      total: peopleStatus.length,
      notSent: peopleStatus.filter((p) => p.status === 'NOT_SENT').length,
      sent: peopleStatus.filter((p) => p.status === 'SENT').length,
      opened: peopleStatus.filter((p) => p.status === 'OPENED').length,
      responded: peopleStatus.filter((p) => p.status === 'RESPONDED').length,
      withPhone: peopleStatus.filter((p) => p.hasPhone).length,
      optedOut: peopleStatus.filter((p) => p.smsOptedOut).length,
    };

    /*
     * GTC-256 (phase 3), RULING 5 — `canReceive` COUNTS WHO WILL BE SENT TO.
     *
     * The screen renders it as "Auto-reminders will be sent to N people". The host has a
     * phone and no opt-out, so before this she was in that N — and no auto-reminder will
     * ever reach her, because Ruling 8 withholds the PARTICIPANT token the sweep requires.
     *
     * `withPhone` / `withoutPhone` / `optedOut` are DELIBERATELY LEFT COUNTING HER. They
     * describe contact data the host is being shown about her guest list, not sending
     * intent, and she is genuinely a person in this event with a phone (Rulings 1 and 3).
     * Only the promise changes.
     */
    const smsSummary = {
      withPhone: peopleStatus.filter((p) => p.hasPhone).length,
      withoutPhone: peopleStatus.filter((p) => !p.hasPhone).length,
      optedOut: peopleStatus.filter((p) => p.smsOptedOut).length,
      canReceive: peopleStatus.filter((p) => p.canReceiveSms && !p.isHost).length,
    };

    // Nudge summary
    // GTC-178 (E1, phase 5): counted off the per-event stamps, and the pending terms now
    // mirror the RETIMED gates in nudge-eligibility.ts exactly.
    //
    // `!openedAt` IS GONE FROM pendingFirst — Ruling 5 deleted the `!hasOpened` gate from
    // the sweep, and a summary that still subtracted openers would under-report every
    // person the system is genuinely still going to chase. This count and the sweep must
    // never disagree; that is the whole reason the terms are spelled out here rather than
    // approximated.
    //
    // `!respondedAt` STAYS on pendingSecond, because `!hasResponded` stays on the second
    // leg.
    //
    // ⚠ GTC-179 (E2, phase 3) — CORRECTION. The line that stood here claimed "neither
    // term encodes the day count, so both survive GTC-179 unchanged." That was true for a
    // PACE change and false for a MARK: a don't-chase person has a phone, no opt-out and
    // no stamps, so they counted as pending and this dashboard promised a reminder the
    // sweep will never send. A correctness bug, not copy — and the fourth label site,
    // which GTC-178's closing follow-up did not find. `isChaseable` is the SAME predicate
    // nudge-eligibility.ts gates on, imported rather than restated, because this block's
    // own rule is that the count and the sweep must never disagree.
    //
    // GTC-179 (E2, phase 5): AND THE PACE. The disagreement phase 3 recorded here — an
    // OFF event's people still counting as pending — is closed by Ruling 11. Both
    // predicates are the SAME ones nudge-eligibility.ts gates on, imported rather than
    // restated, because this block's rule is that the count and the sweep must never
    // disagree, and two copies of a rule are two chances to drift.
    //
    // The pace term is event-level, so it zeroes both counts for the whole event at once.
    // That is the intended reading of "nudge pace: off", and it is why the accompanying
    // skip is still recorded PER PERSON: the operator needs to see who was not messaged,
    // where the host needs the dashboard to stop promising reminders nobody will get.
    //
    // GTC-256 (phase 3), RULING 5 — AND THE HOST. This block's own rule is that the count
    // and the sweep must never disagree, and this is the THIRD instance of the same class:
    // GTC-179 phase 3 found it for the mark, phase 5 for the pace, and phase 2 of this
    // ticket created it again by giving the host a membership row. She has a phone, no
    // opt-out and no stamps, so she counted as pending — and the sweep will never send to
    // her, because Ruling 8 withholds the PARTICIPANT token it requires. The dashboard was
    // promising a reminder nobody will get.
    //
    // `!p.isHost` rather than a token lookup, deliberately: the token's ABSENCE is what
    // the sweep gates on, and counting absences here would make this block's answer depend
    // on token state that `ensureEventTokens` owns. The rule is the reason; the token is
    // the mechanism.
    const paceOff = isPaceOff(event.nudgePace);
    const nudgeSummary = {
      sentFirst: peopleStatus.filter((p) => p.firstNudgeSentAt).length,
      sentSecond: peopleStatus.filter((p) => p.secondNudgeSentAt).length,
      pendingFirst: peopleStatus.filter(
        (p) =>
          p.canReceiveSms &&
          !p.isHost &&
          !p.firstNudgeSentAt &&
          isChaseable(p.nudgeMark) &&
          !paceOff
      ).length,
      pendingSecond: peopleStatus.filter(
        (p) =>
          p.canReceiveSms &&
          !p.isHost &&
          !p.secondNudgeSentAt &&
          !p.respondedAt &&
          isChaseable(p.nudgeMark) &&
          !paceOff
      ).length,
    };

    // Reachability breakdown
    const reachability = {
      direct: 0,
      proxy: 0,
      shared: 0,
      untrackable: 0,
    };

    event.people.forEach((personEvent: any) => {
      const tier = personEvent.reachabilityTier;
      if (tier === 'DIRECT') {
        reachability.direct++;
      } else if (tier === 'PROXY') {
        reachability.proxy++;
      } else if (tier === 'SHARED') {
        reachability.shared++;
      } else if (tier === 'UNTRACKABLE') {
        reachability.untrackable++;
      }
    });

    // Household summary
    const households = await prisma.household.findMany({
      where: { eventId },
      include: {
        members: true,
      },
    });

    const proxyNudgeSummary = {
      totalHouseholds: households.length,
      totalMembers: households.reduce((sum, h) => sum + h.members.length, 0),
      totalChildren: households.reduce((sum, h) => sum + h.littleCount, 0),
    };

    // Attendance breakdown.
    //
    // ⚠ CORRECTED 2026-08-29 (GTC-256 phase 2). This comment used to claim "excluding
    // host — event.people already excludes host via the PersonEvent relation". THAT WAS
    // NEVER TRUE. `event.people` is every PersonEvent on the event and excludes nobody:
    // it was FALSE on V1 (Sarah is counted on the Henderson seed) and ACCIDENTALLY true
    // on Moment-flow events, where the host simply had no membership row to count.
    //
    // GTC-256 phase 2 gives her one, so she is counted here now — DELIBERATELY, on a
    // founder ruling of 2026-08-29: "she is at her own party, she is eating, the numbers
    // should say so." That brings Ruling 3's headcount fix forward from phase 4, and it
    // was taken as a decision rather than inherited silently, which is the distinction
    // the ticket's build decision 2 asks for.
    //
    // ⚠ THREE NUMBERS, AND THIS IS ONLY ONE OF THEM. Build decision 2 stands: the
    // HEADCOUNT that sizes the plan (buildPlanGenerationInput), the RECIPIENTS count at
    // confirm-invites-sent, and these ATTENDANCE totals are different questions —
    // "attending" and "being asked" are not the same thing, and Ruling 5 says she is not
    // a recipient. All three now count her; whether the recipients one should is
    // GTC-256 phase 3/4's to settle, not this route's.
    //
    // GTC-174 (D1): counted from deriveAttendance(), not from a stored column. The old
    // `rsvp` block was a second, identical count off `rsvpStatus` and is deleted rather
    // than kept in sync — two counts of one fact is how they come to disagree.
    //
    // `notSure` becomes `unknown`. Not a rename for tidiness: NOT_SURE meant "maybe I'm
    // coming", a concept Hinge §8 abolishes. UNKNOWN means "engaged, attendance
    // undetermined" — a maybe on the item, or a no whose follow-up went unanswered.
    const derived = event.people.map((pe: any) =>
      deriveAttendance(pe.person.assignments, pe.attendanceAnswer)
    );
    const attendance = {
      total: derived.length,
      yes: derived.filter((a: Attendance) => a === 'YES').length,
      no: derived.filter((a: Attendance) => a === 'NO').length,
      unknown: derived.filter((a: Attendance) => a === 'UNKNOWN').length,
      pending: derived.filter((a: Attendance) => a === 'PENDING').length,
    };

    // Items breakdown (Assignment status)
    // Fetch all items and their assignments for this event
    const allItems = await prisma.item.findMany({
      where: {
        team: {
          eventId: eventId,
        },
      },
      include: {
        assignment: {
          select: {
            response: true,
            person: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const items = {
      total: allItems.length,
      confirmed: allItems.filter((item) => item.assignment?.response === 'ACCEPTED').length,
      declined: allItems.filter((item) => item.assignment?.response === 'DECLINED').length,
      pending: allItems.filter((item) => item.assignment?.response === 'PENDING').length,
      gaps: allItems.filter((item) => !item.assignment || item.assignment.response === 'DECLINED')
        .length,
    };

    // Item details for expanded view
    const itemDetails = allItems.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.assignment
        ? item.assignment.response === 'ACCEPTED'
          ? 'confirmed'
          : item.assignment.response === 'DECLINED'
            ? 'declined'
            : 'pending'
        : 'gap',
      assignee: item.assignment?.person?.name || null,
    }));

    // Calculate threshold metrics (compliance rate and readiness for freeze)
    // Get all assignments for trackable guests (exclude UNTRACKABLE)
    const allTrackableAssignments = await prisma.assignment.findMany({
      where: {
        item: {
          team: { eventId },
        },
        person: {
          eventMemberships: {
            some: {
              eventId,
              reachabilityTier: {
                not: 'UNTRACKABLE',
              },
            },
          },
        },
      },
      include: {
        person: {
          select: {
            eventMemberships: {
              where: { eventId },
              select: { reachabilityTier: true },
            },
          },
        },
      },
    });

    // Calculate compliance rate
    const totalTrackable = allTrackableAssignments.length;
    const acceptedCount = allTrackableAssignments.filter((a) => a.response === 'ACCEPTED').length;
    const complianceRate = totalTrackable === 0 ? 1.0 : acceptedCount / totalTrackable;

    // Check for critical gaps (critical items without ACCEPTED assignment)
    const criticalItems = await prisma.item.findMany({
      where: {
        team: { eventId },
        critical: true,
      },
      include: {
        assignment: true,
      },
    });

    const criticalGaps = criticalItems.filter(
      (item) => !item.assignment || item.assignment.response !== 'ACCEPTED'
    ).length;

    // Ready to freeze if compliance >= 80% AND no critical gaps
    const thresholdReached = complianceRate >= 0.8;
    const readyToFreeze = thresholdReached && criticalGaps === 0;

    return NextResponse.json({
      eventStatus: event.status,
      // GTC-197 (A3c): wire key renamed with its host consumer.
      sentAt: event.sentAt?.toISOString() || null,
      hasUnsentPeople: counts.notSent > 0,
      sharedLinkEnabled: event.sharedLinkEnabled,
      counts,
      claimCounts: {
        claimed: peopleStatus.filter((p) => p.claimedAt).length,
        unclaimed: peopleStatus.filter((p) => !p.claimedAt).length,
      },
      smsSummary,
      nudgeSummary,
      proxyNudgeSummary,
      reachability,
      attendance,
      items,
      itemDetails,
      threshold: {
        complianceRate,
        thresholdReached,
        criticalGaps,
        readyToFreeze,
      },
      people: peopleStatus,
    });
  } catch (error) {
    console.error('Error getting invite status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
