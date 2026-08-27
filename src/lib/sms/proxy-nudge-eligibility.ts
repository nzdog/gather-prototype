import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import { isMessageableRole, CHILD_SKIP_REASON } from '@/lib/eligibility/child-exclusion';
import { resolveHouseholdChannel } from '@/lib/households/channel';
import { isChaseable, DONT_CHASE_SKIP_REASON } from '@/lib/eligibility/nudge-mark';
import { isPaceOff, PACE_OFF_SKIP_REASON } from '@/lib/eligibility/nudge-pace';

export interface ProxyNudgeCandidate {
  householdId: string;
  primaryContactPersonId: string;
  primaryContactName: string;
  primaryContactPhone: string;
  eventId: string;
  eventName: string;
  hostId: string;
  createdAt: Date;
  memberCount: number;
}

export interface ProxyEligibilityResult {
  eligible: ProxyNudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * Find all households eligible for proxy nudges.
 *
 * The Moment 1 redesign replaced HouseholdMember with direct PersonEvent
 * membership (householdId + householdRole). Proxy nudge tracking fields
 * (proxyNudgeCount, lastProxyNudgeAt, claimedAt, escalatedAt) no longer
 * exist on the schema. This function returns basic candidates; nudge
 * scheduling logic needs redesign in a future ticket.
 */
export async function findProxyNudgeCandidates(): Promise<ProxyEligibilityResult> {
  // GTC-169 (A3a): see nudge-eligibility.ts — the send starts the chasing, and the
  // event date ends it (Moment 4 §10.1).
  //
  // GTC-172 (C1): the recipient is now the household's CHANNEL (Moment 4 §10.7), not
  // "the primary contact" by definition. All members are loaded rather than just
  // PRIMARY_CONTACT, because the picked channel may be any adult — including one in a
  // DIFFERENT household, which is why the channel is resolved against a separate
  // lookup below rather than against `household.members`.
  const households = await prisma.household.findMany({
    where: {
      event: SENT_AND_LIVE(new Date()),
    },
    include: {
      event: true,
      members: {
        include: {
          person: true,
        },
      },
    },
  });

  const eligible: ProxyNudgeCandidate[] = [];
  const skipReasons: Map<string, number> = new Map();

  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const household of households) {
    const channelId = resolveHouseholdChannel(household);
    if (!channelId) {
      addSkip('No primary contact');
      continue;
    }

    // The channel may live in another household (§10.7), so it is resolved from the
    // event rather than from this household's members.
    const primaryContact =
      household.members.find((m) => m.id === channelId) ??
      (await prisma.personEvent.findUnique({
        where: { id: channelId },
        include: { person: true },
      }));

    if (!primaryContact || primaryContact.eventId !== household.eventId) {
      addSkip('Household channel not found in this event');
      continue;
    }

    // GTC-172 (C1): the child rule (§10.6), and it FAILS CLOSED. A channel pointing at
    // a CHILD is corrupt data — the picker omits children and the API rejects them —
    // so the household is skipped outright rather than quietly falling back to the
    // primary contact. Falling back would message somebody the host never picked and
    // would hide the corruption for as long as it existed.
    if (!isMessageableRole(primaryContact.householdRole)) {
      addSkip(CHILD_SKIP_REASON);
      continue;
    }

    if (!primaryContact.person.phoneNumber) {
      addSkip('Primary contact has no phone');
      continue;
    }

    if (!isValidNZNumber(primaryContact.person.phoneNumber)) {
      addSkip('Primary contact has invalid/non-NZ phone');
      continue;
    }

    if (primaryContact.contactMethod !== 'SMS') {
      addSkip('Primary contact method not SMS');
      continue;
    }

    const optedOut = await isOptedOut(primaryContact.person.phoneNumber, household.event.hostId);
    if (optedOut) {
      addSkip('Primary contact opted out');
      continue;
    }

    // GTC-179 (E2, phase 3): DON'T-CHASE SUPPRESSES THIS PATH TOO — Ruling 3.
    //
    // §10.3's archetype for don't-chase is "the mother", and the mother is the person
    // MOST LIKELY to be her household's picked channel (Household.contactPersonEventId).
    // A direct-path-only suppression would therefore go quiet on exactly one of the two
    // ways she is messaged and keep chasing her through the other — the control failing
    // precisely where it matters most. Kate says stop chasing my mother; the system must
    // stop, not switch doors.
    //
    // SUPPRESSION ONLY. A boolean read, no clock, no window, no stamp. Retiming this path
    // needs a decision about WHICH clock a household nudge counts from, which is
    // GTC-252's and is undecided — and GTC-252 is a filing that must not be executed as a
    // fix. Suppression needs no clock at all, which is exactly why the two separate
    // cleanly. tests/nudge-cadence-controls-test.ts asserts structurally that no cadence
    // symbol has appeared in this file.
    //
    // PLACED AFTER THE CHILD RULE AND AFTER OPT-OUT, never through either. §10.6 is
    // absolute and must not be reachable-through by a later gate, and opt-out is
    // guest-set and legally binding where this is host-set and revocable (Zone 7). The
    // ordering is asserted, not assumed: the controls test gives one subject the child
    // role AND this mark, and another opt-out AND this mark, then checks which reason
    // comes back.
    //
    // WHY SUPPRESS RATHER THAN RE-RESOLVE TO ANOTHER ADULT. Same reasoning GTC-172
    // records one gate up for a CHILD channel: falling back "would message somebody the
    // host never picked." A mark is a hosting judgement about a person, not a fault in
    // the channel, and quietly routing around it would be the system overruling her.
    if (!isChaseable(primaryContact.nudgeMark)) {
      addSkip(DONT_CHASE_SKIP_REASON);
      continue;
    }

    // GTC-179 (E2), Ruling 12: AN OFF EVENT SILENCES THIS PATH TOO.
    //
    // Ruling 3 suppressed don't-chase on both paths. Ruling 11 addressed OFF on the
    // DIRECT path only, and that asymmetry was the gap this ruling closes: a host who
    // switched the pace off went quiet on one path while this function kept returning her
    // households on every 15-minute tick. Worse than the don't-chase case it mirrors —
    // that one fails for a single person, this one for EVERY household on the event. §10.3
    // calls the pace "an event-level sending decision", and an event-level decision that
    // only reaches one of two send paths is not one.
    //
    // SAME PLACE, SAME ORDERING, SAME REASONING AS THE MARK ABOVE. After the child rule,
    // after opt-out, never through either. Suppression only — a boolean read, no clock, no
    // window, no stamp. Retiming this path still needs GTC-252's undecided decision about
    // which clock a household nudge counts from, and GTC-252 remains a filing that must
    // not be executed as a fix.
    //
    // THE MARK IS CHECKED FIRST, DELIBERATELY, matching nudge-eligibility.ts. Both produce
    // no nudge, so the order only decides which reason is REPORTED — and the mark is the
    // more specific fact: it is a hosting judgement about that person which survives the
    // host switching the pace back on, where a household here only because of the pace
    // returns the moment she does. The two paths must not explain the same household two
    // different ways, so this ordering is asserted on both.
    //
    // ⚠ THIS DOES NOT BOUND THE PROXY LOOP. GTC-252 stands: a household with an unmarked
    // channel on a non-OFF event is still eligible on every tick. Suppression removes
    // households from that loop; it does not put a limit on it.
    if (isPaceOff(household.event.nudgePace)) {
      addSkip(PACE_OFF_SKIP_REASON);
      continue;
    }

    const allMembers = await prisma.personEvent.findMany({
      where: { householdId: household.id },
    });

    eligible.push({
      householdId: household.id,
      primaryContactPersonId: primaryContact.person.id,
      primaryContactName: primaryContact.person.name,
      primaryContactPhone: primaryContact.person.phoneNumber,
      eventId: household.eventId,
      eventName: household.event.name,
      hostId: household.event.hostId,
      createdAt: household.createdAt,
      memberCount: allMembers.length,
    });
  }

  return {
    eligible,
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({
      reason,
      count,
    })),
  };
}

/**
 * Find proxy nudge candidates for a specific event
 */
export async function findProxyNudgeCandidatesForEvent(
  eventId: string
): Promise<ProxyEligibilityResult> {
  const allCandidates = await findProxyNudgeCandidates();

  return {
    eligible: allCandidates.eligible.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
