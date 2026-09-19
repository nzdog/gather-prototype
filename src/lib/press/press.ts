import type { OutboundChannel, PrismaClient } from '@prisma/client';
import { ensureEventTokens } from '@/lib/tokens';
import { pressWillMessage, readAskPreview } from '@/lib/preflight/ask-preview';
import { recordChange, type LedgerActor } from '@/lib/ledger';
import { logInviteEvent } from '@/lib/invite-events';

/**
 * GTC-189 slice 5a — THE PRESS. One writer, and it is dark.
 *
 * Hinge §2: the press commits the release — no recall, no undo, at the mechanism level too
 * (ruled gap #1). Moment 4 §7: "the audit trail starts at the send."
 *
 * ⚠ NOTHING HERE SENDS ANYTHING. This writes the lock, one `OutboundMessage` per addressed
 * recipient, and the ledger's first entry. The dispatcher that drains those rows is slice 5c
 * and does not exist, so every row this creates is unclaimed and unfinished. No provider is
 * reached from this module, and `tests/press-route-test.ts` layer N asserts that it names
 * none.
 *
 * ── ONE ROUTE (DECISION 30), AND BOTH DOORS CALL THIS ─────────────────────────
 *
 * `POST /api/events/[id]/send` under session auth and `POST /api/h/[token]/send` under a HOST
 * token were two routes each doing the whole job, and they had already drifted: the
 * host-token one wrote no `recipientCount` into its `SEND_PRESSED` entry. The founder's
 * ruling: *"Two routes doing the whole job is how they drift, and they have already drifted
 * once."* So each route keeps its own auth — that is the one thing they must not share — and
 * everything after the auth is here.
 *
 * ── RENAMED (DECISION 31), AND THE OLD NAME IS A POINTER ──────────────────────
 *
 * `confirm-invites-sent` described the model in which the host sent the invitations by hand
 * and told Gather she had. Both old paths survive as redirects and carry no press logic, on
 * the founder's answer of 2026-09-19: *"Rename now, and take the redirect."*
 *
 * ⚠ AND THE REASON THE RENAME IS LOAD-BEARING RATHER THAN TIDY. Two LIVE host-reachable
 * buttons post to the old path and neither is the pre-flight: `InviteStatusSection` on
 * `/plan/[eventId]` and the host view at `/h/[token]`, both reading "I've sent the invites".
 * While this slice is dark that is safe, because the rows never drain. **It stops being safe
 * the moment slice 5c exists**, because a button that says "I have already done this myself"
 * would become the button that does it, behind no preview and behind none of the pre-flight's
 * five checks. `tests/press-route-test.ts` layer W is the tripwire.
 *
 * ── WHAT GETS A ROW: SIX MEMBERSHIPS, NOT EIGHT (FOUNDER Q1, 2026-09-19) ──────
 *
 * *"The outbound row is addressed to someone, and the pre-flight's own arithmetic says
 * '8 messages' — two of those eight are not messages. It also makes the withheld count a
 * truthful answer to 'how many did not go out'."*
 *
 * So a recipient gets a row IF AND ONLY IF the press has a link to put in their message.
 * `ensureEventTokens` runs FIRST, inside this transaction, so by the time the preview is read
 * every recipient who can hold a token does; the ones left are `NONE_HOST_CARRIER` (the host
 * as carrier — [[GTC-297]] owns her link) and `NONE_NOT_ISSUED` (the fail-closed default for
 * a role added later). Neither is a message, and `composeAsk` could not compose one for them
 * anyway: its `link` is a required string.
 *
 * ⚠ AND DECISION 29 IS SATISFIED EITHER WAY. THIS IS BOOKKEEPING, NOT HONESTY. The
 * founder's instruction, recorded separately so nobody reads the row set as the thing that
 * makes the press honest: *"The pre-flight is what makes it honest; this is bookkeeping."*
 * What tells the host is slice 3's screen carrying decision 29's state.
 *
 * ── WHAT IS NOT WRITTEN, AND IT USED TO BE ────────────────────────────────────
 *
 * ⚠ `PersonEvent.sentAt` IS NOT STAMPED HERE. Ruling G: each person's clock starts when
 * their provider accepts their message, so the stamp belongs to the dispatcher (slice 5d).
 * The `personEvent.updateMany` both old routes ran is gone. Nothing breaks in the drain
 * window: `findNudgeCandidates` in `src/lib/sms/nudge-eligibility.ts` records
 * `sentAt: { not: null }` as *"A FAIL-SAFE, NOT A TIDY-UP"* and anchors the cadence on
 * `membership.sentAt!`, so a recipient whose send has not been accepted is simply not
 * nudgeable.
 *
 * ⚠ THE CONSEQUENCE TO CARRY: a WITHHELD or REJECTED recipient never gets a
 * `PersonEvent.sentAt`, so they are never chased, ever. That is correct — nothing chases
 * someone who was never reached — and it makes the `OutboundMessage` row the only record
 * that they were meant to be asked.
 *
 * ── GTC-256 RULING 5, AND WHERE IT NOW LIVES ──────────────────────────────────
 *
 * The old route filtered its count through `isAddressable` inline. It does not need to:
 * the host's exclusion is inside `chooseAskRoute`, which answers
 * `NOT_A_RECIPIENT / HOST_OWN_ASK` for her own ask and admits her only as a carrier under
 * ruling A2. One predicate, one caller — so Ruling 5 is enforced one module deeper than it
 * was, not more weakly. `tests/host-never-messaged-test.ts` follows the guard to
 * `src/lib/eligibility/channel-chooser.ts` for the same reason.
 */

/** Why the press refused. Every one is about the event's STATE, never about the request. */
export type PressRefusalCode =
  | 'EVENT_NOT_FOUND'
  | 'ALREADY_SENT'
  | 'NOT_CONFIRMING'
  | 'HOST_HAS_NO_ACCOUNT'
  | 'NO_RECIPIENTS'
  | 'RECIPIENTS_UNAVAILABLE'
  | 'LINKS_NOT_ISSUED';

export interface PressRefusal {
  ok: false;
  /**
   * 404 for an event that is not there; 409 for every state refusal.
   *
   * ⚠ 409, AND NOT 402 OR 403 — the founder's answer of 2026-09-19, recorded with its
   * reason because the shapes differ for a reason: *"A 402 says pay, a 403 says you may not,
   * and neither is true of an event that is not ready. 409 is the honest one — the request is
   * fine, the state is not."*
   *
   * ✅ AND 409 COVERS THE WHOLE FAMILY — WIDENED DELIBERATELY, RULED 2026-09-19, and not
   * inherited from slice 5a by accident. The founder's words: *"A refusal about the state of
   * the event is a 409 whatever the specific state, and two shapes for one family is how a
   * caller learns to read the wrong one."*
   *
   * So the second press and the not-CONFIRMING guard, which both answered 400 before slice
   * 5a, are 409 by the same ground as the rest. Measured before changing them: no suite
   * pinned the status, and neither live caller branches on it. ⚠ DO NOT "RESTORE" A 400 FOR
   * THE OLDER TWO on the grounds that they predate the rest — the family is the point.
   */
  status: 404 | 409;
  code: PressRefusalCode;
  /** What the caller may show. [[GTC-309]] owns what the PRE-FLIGHT shows for the host-account case. */
  message: string;
}

export interface PressSuccess {
  ok: true;
  confirmedAt: Date;
  /**
   * HOW MANY PEOPLE WERE MESSAGED. `addressed.length`, computed from the addressed set and
   * never from a row count.
   *
   * ⚠ THE DOCSTRING USED TO SAY *"the number of `OutboundMessage` rows written"*, AND
   * [[GTC-325]] MADE THAT FALSE while leaving the value right. Since that ticket the press
   * also writes a row for every person on the HOST LIST — one row per person the press
   * DECIDED ABOUT — so the row count exceeds the message count by the size of that list, for
   * the first time. Surveyed at GTC-325: this was the only place in the tree where the two
   * were equated, and it was equated in prose rather than in arithmetic. **Anything that
   * starts counting rows to answer "how many did we message" is wrong from that day.**
   */
  recipientCount: number;
  totalMemberships: number;
  peopleAnchored: number;
}

export type PressOutcome = PressSuccess | PressRefusal;

/**
 * A refusal decided INSIDE the transaction, thrown so the transaction rolls back, and
 * unwrapped outside it so the caller gets a told refusal rather than a 500.
 *
 * ⚠ FOUNDER Q3, 2026-09-19, FAIL CLOSED: *"An event whose recipient set cannot be assembled
 * is not an event ready to send, and 500-then-nothing is the shape where the host presses and
 * cannot tell what happened."* A `return` from inside `$transaction` would commit what came
 * before it; a bare `throw` would reach the route as a 500. This carries both properties.
 */
class PressRefused extends Error {
  constructor(readonly refusal: PressRefusal) {
    super(refusal.code);
  }
}

const refuse = (status: 404 | 409, code: PressRefusalCode, message: string): PressRefusal => ({
  ok: false,
  status,
  code,
  message,
});

export async function pressSend(
  db: PrismaClient,
  args: { eventId: string; actor: LedgerActor; baseUrl: string }
): Promise<PressOutcome> {
  const { eventId, actor, baseUrl } = args;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      status: true,
      sentAt: true,
      hostId: true,
      host: { select: { userId: true, user: { select: { email: true } } } },
      _count: { select: { people: true } },
    },
  });

  if (!event) {
    return refuse(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  /*
   * GTC-169 (A3a): THE PRESS HAPPENS ONCE. "The send happens once, for her... experientially
   * it is one act, one sentence, one handover" (Hinge §7).
   *
   * Freezing used to be what stopped a second press. With FROZEN gone the guard is explicit
   * here rather than a side effect of a state machine. People added afterwards get their own
   * mini-send, not a re-press of the whole event (Hinge §2, gap #5) — slice 5e.
   *
   * ⚠ THIS IS THE ROUTE'S IDEMPOTENCY AND IT IS NOT THE DISPATCHER'S. The dispatcher's is
   * `OutboundMessage.attemptedAt`, claimed before the provider is called. Two different
   * questions: "may this event be pressed again" and "may this row be sent again".
   */
  if (event.sentAt) {
    return refuse(409, 'ALREADY_SENT', 'This event has already been sent');
  }

  if (event.status !== 'CONFIRMING') {
    return refuse(409, 'NOT_CONFIRMING', 'Can only send when the event is in CONFIRMING status');
  }

  /*
   * RULING AC (decision 12, 2026-09-15): THE PRESS REFUSES WHEN THE HOST HAS NO ACCOUNT.
   * "An event whose host has no account is fixed before it sends, not sent with a hole in
   * it."
   *
   * The reply-to is `User.email` by ruling F, and there is no custom reply-to column —
   * "building it now is building for a want nobody has expressed." So no account means no
   * reply-to, and a message whose replies go nowhere is the hole the ruling refuses.
   *
   * ⚠ THE REFUSAL IS HERE; WHAT SHE IS SHOWN IS [[GTC-309]]'s, and the two halves must not
   * be built with two different messages. That ticket carries the measurement (2 of 29 events
   * in `gather_dev`, 0 of them paid), the claim flow that fixes it, and the three things that
   * stand between this refusal and a host who can act on it.
   *
   * Checked against the email and not only the `userId`: `requireEventRole` keys on the
   * SESSION user's `EventRole` while the reply-to reads `Event.hostId -> Person.userId ->
   * User.email`. They are different identities, which is why the state is reachable at all.
   */
  if (!event.host?.userId || !event.host.user?.email) {
    return refuse(
      409,
      'HOST_HAS_NO_ACCOUNT',
      'This event has no host account, so replies would have nowhere to go. Claim the event first.'
    );
  }

  const now = new Date();

  try {
    return await db.$transaction(
      async (tx) => {
        /*
         * ⚠ TOKENS FIRST, AND INSIDE THE TRANSACTION. The build shape's first clause is a
         * CHANGE and not a description: neither old route called this, and 169 of 232
         * recipients in `gather_dev` hold no PARTICIPANT token. The press is where they get
         * one, and the preview below must read the state this leaves — otherwise the row set
         * and the link the message carries are decided from two different instants.
         *
         * ⚠ AND IT FIRES [[GTC-316]], WHICH IS FILED, HIGH, AND NOT FIXED HERE. Issuance
         * keys on `PersonEvent.role` and childness lives on `householdRole`, so every CHILD
         * membership is minted a PARTICIPANT token the unauthenticated family directory then
         * publishes. 57 of the 60 in `gather_dev` would be minted by a press. The founder's
         * instruction, 2026-09-18: *"File it, High, before anything else... Do not fix it. Do
         * not fold it in."* Named here because this line is what makes it live.
         */
        await ensureEventTokens(eventId, tx as unknown as PrismaClient);

        /*
         * FOUNDER Q3 — FAIL CLOSED. `readAskPreview` answers null only for an event that is
         * not there, which cannot happen at this point, but the refusal exists rather than
         * being argued away: an unassemblable recipient set is a told refusal, never a 500.
         */
        const preview = await readAskPreview(tx, eventId, baseUrl);
        if (!preview) {
          throw new PressRefused(
            refuse(
              409,
              'RECIPIENTS_UNAVAILABLE',
              'The recipient list could not be assembled, so nothing was sent.'
            )
          );
        }

        /*
         * FOUNDER Q1 — a row is addressed to someone.
         *
         * ⚠ TWO SETS, AND THE DIFFERENCE BETWEEN THEM IS A REFUSAL RATHER THAN A SILENT DROP.
         * GTC-189 slice 5b.
         *
         * `intended` is what the PRE-FLIGHT promised: `pressWillMessage` is the one rule, shared
         * with the screen so the two cannot answer "who gets a message" differently. Slice 5a
         * read `linkState === 'READY'` inline here, which was a second reading of that rule in a
         * different file from the states — and `ask-preview.ts` already carries a note about the
         * mirror it keeps of `ensureEventTokens` step 4 drifting once, at [[GTC-294]].
         *
         * `addressed` is what issuance actually delivered. After `ensureEventTokens` above,
         * every intended recipient must hold a token, so the two sets must be equal.
         *
         * ⚠ WHEN THEY ARE NOT, SLICE 5a DROPPED THE DIFFERENCE IN SILENCE — no row, no
         * withholding, nothing telling the host she is reaching fewer people than the screen
         * promised. That is the exact shape decision 29 exists to prevent, arriving from inside
         * the press instead of from the preview. It is reachable: `linkOf` answers `AT_PRESS`
         * for any PARTICIPANT membership, while step 4 mints only where
         * `role === 'PARTICIPANT' && !coordinatorIds.has(personId)` and `coordinatorIds` carries
         * NO ROLE FILTER — so a PARTICIPANT membership whose person is a team's `coordinatorId`
         * is promised a link and minted none. **Measured in `gather_dev` on 2026-09-19: 0 such
         * memberships.** Latent, not live, and refused rather than left to become live.
         */
        const intended = preview.recipients.filter((r) => pressWillMessage(r.linkState));
        const addressed = intended.filter((r) => r.linkState === 'READY');

        if (addressed.length !== intended.length) {
          throw new PressRefused(
            refuse(
              409,
              'LINKS_NOT_ISSUED',
              'Some guests could not be given a link, so nothing was sent.'
            )
          );
        }

        /*
         * ✅ AN EVENT WITH NOBODY TO ASK IS REFUSED — RULED 2026-09-19, in the founder's words:
         * *"An event with nobody to message is not an event ready to send, and refusing is the
         * same fail-closed direction as ruling AC."*
         *
         * It was proposed as the executor's reading of ruling AC's ground and is now the
         * ruling itself. Recorded as ruled rather than left as a reading, because the two
         * statuses of a sentence like this are not interchangeable to whoever reads it next.
         */
        if (addressed.length === 0) {
          throw new PressRefused(
            refuse(409, 'NO_RECIPIENTS', 'There is nobody to send to yet, so nothing was sent.')
          );
        }

        await tx.event.update({ where: { id: eventId }, data: { sentAt: now } });

        /*
         * The outbound record, one row per addressed recipient. `channel` is the chooser's
         * answer, STORED — `OutboundChannel` is spelled to match `Channel` in
         * `channel-chooser.ts` exactly so there is no mapping layer for the two to disagree
         * across.
         *
         * Nothing else is set. `attemptedAt`, `provider`, `providerMessageId`, `acceptedAt`,
         * `rejectedAt`, `withheldAt`, `withheldWhy` and `nextAttemptAt` are all facts about
         * an ATTEMPT, and the press makes none.
         */
        await tx.outboundMessage.createMany({
          data: addressed.map((r) => ({
            eventId,
            personEventId: r.personEventId,
            kind: 'ASK' as const,
            channel: r.channel as OutboundChannel,
          })),
        });

        /*
         * ── [[GTC-325]] — AND A ROW FOR EVERY PERSON THE PRESS DECIDED NOT TO MESSAGE ────
         *
         * Founder ruling, 2026-09-19, shape 3:
         *
         *   "YES, the press writes a withheld row for the host list. The reason: the outbound
         *    row is the record of what the press decided about a person, and deciding not to
         *    message someone is a decision about them. A population the press reasoned over and
         *    left no trace of is how the board and the press come to disagree."
         *
         * ⚠ SO `OutboundMessage` CHANGES MEANING HERE, from ONE ROW PER ADDRESSED RECIPIENT to
         * ONE ROW PER PERSON THE PRESS DECIDED ABOUT. That is the ruling and not a side effect
         * of it; the model's own docstring says the second thing now.
         *
         * ⚠ WHAT IT FIXES, AND IT IS WHY THE RULING EXISTS. Slice 7a reads the delivery fact OFF
         * THE ROW — a founder ruling, so that the board and the press cannot disagree by
         * construction. But ruling M's red is about *"a line on the host's list"*, and the press
         * wrote no row for those people, so `UNREACHABLE` **fired for nobody**: four people on
         * the one pressable board read AMBER — *with Gather* — about a decision Gather had
         * already made. Nothing in slice 7a or in the drain changes to fix it; the missing row
         * was the whole defect.
         *
         * ⚠ BORN FINISHED, AND THAT IS WHAT KEEPS THE DRAIN AWAY FROM THEM. `withheldAt` is set
         * at creation, so `findNeverAttempted`'s `withheldAt: null` clause excludes them on the
         * first tick and every tick after; no claim is ever taken and `recordWithholding` would
         * no-op on them anyway. The drain needs no new branch — see the fence in `drainOnce`,
         * which exists for the row that should never reach it rather than for one that does.
         *
         * ⚠ `channel` IS NULL, WHICH IS A MEANING AND NOT AN ABSENCE: there was nobody to send
         * to. The founder refused `EMAIL` by convention and refused a `NONE` member, in those
         * words, at the same ruling.
         *
         * ⚠ AND CHILDREN ARE EXCLUDED, DELIBERATELY. `hostList` carries two kinds of line —
         * adults the chooser cannot reach, and children whose carrier route is closed — and the
         * second is GTC-325's **case 1, which the founder left OPEN**. Writing rows for them
         * would answer it by building, and it would give children `OutboundMessage` rows for the
         * first time, which several fences in this tree assert they do not have. Measured on the
         * one pressable board, 2026-09-19: 4 host-list lines, 0 of them children, so the
         * exclusion costs nothing today and the ruling stays the founder's.
         *
         * ⚠ THE COUNTS STAY MESSAGE-COUNTS. `recipientCount` and the ledger's `recipients` are
         * both `addressed.length` and neither reads a row count — see the docstring above, which
         * this change had to correct.
         */
        const decidedAgainst = preview.hostList.filter((line) => !line.child);
        if (decidedAgainst.length > 0) {
          await tx.outboundMessage.createMany({
            data: decidedAgainst.map((line) => ({
              eventId,
              personEventId: line.personEventId,
              kind: 'ASK' as const,
              channel: null,
              withheldAt: now,
              withheldWhy: line.why,
            })),
          });
        }

        /*
         * GTC-196 (A3b): the anchor. NOT the per-person send clock — that is ruling G's and
         * is the dispatcher's.
         *
         * ⚠ AND THE TWO NOW DISAGREE BY THE DRAIN WINDOW, WHICH IS RAISED AND NOT DECIDED.
         * `Person.inviteAnchorAt` is global to the person, and three surfaces read it — the
         * plan page's `daysSinceAnchor`, `GET /api/h/[token]` (`else if
         * (person.inviteAnchorAt) status = 'SENT'`) and the invite-detail route. With
         * `PersonEvent.sentAt` moving to acceptance, those three read a person as SENT before
         * their message has been accepted, and for a withheld or rejected person they read
         * SENT for good. No ruling moves `inviteAnchorAt`, so it is not moved in passing.
         */
        const memberships = await tx.personEvent.findMany({
          where: { eventId },
          select: { personId: true, person: { select: { inviteAnchorAt: true } } },
        });
        const needAnchor = memberships
          .filter((m) => !m.person.inviteAnchorAt)
          .map((m) => m.personId);
        if (needAnchor.length > 0) {
          await tx.person.updateMany({
            where: { id: { in: needAnchor } },
            data: { inviteAnchorAt: now },
          });
        }

        /*
         * THE PRESS ITSELF, AS THE LEDGER'S FIRST ENTRY. Moment 4 §7: "The audit trail starts
         * at the send." Everything after this is versioned and, where it touches someone,
         * interrogated. The entry that marks the threshold belongs in the history it opens.
         *
         * ⚠ `recipients` IS THE NUMBER OF ROWS ACTUALLY WRITTEN, AND IT IS WRITTEN IN THE
         * SAME TRANSACTION THAT WROTE THEM — the founder's answer of 2026-09-19: *"A
         * recipient count written outside it is a number that can disagree with the rows it
         * counts, and that is the defect this ticket has caught four times in other guises."*
         *
         * It is also a DIFFERENT and truer number from the one the old route wrote. That one
         * counted every addressable membership through `isAddressable`; this counts the
         * messages that exist. Under founder Q1 those are not the same, and the difference is
         * the two states that are not messages.
         */
        await recordChange(tx, {
          eventId,
          actor,
          changes: [
            {
              action: 'SEND_PRESSED',
              targetType: 'Event',
              targetId: eventId,
              before: { sentAt: null },
              after: { sentAt: now.toISOString(), recipients: addressed.length },
            },
          ],
        });

        /*
         * Instrumentation, INSIDE the transaction. `logInviteEvent` takes a `tx` and both old
         * routes declined to pass one, so a rolled-back press could leave an
         * INVITE_SEND_CONFIRMED row behind claiming a send that never happened.
         *
         * ⚠ `totalPeople` IS DELIBERATELY NOT `recipients`. It describes the STAMPING
         * operation — how many memberships the event holds, the host's included — and
         * conflating it with the recipient count would make the anchor diagnostics lie. Two
         * different facts, two different counts: the same distinction the old route recorded
         * at length, kept.
         */
        await logInviteEvent(
          {
            eventId,
            type: 'INVITE_SEND_CONFIRMED',
            metadata: {
              totalPeople: memberships.length,
              recipients: addressed.length,
              newAnchorsSet: needAnchor.length,
              previouslyAnchored: memberships.length - needAnchor.length,
            },
          },
          tx as unknown as PrismaClient
        );

        return {
          ok: true as const,
          confirmedAt: now,
          recipientCount: addressed.length,
          totalMemberships: memberships.length,
          peopleAnchored: needAnchor.length,
        };
      },
      /*
       * ⚠ THE DEFAULT 5s INTERACTIVE-TRANSACTION TIMEOUT IS NOT ENOUGH AND THIS IS MEASURED
       * RATHER THAN GUESSED AT THE EDGE. This transaction runs `ensureEventTokens` (a write
       * per tokenless membership), a full `readAskPreview` walk, a `createMany`, an anchor
       * sweep and `recordChange`'s sequence allocation. The largest event in `gather_dev`
       * holds 61 recipients and the largest press available here is 38, so the ceiling is
       * unmeasured — see the slice's evidence, which names this as something it cannot size.
       * Raised deliberately, because a press that times out half way is the one failure the
       * transaction exists to make impossible.
       */
      { timeout: 30_000, maxWait: 15_000 }
    );
  } catch (e) {
    if (e instanceof PressRefused) return e.refusal;
    throw e;
  }
}
