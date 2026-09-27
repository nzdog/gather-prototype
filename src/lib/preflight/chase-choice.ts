/**
 * GTC-311 — the write path for the chase channel: the event-level switch and the per-person
 * named exception.
 *
 *   { chaseWhenNoMobileDefault }            → Event.chaseWhenNoMobileDefault   (the switch)
 *   { personEventId, chaseException }       → PersonEvent.chaseException       (one person)
 *
 * WHY A ROUTE OF ITS OWN, AND NOT THE CADENCE ROUTE OR THE MESSAGE ROUTE. The cadence route stores
 * E2's two INTENSITY controls, `nudgePace` and `nudgeMark`, whose composition is a different rule
 * on a different axis; putting a third control beside them is the neighbour-by-analogy mistake
 * ruling AL recorded. The message route's PATCH writes one event-level value where the last write
 * wins, which is the wrong contract for independent per-person decisions. So: a third route, a
 * different grain.
 *
 * ⚠ THE ROUTE IS THE GATE, NOT THE MARKUP. `personEventId` arrives in the body, so a pill the
 * screen withholds can still be posted. This re-reads the event through `readAskPreview` — the
 * screen's own source — and writes an exception only where the screen offers one. So the screen
 * and the gate cannot disagree about who may be taken off the chase, and an SMS opt-out is refused
 * here whatever the page does (ruling AI; Do-Not-Touch Zone 7 is adjacent and only READ).
 *
 * NULL CLEARS — on both columns, and it is not a stored "normal": NULL on the switch means "not
 * set", and NULL on a person means "follow the switch". The screen writes NULL when a person is set
 * back to whatever the switch says, so a stored exception is always a real one.
 *
 * NO `sentAt` GATE, matching the cadence route (founder ruling, 2026-09-27, flag E). Whether the
 * host can reach this after the press is [[GTC-329]]'s; the stored value is read when the chase
 * runs, so a later surface needs no change here.
 *
 * STORES ONLY. Nothing here sends, composes or schedules; the chase that reads these columns is
 * [[GTC-189]] slice 8's.
 */

import type { PrismaClient } from '@prisma/client';
import {
  isChaseWhenNoMobile,
  type ChaseWhenNoMobile,
} from '@/lib/eligibility/chase-when-no-mobile';
import { readAskPreview } from './ask-preview';

export type ChaseChoiceRefusal =
  | 'CHASE_EXCEPTION_OPTED_OUT'
  | 'CHASE_EXCEPTION_NOT_OFFERED'
  | 'NOT_ON_EVENT'
  | 'BAD_REQUEST';

export interface ChaseChoiceResult {
  status: number;
  body: Record<string, unknown>;
}

const bad = (message: string): ChaseChoiceResult => ({
  status: 400,
  body: { error: 'BAD_REQUEST', message },
});

export async function writeChaseChoice(
  db: PrismaClient,
  eventId: string,
  body: unknown,
  baseUrl: string
): Promise<ChaseChoiceResult> {
  if (!body || typeof body !== 'object') return bad('A JSON body is required.');
  const b = body as Record<string, unknown>;
  const setsDefault = 'chaseWhenNoMobileDefault' in b;
  const setsPerson = 'personEventId' in b || 'chaseException' in b;
  if (!setsDefault && !setsPerson) {
    return bad('Send chaseWhenNoMobileDefault, or personEventId with chaseException.');
  }

  let defaultValue: ChaseWhenNoMobile | null = null;
  if (setsDefault) {
    const value = b.chaseWhenNoMobileDefault;
    if (value !== null && !isChaseWhenNoMobile(value)) {
      return bad('chaseWhenNoMobileDefault must be BY_EMAIL, HAND_TO_HOST or null.');
    }
    defaultValue = value;
  }

  let person: { personEventId: string; chaseException: ChaseWhenNoMobile | null } | null = null;
  if (setsPerson) {
    const { personEventId, chaseException } = b;
    if (typeof personEventId !== 'string' || !personEventId) {
      return bad('personEventId is required when setting chaseException.');
    }
    if (!('chaseException' in b)) return bad('chaseException is required (null clears it).');
    if (chaseException !== null && !isChaseWhenNoMobile(chaseException)) {
      return bad('chaseException must be BY_EMAIL, HAND_TO_HOST or null.');
    }

    // Scoped to this event before anything else, so another event's person reads as absent
    // rather than as refused.
    const member = await db.personEvent.findFirst({
      where: { id: personEventId, eventId },
      select: { id: true },
    });
    if (!member) {
      return {
        status: 404,
        body: { error: 'NOT_ON_EVENT', message: 'Person is not part of this event' },
      };
    }

    const preview = await readAskPreview(db, eventId, baseUrl);
    const offer = preview?.chase.byRecipient[personEventId]?.control ?? 'NONE';
    if (offer === 'REFUSED_OPTED_OUT') {
      return {
        status: 409,
        body: {
          error: 'CHASE_EXCEPTION_OPTED_OUT',
          message:
            'This person has opted out of texts, so they are not chased at all and the ' +
            'exception is not offered (GTC-189 ruling AI).',
        },
      };
    }
    if (offer !== 'OFFERED') {
      return {
        status: 409,
        body: {
          error: 'CHASE_EXCEPTION_NOT_OFFERED',
          message:
            'The exception applies only to someone the chase cannot text who has an email. This ' +
            "person is chased by text, marked don't-chase, the host, or carried by someone else.",
        },
      };
    }
    person = { personEventId, chaseException };
  }

  // Both writes, together or not at all.
  await db.$transaction(async (tx) => {
    if (setsDefault) {
      await tx.event.update({
        where: { id: eventId },
        data: { chaseWhenNoMobileDefault: defaultValue },
      });
    }
    if (person) {
      await tx.personEvent.updateMany({
        where: { id: person.personEventId, eventId },
        data: { chaseException: person.chaseException },
      });
    }
  });

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { chaseWhenNoMobileDefault: true },
  });
  return {
    status: 200,
    body: { ok: true, chaseWhenNoMobileDefault: event?.chaseWhenNoMobileDefault ?? null },
  };
}
