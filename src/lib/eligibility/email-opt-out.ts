import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * [[GTC-296]] — THE PER-EVENT EMAIL OPT-OUT. The fact, and the words for it.
 *
 * Ruling Q of [[GTC-189]]: every guest-bound email carries a way out. This module owns
 * what that way out leaves behind, and it is the layer that sits ABOVE
 * `src/lib/eligibility/nudge-mark.ts`'s don't-chase mark in every eligibility ladder.
 *
 * ── THE HOUSE ORDER, AND WHY THIS MODULE IS AT THE TOP OF IT ─────────────────
 *
 *   1. SMS OPT-OUT    — Do-Not-Touch Zone 7. GUEST-set, per host, legally binding.
 *   2. EMAIL OPT-OUT  — this module. GUEST-set, per event.
 *   3. DONT_CHASE     — `nudge-mark.ts`. HOST-set, and revocable by her.
 *
 * ⚠ 1 AND 2 IN THAT ORDER IS A FOUNDER RULING (correction R2, 2026-09-20) AND WAS NOT THE
 * EXECUTOR'S FIRST GUESS. It was built with the email opt-out on top, on the reasoning that a
 * per-event no is the more specific fact; the ruling places it *"above the don't-chase mark and
 * below the SMS opt-out check, matching `nudge-mark.ts`'s house order"*. Nothing about the
 * OUTCOME turns on it — both refuse — and what it decides is which reason a person carrying
 * both is reported under. Zone 7 keeps the top.
 *
 * ⚠ 2 ABOVE 3 IS THE PART THAT IS LOAD-BEARING, and it is `nudge-mark.ts`'s own argument one
 * layer up: a host clearing her own mark must never resume messaging somebody who said no
 * themselves.
 *
 * ⚠ ZONE 7 IS A SIBLING, NOT A PARENT. The email opt-out gets its own table, its own
 * module and its own gate check. Nothing here reads `Person.smsOptedOut` or `SmsOptOut`,
 * and nothing there reads this. The ticket's Do-not-touch list says so and the suite
 * asserts it against `git diff`.
 *
 * ── PER EVENT, WHICH IS A RULING ────────────────────────────────────────────
 *
 * Ruling 1, 2026-09-20, overturning the executor's proposal of per-host: *"the person is
 * saying no to THIS event, not to THIS host."* Every function here takes an `eventId` for
 * that reason, and the suite's cross-event assertion is the one that would catch a
 * per-host implementation — every other assertion in the layer passes under both.
 */

/** One row, as every caller needs it. Structural, so a narrow `select` satisfies it. */
export interface EmailOptOutRow {
  id: string;
  personId: string;
  eventId: string;
  optedOutAt: Date;
  token: string | null;
}

/**
 * Has this person taken the email way out of this event?
 *
 * Returns the ROW rather than a boolean, so a caller that needs to say *when* — a support
 * question, a host's list — has it without a second query. `null` is the whole of "no".
 *
 * ⚠ THE SIGNATURE IS DELIBERATELY THE SHAPE OF ZONE 7's SIBLING. `isOptedOut(phoneNumber,
 * hostId)` in `src/lib/sms/opt-out-service.ts` takes plain ids and reaches the `prisma`
 * singleton, and two suppression checks that read differently invite a caller to believe
 * they mean different kinds of thing.
 *
 * Use `listEmailOptOutsForEvent` instead wherever a whole event is being walked: this
 * costs one query per person and that costs one per event.
 */
export async function getEmailOptOut(
  personId: string,
  eventId: string
): Promise<EmailOptOutRow | null> {
  if (!personId || !eventId) return null;
  return prisma.emailOptOut.findUnique({
    where: { personId_eventId: { personId, eventId } },
    select: { id: true, personId: true, eventId: true, optedOutAt: true, token: true },
  });
}

/**
 * Everyone who has taken the way out of ONE event, in one query.
 *
 * The shape `readAskPreview` already uses for the SMS opt-out numbers, for the same
 * reason: the pre-flight, the press and the drain all walk a whole roster, and a check
 * that cost a query per person would put the count of queries under the guest list's
 * control.
 *
 * Takes the client rather than reaching the singleton, because the press runs inside a
 * transaction and a read outside it would see a roster the transaction has not committed.
 * Typed as `Prisma.TransactionClient`, which `readAskPreview` also uses and which a full
 * `PrismaClient` satisfies — so the one function serves both callers.
 */
export async function listEmailOptOutsForEvent(
  db: Prisma.TransactionClient,
  eventId: string
): Promise<Set<string>> {
  if (!eventId) return new Set();
  const rows = await db.emailOptOut.findMany({ where: { eventId }, select: { personId: true } });
  return new Set(rows.map((r) => r.personId));
}

/** The pure predicate the chooser's context is built from. */
export function emailOptedOutFact(personId: string, optedOut: ReadonlySet<string>): boolean {
  return optedOut.has(personId);
}

/**
 * RULING 3's SENTENCE, VERBATIM — *"a no to one channel is treated as a no to being
 * chased"*, read straight and applied to the email side.
 *
 * ⚠ IT IS 70 CHARACTERS, AND THAT IS WHY IT DOES NOT LIVE IN `WHY_LINES`. The ticket
 * originally sent it to a map called `WHY_LINE_TEMPLATES`, which does not exist; the
 * strip's real map is `WHY_LINES` in `src/components/glance/strip.ts`, and every line
 * there is held to 16 characters by `tests/glance-grid-test.tsx`, from the reference's
 * 160px columns. Correction R7 split the two: the long form lives here and in
 * `ADULT_WHY`/`CHILD_WHY`, the short form on the strip.
 */
export const EMAIL_OPTED_OUT_WHY_LINE =
  'chose not to receive email about this event; not chased on any channel.';

/**
 * The recorded skip, for the three automatic chase finders (corrections R2 and R2b).
 *
 * A RECORDED SKIP, NEVER A SILENT DROP — the rule `nudge-mark.ts` states at length and
 * for the same reason: every other exclusion on those paths records one, and invisible is
 * indistinguishable from broken when somebody asks why a person got nothing.
 */
export const EMAIL_OPT_OUT_SKIP_REASON = 'Unsubscribed from email for this event (GTC-296)';

/**
 * RULING 4 — what the host is told when her by-hand nudge overrides an email unsubscribe.
 *
 * ⚠ THE OVERRIDE SURVIVES, AND THAT IS THE RULING. The by-hand nudge is host-initiated
 * and is not the automatic chase, so ruling AD of [[GTC-189]] — *"the by-hand nudge sends,
 * and says what it is overriding"* — still holds. What ruling 3 stops is the machine.
 */
export const EMAIL_OPT_OUT_OVERRIDE_MESSAGE =
  "You're nudging this person by text. They unsubscribed from your emails for this event.";

/** Ruling 4's other half: no usable text channel, so the nudge is refused with the reason. */
export const EMAIL_OPT_OUT_NOT_ADDRESSABLE_MESSAGE =
  'This person unsubscribed from your emails for this event, and there is no usable mobile ' +
  'number to text instead, so there is no way to nudge them.';

/** `Alice` → `Alice's`; `James` → `James'`. The ordinary English rule, and no more. */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * RULING 1's SPECIMEN SENTENCE, on the confirm page.
 *
 * *"Confirm: you'll stop receiving emails about Alice's Christmas Lunch. Alice can still
 * email you about other events."*
 *
 * ⚠ THE SECOND SENTENCE IS THE WHOLE POINT OF THE FIRST. Ruling 1 is per EVENT, and a
 * confirm page that said only *"you'll stop receiving emails"* would describe a per-host
 * or per-service no — which is what the person would reasonably believe they had just
 * done. Saying what the no does NOT cover is what makes the narrow scope honest rather
 * than a technicality.
 */
export function unsubscribeConfirmSentence(args: {
  hostFirstName: string;
  eventName: string;
}): string {
  return (
    `Confirm: you'll stop receiving emails about ${possessive(args.hostFirstName)} ` +
    `${args.eventName}. ${args.hostFirstName} can still email you about other events.`
  );
}

/** What the same page says once the row exists. Idempotent in words as well as in writes. */
export function unsubscribeDoneSentence(args: {
  hostFirstName: string;
  eventName: string;
}): string {
  return (
    `You've been unsubscribed. You won't receive any more emails about ` +
    `${possessive(args.hostFirstName)} ${args.eventName}. ` +
    `${args.hostFirstName} can still email you about other events.`
  );
}
