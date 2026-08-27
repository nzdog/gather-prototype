import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import {
  MESSAGEABLE_PERSON_EVENT,
  isMessageableRole,
  CHILD_SKIP_REASON,
} from '@/lib/eligibility/child-exclusion';

export interface NudgeCandidate {
  /**
   * GTC-178 (E1, phase 2): the membership row this candidacy belongs to. The clock is
   * read from it, and phase 3's `firstNudgeSentAt`/`secondNudgeSentAt` will be written
   * back to it. `personId` + `eventId` identify the same row, but carrying the id means
   * the sender does not have to re-derive it to stamp a send.
   */
  personEventId: string;
  personId: string;
  personName: string;
  phoneNumber: string;
  eventId: string;
  eventName: string;
  hostId: string;
  hostName: string;
  anchorAt: Date;
  participantToken: string;

  // Status flags
  hasOpened: boolean;
  hasResponded: boolean;
  /**
   * GTC-178 (E1, phase 4): the sent-side dedup stamps, now read from the PersonEvent row
   * named by `personEventId` above rather than from the global `Person` pair.
   *
   * ORDINAL NAMES, matching the columns (Ruling 7). They are still the 24h and 48h legs
   * in this phase — the retime to day-4/day-7 is phase 5 — so the names describe WHICH
   * nudge, never WHEN, which is what keeps them true once GTC-179 makes the pace
   * adjustable.
   */
  firstNudgeSentAt: Date | null;
  secondNudgeSentAt: Date | null;
}

export interface EligibilityResult {
  eligible24h: NudgeCandidate[];
  eligible48h: NudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * Find all people eligible for nudges across all active events.
 *
 * `now` is injectable and defaults to the current instant — the same shape as
 * `findDecideByFollowupCandidates(now)` and `isComplete(event, now)`, and for the same
 * reason: this is a clock feature, and a clock test that cannot fix the clock asserts
 * whatever the wall clock happened to be when CI ran.
 */
export async function findNudgeCandidates(now: Date = new Date()): Promise<EligibilityResult> {
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // GTC-178 (E1, phase 2): ROOTED ON `PersonEvent`, AND THE CLOCK IS `PersonEvent.sentAt`.
  //
  // THE BUG THIS FIXES. This query used to root on `Person` and read
  // `Person.inviteAnchorAt`, which is GLOBAL PER PERSON. A person who is a guest at two
  // events therefore shared ONE clock, and the second event's nudge timing was wrong from
  // the moment they joined it — a mini-send pressed an hour ago inherited an anchor from
  // an event pressed last week and fired both nudges on the next tick. GTC-168 (A2)
  // created `PersonEvent.sentAt` for exactly this reason and the schema comment on that
  // field names this ticket as the fix. Ruled a BUG FIX, not a refactor (Ruling 2,
  // 2026-08-23). `tests/nudge-clock-origin-test.ts` is the two-event proof; it cannot be
  // expressed with a one-event fixture, which is why the leak survived this long.
  //
  // WHY THE ROOT MOVED AND NOT JUST THE FIELD. Both facts this query gates on —
  // `sentAt` and `householdRole` — live on `PersonEvent`. Under the old `Person` root each
  // had to be filtered in BOTH the `some` (which decides whether the person loads at all)
  // and the include's `where` (which decides which memberships come back); filtering only
  // the `some` would load a person for their eligible membership and then still emit a
  // candidate for their ineligible one. That two-place hazard is what the old comment here
  // warned about for the child rule, and moving the clock in would have created a second
  // instance of it. Rooting on the row that owns the facts collapses both to one predicate.
  // Same reasoning `decide-by-eligibility.ts` records for rooting on `Assignment`.
  //
  // GTC-169 (A3a): the event filter was `status: 'CONFIRMING'`, which meant FREEZING AN
  // EVENT STOPPED ITS NUDGES — exactly backwards from the ruled model, where the send is
  // when the chasing starts (Moment 4 §4; Hinge §6 "I'll tell you the moment anything
  // comes back"). The endDate half of SENT_AND_LIVE is load-bearing, not cosmetic: after
  // A3a no event ever leaves CONFIRMING, so a status-only filter would keep matching
  // events whose date had passed and fire nudges after the event — which Moment 4 §10.1
  // forbids outright ("Post-date: nudges dead"). The security suite asserts this directly.
  //
  // `sentAt: { not: null }` IS A FAIL-SAFE, NOT A TIDY-UP. No personal send clock means
  // the system does not know when this person was told, so it must not guess — and the
  // global field it used to fall back on is precisely what produced the wrong guess.
  //
  // GTC-178 (E1, phase 4): THE DEDUP STAMPS ARE READ FROM THIS ROW TOO. They used to be
  // `Person.nudge24hSentAt`/`nudge48hSentAt` — the same per-person-for-a-per-event leak
  // as the clock, through the other door: one person in two live events, nudged for event
  // A, went permanently silent for event B. Nobody was nudged twice; somebody was never
  // nudged at all, which is the worse direction to fail.
  // `tests/nudge-dedup-scope-test.ts` is the two-event proof.
  //
  // COST, STATED HONESTLY: the person payload (tokens, assignments) is now fetched once
  // per membership rather than once per person, so someone in two events is carried
  // twice. Prisma cannot correlate a nested `where` to the outer row's `eventId`, so
  // those two relations are still filtered in JS below — unchanged from before, and the
  // same limitation `decide-by-eligibility.ts` documents. Memberships per person are 1-2
  // in practice; correctness is worth the duplication.
  const memberships = await prisma.personEvent.findMany({
    where: {
      sentAt: { not: null },
      event: SENT_AND_LIVE(now),
      ...MESSAGEABLE_PERSON_EVENT,
      person: { phoneNumber: { not: null } },
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          hostId: true,
          host: {
            select: { name: true },
          },
        },
      },
      person: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          tokens: {
            where: { scope: 'PARTICIPANT' },
            select: {
              token: true,
              openedAt: true,
              eventId: true,
            },
          },
          assignments: {
            select: {
              response: true,
              item: {
                select: {
                  team: {
                    select: {
                      eventId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const eligible24h: NudgeCandidate[] = [];
  const eligible48h: NudgeCandidate[] = [];
  const skipReasons: Map<string, number> = new Map();

  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const membership of memberships) {
    const event = membership.event;
    const person = membership.person;

    // GTC-172 (C1): belt and braces. The SQL above already excludes CHILD; this
    // re-checks in JS so that if anyone ever loosens the query, the child rule still
    // holds and the skip is recorded rather than silently sending.
    if (!isMessageableRole(membership.householdRole)) {
      addSkip(CHILD_SKIP_REASON);
      continue;
    }

    // Find token for this event. Prisma cannot scope the nested `where` to this row's
    // eventId (see the query note above), so the correlation happens here.
    const token = person.tokens.find((t: any) => t.eventId === event.id);

    // Skip if no participant token
    if (!token) {
      addSkip('No participant token');
      continue;
    }

    // Skip if invalid phone
    if (!isValidNZNumber(person.phoneNumber!)) {
      addSkip('Invalid/non-NZ phone');
      continue;
    }

    // Check opt-out
    const optedOut = await isOptedOut(person.phoneNumber!, event.hostId);
    if (optedOut) {
      addSkip('Opted out');
      continue;
    }

    // Check if person has responded to any assignment in this event
    const hasResponded = person.assignments.some(
      (a: any) => a.item.team.eventId === event.id && a.response !== 'PENDING'
    );

    const candidate: NudgeCandidate = {
      personEventId: membership.id,
      personId: person.id,
      personName: person.name,
      phoneNumber: person.phoneNumber!,
      eventId: event.id,
      eventName: event.name,
      hostId: event.hostId,
      hostName: event.host?.name || 'The host',
      // THIS person's clock for THIS event. The `sentAt: { not: null }` filter above is
      // what makes the assertion safe.
      anchorAt: membership.sentAt!,
      participantToken: token.token,
      hasOpened: !!token.openedAt,
      hasResponded,
      firstNudgeSentAt: membership.firstNudgeSentAt,
      secondNudgeSentAt: membership.secondNudgeSentAt,
    };

    // Check 24h eligibility
    if (
      candidate.anchorAt <= twentyFourHoursAgo && // 24h passed
      !candidate.hasOpened && // Haven't opened
      !candidate.firstNudgeSentAt // Haven't sent the first nudge for THIS event
    ) {
      eligible24h.push(candidate);
    }

    // Check 48h eligibility
    if (
      candidate.anchorAt <= fortyEightHoursAgo && // 48h passed
      !candidate.hasResponded && // Haven't responded
      !candidate.secondNudgeSentAt // Haven't sent the second nudge for THIS event
    ) {
      eligible48h.push(candidate);
    }
  }

  return {
    eligible24h,
    eligible48h,
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({
      reason,
      count,
    })),
  };
}

/**
 * Find nudge candidates for a specific event.
 *
 * `now` is threaded through rather than re-derived — the host-triggered POST path and the
 * cron path must not be able to disagree about what time it is.
 */
export async function findNudgeCandidatesForEvent(
  eventId: string,
  now: Date = new Date()
): Promise<EligibilityResult> {
  // Similar to above but filtered to one event
  const allCandidates = await findNudgeCandidates(now);

  return {
    eligible24h: allCandidates.eligible24h.filter((c) => c.eventId === eventId),
    eligible48h: allCandidates.eligible48h.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
