/**
 * [[GTC-251]] slice 251c — THE HAND-BACK: from "gone quiet", back to Gather with 1, 2 or 3 more.
 *
 * Founder ruling Q3 (2026-09-29): *"You choose how many more reminders Gather sends: one, two or
 * three. The first goes out next, the rest three days apart, and three days after the last they turn
 * red again if still silent. The cap stops a guest being pestered."* And 4.6 (2026-09-30): no
 * lifetime cap — each hand-back is the host's own act.
 *
 * ⚠ IT SENDS NOTHING. It writes the host's decision on the membership, and the chase's next run
 * (`findNudgeCandidates` → `queueChase` → `drainOnce`) does the rest, through every gate the chase
 * already has. So a hand-back can never reach a guest the chooser refuses: the mark and every opt-out
 * still win (Q3), at the sweep and again at the send.
 *
 * ⚠ IT RE-DERIVES THE PERSON BEFORE WRITING. The board the host tapped may be stale; only somebody
 * who is "gone quiet" NOW may be handed back, and the refusal says the board is catching up (W2).
 */

import type { Prisma } from '@prisma/client';
import { readEventGlance } from '@/lib/glance/read';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import { CATCH_UP_NOTE, HAND_BACK_REASONS } from '@/lib/glance/actions';

type Db = Prisma.TransactionClient;

/** Q3's cap, as the only counts the route accepts. */
export const HAND_BACK_COUNTS: readonly number[] = [1, 2, 3];

export type HandBackOutcome =
  | { ok: true; recipientPersonEventId: string }
  | { ok: false; status: 400 | 404 | 409; code: string; error: string };

export async function handBackPerson(
  db: Db,
  input: { eventId: string; personId: string; reminders: unknown; now?: Date }
): Promise<HandBackOutcome> {
  const now = input.now ?? new Date();
  if (typeof input.reminders !== 'number' || !HAND_BACK_COUNTS.includes(input.reminders)) {
    return { ok: false, status: 400, code: 'BAD_COUNT', error: 'Choose 1, 2 or 3 more nudges.' };
  }

  const glance = await readEventGlance(db, input.eventId, now);
  const person = [...glance.households.flatMap((h) => h.members), ...glance.unhoused].find(
    (p) => p.personId === input.personId
  );
  if (!person) {
    return { ok: false, status: 404, code: 'NOT_ON_EVENT', error: 'Not on this event.' };
  }
  /*
   * [[GTC-350]] — "gone quiet" or a reply (one list with the panel), and only a count the board's own
   * door offers: plan ruling Q-D (a maybe-only guest gets 1) and fix 1 (with reminders off, only
   * where something would still be sent). Refused in W2's words, as a stale board is.
   */
  if (
    person.state !== 'RED' ||
    !HAND_BACK_REASONS.some((r) => person.reasons.includes(r)) ||
    !person.handBackChoices.includes(input.reminders)
  ) {
    return { ok: false, status: 409, code: 'NOT_GONE_QUIET', error: CATCH_UP_NOTE };
  }

  // The reminders go to whoever the chase messages — for a carried child, the carrier (ruling R).
  const preview = await readAskPreview(db, input.eventId, '');
  const route = preview?.chase.byMembership[person.personEventId];
  if (!route || route.kind === 'NONE') {
    return { ok: false, status: 409, code: 'NOT_GONE_QUIET', error: CATCH_UP_NOTE };
  }

  await db.personEvent.update({
    where: { id: route.recipientId },
    data: { handBackReminders: input.reminders, handedBackAt: now },
  });
  return { ok: true, recipientPersonEventId: route.recipientId };
}
