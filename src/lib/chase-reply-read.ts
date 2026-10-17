/**
 * [[GTC-350]] — the server-side half of `chase-reply.ts`: each guest's text replies, read once.
 *
 * ⚠ THE ONE PLACE A REPLY'S INSTANT IS READ. Ruling 1's fence, relaxed by Q2 for text replies only
 * (`REPLY_FENCE_DENYLIST` in `tests/glance-fence.ts`), keeps the reply row, TNZ's ids, the instant
 * and the number out of every glance source. This module sits outside that fence for the reason
 * `chase-exhaustion-read.ts` does: it reads the instants, turns them into a decision
 * (`replyInForce`) and a line already written (`replyWhen`), and only those reach the board.
 *
 * Only `TextReply` rows count (note 1): [[GTC-288]] keeps a reply only when TNZ's MessageID ties it
 * to one of Gather's texts and it came from the number that text went to. STOP and START are never
 * kept as replies. Nothing here guesses, and nothing tries to detect a stray reply (Q3).
 *
 * READS ONLY. Zone 7 is not read or written here: a reply is not an opt-out.
 */

import type { Prisma } from '@prisma/client';
import { isDecideByExpired } from '@/lib/decide-by';
import type { GlanceReply } from '@/lib/glance/state';
import { replyInForce, replyWhen } from '@/lib/chase-reply';

type Db = Prisma.TransactionClient;

export interface ReplyFacts {
  /** Each membership's reply instants. Server-side only. */
  repliedAt: Map<string, Date[]>;
  /** Each membership's latest hand-back instant, when both columns are set. */
  handBackAt: Map<string, { at: Date }>;
  /** Each PERSON's replies on this event, newest first, as the board shows them (Q2). */
  board: Map<string, GlanceReply[]>;
  /** Memberships holding a live maybe whose one follow-up has not gone yet. */
  followUpOwed: Set<string>;
  /** Memberships holding a live maybe whose one follow-up has already gone. */
  followUpSpent: Set<string>;
}

export async function readReplyFacts(
  db: Db,
  eventId: string,
  now: Date = new Date()
): Promise<ReplyFacts> {
  const [event, memberships, replies, maybes] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { status: true, sentAt: true, endDate: true, decideByOffsetHours: true },
    }),
    db.personEvent.findMany({
      where: { eventId },
      select: { id: true, personId: true, handBackReminders: true, handedBackAt: true },
    }),
    db.textReply.findMany({
      where: { eventId },
      select: { personId: true, body: true, receivedAt: true },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    }),
    db.assignment.findMany({
      where: { item: { team: { eventId } }, response: 'MAYBE' },
      select: {
        personId: true,
        response: true,
        decideByFollowupSentAt: true,
        item: { select: { dropOffAt: true, decideByOffsetHours: true } },
      },
    }),
  ]);

  const membershipOf = new Map(memberships.map((m) => [m.personId, m.id]));
  const repliedAt = new Map<string, Date[]>();
  const board = new Map<string, GlanceReply[]>();
  for (const r of replies) {
    const shown = board.get(r.personId) ?? [];
    shown.push({ words: r.body, when: replyWhen(r.receivedAt) });
    board.set(r.personId, shown);
    const membership = membershipOf.get(r.personId);
    if (!membership) continue;
    const times = repliedAt.get(membership) ?? [];
    times.push(r.receivedAt);
    repliedAt.set(membership, times);
  }

  const handBackAt = new Map<string, { at: Date }>();
  for (const m of memberships) {
    if (m.handBackReminders !== null && m.handedBackAt !== null) {
      handBackAt.set(m.id, { at: m.handedBackAt });
    }
  }

  const followUpOwed = new Set<string>();
  const followUpSpent = new Set<string>();
  for (const a of maybes) {
    const membership = membershipOf.get(a.personId);
    if (!membership || isDecideByExpired(a, a.item, event, now)) continue;
    if (a.decideByFollowupSentAt === null) followUpOwed.add(membership);
    else followUpSpent.add(membership);
  }

  return { repliedAt, handBackAt, board, followUpOwed, followUpSpent };
}

/**
 * For a sender about to send one message: is a reply in force for this membership now? The drain
 * and the decide-by retry ask this at the send, because a reply can land between the tick that
 * queued a reminder and the tick that would send it.
 */
export async function readReplyInForce(
  db: Db,
  eventId: string,
  personEventId: string,
  now: Date = new Date()
): Promise<boolean> {
  const membership = await db.personEvent.findUnique({
    where: { id: personEventId },
    select: { personId: true, handBackReminders: true, handedBackAt: true },
  });
  if (!membership) return false;
  const replies = await db.textReply.findMany({
    where: { eventId, personId: membership.personId },
    select: { receivedAt: true },
  });
  const handBack =
    membership.handBackReminders !== null && membership.handedBackAt !== null
      ? { at: membership.handedBackAt }
      : null;
  return replyInForce(
    replies.map((r) => r.receivedAt),
    handBack,
    now
  );
}
