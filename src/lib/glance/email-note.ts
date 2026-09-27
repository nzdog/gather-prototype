import type { Prisma } from '@prisma/client';
import { emailBlockStateOf, listEmailBlocks } from '@/lib/eligibility/email-block';
import { emailNoteFor, type EmailBlockState } from '@/lib/eligibility/email-block-words';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';
import { smsOptedOutFact } from '@/lib/preflight/ask-preview';
import { isValidNZNumber } from '@/lib/phone';

/**
 * One adult's email facts, for the board. `textable` is the chooser's own sense — a usable mobile
 * not opted out of texts — and it is read by the strip's UNREACHABLE line, which is otherwise false
 * of somebody Gather can text (ruled 2026-09-27). A boolean derived on the server, never the number.
 */
export interface EmailFacts {
  state: EmailBlockState;
  textable: boolean;
  note: string | null;
}

/**
 * [[GTC-189]] slice 8a, D3 — RULING 3's SENTENCE ON THE BOARD'S PERSON SURFACE.
 *
 * ⚠ WHY THE BOARD AT ALL: after the press the pre-flight cannot be reached from the product
 * ([[GTC-329]]), so a line shown only there would never reach the host whose invitation was
 * reported. Ruled 2026-09-27: *"yes, ruling 3's line on the board's PersonSurface."*
 *
 * ⚠ ITS OWN QUERIES, AND THE ADDRESS NEVER LEAVES THIS FUNCTION. The board's payload has never
 * carried a guest's contact details (slice 7b, founder answer 6) and `PERSON_EVENT_SELECT` in
 * `read.ts` deliberately selects none, so this reads them separately, decides the sentence here,
 * and returns only sentences and one boolean — keyed by membership, adults only. A child's carrier
 * has the line on the carrier's own surface. Only BLOCKED adults are returned: the strip's `textable`
 * question arises only for a blocked address, so everybody else defaults to false.
 *
 * ⚠ AND IT IS NOT A COLOUR. A complaint maps to no red (`DELIVERY_STATE_MEANS.COMPLAINED` is
 * null); the strip's amber-with-no-why for an opt-out is [[GTC-327]]'s and is untouched here.
 */
export async function readEmailNotes(
  db: Prisma.TransactionClient,
  eventId: string,
  hostId: string
): Promise<Map<string, EmailFacts>> {
  const rows = await db.personEvent.findMany({
    where: { eventId, person: { email: { not: null } } },
    select: {
      id: true,
      householdRole: true,
      person: { select: { email: true, phoneNumber: true, smsOptedOut: true } },
    },
  });
  const notes = new Map<string, EmailFacts>();
  if (rows.length === 0) return notes;

  const blocks = await listEmailBlocks(
    db,
    rows.map((r) => r.person.email)
  );
  if (blocks.size === 0) return notes;

  const phones = rows.map((r) => r.person.phoneNumber).filter((n): n is string => !!n);
  const optedOutNumbers = new Set(
    phones.length === 0
      ? []
      : (
          await db.smsOptOut.findMany({
            where: { hostId, phoneNumber: { in: phones } },
            select: { phoneNumber: true },
          })
        ).map((o) => o.phoneNumber)
  );

  for (const r of rows) {
    if (!isMessageableRole(r.householdRole)) continue;
    const state = emailBlockStateOf(r.person.email, eventId, blocks);
    if (state === 'NONE') continue;
    // [[GTC-301]]'s two facts, through their one definition; Zone 7 is only read.
    const smsOptedOut = smsOptedOutFact(r.person, optedOutNumbers);
    const textable =
      !smsOptedOut && !!r.person.phoneNumber && isValidNZNumber(r.person.phoneNumber);
    notes.set(r.id, { state, textable, note: emailNoteFor({ state, textable, smsOptedOut }) });
  }
  return notes;
}
