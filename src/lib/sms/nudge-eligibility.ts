import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import {
  MESSAGEABLE_PERSON_EVENT,
  isMessageableRole,
  CHILD_SKIP_REASON,
} from '@/lib/eligibility/child-exclusion';
import { resolveNudgeOffsetDays, dueNudgeIndices } from '@/lib/nudge-cadence';
import { isChaseable, DONT_CHASE_SKIP_REASON } from '@/lib/eligibility/nudge-mark';
import { isPaceOff, PACE_OFF_SKIP_REASON } from '@/lib/eligibility/nudge-pace';

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
  /**
   * GTC-178 (E1, phase 5): ORDINAL, matching the cadence and the columns. These were
   * `eligible24h`/`eligible48h`; the legs are days 4 and 7 now, and GTC-179 (E2) makes
   * even that adjustable — so the names say WHICH nudge, never when.
   */
  eligibleFirst: NudgeCandidate[];
  eligibleSecond: NudgeCandidate[];
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
  // GTC-178 (E1, phase 5): the cadence comes from the shared pure module — days 4 and 7
  // by default (Moment 4 §8.3), the system's own schedule, not "opened but no response",
  // which is a different mechanism and was never what the spec asked for.
  //
  // GTC-179 (E2, phase 1): THE RESOLUTION MOVED INTO THE LOOP. It used to sit here, above
  // the query, resolved once per sweep — correct while the only layer was a constant, and
  // wrong the moment §10.3's two layers exist, because BOTH vary per row: the mark is per
  // PersonEvent, the pace is per Event. A run-level resolution can only ever produce one
  // answer for everybody, which is the opposite of what "cadence controls live where the
  // people-decisions live" asks for. See the call site further down.

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
          // GTC-179 (E2, phase 3): THE PACE, AND IT HAD TO BE ADDED BY HAND.
          //
          // This is the exact hazard phase 1 flagged. `NudgePaceSource` is all-optional
          // (a narrow select has to satisfy it), so omitting this line type-checks
          // perfectly and every event silently reads as "no opinion" — the system
          // default, for everybody, forever, with the whole suite green. Measured on the
          // tree at 4b3ee57: `'nudgePace' in membership.event` was FALSE.
          //
          // The mark needs no equivalent line: the top-level query uses `include` rather
          // than a root `select`, so every PersonEvent scalar (nudgeMark included) comes
          // back already. That asymmetry is the trap — one column worked by accident and
          // the other did not work at all. tests/nudge-cadence-controls-test.ts turns
          // BOTH into outcomes, so neither can regress silently.
          nudgePace: true,
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

  const eligibleFirst: NudgeCandidate[] = [];
  const eligibleSecond: NudgeCandidate[] = [];
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

    // GTC-179 (E2, phase 3): THE DON'T-CHASE GATE — Ruling 6, and note WHERE it sits.
    //
    // AFTER the child rule and AFTER opt-out, never through either (Do-Not-Touch Zone 7).
    // Opt-out is guest-set and legally binding; this is a host-set preference layered on
    // top of it. If this ran first, a host clearing the mark would resume messaging
    // somebody who had opted out — so the order above is load-bearing, not incidental,
    // and the controls test asserts it by giving one subject BOTH conditions and checking
    // which reason comes back.
    //
    // A RECORDED SKIP, NOT A SILENT FALLTHROUGH. The resolver returns [] for DONT_CHASE
    // and that alone would silence the legs below — but [] is also an OFF event and also
    // not-yet-due, so the reason cannot be recovered downstream. Every other exclusion
    // here records a skip; this would have been the only silent one. See
    // src/lib/eligibility/nudge-mark.ts for why the two mechanisms deliberately overlap.
    if (!isChaseable(membership.nudgeMark)) {
      addSkip(DONT_CHASE_SKIP_REASON);
      continue;
    }

    // GTC-179 (E2, phase 5): THE OFF GATE — Ruling 11, and it sits AFTER the mark.
    //
    // Order matters for the REPORT, not for the outcome: both produce no nudge, but a
    // don't-chase person on an OFF event is counted once, and the question is under which
    // reason. The mark is the more specific fact — a hosting judgement about that person,
    // which survives the host later switching the pace back on — so it is reported first.
    // The pace is the broader one, and a person who is only here because of it goes back
    // to being chased the moment she changes it.
    //
    // A GENTLE person on an OFF event therefore lands HERE, under the pace, which is
    // correct: gentle is a volume control and OFF is what actually silenced them.
    // tests/nudge-cadence-controls-test.ts asserts exactly that split.
    //
    // See src/lib/eligibility/nudge-pace.ts for the semantic cost this reason carries —
    // it is the one skip that reports an EVENT-level decision through a per-person tally,
    // ruled in deliberately rather than arrived at.
    if (isPaceOff(membership.event.nudgePace)) {
      addSkip(PACE_OFF_SKIP_REASON);
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

    // GTC-179 (E2, phase 3): THIS ROW'S CADENCE, from this row's columns.
    //
    // Per membership, because both of §10.3's layers are per-row — the mark on this
    // PersonEvent, the pace on its Event. Quieter of the two wins (Ruling 4), which is
    // NOT an override ladder: a GENTLE person on an OFF event gets nothing, not one.
    //
    // DONT_CHASE never reaches here — the gate above already continued — so what this
    // call actually decides is GENTLE vs the event's pace vs the default. The resolver's
    // own DONT_CHASE handling stands behind that gate as belt and braces, the same
    // two-place treatment the child rule gets in this file.
    //
    // An empty result (an OFF event) needs no branch of its own: `due` comes back empty
    // and both gates below simply do not fire.
    const offsetDays = resolveNudgeOffsetDays({
      person: membership,
      event: membership.event,
    });

    // GTC-178 (E1, phase 5): which legs the clock says are due, by INDEX. Position is
    // what has to line up, because the stamps are ordinal (Ruling 7).
    const due = dueNudgeIndices(candidate.anchorAt, now, offsetDays);

    // THE FIRST LEG — TIME ALONE, PLUS THE ALREADY-SENT STAMP.
    //
    // Ruling 5 (2026-08-27) DELETED the `!hasOpened` gate that used to sit here. Opening
    // is BEHAVIOUR, and Hinge §6 refuses showing the host anything a guest did short of
    // deciding — "the screen shows what the system will do, never what the guest did
    // short of deciding." It replaces seen-status with the nudge-clock ("nudge in 2
    // days"), and that promise is only truthful if opening cannot silently cancel it.
    // DO NOT RESTORE AN OPENED CHECK HERE. tests/nudge-cadence-test.ts asserts that an
    // opened-but-silent person is treated identically to a silent one.
    const firstLegDue = due.includes(0) && !candidate.firstNudgeSentAt;

    // THE SECOND LEG — the same, plus response state.
    //
    // `!hasResponded` is KEPT (Ruling 5's other half): responding is a DECISION, and a
    // decision stops the cadence. That is the same §6 line read the other way — decisions
    // surface, behaviour stays the system's business. A MAYBE counts as responded here,
    // which is Hinge §8's "a maybe gets no nudges" falling out for free; its own clock is
    // the decide-by follow-up, a separate module and a separate cron.
    const secondLegDue = due.includes(1) && !candidate.hasResponded && !candidate.secondNudgeSentAt;

    // GTC-179 (E2, phase 3): AT MOST ONE NUDGE PER PERSON PER RUN — Ruling 7(b).
    //
    // THIS IS A BUG FIX, NOT CADENCE SCAFFOLDING, AND IT PREDATES THIS TICKET. These were
    // two independent `if` statements with no `else` and no cross-check, and
    // `processNudges` iterates both arrays unconditionally — so anyone past BOTH legs
    // with both stamps null landed in both and received TWO SMS 500 MILLISECONDS APART in
    // a single run. Proven on the live database on 2026-08-27, not inferred: a read-only
    // `findNudgeCandidates()` returned the same person in `eligibleFirst` and
    // `eligibleSecond`. Nothing has fired only because no SMS provider is configured.
    //
    // The shape is unchanged from the 24h/48h era, so this was reachable long before
    // GTC-178's retime — anyone 48h past send with both stamps null hit it identically.
    // `dueNudgeIndices` even documents the state ("[0, 1] means both are — someone added
    // late, or a cron that missed a tick"); nothing downstream ever capped it.
    //
    // EARLIEST DUE LEG ONLY. The next 15-minute tick takes the rest: once the first leg
    // is stamped, `firstLegDue` goes false and the second becomes the earliest
    // outstanding one. Deferred, never dropped.
    //
    // A GENERAL RULE ABOUT THE SWEEP, not a special case for pace changes. A setting
    // change is only one way legs coincide; a missed cron tick and a late-added person
    // are two others, and all three are covered by the same `else if`.
    if (firstLegDue) {
      eligibleFirst.push(candidate);
    } else if (secondLegDue) {
      eligibleSecond.push(candidate);
    }
  }

  return {
    eligibleFirst,
    eligibleSecond,
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
    eligibleFirst: allCandidates.eligibleFirst.filter((c) => c.eventId === eventId),
    eligibleSecond: allCandidates.eligibleSecond.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
