/**
 * GTC-192 (J1, phase 1) — the person-keyed read.
 *
 * Moment 4 §10.8 fixes the shape before any screen exists: "People are the boxes; items
 * live inside the person." The chosen design (`docs/design/moment4-glance-reference.md`)
 * keeps that and changes the geometry — card = household = channel, strip = person =
 * state — so the payload groups people by household and gives the household no colour.
 *
 * ── WHY THIS IS A MODULE AND NOT AN HTTP ROUTE ────────────────────────────────
 *
 * "Where the screen lives — its route and entry point" is recorded on this ticket as still
 * open. A route here would answer half of it by accident, and phase 1's own line is "no
 * UI". Phase 2's server component calls this directly; when the route is ruled, it is a
 * wrapper over `readEventGlance` rather than a second assembly.
 *
 * ── THE SELECT IS THE FENCE ───────────────────────────────────────────────────
 *
 * Ruling 1 fences the replay to state changes, "never behaviour. No opens, no views, no
 * hesitations, ever." Applied from birth rather than from phase 6: a payload that already
 * carries the field only needs somebody to render it. Every read below is an explicit
 * `select` — never an `include` — so no whole row can spread in, and
 * `tests/glance-read-test.ts` asserts both the absence of the denied names in this source
 * and the absence of `include:` itself.
 *
 * `PersonEvent.sentAt` is read and is not a breach: it records when GATHER SENT, which is
 * the anchor E1's cadence counts from. What the fence excludes is what the GUEST did.
 */

import { readEmailNotes } from './email-note';
import { textNoteFor } from './text-note';
import {
  EMAIL_BLOCKED_ASK_HELD_WORDS,
  EMAIL_BLOCKED_TEXT_FAILED_WORDS,
} from '@/lib/eligibility/email-block-words';
import type { Prisma } from '@prisma/client';
import {
  decideByAtFor,
  derivePersonState,
  deriveItemState,
  memberRank,
  nextNudgeFor,
  summarisePeople,
  type EventGlance,
  type GlanceEvent,
  type GlanceHousehold,
  type GlanceItemInput,
  type GlancePerson,
} from './state';

import { isChildMembership } from '@/lib/eligibility/child-exclusion';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import {
  carriedChildNoteFor,
  carrierOfAsk,
  deliveryFactFrom,
  latestRowByMembership,
} from './delivery-fact';
import { chaseFactFrom, chaseNoteFor } from './chase-fact';
import { exhaustionFor, handBackNextFor } from '@/lib/chase-exhaustion';
import { readChaseSpend } from '@/lib/chase-exhaustion-read';
import { isPaceOff } from '@/lib/eligibility/nudge-pace';

/** Accepts a client or a transaction, the shape `createHostHousehold` already takes. */
type Db = Prisma.TransactionClient;

/** A person is on the board if they are on the event. Roles do not gate the guest list. */
const PERSON_EVENT_SELECT = {
  id: true,
  personId: true,
  role: true,
  // Phase 4: `SameTeamSubject`'s team half. Null for the host by design — see the
  // "she must stay on none" note in src/lib/assignment/same-team.ts.
  teamId: true,
  householdId: true,
  householdRole: true,
  nudgeMark: true,
  attendanceAnswer: true,
  sentAt: true,
  person: { select: { id: true, name: true } },
} satisfies Prisma.PersonEventSelect;

/**
 * Ruling 8's subject: items with no holder at all.
 *
 * `assignment: null` is the HOUSE PREDICATE for unassigned — `/api/events/[id]/pre-flight`,
 * `/api/c/[token]`, `workflow.ts` and `detectUnassignedItems` in `src/lib/ai/check.ts` all
 * ask it this way. `Item.status` is deliberately not read: it is a presence cache that is
 * never consulted for status (architecture-contract §6), and reading it here would make the
 * strip lie the moment any write path forgot to repair it.
 */
const UNASSIGNED_CRITICAL_SELECT = { id: true, name: true } satisfies Prisma.ItemSelect;

const ASSIGNMENT_SELECT = {
  id: true,
  personId: true,
  response: true,
  item: {
    select: {
      id: true,
      name: true,
      critical: true,
      // Phase 4: `SameTeamItem`. Read for the picker's eligibility question, never for a
      // colour — `deriveItemState` does not see them.
      kind: true,
      teamId: true,
      // RULING 32 (amended 2026-09-11). The read-only panel's "what they are bringing".
      // Read for display, never for a colour — `deriveItemState` does not see them, and a
      // mutation that made a quantity move a tint fails `test:glance-read`.
      quantityAmount: true,
      quantityUnit: true,
      quantityUnitCustom: true,
      dropOffAt: true,
      decideByOffsetHours: true,
    },
  },
} satisfies Prisma.AssignmentSelect;

/**
 * The whole board for one event, as of `now`.
 *
 * @param now injected so the decide-by and cadence boundaries are testable exactly, the
 *   convention `isDecideByExpired` and `dueNudgeIndices` both take.
 */
export async function readEventGlance(
  db: Db,
  eventId: string,
  now: Date = new Date()
): Promise<EventGlance> {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      status: true,
      sentAt: true,
      endDate: true,
      decideByOffsetHours: true,
      nudgePace: true,
    },
  });

  const glanceEvent: GlanceEvent = {
    status: event.status,
    sentAt: event.sentAt,
    endDate: event.endDate,
    decideByOffsetHours: event.decideByOffsetHours,
    nudgePace: event.nudgePace,
  };

  const [
    memberships,
    assignments,
    households,
    unassignedCritical,
    unassignedOrdinaryCount,
    outbound,
    emailNotes,
    preview,
    chaseSpend,
  ] = await Promise.all([
    db.personEvent.findMany({ where: { eventId }, select: PERSON_EVENT_SELECT }),
    db.assignment.findMany({
      where: { item: { team: { eventId } } },
      select: ASSIGNMENT_SELECT,
    }),
    db.household.findMany({
      where: { eventId },
      // [[GTC-336]]: `contactPersonEventId` is no longer read here. Ruling S's carrier is the
      // chooser's (`carrierOfAsk`), not the household's contact.
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    // Named, because a count would not tell her WHICH critical has no owner.
    db.item.findMany({
      where: { team: { eventId }, assignment: null, critical: true },
      select: UNASSIGNED_CRITICAL_SELECT,
      orderBy: [{ name: 'asc' }],
    }),
    // COUNTED, never named — Ruling 8 keeps ordinary unassigned items the plan's and
    // pre-flight's business. A `findMany` here would haul every name across for a number,
    // and the names would then be one careless render away from the surface.
    db.item.count({ where: { team: { eventId }, assignment: null, critical: false } }),
    /*
     * GTC-189 SLICE 7a — THE DELIVERY FACT'S ONE QUERY, and it is the sixth rather than the sixth
     * through the eleventh.
     *
     * ⚠ `ASK` ONLY SINCE [[GTC-189]] SLICE 8b (F2, the approved plan, 2026-09-27) — AND IT REVERSES
     * 7a's "every kind, deliberately", whose argument is kept because it names the cost. 7a read every
     * kind because *"a chase leg that bounces has found the same dead channel an ask would have."*
     * Once the chase writes rows, every kind means the NEWEST row is the fact, and a reminder queued
     * or refused after a failed ask would clear that ask's red — a message that never arrived, read
     * as amber because a later row exists. So the fact is the ask's. **What that costs:** a reminder
     * that bounces does not turn the strip red. Slice 8a's block still learns it — the address is
     * blocked, the next reminder refuses, and the person surface carries the sentence — but the
     * colour is the ask's alone. Named in slice 8b's Evidence; not solved here.
     *
     * The fields are the three doors plus the clock that orders them. No names, no bodies, no
     * provider ids — the board needs to know THAT it failed, never what was in it.
     */
    db.outboundMessage.findMany({
      where: { eventId, kind: 'ASK' },
      select: {
        id: true,
        personEventId: true,
        // [[GTC-340]] plan ruling Q3 — which channel the failed ask went by, for the person view's line.
        channel: true,
        createdAt: true,
        rejectedAt: true,
        withheldAt: true,
        withheldWhy: true,
        deliveryState: true,
      },
    }),
    // [[GTC-189]] slice 8a, D3 — sentences only; see `readEmailNotes`.
    readEmailNotes(db, eventId),
    /*
     * [[GTC-305]] — THE CHASE ANSWER, FROM THE ONE PLACE IT LIVES. `readAskPreview` is the walk the
     * pre-flight shows and the chase itself reads (`findNudgeCandidates`), so the board, the
     * pre-flight and the reminder give one answer. It costs its own queries — seven or eight,
     * measured at GTC-305 step 0 at 2–7 ms per event on `gather_dev` — on every load and every poll.
     * A second assembly of the chooser's inputs from the queries above would be cheaper and is
     * refused: it is the drift `smsOptedOutFact` was extracted to prevent. No link is read here.
     */
    readAskPreview(db, eventId, ''),
    /*
     * [[GTC-251]] — WHAT EACH RECIPIENT HAS BEEN SENT, read outside this module on purpose. The send
     * instants stay behind `readChaseSpend`; only `exhaustionFor`'s yes or no is used here, which is
     * the decision `tests/glance-fence.ts` asks the board to take instead of telemetry.
     */
    readChaseSpend(db, eventId),
  ]);

  const markOf = new Map(memberships.map((m) => [m.id, m.nudgeMark as string | null]));

  /*
   * GTC-189 slice 7a — THE LATEST ROW PER MEMBERSHIP, not every row.
   *
   * ⚠ "Any row ever failed" would make slice 7b's door unable to clear the red it opens: ruling U's
   * resend writes a NEW row, so the host retries, it works, and a board reading the older row goes on
   * saying the message never arrived. See `latestRowByMembership`.
   */
  const latestOutbound = latestRowByMembership(outbound);

  // Rows are keyed by Person, not by PersonEvent (`Assignment.personId` is a Person id),
  // so they are grouped once here rather than re-scanned per member.
  const heldBy = new Map<string, GlanceItemInput[]>();
  for (const a of assignments) {
    const held = heldBy.get(a.personId) ?? [];
    held.push({
      itemId: a.item.id,
      assignmentId: a.id,
      name: a.item.name,
      critical: a.item.critical,
      response: a.response,
      kind: a.item.kind,
      teamId: a.item.teamId,
      quantityAmount: a.item.quantityAmount,
      quantityUnit: a.item.quantityUnit,
      quantityUnitCustom: a.item.quantityUnitCustom,
      item: { dropOffAt: a.item.dropOffAt, decideByOffsetHours: a.item.decideByOffsetHours },
    });
    heldBy.set(a.personId, held);
  }

  /**
   * [[GTC-189]] slice 8a — the note and the `textable` fact. A child reads their CARRIER's
   * `textable` (ruling S: the carrier's failure is the child's red, so the carrier's reach is its
   * line), and no note of their own — the carrier's surface carries it.
   *
   * ⚠ TWO CASES REPLACE THE NOTE, and W2 ("so I'll text them instead") would be false of both:
   *  - an UNREACHABLE red on a blocked, textable adult is an invitation the dispatcher's fence
   *    withheld — nothing texts it unless the host sends it as a text;
   *  - [[GTC-340]] plan ruling Q3: a NOT_DELIVERED red on a blocked, textable adult whose failed ask
   *    row is a TEXT row — Gather tried to text them, and it didn't arrive. ⚠ THE CHANNEL IS THE
   *    FOUNDER'S CONDITION: a guest whose EMAIL bounced is blocked by that bounce, was never
   *    texted, and keeps W2.
   */
  function emailFactsFor(
    row: (typeof memberships)[number],
    answering: string | null,
    failure: string | null,
    failedChannel: string | null
  ): { emailNote: string | null; textable: boolean } {
    const own = emailNotes.get(row.id);
    if (isChildMembership(row.householdRole)) {
      return {
        emailNote: null,
        textable: answering ? !!emailNotes.get(answering)?.textable : false,
      };
    }
    if (!own) return { emailNote: null, textable: false };
    const blockedTextable = own.state === 'BLOCKED' && own.textable;
    const held = failure === 'UNREACHABLE' && blockedTextable;
    const textFailed = failure === 'NOT_DELIVERED' && blockedTextable && failedChannel === 'TEXT';
    return {
      emailNote: held
        ? EMAIL_BLOCKED_ASK_HELD_WORDS
        : textFailed
          ? EMAIL_BLOCKED_TEXT_FAILED_WORDS
          : own.note,
      textable: own.textable,
    };
  }

  function toPerson(row: (typeof memberships)[number]): GlancePerson {
    const isHost = row.personId === event.hostId || row.role === 'HOST';
    const items = heldBy.get(row.personId) ?? [];
    /*
     * GTC-189 SLICE 7a — WHOSE ROW ANSWERS FOR THIS PERSON.
     *
     * Their own, unless they are a CHILD: ruling S sends the CARRIER's failure to the child's rows,
     * because a child is never a recipient and the only message that carried their ask was somebody
     * else's. [[GTC-336]] Q2: the carrier the CHOOSER names, read off the walk already run above —
     * no extra query. A child the chooser gives no carrier inherits nothing.
     */
    const answeringMembership = isChildMembership(row.householdRole)
      ? carrierOfAsk(preview?.askRoutes[row.id])
      : row.id;
    const context = {
      isHost,
      // [[GTC-251]] — gated on the chooser inside `exhaustionFor`; a child's is its carrier's.
      exhaustion: exhaustionFor(preview?.chase.byMembership[row.id], chaseSpend, now),
      // ANCHOR(GTC-189 slice 7a): the delivery door. NULL before the press, for the same reason.
      delivery: answeringMembership
        ? deliveryFactFrom(latestOutbound.get(answeringMembership))
        : null,
      // [[GTC-305]] — the chooser's chase answer for THIS membership (a child's goes through its
      // carrier, ruling R). Null for the host, whom the preview never chases.
      chase: chaseFactFrom(
        preview?.chase.byMembership[row.id],
        markOf,
        isChildMembership(row.householdRole),
        isPaceOff(event.nudgePace)
      ),
    };
    const emailFacts = emailFactsFor(
      row,
      answeringMembership,
      context.delivery?.failure ?? null,
      latestOutbound.get(row.id)?.channel ?? null
    );
    const { state, reasons } = derivePersonState(
      {
        ...context,
        nudgeMark: row.nudgeMark,
        attendanceAnswer: row.attendanceAnswer,
        items,
      },
      glanceEvent,
      now
    );

    return {
      personEventId: row.id,
      personId: row.personId,
      name: row.person.name,
      isHost,
      householdRole: row.householdRole,
      role: row.role,
      teamId: row.teamId,
      nudgeMark: row.nudgeMark,
      state,
      reasons,
      // [[GTC-251]] slice 251c — after the cadence, the next further reminder the host asked for:
      // GTC-192 Ruling 34's "system's own promise about what it will do next".
      nextNudgeAt:
        (
          nextNudgeFor(row.sentAt, row.nudgeMark, glanceEvent, now) ??
          handBackNextFor(preview?.chase.byMembership[row.id], chaseSpend, now)
        )?.toISOString() ?? null,
      items: items.map((i) => {
        const derived = deriveItemState(i, glanceEvent, context, now);
        return {
          itemId: i.itemId,
          assignmentId: i.assignmentId,
          name: i.name,
          critical: i.critical,
          kind: i.kind,
          teamId: i.teamId,
          quantityAmount: i.quantityAmount,
          quantityUnit: i.quantityUnit,
          quantityUnitCustom: i.quantityUnitCustom,
          state: derived.state,
          reason: derived.reason,
          decideByAt: decideByAtFor(i.response, i.item, glanceEvent),
        };
      }),
      ...emailFacts,
      // [[GTC-258]] — their OWN text invitation's failure, in W1 to W3; the email note speaks first.
      textNote:
        emailFacts.emailNote || isChildMembership(row.householdRole)
          ? null
          : latestOutbound.get(row.id)?.channel === 'TEXT'
            ? textNoteFor(latestOutbound.get(row.id)?.deliveryState)
            : null,
      chase: context.chase,
      chaseNote: chaseNoteFor({
        state,
        reasons,
        route: preview?.chase.byMembership[row.id],
        isChild: isChildMembership(row.householdRole),
        carrierName: carrierNameOf(preview?.chase.byMembership[row.id]),
      }),
      carrierNote: carrierNoteFor(row, answeringMembership, reasons, emailFacts.textable),
    };
  }

  /**
   * [[GTC-336]] Q1 — a red child's card names whose message carried the ask. Only for a child: an
   * adult's answering membership is their own, and their card has the door.
   */
  function carrierNoteFor(
    row: (typeof memberships)[number],
    answering: string | null,
    reasons: readonly string[],
    textable: boolean
  ): string | null {
    if (!isChildMembership(row.householdRole) || !answering) return null;
    const carrier = memberships.find((m) => m.id === answering);
    if (!carrier) return null;
    return carriedChildNoteFor({
      reasons,
      carrierName: carrier.person.name,
      carrierIsHost: carrier.personId === event.hostId || carrier.role === 'HOST',
      textable,
    });
  }

  /** The carrier a child's chase route names, by name — for the ruled carrier sentence. */
  function carrierNameOf(
    route: { kind: string; carrierId?: string; recipientId?: string } | undefined
  ) {
    const id = route?.kind === 'NONE' ? route.carrierId : route?.recipientId;
    return id ? (memberships.find((m) => m.id === id)?.person.name ?? null) : null;
  }

  const people = memberships.map(toPerson);
  const byId = new Map(memberships.map((row, i) => [row.id, people[i]]));

  /*
    ── RULING 23 (2026-09-09) — "FALL LOOSE", DERIVED ────────────────────────────────────

    Ruling 6: "Items the person held fall loose; criticals among them surface in the alert strip."
    Ruling 23 says how: "widen the empty-strip predicate to include rows held by a reversed
    person. No unassignment, no write."

    ⚠ THIS OVERRIDES PHASE 3's DECISION, DELIBERATELY, AND PHASE 3's REASON IS ANSWERED RATHER
    THAN IGNORED. Phase 3 declined to build this and said why: "the strip's test is 'no
    Assignment row' and theirs still has one… building half of it now would put a SECOND
    DEFINITION of 'loose' in the tree." The hazard it named is real and this does not walk into
    it: there is still exactly ONE predicate for loose, at one site, and it now has two limbs —
    no Assignment row, OR an Assignment row held by a person who is OUT. "Loose" gained a
    meaning; it did not gain a definition.

    ⚠ WHAT IS *NOT* ANSWERED, SAID PLAINLY. Phase 3's neighbouring note warns that "critical
    without an ACCEPTED assignment" is "a wider set and a different fact" — the pre-flight's set,
    which this strip is deliberately narrower than. That warning still stands and this widening
    is deliberately not that set: a person who merely DECLINED a row is still holding it, and
    their critical stays under them and out of the strip. Only OUT is loose, and
    `tests/glance-read-test.ts` pins the difference across all five states.

    ⚠ NOT PER VIEWER, AND THAT IS A READING RATHER THAN A RULING. Ruling 23's second half keys
    on "rows held by a reversed person", not on a reversal a viewer has been shown — so this is
    a fact about the board and every viewer reads it the same. Two reasons it is built that way:
    Ruling 6's own ordering puts the loose items with the reversal rather than with the seeing,
    and making it per-viewer would make `readEventGlance` viewer-dependent, which would mean
    6e's ~20-second poll answered a different alert strip to each caller. Recorded here so a
    later reader knows it was decided rather than missed.

    DERIVED, NEVER A WRITE. This reads rows already assembled above — no second query, no
    `Assignment` touched, and the row stays on the person and visible on tap (§10.8). The item
    is genuinely in two places at once, and that is what "no unassignment" costs and buys.
  */
  const reversedRows = people.filter((p) => p.state === 'OUT').flatMap((p) => p.items);

  const hostHouseholdId =
    memberships.find((row) => row.personId === event.hostId)?.householdId ?? null;

  const cards: GlanceHousehold[] = households.map((hh) => {
    const members = memberships
      .filter((row) => row.householdId === hh.id)
      .sort(
        (a, b) =>
          memberRank(a.householdRole) - memberRank(b.householdRole) ||
          a.person.name.localeCompare(b.person.name) ||
          a.id.localeCompare(b.id)
      );
    const primary = members.find((row) => row.householdRole === 'PRIMARY_CONTACT');
    return {
      householdId: hh.id,
      primaryContactName: primary?.person.name ?? null,
      isHostHousehold: hh.id === hostHouseholdId,
      members: members.map((row) => byId.get(row.id)!),
    };
  });

  // Ruling 3: fixed positions, the host's own household first. "The board is a map, not a
  // queue" — the rest hold capture order, which is the geography Kate learns.
  cards.sort((a, b) => Number(b.isHostHousehold) - Number(a.isHostHousehold));

  const unhoused = memberships
    .filter((row) => row.householdId === null)
    .sort((a, b) => a.person.name.localeCompare(b.person.name) || a.id.localeCompare(b.id))
    .map((row) => byId.get(row.id)!);

  return {
    eventId: event.id,
    // Phase 4: TAKE OVER's target and `mayHoldRow`'s host argument, taken from the FK
    // rather than found by scanning the cards — see EventGlance's docstring for the
    // legacy event on which that scan comes back empty.
    hostPersonId: event.hostId,
    asOf: now.toISOString(),
    summary: summarisePeople(people.map((p) => p.state)),
    households: cards,
    unhoused,
    unassignedCritical: [
      ...unassignedCritical.map((i) => ({ itemId: i.id, name: i.name })),
      ...reversedRows.filter((i) => i.critical).map((i) => ({ itemId: i.itemId, name: i.name })),
    ].sort((a, b) => a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId)),
    // The door's N is the SAME predicate, and it has to be: one meaning of loose, not one for
    // the names above and another for the count beside them.
    unassignedOrdinaryCount:
      unassignedOrdinaryCount + reversedRows.filter((i) => !i.critical).length,
  };
}
