import type { Prisma } from '@prisma/client';
import type { TnzResultVerdict } from './tnz-delivery-contract';
import type { TextBlockReason } from '@/lib/eligibility/text-block';

/**
 * [[GTC-258]] — WHAT HAPPENED TO A TEXT, IN GATHER'S WORDS, AND WHAT EACH OUTCOME DOES.
 *
 * TNZ's verdict (`interpretTnzResult` in `./tnz-delivery-contract.ts`) says what TNZ reported. This
 * module says what Gather makes of it, ruled 2026-10-02 (SCOPED Q2, Q3 and plan rulings Q1 to Q4,
 * verbatim in GTC-258). It is stored in `OutboundMessage.deliveryState` on the TEXT row, beside
 * TNZ's own Result in `providerLastEvent`, the way the email poll stores Resend's.
 *
 * ⚠ EVERY KIND IS PREFIXED TEXT_, SO NONE COLLIDES WITH A RESEND KIND IN THE SAME COLUMN. Two of
 * Resend's (`IN_FLIGHT`, `UNRECOGNISED`) would otherwise mean different things on different rows.
 *
 * ⚠ NOT A COLOUR. The board's reading is `TEXT_DELIVERY_STATE_MEANS` in
 * `src/lib/glance/delivery-fact.ts`, beside Resend's. The contract module stays free of both.
 *
 *   TEXT_ARRIVED              delivered / SentOK                   sent
 *   TEXT_REACHED_NETWORK      delivered-to-network                 sent (Q3)
 *   TEXT_DEAD_CHANNEL         the number cannot receive            red, blocked, retried
 *   TEXT_OPTED_OUT            "Destination is blacklisted"         not red, blocked (a STOP), thank-you retried
 *   TEXT_OUR_FAULT            ours or TNZ's to fix                 red, not blocked, retried
 *   TEXT_UNDELIVERED          "Undelivered", no reason given       red, not blocked, retried (plan Q2)
 *   TEXT_CANCELLED            "Control Deleted" in TNZ's Dashboard red, not blocked, NOT retried (plan Q3)
 *   TEXT_FAILED_UNRECOGNISED  Status Failed, a Result not known    red, not blocked, retried (plan Q4)
 *   TEXT_UNRECOGNISED         Status Success, a Result not known   sent (plan Q4)
 */
export type TextOutcomeKind =
  | 'TEXT_ARRIVED'
  | 'TEXT_REACHED_NETWORK'
  | 'TEXT_DEAD_CHANNEL'
  | 'TEXT_OPTED_OUT'
  | 'TEXT_OUR_FAULT'
  | 'TEXT_UNDELIVERED'
  | 'TEXT_CANCELLED'
  | 'TEXT_FAILED_UNRECOGNISED'
  | 'TEXT_UNRECOGNISED';

/**
 * TNZ's verdict as an outcome, or null while TNZ are not finished (PENDING) or when the envelope was
 * never a delivery outcome. Only a FINAL report has an outcome, which is what lets the replay read
 * `deliveryCheckedAt` as the instant the failure was learned.
 */
export function textOutcomeOf(
  v: Pick<TnzResultVerdict, 'statusClass' | 'arrival' | 'failureBucket' | 'terminal'>
): TextOutcomeKind | null {
  if (!v.terminal) return null;
  switch (v.arrival) {
    case 'ARRIVED':
      return 'TEXT_ARRIVED';
    case 'REACHED_NETWORK_ONLY':
      return 'TEXT_REACHED_NETWORK';
    case 'ABORTED_BEFORE_SEND':
      return 'TEXT_CANCELLED';
    case 'DID_NOT_ARRIVE':
      switch (v.failureBucket) {
        case 'DEAD_CHANNEL':
          return 'TEXT_DEAD_CHANNEL';
        case 'OPTED_OUT':
          return 'TEXT_OPTED_OUT';
        case 'OUR_FAULT':
          return 'TEXT_OUR_FAULT';
        case 'UNASSIGNED':
          return 'TEXT_UNDELIVERED';
        default:
          return 'TEXT_FAILED_UNRECOGNISED';
      }
    case 'UNRECOGNISED_RESULT':
      // Plan ruling Q4: TNZ's Status decides. Failed is TNZ saying it did not arrive.
      if (v.statusClass === 'FAILED') return 'TEXT_FAILED_UNRECOGNISED';
      if (v.statusClass === 'SUCCESS') return 'TEXT_UNRECOGNISED';
      return null;
    case 'IN_FLIGHT':
      return null;
  }
}

/**
 * WHICH OUTCOMES BLOCK THE NUMBER, FOR EVERY HOST. A `Record`, so a new kind is a compile error until
 * somebody decides. Only a number TNZ said cannot receive, and one on TNZ's opt-out list: a fault on
 * TNZ's or Gather's side reads red but does not block (Q2), and blocking on a failure that may be
 * passing would lose a number for every host.
 */
export const TEXT_OUTCOME_BLOCKS: Record<TextOutcomeKind, TextBlockReason | null> = {
  TEXT_ARRIVED: null,
  TEXT_REACHED_NETWORK: null,
  TEXT_DEAD_CHANNEL: 'DEAD_CHANNEL',
  TEXT_OPTED_OUT: 'OPTED_OUT',
  TEXT_OUR_FAULT: null,
  TEXT_UNDELIVERED: null,
  TEXT_CANCELLED: null,
  TEXT_FAILED_UNRECOGNISED: null,
  TEXT_UNRECOGNISED: null,
};

/** The two messages that only ever go once, and so get the one email retry (Q2). */
export type RetriedKind = 'THANK_YOU' | 'DECIDE_BY_FOLLOWUP';

/**
 * WHICH OUTCOMES EARN THE ONE EMAIL RETRY, PER MESSAGE.
 *
 * - The thank-you on every failure, TEXT_OPTED_OUT included: a guest who has opted out of texts
 *   already gets their thank-you by email (`generateWrapUpLinks`).
 * - The follow-up on the same, less TEXT_OPTED_OUT: a text opt-out stops the follow-up altogether
 *   ([[GTC-251]] Q4a), and plan ruling Q1 makes TNZ's list the guest's own STOP.
 * - Neither on TEXT_CANCELLED (plan ruling Q3): a cancel in TNZ's Dashboard is someone at Gather
 *   acting on purpose, and TNZ mark it a success "to avoid retries".
 */
export const TEXT_OUTCOME_RETRIES: Record<TextOutcomeKind, Record<RetriedKind, boolean>> = {
  TEXT_ARRIVED: { THANK_YOU: false, DECIDE_BY_FOLLOWUP: false },
  TEXT_REACHED_NETWORK: { THANK_YOU: false, DECIDE_BY_FOLLOWUP: false },
  TEXT_DEAD_CHANNEL: { THANK_YOU: true, DECIDE_BY_FOLLOWUP: true },
  TEXT_OPTED_OUT: { THANK_YOU: true, DECIDE_BY_FOLLOWUP: false },
  TEXT_OUR_FAULT: { THANK_YOU: true, DECIDE_BY_FOLLOWUP: true },
  TEXT_UNDELIVERED: { THANK_YOU: true, DECIDE_BY_FOLLOWUP: true },
  TEXT_CANCELLED: { THANK_YOU: false, DECIDE_BY_FOLLOWUP: false },
  TEXT_FAILED_UNRECOGNISED: { THANK_YOU: true, DECIDE_BY_FOLLOWUP: true },
  TEXT_UNRECOGNISED: { THANK_YOU: false, DECIDE_BY_FOLLOWUP: false },
};

/** The outcomes that earn this message its retry, as a list for a `where … in`. */
export function retryableFor(kind: RetriedKind): TextOutcomeKind[] {
  return (Object.keys(TEXT_OUTCOME_RETRIES) as TextOutcomeKind[]).filter(
    (k) => TEXT_OUTCOME_RETRIES[k][kind]
  );
}

/**
 * WRITE AN OUTCOME ONTO ITS TEXT ROW. The first final outcome wins: the guard is
 * `deliveryPollDoneAt IS NULL`, the email poll's own "we have stopped asking", so a second final
 * report for the same message (or TNZ's retry of the first) changes nothing.
 *
 * `deliveryCheckedAt` is the instant GATHER recorded it — which is what [[GTC-335]]'s replay plays the
 * step at, as it does for a bounce. Shaped so [[GTC-290]]'s status poll can feed it unchanged.
 */
export async function applyTextOutcome(
  tx: Prisma.TransactionClient,
  args: {
    outboundMessageId: string;
    outcome: TextOutcomeKind;
    providerLastEvent: string | null;
    now?: Date;
  }
): Promise<boolean> {
  const now = args.now ?? new Date();
  const { count } = await tx.outboundMessage.updateMany({
    where: { id: args.outboundMessageId, channel: 'TEXT', deliveryPollDoneAt: null },
    data: {
      deliveryState: args.outcome,
      providerLastEvent: args.providerLastEvent,
      deliveryCheckedAt: now,
      deliveryPollDoneAt: now,
    },
  });
  return count === 1;
}
