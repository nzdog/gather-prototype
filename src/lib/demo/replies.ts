import type { AssignmentResponse, PrismaClient } from '@prisma/client';
import { recordAssignmentAnswer } from '@/lib/assignment/answer';
import { logAudit } from '@/lib/workflow';
import { copyEventWhere } from '@/lib/demo/copy';
import { readSampleBoardView } from '@/lib/demo/sample-board';
import { REPLIES_WORDS } from '@/lib/demo/replies-words';
import { NON_CHILD_PERSON_EVENT } from '@/lib/eligibility/child-exclusion';

/**
 * [[GTC-445]] "MAKE THE GUESTS REPLY", on a sample copy's board. Founder rulings, 1 Nov 2026 (Q7,
 * Q16; W49 to W56).
 *
 * The sample guests answer, so the visitor sees the board change. Sample copies only
 * (`copyEventWhere`), once only, in ONE transaction: a failure part-way writes nothing.
 *
 * WHO ANSWERS: every guest on the copy but the host, the fixed guest (GTC-444's, who answers
 * herself), the kids, and anyone with no address and no phone (June: nobody could have asked
 * her). In Person id order, the order the guests were made. FIXED, NOT RANDOM, by place n (counted
 * from 1 over the guests who answer). THE PRIORITY: every 6th beats every 5th, which beats every
 * 4th (place 12 does not answer; place 20 declines one):
 *   - every 6th does not answer (amber, waiting);
 *   - every 5th declines one item (its first) and accepts the rest (red, handed back);
 *   - every 4th says maybe on every item (amber);
 *   - the rest accept every item (green);
 *   - a guest holding no item answers attendance: yes, but the first such guest answers no (out).
 *
 * THE WRITERS ARE THE GUESTS' OWN: an item answer goes through `recordAssignmentAnswer`, the
 * writer both answer routes share; an attendance answer writes the two columns and the audit
 * line the guest's own PATCH writes (`logAudit`, its words). The board's replay reads those audit
 * lines, so it shows the answers arriving. Nothing else: no message, no link, no InviteEvent, no
 * sentAt. Nothing here sends, queues, mints or calls out.
 */

export type RepliesRefusalCode = 'NOT_A_SAMPLE' | 'ALREADY_REPLIED' | 'NO_GUESTS';
export type RepliesOutcome =
  | { ok: true; answered: number }
  | { ok: false; status: 409; code: RepliesRefusalCode; words: string };

const refuse = (code: RepliesRefusalCode, words: string): RepliesOutcome => ({
  ok: false,
  status: 409,
  code,
  words,
});

/** The four answer lines a guest's own writers leave, which "already replied" looks for. */
const ANSWER_ACTIONS = [
  'ACCEPT_ASSIGNMENT',
  'DECLINE_ASSIGNMENT',
  'MAYBE_ASSIGNMENT',
  'ANSWER_ATTENDANCE',
];

export type ReplyPlan =
  | { kind: 'NONE' }
  | { kind: 'ITEMS'; responses: AssignmentResponse[] }
  | { kind: 'ATTENDANCE'; answer: 'YES' | 'NO' };

/**
 * The mix, pure: for guests in order (1-based places), each one's answer. `itemCounts[i]` is how
 * many items the i-th guest holds.
 */
export function planReplies(itemCounts: readonly number[]): ReplyPlan[] {
  let noGiven = false;
  return itemCounts.map((count, i) => {
    const n = i + 1;
    if (n % 6 === 0) return { kind: 'NONE' };
    if (count === 0) {
      const answer = noGiven ? 'YES' : 'NO';
      noGiven = true;
      return { kind: 'ATTENDANCE', answer };
    }
    if (n % 5 === 0) {
      return {
        kind: 'ITEMS',
        responses: Array.from({ length: count }, (_, k) => (k === 0 ? 'DECLINED' : 'ACCEPTED')),
      };
    }
    const one: AssignmentResponse = n % 4 === 0 ? 'MAYBE' : 'ACCEPTED';
    return { kind: 'ITEMS', responses: Array.from({ length: count }, () => one) };
  });
}

export async function addDemoReplies(
  db: PrismaClient,
  eventId: string,
  now: Date = new Date()
): Promise<RepliesOutcome> {
  const event = await db.event.findFirst({
    where: { AND: [{ id: eventId }, copyEventWhere()] },
    select: { id: true, hostId: true },
  });
  if (!event) return refuse('NOT_A_SAMPLE', REPLIES_WORDS.NOT_A_SAMPLE);

  return db.$transaction(
    async (tx) => {
      // The event's row is the lock, so two presses at once cannot both answer.
      await tx.$executeRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

      // The fixed guest, exactly as the board's Guest view finds her (GTC-444).
      const view = await readSampleBoardView(tx, eventId, now);
      const fixedToken = view?.guest?.href.startsWith('/p/') ? view.guest.href.slice(3) : null;
      const fixedPersonId = fixedToken
        ? ((
            await tx.accessToken.findUnique({
              where: { token: fixedToken },
              select: { personId: true },
            })
          )?.personId ?? null)
        : null;

      const rows = await tx.personEvent.findMany({
        where: {
          eventId,
          role: { not: 'HOST' },
          personId: { not: event.hostId },
          // Null-safe, as src/app/api/gather/[eventId]/directory/route.ts: a NULL role is an adult.
          ...NON_CHILD_PERSON_EVENT,
          person: { OR: [{ email: { not: null } }, { phoneNumber: { not: null } }] },
        },
        select: {
          id: true,
          personId: true,
          attendanceAnswer: true,
          person: { select: { email: true, phoneNumber: true } },
        },
        orderBy: { person: { id: 'asc' } },
      });
      const guests = rows.filter(
        (r) =>
          r.personId !== fixedPersonId &&
          ((r.person.email ?? '').trim() !== '' || (r.person.phoneNumber ?? '').trim() !== '')
      );
      if (guests.length === 0) return refuse('NO_GUESTS', REPLIES_WORDS.NOBODY);

      const already = await tx.auditEntry.count({
        where: {
          eventId,
          actionType: { in: ANSWER_ACTIONS },
          actorId: { in: guests.map((g) => g.personId) },
        },
      });
      if (already > 0) return refuse('ALREADY_REPLIED', REPLIES_WORDS.ALREADY);

      const held = await Promise.all(
        guests.map((g) =>
          tx.assignment.findMany({
            where: { personId: g.personId, item: { team: { eventId } } },
            select: { id: true, response: true, item: { select: { name: true } } },
            orderBy: { id: 'asc' },
          })
        )
      );
      const plans = planReplies(held.map((rowsOf) => rowsOf.length));

      let answered = 0;
      for (let i = 0; i < guests.length; i++) {
        const guest = guests[i];
        const plan = plans[i];
        if (plan.kind === 'NONE') continue;
        if (plan.kind === 'ITEMS') {
          let wrote = false;
          for (let k = 0; k < held[i].length; k++) {
            const row = held[i][k];
            if (row.response !== 'PENDING') continue;
            await recordAssignmentAnswer(tx, {
              eventId,
              assignmentId: row.id,
              itemName: row.item.name,
              response: plan.responses[k],
              actorId: guest.personId,
            });
            wrote = true;
          }
          if (wrote) answered++;
          continue;
        }
        if (guest.attendanceAnswer !== null) continue;
        // The guest's own PATCH /api/p/[token], its two columns and its audit line.
        await tx.personEvent.update({
          where: { id: guest.id },
          data: { attendanceAnswer: plan.answer, attendanceAnsweredAt: new Date() },
        });
        await logAudit(tx, {
          eventId,
          actorId: guest.personId,
          actionType: 'ANSWER_ATTENDANCE',
          targetType: 'PersonEvent',
          targetId: guest.id,
          details: plan.answer === 'YES' ? 'Answered still coming' : 'Answered not coming',
        });
        answered++;
      }
      return { ok: true as const, answered };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
}
