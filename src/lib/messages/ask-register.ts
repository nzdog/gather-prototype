/**
 * GTC-187 (H2) — the ASK register: the words of the outgoing ask, movement by movement.
 *
 * The architecture is `compose.ts`'s. This file is only the ask's content, and it is the
 * ONLY register that exists — `THANK_YOU_REGISTER` is deliberately unrecorded and is a
 * founder ruling, not an executor's inference. See THE MISSING REGISTER in `compose.ts`.
 *
 * The four founder rulings this file implements (GTC-187, 2026-08-23):
 *
 *   decision 1  One message per RECIPIENT, regardless of item count — narrowed from "per
 *               person" by GTC-189 ruling D, because a child's item is carried in their
 *               household contact's message. The message NAMES the items; it does not carry
 *               their logistics — quantity, drop-off, timing all live on the guest tap page.
 *               `askSystemVoice` therefore takes item NAMES and nothing else, so there is no
 *               logistics field here to leak.
 *   decision 3  Movement 1's draft is generated from event data — name, date, venue,
 *               occasion — "not a generic template, not a blank field", and it is a starting
 *               point the host is expected to edit. TEMPLATED, NOT AI: decision 3 left that
 *               open and noted AI "would be a new call on the send path"; the send path has
 *               no AI call today and this ticket does not add one.
 *   decision 5  One composed text serves both channels. `composeAsk` returns one `text` and
 *               a `subject` that only email uses. There is no per-channel shaping.
 *   decision 8  The itemless guest gets all three movements — the handover is NOT dropped,
 *               because "a guest who never met Gather would receive an unrecognised nudge if
 *               they go quiet". Movement 3 is thinner: no item ask, no logistics.
 *
 * EVERY CHARACTER IN THE BODY IS GSM-7. Not a style preference — a cost one. GSM-7 has no
 * em dash, so a single `—` anywhere in the body forces the whole message to UCS-2 and drops
 * the segment size from 160 characters to 70. Measured on Henderson Family Christmas 2026 at
 * 2026-08-29: one em dash was the ONLY non-ASCII character in the body, and it took a
 * 510-character ask from 4 segments to 8 — double the send cost of every message on the
 * event, caused by punctuation. The register's words use ` - ` instead. `askSubject` below
 * is the deliberate exception, and says why.
 *
 * This constrains THE REGISTER'S OWN WORDS, which is all composition controls. Item names,
 * event names, venue names and guest names come from the database and may carry anything —
 * a macron in "kūmara" pushes the same message back to 70-character segments and nothing
 * here can prevent that. `tests/message-composition-test.ts` pins the register's half by
 * composing over ASCII-clean fixture data and asserting the result stays in GSM-7.
 *
 * CLIENT-SAFE, like `compose.ts` and for the same reason. No Prisma, no database.
 *
 * NOT HERE, AND NOT THIS TICKET'S:
 *  - The send. GTC-189 (I2) owns dispatch, the recipient routing, and the per-channel
 *    opt-out suffix every system-sent SMS carries (`getFirstNudgeMessage` in
 *    `src/lib/sms/nudge-templates.ts` bakes it in; `buildSmsWrapUpMessage` does not).
 *    Composition does not append it, because decision 5 forbids per-channel shaping of the
 *    movements and an SMS-only suffix in a shared body is exactly that.
 *  - WHO carries whose ask. `chooseAskRoute` in `src/lib/eligibility/channel-chooser.ts`
 *    decides that (GTC-189 slice 1); this module words what it is handed. Hinge §4's
 *    Grandma — an adult's ask routed through somebody else — is overturned for adults
 *    (GTC-189, THE ASK), so the only other owner a message can name is a child. See
 *    `CarriedChildAsk`.
 */

import {
  ASK_REGISTER,
  composeMessage,
  composedCost,
  movementsOf,
  type Movement,
  type MovementContent,
} from './compose';

/**
 * The from-whom when the event carries no usable host name.
 *
 * ⚠ NO LONGER PROVISIONAL FOR NEW EVENTS — [[GTC-256]], closed 2026-08-29. The consequence
 * this once described ("the from-whom of a send has two candidate rows and no rule
 * distinguishing them") is gone at the root: Ruling 10 makes the host's `PersonEvent` point
 * at `Event.hostId`'s EXISTING Person, so there is one candidate row and no second Person to
 * disagree with it. There was never a Moment-flow event with a duplicated host in the data —
 * it was predicted, not observed — and phase 2 removed the code that would have produced one.
 *
 * IT REMAINS THE FALLBACK, for two reasons that are not the old one: `Event.hostId`'s Person
 * may simply have a blank name, and events created before phase 2 keep no host membership row
 * (Ruling 12 — no backfill). This module still takes whatever name it is handed and the
 * caller still flags it — see `resolveHostName`. The fallback string mirrors `findNudgeCandidates` in
 * `src/lib/sms/nudge-eligibility.ts`, which already ships `event.host?.name || 'The host'`.
 */
export const HOST_NAME_FALLBACK = 'your host';

/** Event facts movement 1's draft is built from (decision 3). */
export interface AskEventFacts {
  name: string;
  startDate: Date;
  venueName: string | null;
  occasionDescription: string | null;
}

/**
 * A child's item, carried in their household contact's message. GTC-189, THE ASK: "That is
 * the only case where a message carries someone else's ask." An adult's ask never travels
 * this way, which is why the owner is `childFirstName` and nothing wider — widening it is
 * widening GTC-187 decision 1 past ruling D's narrowing, and that is the founder's.
 *
 * Names only, like `AskRecipient.itemNames`: decision 1 keeps logistics on the tap page.
 */
export interface CarriedChildAsk {
  childFirstName: string;
  /** The child's items — `Item.kind` ITEM, brought. */
  itemNames: readonly string[];
  /** The child's jobs — `Item.kind` TASK, done and not brought. See `whatIsAsked`. */
  jobNames: readonly string[];
}

/** One recipient's ask. `itemNames` is names ONLY — decision 1 keeps logistics off the
 *  message and on the tap page, and there is deliberately no field here to put them in. */
export interface AskRecipient {
  firstName: string;
  /** The recipient's OWN items — `Item.kind` ITEM, brought. No owner field: they are theirs. */
  itemNames: readonly string[];
  /**
   * The recipient's OWN jobs — `Item.kind` TASK, done and not brought (GTC-189 slice 2, answer
   * 6). REQUIRED for the reason `carried` is: a caller with nowhere to put a job puts it among
   * the dishes, where it reads "bring".
   *
   * ⚠ EVERY CALLER PASSES `[]` TODAY, AND IT IS NOT A FILTER. The preview route selects no
   * `Item.kind`, so every assigned row still arrives in `itemNames`; slice 3 splits them.
   */
  jobNames: readonly string[];
  /**
   * Children's asks this recipient carries (GTC-189 slice 2), `[]` when none. REQUIRED, not
   * optional: a caller that left it out would tell a carrier "Nothing for you to bring",
   * silently — ruling D item 2.
   *
   * ⚠ DARK UNTIL GTC-189 SLICE 3. Every caller passes `[]`, and
   * `tests/carried-ask-composition-test.ts` asserts it.
   */
  carried: readonly CarriedChildAsk[];
  /** The guest's tap link. Supplied by the caller; token issuance is `ensureEventTokens`'s
   *  and routing is GTC-189's. */
  link: string;
}

export interface ComposedAsk {
  /** The body. Identical on SMS and email (decision 5). */
  text: string;
  /** Email only. SMS ignores it (decision 5). */
  subject: string;
  /** Shown to the host at compose time so the cost of a long message is visible, never to
   *  cap or truncate it (decision 6). */
  segments: number;
  /** Whether that count is at 70 characters a segment rather than 160 — see `ComposedCost`. */
  narrowSegments: boolean;
  /** The movements with their voices, so the preview can show whose words are whose
   *  (Hinge §5). Renders from the same content the `text` was joined from. */
  movements: Movement[];
}

/** First name, matching the inline `name.split(' ')[0]` already used by `dispatchWrapUp`
 *  in `src/lib/wrap-up.ts` and `sendDecideByFollowup` in
 *  `src/lib/sms/decide-by-sender.ts`. Falls back to the whole name. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * The event date as a guest reads it, in NZ local time.
 *
 * NZ-local rather than UTC for the reason `formatDecideByDay` in
 * `src/lib/sms/nudge-templates.ts` records: the guest reads this on an NZ phone, and a
 * midnight-UTC event date is the following afternoon to them.
 */
export function formatEventDay(startDate: Date): string {
  return startDate.toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * MOVEMENT 1's DRAFT — decision 3.
 *
 * Built from the event's own facts, "not a generic template, not a blank field". It is
 * deliberately short and plain: decision 3 flags that this is the movement Hinge §5 makes
 * fully the host's, "the seam the three-movement structure protects is thinnest here", and
 * that whatever is built "should make editing the obvious next step rather than sending
 * as-is". A polished paragraph invites a wave-through; a serviceable sentence invites a
 * rewrite.
 *
 * NO GUEST NAME IN HERE. The greeting is composed per recipient by `authorLineFor` below,
 * because decision 2 makes this line STORED and reusable across every send on the event —
 * a name baked into it would be the wrong guest's on the second send.
 *
 * The start TIME is deliberately absent. Decision 3 lists "name, date, venue, occasion";
 * times are logistics, and decision 1 keeps logistics on the tap page.
 */
export function draftAuthorLine(event: AskEventFacts): string {
  const where = event.venueName?.trim() ? `, at ${event.venueName.trim()}` : '';
  const occasion = event.occasionDescription?.trim();

  return [
    `We're doing ${event.name} on ${formatEventDay(event.startDate)}${where}.`,
    occasion ? `${occasion}` : null,
    `Would love to have you there.`,
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
}

/**
 * MOVEMENT 1, as it appears — the greeting plus the host's line.
 *
 * `line` is the host's authored text when there is one, and the draft otherwise. A blank line
 * leaves the greeting standing alone: Hinge §5 makes this movement the host's, which includes
 * theirs to cut to nothing, and the product "does not permit or approve this movement".
 *
 * THAT BLANK CASE IS NOW REACHABLE, not just tolerated. A founder ruling (2026-08-29) made it
 * the third state of `Event.askAuthorLine`: the host can store `''` from the pre-flight and
 * every guest gets this greeting and no authored line. The branch below was already written
 * for it — the ruling gave it a way in rather than changing what it does.
 */
export function authorLineFor(recipientFirstName: string, line: string | null): string {
  const written = line?.trim();
  return written ? `Hi ${recipientFirstName} - ${written}` : `Hi ${recipientFirstName},`;
}

/**
 * MOVEMENT 2 — the handover. Hinge §5's load-bearing beat: "the guest doesn't meet an app, he
 * meets something his host vouched for. The introduction travels on her credibility."
 *
 * VOICED AS THE HOST (`ASK_REGISTER.handover === 'HOST'`) but not authored by them. Hinge §5
 * makes movement 1 the authored one — "hers to write, or hers to wave through" — and says
 * nothing about movement 2 being editable, so it stays the register's words in the host's voice.
 *
 * To §5's introduction budget exactly: "Kate's vouching, one name, what-happens-next", and
 * no more. "The moment the message describes the product, it stops being a personal ask" —
 * so this never says what Gather is. The hand-off is immediate because movement 3 follows it
 * in the same message; that is the seam, and it is meant to be audible.
 */
export function askHandover(): string {
  return `I've got Gather helping me put it together - I'll let it take it from here.`;
}

/**
 * MOVEMENT 3 — Gather in its own voice: "what to expect, the roadmap from here" (Hinge §5).
 *
 * Carries, in order: who is speaking, the items BY NAME (decision 1), the promise to check
 * back, and last the one decision with its link (Hinge §3 — "One decision: yes / no / maybe —
 * a single tap") together with where the logistics are.
 *
 * THE CHECK-BACK LINE IS NOT DECORATION. Hinge §5's continuity-by-declaration: "Gather *says*
 * it will check back. The later nudge arrives as a kept promise, not a cold contact —
 * intrusion is contact you weren't told to expect. The first message is thereby the consent
 * moment." Removing it makes every nudge in `src/lib/sms/nudge-sender.ts` a cold contact.
 *
 * THE ITEMLESS BRANCH (decision 8) is thinner, not shorter by accident: no item ask and no
 * logistics pointer, because there are none. It keeps the speaker, the tap and the check-back
 * promise — the promise most of all, since the itemless guest is exactly the one who would
 * otherwise "receive an unrecognised nudge if they go quiet". Attendance is the question on
 * their page ("Attendance is asked as a direct question only for guests with no items"); this
 * movement points at it rather than asking it, because the control lives on the page.
 *
 * THE LINK ENDS THE MESSAGE. A URL followed by more prose is linkified greedily by some SMS
 * clients, and the tap is the one thing the guest is being asked to do — Hinge §3: "One
 * decision: yes / no / maybe — a single tap... Nothing else." Last position, every time.
 *
 * NO PRONOUN FOR THE HOST, ANYWHERE IN THIS FILE. The host's pronouns are not a field on
 * `Person` and are not captured anywhere in Moment 1, so any pronoun here is a guess that
 * ships to every guest they invite. The ask is phrased around the name instead.
 *
 * THE CARRIED ASK (GTC-189 slice 2) sits here, in Gather's movement, beside the recipient's
 * own ask and never merged into it. Not in movement 1: that line is the host's, stored and
 * shared by every recipient (decisions 2 and 3), so no child's name can go in it. A recipient
 * carrying a child's ask, or holding only a job, is not itemless — the itemless branch is for
 * nothing of any kind.
 * The words are `carriedAskSentences`'s, ruled at GTC-189 slice 2.
 *
 * WOULD, NOT COULD — a founder ruling on the whole register, not a style choice: "Could asks
 * whether she is able; would asks whether she is willing, and willing is what is being
 * asked." Every question in this register says would, so it speaks in one voice. Do not
 * add a could.
 */
export function askSystemVoice(recipient: AskRecipient, hostFirstName: string): string {
  const speaker = `Hi - Gather here, helping ${hostFirstName} with this one.`;
  const checkBack = `I'll check back if I haven't heard from you.`;
  const hasOwn = recipient.itemNames.length > 0 || recipient.jobNames.length > 0;
  const carried = recipient.carried.filter((c) => c.itemNames.length > 0 || c.jobNames.length > 0);

  if (!hasOwn && carried.length === 0) {
    return [
      speaker,
      `Nothing for you to bring.`,
      checkBack,
      `One tap to say whether you can make it: ${recipient.link}`,
    ].join(' ');
  }

  return [
    speaker,
    ...(hasOwn ? [`Would you ${whatIsAsked(recipient.itemNames, recipient.jobNames)}?`] : []),
    ...carriedAskSentences(carried, hasOwn),
    checkBack,
    `One tap to say yes, no or maybe - the details are on the page: ${recipient.link}`,
  ].join(' ');
}

/**
 * The carried ask: each child named before their items, then one question asking the
 * recipient to answer ON THE CHILD'S BEHALF. The child is the one asked to bring; the recipient
 * confirms for them. Nothing here says "you bring" of a child's item — that is the register
 * boundary — and nothing says "answer for". Founder ruling: "Answering FOR him reads as
 * speaking in his voice. She is confirming on his behalf, which is a different thing and the
 * true one."
 *
 * ONE CHILD IS NAMED, NOT GIVEN A PRONOUN — the founder's choice at slice 2. A pronoun is
 * captured nowhere, so a fixed one would be wrong for some child in every household. Two or
 * more children are "their".
 *
 * BESIDE THE RECIPIENT'S OWN ASK THE QUESTION SAYS "also", before "answer", so it reads "as well
 * as bringing yours" and not "on somebody else's behalf as well", which is where a closing "too"
 * would land. Confirmed by the founder.
 *
 * NO "please" — a founder ruling, and a defect that shows only when the two questions are read
 * side by side. "Would you bring the pavlova?" followed by "Would you please also answer on
 * Ollie's behalf?" is one question polite and the next plain: two voices, the same test that
 * made could into would. "On Ollie's behalf" already carries the courtesy; please did it twice.
 *
 * A carrier with nothing of their own is pointed at the child's yes / no / maybe and is NOT
 * asked whether they can make it. Whether they should be is decision 8's reach, and not ruled.
 */
function carriedAskSentences(carried: readonly CarriedChildAsk[], alongsideOwn: boolean): string[] {
  if (carried.length === 0) return [];
  // ANCHOR(GTC-189): slice 2 carried ask words — ruled, see "Founder answers — the slice 2 words"
  const whose = carried.length === 1 ? `${carried[0].childFirstName}'s` : 'their';
  return [
    ...carried.map(
      (c) => `${c.childFirstName} has been asked to ${whatIsAsked(c.itemNames, c.jobNames)}.`
    ),
    `Would you ${alongsideOwn ? 'also ' : ''}answer on ${whose} behalf?`,
  ];
}

/**
 * What one person is asked to take on, as the words after "Would you" or "has been asked to":
 * "bring the pavlova", "do the dishes", "bring the pavlova and do the dishes".
 *
 * A JOB IS DONE, NOT BROUGHT — founder ruling, GTC-189 slice 2 answer 6: "that is the whole
 * ruling and it changes one word." A job is an `Item` row whose `kind` is TASK. One person
 * holding both kinds is asked in ONE sentence, not two (founder ruling). A carried child holding
 * both is one sentence the same way — the executor's extension of that rule, not a ruling.
 *
 * ⚠ RULED BEFORE THE CASE EXISTS. No TASK row is assigned in gather_dev, only plan generation
 * writes one, and the routes where a host adds an item set no kind — so a job assigned by hand
 * is an ITEM and reads "bring". That is [[GTC-302]]'s, and it keeps this sentence unreachable
 * today. JOBS ARE NEVER FILTERED OUT instead: a filtered job reaches nobody, and a child's job
 * reaching an adult is what the carried ask is for.
 */
function whatIsAsked(itemNames: readonly string[], jobNames: readonly string[]): string {
  const bring = itemNames.length > 0 ? `bring ${theItems(itemNames)}` : null;
  const doing = jobNames.length > 0 ? `do ${theItems(jobNames)}` : null;
  // Decision 22, ruled: with two or more to bring, a comma before "and do" — otherwise the list's
  // own "and" sits beside it, and "the trifle and do" reads for a beat like a third dish. Found by
  // reading two of one kind, not three: the collision is worst at the short list. One to bring has
  // no list "and" to collide with, so no comma.
  const joiner = itemNames.length > 1 ? ', and ' : ' and ';
  return [bring, doing].filter((part): part is string => part !== null).join(joiner);
}

/**
 * Names as a sentence names them: "the pavlova", "the pavlova and the trifle", "the pavlova,
 * the trifle and the ham" — and jobs the same way, "the dishes". Founder ruling: "Would you
 * bring: pavlova?" is a form field, not a sentence.
 *
 * ⚠ EACH NAME IS USED EXACTLY AS STORED, deliberately. gather_dev holds generated names in
 * Title Case and seeded names that already begin "The", so on that data this reads "the Berry
 * Trifle" and "the The pavlova". That is a data problem, filed as [[GTC-302]], and the founder
 * chose to see it rather than have composition hide it. No casing fix, no article stripped.
 */
function theItems(names: readonly string[]): string {
  return listOf(names.map((name) => `the ${name}`));
}

/** "a", "a and b", "a, b and c" — no comma before the "and". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Email's subject. Decision 5: "Email adds a subject line; the body is identical."
 *
 * THE ONE PLACE THE REGISTER KEEPS AN EM DASH, deliberately. The GSM-7 rule above is a
 * segment-cost rule and the subject has no segments: decision 5 sends it on email only, and
 * SMS never carries it. Email renders an em dash correctly, so the cost argument that
 * governs the body does not reach here.
 */
export function askSubject(eventName: string, hostFirstName: string): string {
  return `${eventName} — from ${hostFirstName}`;
}

export interface ComposeAskInput {
  event: AskEventFacts;
  /** The host as the guest knows them. ⚠ See `HOST_NAME_FALLBACK` and [[GTC-256]]. */
  hostName: string;
  recipient: AskRecipient;
  /**
   * The host's stored movement 1 (decision 2), or null to use `draftAuthorLine`.
   *
   * Held in `Event.askAuthorLine` (GTC-259, wired by GTC-260) and read by
   * `GET /api/events/[id]/pre-flight/message`. NULL MEANS SHE NEVER WROTE ONE — the
   * fall-through below is what every event does until she does.
   *
   * ⚠ NULL AND `''` ARE DIFFERENT ARGUMENTS, deliberately (founder ruling, 2026-08-29). The
   * fall-through below is `??`, which catches null but not an empty string, and that is what
   * carries all three states through one expression:
   *
   *   null   never authored        → `draftAuthorLine(event)`
   *   ''     deliberately no line  → `authorLineFor` returns the bare greeting, no draft
   *   value  her words             → her words
   *
   * So do not "fix" this to `||`, and do not coalesce `''` at a call site: both would collapse
   * the third state into the first and put Gather's draft in the mouth of a host who chose not
   * to speak. `Event.askAuthorLine` stores all three; the write path preserves `''`.
   */
  storedAuthorLine?: string | null;
}

/**
 * ONE MESSAGE PER RECIPIENT, whatever they are holding or carrying (decision 1, as GTC-189
 * ruling D narrows it). There is no per-item or per-child loop here and no variant to call:
 * `recipient.itemNames` may hold one name or four and `recipient.carried` none or two
 * children, and either way this returns exactly one `ComposedAsk`.
 */
export function composeAsk(input: ComposeAskInput): ComposedAsk {
  const hostFirstName = firstNameOf(input.hostName || HOST_NAME_FALLBACK);

  const content: MovementContent = {
    authorLine: authorLineFor(
      input.recipient.firstName,
      input.storedAuthorLine ?? draftAuthorLine(input.event)
    ),
    handover: askHandover(),
    systemVoice: askSystemVoice(input.recipient, hostFirstName),
  };

  const text = composeMessage(content, ASK_REGISTER);
  const cost = composedCost(text);

  return {
    text,
    subject: askSubject(input.event.name, hostFirstName),
    segments: cost.segments,
    narrowSegments: cost.narrowSegments,
    movements: movementsOf(content, ASK_REGISTER),
  };
}
