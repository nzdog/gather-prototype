import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { EMAIL_OPT_OUT_SKIP_REASON } from '@/lib/eligibility/email-opt-out';
import { EMAIL_BLOCK_SKIP_REASON } from '@/lib/eligibility/email-block';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import { CHILD_SKIP_REASON } from '@/lib/eligibility/child-exclusion';
import { resolveNudgeOffsetDays, dueNudgeIndices } from '@/lib/nudge-cadence';
import { DONT_CHASE_SKIP_REASON } from '@/lib/eligibility/nudge-mark';
import { isPaceOff, PACE_OFF_SKIP_REASON } from '@/lib/eligibility/nudge-pace';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import type { ChaseNoneWhy, HostListWhy } from '@/lib/eligibility/channel-chooser';
import type { Prisma } from '@prisma/client';
import { handBackInForce, handBackLegDue, type ChaseHandBack } from '@/lib/chase-exhaustion';
import { readChaseSpend } from '@/lib/chase-exhaustion-read';
import { REPLIED_SKIP_REASON, replyInForce } from '@/lib/chase-reply';
import { readReplyFacts } from '@/lib/chase-reply-read';

export interface NudgeCandidate {
  /**
   * The RECIPIENT's membership — the adult the reminder goes to. For a carried child's ask that is
   * the carrier (ruling R), and the clock, the stamps and the row all belong to that membership.
   */
  personEventId: string;
  personId: string;
  personName: string;
  /**
   * [[GTC-189]] slice 8b — the chooser's channel for this reminder. `phoneNumber` is null for an
   * email chase; the SQL phone-only filter is gone because the chooser must SEE a phoneless person,
   * to chase them by email (ruling AH) or to hand them over (rulings O and P).
   */
  channel: 'EMAIL' | 'TEXT';
  phoneNumber: string | null;
  eventId: string;
  eventName: string;
  hostId: string;
  hostName: string;
  anchorAt: Date;
  participantToken: string;
  /** Kept for the report; neither leg reads it (GTC-178 Ruling 5 deleted the opened gate). */
  hasOpened: boolean;
  /**
   * TRUE when nothing the reminder would ask about is still open. ⚠ D5, founder ruling 2026-09-27:
   * BOTH legs now require it false — see `stillUnanswered`.
   */
  hasResponded: boolean;
  firstNudgeSentAt: Date | null;
  secondNudgeSentAt: Date | null;
  /** [[GTC-251]] slice 251c — set on a further-reminder candidate: the hand-back it answers. */
  handBack?: ChaseHandBack | null;
}

export interface EligibilityResult {
  eligibleFirst: NudgeCandidate[];
  eligibleSecond: NudgeCandidate[];
  /** [[GTC-251]] slice 251c — a further reminder the host asked for (Q3). */
  eligibleMore: NudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * ⚠ D5, FOUNDER RULING 2026-09-27 — "BOTH REMINDERS REQUIRE THAT THE GUEST STILL HAS NOT ANSWERED."
 *
 * F7, RECORDED AS A DEFECT IN TODAY'S BEHAVIOUR AND FIXED HERE: the first leg used to fire on
 * elapsed time alone, so on day four a guest who had already said yes was told the host "is waiting
 * for your response". GTC-178 Ruling 5 deleted an OPENED gate from that leg — opening is behaviour,
 * and must not cancel the nudge clock — and never had a RESPONSE gate to delete. A response is a
 * decision, and a decision stops the cadence (Ruling 5's own other half).
 *
 * WHAT "STILL NOT ANSWERED" MEANS, which is the part a reader should check:
 *  - they said they cannot come — answered, whatever their rows say;
 *  - any row of their OWN still PENDING — unanswered;
 *  - any row of a CHILD they carry for the chase still PENDING — unanswered (ruling R: *"a carried
 *    ask is a real ask and it is chased like one"*);
 *  - no rows at all, own or carried — the ask was whether they can make it, so unanswered until
 *    `attendanceAnswer` is set.
 *
 * ⚠ THE SECOND HALF IS A CHANGE FROM THE OLD SECOND LEG, WHICH STOPPED ON ANY ONE ANSWER. A guest
 * with two dishes who answered one is still asked about the other; ruling R's own case — Sarah
 * answered hers, not Ollie's — cannot be chased under "any one answer stops it".
 */
export function stillUnanswered(input: {
  attendanceAnswer: string | null;
  ownRows: number;
  ownPending: number;
  carriedRows: number;
  carriedPending: number;
}): boolean {
  if (input.attendanceAnswer === 'NO') return false;
  if (input.ownPending > 0 || input.carriedPending > 0) return true;
  if (input.ownRows === 0 && input.carriedRows === 0) return input.attendanceAnswer === null;
  return false;
}

/**
 * The recorded skip for each reason the chooser refuses the chase. A `Record`, so a new refusal does
 * not compile until it has a line — the rule every skip on this path has held: a RECORDED skip,
 * never a silent drop. The strings the suites already read are kept verbatim.
 *
 * Exported for [[GTC-251]] slice 251b: the decide-by follow-up asks the same chooser, so it records
 * the same refusal in the same words.
 */
export const CHASE_SKIP_REASON: Record<ChaseNoneWhy, string> = {
  SMS_OPTED_OUT: 'Opted out',
  EMAIL_OPTED_OUT: EMAIL_OPT_OUT_SKIP_REASON,
  EMAIL_REPORTED: EMAIL_OPT_OUT_SKIP_REASON,
  EMAIL_BLOCKED: EMAIL_BLOCK_SKIP_REASON,
  MARKED_DONT_CHASE: DONT_CHASE_SKIP_REASON,
  PHONE_UNUSABLE: 'Invalid/non-NZ phone',
  NO_CHANNEL: 'No channel to chase by',
  HANDED_TO_HOST: 'Handed to the host by her exception or her switch (GTC-311)',
  HOST_AS_CARRIER: 'Host as carrier — not chased (slice 1 answer 1)',
  HOST_OWN_ASK: 'Host — never chased',
  HOST_HOUSEHOLD_CHILD: CHILD_SKIP_REASON,
  NO_CARRIER: CHILD_SKIP_REASON,
  HOUSEHOLD_MUTED: CHILD_SKIP_REASON,
  CHILD_WITHOUT_ITEM: CHILD_SKIP_REASON,
};

/**
 * The recorded skip for a guest who WAS asked (their clock is running) and whom the chooser now
 * refuses the ask outright — an unsubscribe, a complaint, a blocked address, an opt-out. They are on
 * the host's list and not among the recipients, so without this they would drop out of the sweep
 * silently; `tests/email-opt-out-test.ts` layer I caught exactly that at slice 8b.
 */
const HOST_LIST_SKIP_REASON: Record<HostListWhy, string> = {
  EMAIL_REPORTED: EMAIL_OPT_OUT_SKIP_REASON,
  EMAIL_REPORTED_SMS_OPTED_OUT: EMAIL_OPT_OUT_SKIP_REASON,
  EMAIL_OPTED_OUT: EMAIL_OPT_OUT_SKIP_REASON,
  EMAIL_BLOCKED: EMAIL_BLOCK_SKIP_REASON,
  EMAIL_BLOCKED_SMS_OPTED_OUT: EMAIL_BLOCK_SKIP_REASON,
  NO_CHANNEL: CHASE_SKIP_REASON.NO_CHANNEL,
  SMS_OPTED_OUT: CHASE_SKIP_REASON.SMS_OPTED_OUT,
  PHONE_UNUSABLE: CHASE_SKIP_REASON.PHONE_UNUSABLE,
  HOST_HOUSEHOLD_CHILD: CHILD_SKIP_REASON,
  NO_CARRIER: CHILD_SKIP_REASON,
  HOUSEHOLD_MUTED: CHILD_SKIP_REASON,
};

/**
 * Who is due a reminder, and on which leg. [[GTC-189]] slice 8b.
 *
 * ⚠ THE CHOOSER DECIDES WHO IS CHASED AND BY WHAT, AND THIS FUNCTION NO LONGER DOES. It reads
 * `readAskPreview` — the walk the pre-flight, the press and the drain already run — and takes each
 * recipient's `chooseChaseRoute` answer from it. So the pre-flight's "Chased by" and the reminder
 * cannot disagree, and [[GTC-296]]'s gate, which lived here AND in `chaseChannelOf`, now lives only in
 * the chooser. What stays here is what the chooser does not know: the clock, the cadence, the pace,
 * whether the guest has answered, and whether a leg is already taken.
 *
 * ⚠ THE CLOCK IS STILL `PersonEvent.sentAt`, and under ruling G it is written only when a provider
 * accepts that person's ask. A membership with none is not yet chased. [[GTC-322]]'s legacy stamps
 * were cleared in gather_dev on 2026-09-19; the production run of its script is a deploy
 * precondition of this slice.
 *
 * A LEG IS TAKEN once its row exists (any state) or its stamp is set — the stamp for chases the old
 * text path sent before this slice. So a second tick writes nothing twice, and a failed reminder is
 * the dispatcher's to retry, never the finder's to re-queue.
 *
 * `now` is injectable for the reason every clock function here takes it. `eventIds` narrows the
 * sweep to named events — the host's trigger route, and a suite that must not touch other boards.
 */
export async function findNudgeCandidates(
  now: Date = new Date(),
  scope: { eventIds?: string[] } = {}
): Promise<EligibilityResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const eligibleFirst: NudgeCandidate[] = [];
  const eligibleSecond: NudgeCandidate[] = [];
  const eligibleMore: NudgeCandidate[] = [];
  const skipReasons = new Map<string, number>();
  const addSkip = (reason: string) => skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);

  // GTC-169 (A3a): the send starts the chasing and the event date ends it (Moment 4 §10.1). The
  // endDate half of SENT_AND_LIVE is load-bearing; the security suite asserts it.
  const where: Prisma.EventWhereInput = {
    ...SENT_AND_LIVE(now),
    ...(scope.eventIds ? { id: { in: scope.eventIds } } : {}),
  };
  const events = await prisma.event.findMany({
    where,
    select: {
      id: true,
      name: true,
      hostId: true,
      // GTC-179 phase 3's hazard, still true: omit this and every event silently reads as the default.
      nudgePace: true,
      host: { select: { name: true } },
    },
  });

  for (const event of events) {
    const preview = await readAskPreview(prisma, event.id, baseUrl);
    if (!preview) continue;

    const [memberships, assignments, tokens] = await Promise.all([
      prisma.personEvent.findMany({
        where: { eventId: event.id },
        select: {
          id: true,
          personId: true,
          sentAt: true,
          nudgeMark: true,
          attendanceAnswer: true,
          firstNudgeSentAt: true,
          secondNudgeSentAt: true,
          person: { select: { name: true, phoneNumber: true } },
        },
      }),
      prisma.assignment.findMany({
        where: { item: { team: { eventId: event.id } } },
        select: { personId: true, response: true },
      }),
      prisma.accessToken.findMany({
        where: { eventId: event.id, scope: 'PARTICIPANT' },
        select: { personId: true, token: true, openedAt: true },
      }),
    ]);
    const taken = new Set(
      (
        await prisma.outboundMessage.findMany({
          where: { eventId: event.id, kind: { in: ['CHASE_FIRST', 'CHASE_SECOND'] } },
          select: { personEventId: true, kind: true },
        })
      ).map((r) => `${r.personEventId}:${r.kind}`)
    );
    const byId = new Map(memberships.map((m) => [m.id, m]));
    // [[GTC-251]] slice 251c — the same reading of the reminders the board's exhaustion takes.
    const spend = await readChaseSpend(prisma, event.id);
    // [[GTC-350]] — each recipient's text replies, for the one predicate the board also asks.
    const replies = await readReplyFacts(prisma, event.id, now);
    const rowsOf = (personId: string) => {
      const mine = assignments.filter((a) => a.personId === personId);
      return { rows: mine.length, pending: mine.filter((a) => a.response === 'PENDING').length };
    };

    for (const line of preview.hostList) {
      if (byId.get(line.personEventId)?.sentAt) addSkip(HOST_LIST_SKIP_REASON[line.why]);
    }

    for (const recipient of preview.recipients) {
      const m = byId.get(recipient.personEventId);
      // Not yet accepted — ruling G's clock has not started. Silent, as the SQL filter it replaces was.
      if (!m?.sentAt) continue;

      const chase = preview.chase.byRecipient[recipient.personEventId];
      if (!chase || chase.chasedBy === 'NONE') {
        addSkip(chase?.why ? CHASE_SKIP_REASON[chase.why] : 'Not chased');
        continue;
      }

      const token = tokens.find((t) => t.personId === m.personId);
      if (!token) {
        addSkip('No participant token');
        continue;
      }

      /*
       * ZONE 7, BELT AND BRACES, ON THE TEXT LEG. The chooser already refused an opted-out or unusable
       * number; this re-checks with the opt-out service directly (account-wide since [[GTC-288]]), as this finder always has,
       * so a regression in the chooser fails SAFE here — the treatment the child rule gets. Only read.
       */
      if (chase.chasedBy === 'TEXT') {
        const phone = m.person.phoneNumber;
        if (!phone || !isValidNZNumber(phone)) {
          addSkip('Invalid/non-NZ phone');
          continue;
        }
        if (await isOptedOut(phone)) {
          addSkip('Opted out');
          continue;
        }
      }

      // GTC-179 (E2, phase 5): THE OFF GATE, a recorded skip. The mark is the chooser's now.
      if (isPaceOff(event.nudgePace)) {
        addSkip(PACE_OFF_SKIP_REASON);
        continue;
      }

      const own = rowsOf(m.personId);
      const carried = chase.carried
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => rowsOf(c.personId));
      const unanswered = stillUnanswered({
        attendanceAnswer: m.attendanceAnswer,
        ownRows: own.rows,
        ownPending: own.pending,
        carriedRows: carried.reduce((n, c) => n + c.rows, 0),
        carriedPending: carried.reduce((n, c) => n + c.pending, 0),
      });

      const candidate: NudgeCandidate = {
        personEventId: m.id,
        personId: m.personId,
        personName: m.person.name,
        channel: chase.chasedBy,
        phoneNumber: m.person.phoneNumber,
        eventId: event.id,
        eventName: event.name,
        hostId: event.hostId,
        hostName: event.host?.name || 'The host',
        anchorAt: m.sentAt,
        participantToken: token.token,
        hasOpened: !!token.openedAt,
        hasResponded: !unanswered,
        firstNudgeSentAt: m.firstNudgeSentAt,
        secondNudgeSentAt: m.secondNudgeSentAt,
      };
      if (!unanswered) {
        addSkip('Answered — nothing to remind them of (D5)');
        continue;
      }

      /*
       * [[GTC-350]] Q1 — A REPLY IN FORCE ENDS THE CHASE: *"Gather stops reminding them."* After the
       * answer, which is the stronger fact (the drain keeps the same order). Every leg, the further
       * ones included; a hand-back after the reply starts a new chase, which only a later reply ends.
       */
      if (replyInForce(replies.repliedAt.get(m.id) ?? [], spend.get(m.id)?.handBack ?? null, now)) {
        addSkip(REPLIED_SKIP_REASON);
        continue;
      }

      // Per membership, because both of §10.3's layers are per-row (GTC-179 Ruling 4, quieter wins).
      const offsetDays = resolveNudgeOffsetDays({ person: m, event });
      const due = dueNudgeIndices(candidate.anchorAt, now, offsetDays);
      const firstTaken = !!m.firstNudgeSentAt || taken.has(`${m.id}:CHASE_FIRST`);
      const secondTaken = !!m.secondNudgeSentAt || taken.has(`${m.id}:CHASE_SECOND`);

      // [[GTC-350]] plan ruling Q-C — while a hand-back is in force its count is all Gather sends:
      // no first or second reminder goes after it. From "gone quiet" both were already taken.
      const handedBack = handBackInForce(spend.get(m.id), now);

      // GTC-179 Ruling 7(b): AT MOST ONE REMINDER PER PERSON PER RUN — earliest due leg only; the
      // next tick takes the rest. Deferred, never dropped.
      if (!handedBack && due.includes(0) && !firstTaken) {
        eligibleFirst.push(candidate);
      } else if (!handedBack && due.includes(1) && !secondTaken) {
        eligibleSecond.push(candidate);
      } else if (handBackLegDue(spend.get(m.id), now)) {
        // [[GTC-251]] Q3 — a further reminder, after every gate above: the chooser (the mark and
        // every opt-out), Zone 7's belt, pace OFF and an answer each stop it here, and the drain
        // asks them all again. Still one reminder per person per run (Ruling 7(b)).
        eligibleMore.push({ ...candidate, handBack: spend.get(m.id)?.handBack ?? null });
      }
    }
  }

  return {
    eligibleFirst,
    eligibleSecond,
    eligibleMore,
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * Find nudge candidates for a specific event.
 *
 * `now` is threaded through rather than re-derived — the host-triggered POST path and the
 * cron path must not be able to disagree about what time it is. Scoped at the query now, rather
 * than filtered after a sweep of every live event.
 */
export async function findNudgeCandidatesForEvent(
  eventId: string,
  now: Date = new Date()
): Promise<EligibilityResult> {
  return findNudgeCandidates(now, { eventIds: [eventId] });
}

/**
 * One party the reminder is about: the recipient themself, or a child whose ask they carry.
 *  WHOLE    — nothing of theirs answered yet (for the recipient with no rows of their own: they have
 *             not said whether they can come).
 *  PARTIAL  — some answered, some still open; `pendingNames` are the open ones.
 *  DONE     — nothing open. Never named.
 */
export interface ChaseParty {
  state: 'WHOLE' | 'PARTIAL' | 'DONE';
  pendingNames: string[];
}

/**
 * [[GTC-189]] slice 8b — D5 AGAIN, AT THE SEND. The dispatcher asks this before a reminder goes,
 * because a guest can answer between the tick that queued it and the tick that sends it, and a
 * reminder arriving after the answer is the defect F7 names. The same rule as the finder, through
 * `stillUnanswered`, so the two cannot disagree.
 *
 * ⚠ AND IT SAYS WHAT IS STILL OPEN, BY NAME — founder ruling at the 8b hold, 2026-09-27: *"a reminder
 * names only what is still unanswered, and never tells someone who has answered anything 'I haven't
 * heard from you'."* So it returns each party's state and open row names, and whether the recipient
 * has answered anything at all, for `composeChase` to word.
 */
export async function readChaseOwed(
  db: Prisma.TransactionClient,
  eventId: string,
  recipientPersonEventId: string,
  carriedPersonEventIds: readonly string[]
): Promise<{
  owed: boolean;
  itemless: boolean;
  answeredAnything: boolean;
  self: ChaseParty;
  carried: (ChaseParty & { name: string })[];
}> {
  const ids = [recipientPersonEventId, ...carriedPersonEventIds];
  const members = await db.personEvent.findMany({
    where: { id: { in: ids }, eventId },
    select: {
      id: true,
      personId: true,
      attendanceAnswer: true,
      person: { select: { name: true } },
    },
  });
  const rows = await db.assignment.findMany({
    where: { item: { team: { eventId } }, personId: { in: members.map((m) => m.personId) } },
    select: { personId: true, response: true, item: { select: { name: true } } },
    orderBy: { item: { name: 'asc' } },
  });
  const partyOf = (personId: string): ChaseParty & { rows: number; answered: number } => {
    const mine = rows.filter((r) => r.personId === personId);
    const pending = mine.filter((r) => r.response === 'PENDING');
    const answered = mine.length - pending.length;
    const state = pending.length === 0 ? 'DONE' : answered === 0 ? 'WHOLE' : ('PARTIAL' as const);
    return { state, pendingNames: pending.map((r) => r.item.name), rows: mine.length, answered };
  };
  const recipient = members.find((m) => m.id === recipientPersonEventId);
  if (!recipient) {
    return {
      owed: false,
      itemless: false,
      answeredAnything: false,
      self: { state: 'DONE', pendingNames: [] },
      carried: [],
    };
  }
  const own = partyOf(recipient.personId);
  // With no rows of their own, the recipient was asked whether they can come (ruling AA).
  const self: ChaseParty =
    own.rows > 0
      ? { state: own.state, pendingNames: own.pendingNames }
      : { state: recipient.attendanceAnswer === null ? 'WHOLE' : 'DONE', pendingNames: [] };
  const carried = members
    .filter((m) => m.id !== recipientPersonEventId)
    .map((m) => ({ name: m.person.name, ...partyOf(m.personId) }));
  const carriedRows = carried.reduce((n, c) => n + c.rows, 0);
  return {
    owed: stillUnanswered({
      attendanceAnswer: recipient.attendanceAnswer,
      ownRows: own.rows,
      ownPending: own.pendingNames.length,
      carriedRows,
      carriedPending: carried.reduce((n, c) => n + c.pendingNames.length, 0),
    }),
    itemless: own.rows === 0 && carriedRows === 0,
    answeredAnything:
      own.answered > 0 ||
      recipient.attendanceAnswer !== null ||
      carried.some((c) => c.answered > 0),
    self,
    carried: carried
      .filter((c) => c.state !== 'DONE')
      .map((c) => ({ name: c.name, state: c.state, pendingNames: c.pendingNames })),
  };
}
