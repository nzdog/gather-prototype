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

  const [memberships, assignments, households, unassignedCritical, unassignedOrdinaryCount] =
    await Promise.all([
      db.personEvent.findMany({ where: { eventId }, select: PERSON_EVENT_SELECT }),
      db.assignment.findMany({
        where: { item: { team: { eventId } } },
        select: ASSIGNMENT_SELECT,
      }),
      db.household.findMany({
        where: { eventId },
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
    ]);

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
      item: { dropOffAt: a.item.dropOffAt, decideByOffsetHours: a.item.decideByOffsetHours },
    });
    heldBy.set(a.personId, held);
  }

  function toPerson(row: (typeof memberships)[number]): GlancePerson {
    const isHost = row.personId === event.hostId || row.role === 'HOST';
    const items = heldBy.get(row.personId) ?? [];
    const context = {
      isHost,
      // ANCHOR(GTC-251): exhaustion has no source until E6 lands. NULL says "no signal",
      // which is a different claim from "not exhausted" — see ExhaustionFact in state.ts.
      exhaustion: null,
    };
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
      nextNudgeAt: nextNudgeFor(row.sentAt, row.nudgeMark, glanceEvent, now)?.toISOString() ?? null,
      items: items.map((i) => {
        const derived = deriveItemState(i, glanceEvent, context, now);
        return {
          itemId: i.itemId,
          assignmentId: i.assignmentId,
          name: i.name,
          critical: i.critical,
          kind: i.kind,
          teamId: i.teamId,
          state: derived.state,
          reason: derived.reason,
          decideByAt: decideByAtFor(i.response, i.item, glanceEvent),
        };
      }),
    };
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
